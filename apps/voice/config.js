import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PORT = Number(process.env.PORT || 8001);
export const RECORDINGS_DIR = path.join(__dirname, "recordings");
export const WORKFLOW_PATH = process.env.WORKFLOW_PATH || path.join(__dirname, "workflows", "default.json");

// ElevenLabs (TTS + STT fallback on valsea branch — Valsea used for live partial display only)
export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
export const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "Xb7hH8MSUJpSbSDYk0k2";
export const ELEVENLABS_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5";
export const ELEVENLABS_TTS_URL = () =>
  `wss://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream-input?model_id=${ELEVENLABS_TTS_MODEL}`;
export const ELEVENLABS_STT_URL =
  "wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_24000&commit_strategy=vad&vad_silence_duration_ms=1000";

// Valsea STT
export const VALSEA_API_KEY = process.env.VALSEA_API_KEY;
export const VALSEA_STT_URL = "wss://api.valsea.ai/v1/realtime";

// STT provider: "elevenlabs" (default, reliable) | "dual" (Valsea partials + ElevenLabs finals)
export const STT_PROVIDER = process.env.STT_PROVIDER || "elevenlabs";

// OpenAI
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";

// Supabase
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Dev fallback: when Supabase is not configured, load this file instead
export const DEV_WORKFLOW_PATH = process.env.WORKFLOW_PATH || path.join(__dirname, "workflows", "default.json");

// Behaviour
export const AUTO_HANGUP_MS = Number(process.env.AUTO_HANGUP_MS || 30000);
export const TTS_TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS || 15000);
export const MAX_RECORDING_BYTES = Number(process.env.MAX_RECORDING_BYTES || 15 * 1024 * 1024);
export const MAX_NODE_VISITS = 60;
export const TTS_SENTENCE_FLUSH_REGEX = /[.!?]\s$/;
export const ALLOW_LOCAL_WEBHOOKS = process.env.ALLOW_LOCAL_WEBHOOKS === "true";
