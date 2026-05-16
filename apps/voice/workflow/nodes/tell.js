// Speaks a message and immediately advances to nextNodeId.
export async function enter({ session, node, speak, interpolate }) {
  await speak(session, interpolate(node.config?.message || "", session.variables));
  return { waitForInput: false, nextNodeId: node.nextNodeId };
}
