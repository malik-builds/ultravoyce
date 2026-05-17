import WebSocket from "ws";
import { VALSEA_API_KEY, VALSEA_STT_URL } from "../config.js";
import { log } from "./log.js";

export function connectSTT(onMessage) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(VALSEA_STT_URL, {
      headers: { "Authorization": `Bearer ${VALSEA_API_KEY}` },
    });

    socket.once("open", () => {
      // Valsea requires explicit session initialisation before audio can be sent.
      socket.send(JSON.stringify({
        type: "session.start",
        model: "valsea-rtt",
        enable_correction: true,
        language: "en",
      }));
      log.debug("STT", "Valsea session.start sent");
      socket.off("error", reject);
      socket.on("error", (err) => console.error("Valsea STT socket error:", err));
      resolve(socket);
    });

    socket.on("message", onMessage);
    socket.once("error", reject);
  });
}

export function sendAudioChunk(socket, audioBase64) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "audio.append", audio: audioBase64 }));
}
