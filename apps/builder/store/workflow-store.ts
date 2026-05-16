"use client";

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import {
  createBlankWorkflow,
  createNode,
  defaultConfig,
} from "@/lib/workflow/defaults";
import { inferEntryNodeId } from "@/lib/workflow/flow";
import type {
  GlobalVariable,
  NodeConfig,
  NodeType,
  Position,
  Trigger,
  VariableType,
  WorkflowDocument,
  WorkflowNode,
} from "@/lib/workflow/types";
import {
  getCalendarBookingTemplate,
  getReceptionistTemplate,
} from "@/lib/workflow/templates";
import { saveWorkflowToDb } from "@/lib/supabase/workflows";

const MAX_HISTORY = 50;

interface WorkflowStore {
  id: string;
  name: string;
  version: number;
  description: string;
  trigger: Trigger;
  entryNodeId: string | null;
  nodes: WorkflowNode[];
  globalVariables: Record<string, GlobalVariable>;

  selectedNodeId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  lastSavedAt: number | null;

  history: WorkflowDocument[];
  historyIndex: number;

  validationIssues: import("@/lib/workflow/types").ValidationIssue[];

  setName: (name: string) => void;
  setDescription: (description: string) => void;
  loadDocument: (doc: WorkflowDocument) => void;
  addNode: (type: NodeType, position: Position) => string;
  updateNode: (id: string, patch: Partial<WorkflowNode>) => void;
  updateNodeConfig: (id: string, config: NodeConfig) => void;
  updateNodePosition: (id: string, position: Position) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  connectNodes: (
    fromId: string,
    toId: string,
    sourceHandle?: string | null,
  ) => void;
  disconnectNodes: (fromId: string, sourceHandle?: string | null) => void;
  setEntryNode: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
  addGlobalVariable: (name: string, type: VariableType) => void;
  updateGlobalVariable: (
    oldName: string,
    name: string,
    patch: Partial<GlobalVariable>,
  ) => void;
  deleteGlobalVariable: (name: string) => void;
  ensureVariable: (name: string, type: VariableType) => void;
  loadTemplate: (template: "calendar" | "receptionist") => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
  serialise: () => WorkflowDocument;
  pushHistory: () => void;
  setValidationIssues: (
    issues: import("@/lib/workflow/types").ValidationIssue[],
  ) => void;
  markDirty: () => void;
}

function snapshot(state: WorkflowStore): WorkflowDocument {
  return {
    id: state.id,
    name: state.name,
    version: state.version,
    description: state.description,
    trigger: state.trigger,
    globalVariables: structuredClone(state.globalVariables),
    entryNodeId: state.entryNodeId,
    nodes: structuredClone(state.nodes),
  };
}

function applySnapshot(
  snap: WorkflowDocument,
): Pick<
  WorkflowStore,
  | "id"
  | "name"
  | "version"
  | "description"
  | "trigger"
  | "entryNodeId"
  | "nodes"
  | "globalVariables"
