import { BookOpen, Calendar, MessageCircle } from "lucide-react";
import styles from "../app/marketing.module.css";

type PreviewNode = {
  label: string;
  type: string;
  body: string;
  color: string;
  icon: typeof MessageCircle;
};

const nodes: PreviewNode[] = [
  {
    label: "Greet caller",
    type: "tell",
    body: "Welcome to Acme Plumbing…",
    color: "var(--node-tell)",
    icon: MessageCircle,
  },
  {
    label: "Book appointment",
    type: "calendar_booker",
    body: "Connect to cal.com",
    color: "var(--node-sky)",
    icon: Calendar,
  },
  {
    label: "Answer FAQs",
    type: "answer_queries",
    body: "Hours, pricing, services",
    color: "var(--node-violet)",
    icon: BookOpen,
  },
];

function NodeCard({ node }: { node: PreviewNode }) {
  const { label, type, body, color, icon: Icon } = node;
  return (
    <>
      <span className={styles.previewStripe} style={{ background: color }} />
      <div className={styles.previewNodeHeader}>
        <Icon size={16} strokeWidth={1.5} style={{ color }} />
        <span>{label}</span>
        <span className={styles.previewTypeBadge}>{type}</span>
      </div>
      <p className={styles.previewNodeBody}>{body}</p>
    </>
  );
}

export function WorkflowPreview() {
  return (
    <div className={styles.workflowPreview} aria-hidden>
      <div className={`${styles.previewNode} ${styles.previewNode1}`}>
        <NodeCard node={nodes[0]!} />
      </div>
      <div className={`${styles.previewNode} ${styles.previewNode2}`}>
        <NodeCard node={nodes[1]!} />
      </div>
      <div className={`${styles.previewNode} ${styles.previewNode3}`}>
        <NodeCard node={nodes[2]!} />
      </div>
      <span className={`${styles.previewEdge} ${styles.previewEdge1}`} />
      <span className={`${styles.previewEdge} ${styles.previewEdge2}`} />
    </div>
  );
}
