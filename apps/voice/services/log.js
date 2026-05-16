// Structured timestamped logger for the voice pipeline.
// All output goes to stderr so it doesn't interfere with any piped stdout.

function ts() {
  return new Date().toISOString();
}

function fmt(level, tag, msg, extra) {
  const base = `[${ts()}] ${level.padEnd(5)} [${tag}] ${msg}`;
  return extra ? `${base} ${JSON.stringify(extra)}` : base;
}

export const log = {
  info:  (tag, msg, extra) => console.error(fmt("INFO",  tag, msg, extra)),
  warn:  (tag, msg, extra) => console.error(fmt("WARN",  tag, msg, extra)),
  error: (tag, msg, extra) => console.error(fmt("ERROR", tag, msg, extra)),
  debug: (tag, msg, extra) => console.error(fmt("DEBUG", tag, msg, extra)),
};
