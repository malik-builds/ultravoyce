// Speaks a hold message and emits a transfer event to the client.
export async function enter({ session, node, speak, send, interpolate }) {
  await speak(session, interpolate(node.config?.message || "Transferring your call now.", session.variables));
  send(session.clientWs, {
    type: "workflow.transfer.requested",
    transferTo: interpolate(node.config?.transferTo || "", session.variables),
  });
  return { waitForInput: false, nextNodeId: node.nextNodeId };
}