> {
  return {
    id: snap.id,
    name: snap.name,
    version: snap.version,
    description: snap.description ?? "",
    trigger: snap.trigger,
    entryNodeId: snap.entryNodeId,
    nodes: snap.nodes,
    globalVariables: snap.globalVariables,
  };
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  ...applySnapshot(createBlankWorkflow(uuidv4())),
  selectedNodeId: null,
  isDirty: false,
  isSaving: false,
  saveError: null,
  lastSavedAt: null,
  history: [],
  historyIndex: -1,
  validationIssues: [],

  setName: (name) => {
    set({ name, isDirty: true });
    get().pushHistory();
  },

  setDescription: (description) => {
    set({ description, isDirty: true });
    get().pushHistory();
  },

  loadDocument: (doc) => {
    set({
      ...applySnapshot(doc),
      selectedNodeId: null,
      isDirty: false,
      history: [structuredClone(doc)],
      historyIndex: 0,
    });
  },

  addNode: (type, position) => {
    const node = createNode(type, position);
    const state = get();
    const entryNodeId =
      state.nodes.length === 0 ? node.id : state.entryNodeId;
    set({
      nodes: [...state.nodes, node],
      entryNodeId,
      isDirty: true,
      selectedNodeId: node.id,
    });
    get().pushHistory();
    return node.id;
  },

  updateNode: (id, patch) => {
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      isDirty: true,
    });
  },

  updateNodeConfig: (id, config) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, config } : n,
      ),
      isDirty: true,
    });
  },

  updateNodePosition: (id, position) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, position } : n,
      ),
      isDirty: true,
    });
  },

  deleteNode: (id) => {
    const state = get();
    const nodes = state.nodes
      .filter((n) => n.id !== id)
      .map((n) => {
        let nextNodeId = n.nextNodeId === id ? null : n.nextNodeId;
        let config = n.config;
        if (n.type === "switch") {
          const c = config as {
            cases: { value: string; label: string; nextNodeId: string | null }[];
            defaultCaseNextNodeId: string | null;
          };
          config = {
            ...c,
            cases: c.cases.map((x) => ({
              ...x,
              nextNodeId: x.nextNodeId === id ? null : x.nextNodeId,
            })),
            defaultCaseNextNodeId:
              c.defaultCaseNextNodeId === id ? null : c.defaultCaseNextNodeId,
          };
        }
        return { ...n, nextNodeId, config };
      });
    let entryNodeId =
      state.entryNodeId === id ? inferEntryNodeId(nodes) : state.entryNodeId;
    set({
      nodes,
      entryNodeId,
      selectedNodeId:
        state.selectedNodeId === id ? null : state.selectedNodeId,
      isDirty: true,
    });
    get().pushHistory();
  },

  duplicateNode: (id) => {
    const original = get().nodes.find((n) => n.id === id);
    if (!original) return;
    const copy = createNode(original.type, {
      x: original.position.x + 40,
      y: original.position.y + 40,
    });
    copy.label = `${original.label} (copy)`;
    copy.config = structuredClone(original.config);
    copy.nextNodeId = null;
    if (copy.type === "switch") {
      const c = copy.config as {
        cases: { value: string; label: string; nextNodeId: string | null }[];
        defaultCaseNextNodeId: string | null;
      };
      c.cases = c.cases.map((x) => ({ ...x, nextNodeId: null }));
      c.defaultCaseNextNodeId = null;
    }
    set({
      nodes: [...get().nodes, copy],
      isDirty: true,
      selectedNodeId: copy.id,
    });
    get().pushHistory();
  },

  connectNodes: (fromId, toId, sourceHandle) => {
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== fromId) return n;
        if (n.type === "switch") {
          const config = n.config as {
            prompt: string;
            cases: {
              value: string;
              label: string;
              nextNodeId: string | null;
            }[];
            defaultCaseNextNodeId: string | null;
          };
          if (sourceHandle === "default") {
            return {
              ...n,
              config: { ...config, defaultCaseNextNodeId: toId },
            };
          }
          return {
            ...n,
            config: {
              ...config,
              cases: config.cases.map((c) =>
                c.value === sourceHandle
                  ? { ...c, nextNodeId: toId }
                  : c,
              ),
            },
          };
        }
        return { ...n, nextNodeId: toId };
      }),
      isDirty: true,
    });
    get().pushHistory();
  },

  disconnectNodes: (fromId, sourceHandle) => {
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== fromId) return n;
        if (n.type === "switch") {
          const config = n.config as {
            prompt: string;
            cases: {
              value: string;
              label: string;
              nextNodeId: string | null;
            }[];
            defaultCaseNextNodeId: string | null;
          };
          if (sourceHandle === "default") {
            return {
              ...n,
              config: { ...config, defaultCaseNextNodeId: null },
            };
          }
          return {
            ...n,
            config: {
              ...config,
              cases: config.cases.map((c) =>
                c.value === sourceHandle
                  ? { ...c, nextNodeId: null }
                  : c,
              ),
            },
          };
        }
        return { ...n, nextNodeId: null };
      }),
      isDirty: true,
    });
    get().pushHistory();
  },

  setEntryNode: (id) => {
    set({ entryNodeId: id, isDirty: true });
    get().pushHistory();
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  addGlobalVariable: (name, type) => {
    if (!name.trim() || get().globalVariables[name]) return;
    set({
      globalVariables: {
        ...get().globalVariables,
        [name]: { type, value: null },
      },
      isDirty: true,
    });
    get().pushHistory();
  },

  updateGlobalVariable: (oldName, name, patch) => {
    const vars = { ...get().globalVariables };
    const existing = vars[oldName];
    if (!existing) return;
    delete vars[oldName];
    vars[name] = { ...existing, ...patch };
    set({
      globalVariables: vars,
      nodes: get().nodes.map((n) => {
        if (n.type === "ask_question") {
          const c = n.config as { storeIn: string };
          if (c.storeIn === oldName) {
            return {
              ...n,
              config: { ...c, storeIn: name },
            };
          }
        }
        return n;
      }),
      isDirty: true,
    });
    get().pushHistory();
  },

  deleteGlobalVariable: (name) => {
    const vars = { ...get().globalVariables };
    delete vars[name];
    set({ globalVariables: vars, isDirty: true });
    get().pushHistory();
  },

  ensureVariable: (name, type) => {
    if (!name || get().globalVariables[name]) return;
    set({
      globalVariables: {
        ...get().globalVariables,
        [name]: { type, value: null },
      },
      isDirty: true,
    });
  },

  loadTemplate: (template) => {
    const doc =
      template === "calendar"
        ? getCalendarBookingTemplate()
        : getReceptionistTemplate();
    doc.id = get().id;
    get().loadDocument(doc);
    set({ isDirty: true });
    get().pushHistory();
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    const snap = history[nextIndex];
    if (!snap) return;
    set({ ...applySnapshot(snap), historyIndex: nextIndex, isDirty: true });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const snap = history[nextIndex];
    if (!snap) return;
    set({ ...applySnapshot(snap), historyIndex: nextIndex, isDirty: true });
  },

  pushHistory: () => {
    const snap = snapshot(get());
    const { history, historyIndex } = get();
    const trimmed = history.slice(0, historyIndex + 1);
    trimmed.push(structuredClone(snap));
    if (trimmed.length > MAX_HISTORY) trimmed.shift();
    set({ history: trimmed, historyIndex: trimmed.length - 1 });
  },

  serialise: () => {
    const state = get();
    const entryNodeId =
      state.entryNodeId ?? inferEntryNodeId(state.nodes);
    return {
      id: state.id,
      name: state.name,
      version: state.version + (state.isDirty ? 0 : 0),
      description: state.description,
      updatedAt: new Date().toISOString(),
      trigger: state.trigger,
      globalVariables: state.globalVariables,
      entryNodeId,
      nodes: state.nodes,
    };
  },

  save: async () => {
    const state = get();
    set({ isSaving: true, saveError: null });
    try {
      const doc = state.serialise();
      doc.version = state.version + 1;
      await saveWorkflowToDb(state.id, doc);
      set({
        version: doc.version,
        isDirty: false,
        isSaving: false,
        lastSavedAt: Date.now(),
      });
    } catch (err) {
      set({
        isSaving: false,
        saveError: err instanceof Error ? err.message : "Save failed",
      });
    }
  },

  setValidationIssues: (issues) => set({ validationIssues: issues }),

  markDirty: () => set({ isDirty: true }),
}));
