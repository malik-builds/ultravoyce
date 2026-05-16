import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Calendar,
  ClipboardList,
  GitBranch,
  HelpCircle,
  MessageCircle,
  PhoneForwarded,
  Zap,
} from "lucide-react";
import type { NodeType } from "./types";

export interface PaletteItem {
  type: NodeType;
  name: string;
  description: string;
  color: string;
  icon: LucideIcon;
}

export interface PaletteCategory {
  id: string;
  label: string;
  items: PaletteItem[];
}

export const NODE_COLORS: Record<NodeType, string> = {
  tell: "#2dd4bf",
  ask_question: "#2dd4bf",
  get_details: "#38bdf8",
  calendar_booker: "#38bdf8",
  answer_queries: "#a78bfa",
  switch: "#fbbf24",
  action: "#94a3b8",
  transfer_call: "#fb7185",
};

export const PALETTE_CATEGORIES: PaletteCategory[] = [
  {
    id: "conversation",
    label: "Conversation",
    items: [
      {
        type: "tell",
        name: "Tell",
        description: "Speak a message to the caller",
        color: NODE_COLORS.tell,
        icon: MessageCircle,
      },
      {
        type: "ask_question",
        name: "Ask question",
        description: "Ask one question and store the answer",
        color: NODE_COLORS.ask_question,
        icon: HelpCircle,
      },
      {
        type: "get_details",
        name: "Get details",
        description: "Collect multiple fields in conversation",
        color: NODE_COLORS.get_details,
        icon: ClipboardList,
      },
      {
        type: "answer_queries",
        name: "Answer queries",
        description: "Answer questions from a knowledge base",
        color: NODE_COLORS.answer_queries,
        icon: BookOpen,
      },
    ],
  },
  {
    id: "actions",
    label: "Actions",
    items: [
      {
        type: "calendar_booker",
        name: "Calendar booker",
        description: "Book an appointment via cal.com",
        color: NODE_COLORS.calendar_booker,
        icon: Calendar,
      },
      {
        type: "transfer_call",
        name: "Transfer call",
        description: "Transfer to a phone number",
        color: NODE_COLORS.transfer_call,
        icon: PhoneForwarded,
      },
      {
        type: "action",
        name: "Action",
        description: "Send data to a webhook",
        color: NODE_COLORS.action,
        icon: Zap,
      },
    ],
  },
  {
    id: "logic",
    label: "Logic",
    items: [
      {
        type: "switch",
        name: "Switch",
        description: "Route by classified intent",
        color: NODE_COLORS.switch,
        icon: GitBranch,
      },
    ],
  },
];

export function getPaletteItem(type: NodeType): PaletteItem | undefined {
  for (const cat of PALETTE_CATEGORIES) {
    const item = cat.items.find((i) => i.type === type);
    if (item) return item;
  }
  return undefined;
}
