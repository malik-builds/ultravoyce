import WebSocket from "ws";
import { ELEVENLABS_API_KEY, ELEVENLABS_TTS_URL, TTS_TIMEOUT_MS, TTS_SENTENCE_FLUSH_REGEX } from "../config.js";

export function streamTTS(text, onChunk) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(ELEVENLABS_TTS_URL(), {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });

    let settled = false;
    let timeoutId;

    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve();
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try { socket.close(); } catch { /* ignore */ }
      reject(err);
    };

    timeoutId = setTimeout(() => fail(new Error("TTS stream timeout")), TTS_TIMEOUT_MS);

    socket.once("open", () => {
      socket.send(JSON.stringify({
        text: " ",
        voice_settings: { stability: 0.4, similarity_boost: 0.8, use_speaker_boost: true },
        generation_config: { chunk_length_schedule: [80, 120, 180, 240] },
      }));

      let buffer = "";
      for (const char of text) {
        buffer += char;
        if (buffer.length >= 90 || TTS_SENTENCE_FLUSH_REGEX.test(buffer)) {
          socket.send(JSON.stringify({ text: buffer }));
          buffer = "";
        }
      }
      socket.send(JSON.stringify({ text: buffer || " ", flush: true }));
      socket.send(JSON.stringify({ text: "" }));
    });

    socket.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.audio) onChunk(data.audio);
        if (data.isFinal) { socket.close(); done(); }
      } catch (err) {
        fail(err);
      }
    });

    socket.once("error", fail);
    socket.once("close", done);
  });
}
