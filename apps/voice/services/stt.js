import WebSocket from "ws";
import { ELEVENLABS_API_KEY, ELEVENLABS_STT_URL } from "../config.js";

export function connectSTT(onMessage) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(ELEVENLABS_STT_URL, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });

    socket.once("open", () => {
      socket.off("error", reject);
      socket.on("error", (err) => console.error("STT socket error:", err));
      resolve(socket);
    });

    socket.on("message", onMessage);
    socket.once("error", reject);
  });
}

export function sendAudioChunk(socket, audioBase64) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    message_type: "input_audio_chunk",
    audio_base_64: audioBase64,
    commit: false,
  }));
}
