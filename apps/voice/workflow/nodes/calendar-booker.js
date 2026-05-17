import { slotsToNaturalLanguage, parseSlotSelection, extractSingleValue } from "../../services/llm.js";

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
import { log } from "../../services/log.js";

// Interactive cal.com booking node.
//
// Works in two modes:
//   1. Config has attendeeEmailVariable / attendeeNameVariable pointing to filled session vars
//      → skips inline collection, goes straight to slots.
//   2. Those config fields are empty or the vars are null (e.g. JSON from builder not yet wired)
//      → collects email then name inline before fetching slots.
//
// Phase stored in session._calBooking.phase:
//   "need_email"  → waiting for user to provide email
//   "need_name"   → waiting for user to provide name
//   "need_slot"   → waiting for user to pick a slot

// ─── Helpers ─────────────────────────────────────────────────────────────────

function upsertBookingLead(session, patch) {
  const existing = session.capturedLeads.find((l) => l.source === "booking");
  if (existing) {
    Object.assign(existing, patch);
  } else {
    session.capturedLeads.push({ source: "booking", capturedAt: new Date().toISOString(), ...patch });
  }
}

function resolveEmail(cfg, session) {
  if (cfg.attendeeEmailVariable && session.variables[cfg.attendeeEmailVariable]?.value) {
    return session.variables[cfg.attendeeEmailVariable].value;
  }
  return session._calBooking?.email || null;
}

function resolveName(cfg, session) {
  if (cfg.attendeeNameVariable && session.variables[cfg.attendeeNameVariable]?.value) {
    return session.variables[cfg.attendeeNameVariable].value;
  }
  return session._calBooking?.name || null;
}

// ─── Advance the booking flow (called from both enter and handleInput) ────────

async function advance(session, node, speak, send, interpolate) {
  const cfg = node.config || {};
  const cal = session._calBooking;

  const email = resolveEmail(cfg, session);
  if (!email) {
    cal.phase = "need_email";
    await speak(session, "I'd be happy to help you book an appointment. Could I get your email address?");
    return { waitForInput: true };
  }

  const name = resolveName(cfg, session);
  if (!name) {
    cal.phase = "need_name";
    await speak(session, "And could I get your full name?");
    return { waitForInput: true };
  }

  // Have both — fetch slots.
  cal.phase = "need_slot";
  const slots = await fetchSlots(node, session, interpolate);
  if (!slots) {
    // API down — fall back to lead capture with phone number instead of booking.
    log.warn("CAL", "slots unavailable — switching to fallback lead capture");
    cal.fallbackPhase = "need_phone";
    await speak(session, "I'm having trouble checking our calendar right now. No worries — could I take your phone number and we'll call you back to arrange a time?");
    return { waitForInput: true };
  }
  if (slots.length === 0) {
    await speak(session, "There are no available slots in the next 7 days. I'll let the team know and they'll reach out to you.");
    return { waitForInput: false, nextNodeId: node.nextNodeId };
  }

  session.calendarSlots = slots;
  const timezone = cfg.timezone || "UTC";
  const description = await slotsToNaturalLanguage(slots.slice(0, 3), timezone);
  await speak(session, description);
  return { waitForInput: true };
}

// ─── Node handlers ────────────────────────────────────────────────────────────

export async function enter({ session, node, speak, send, interpolate }) {
  session._calBooking = { email: null, name: null, phase: null, emailFailCount: 0, fallbackPhase: null };
  return advance(session, node, speak, send, interpolate);
}

export async function handleInput({ session, node, speak, setVar, send, interpolate }, utterance) {
  const cfg = node.config || {};
  const timezone = cfg.timezone || "UTC";
  const cal = session._calBooking || {};

  // ── Fallback lead capture (API was down) ──────────────────────────────────
  if (cal.fallbackPhase === "need_phone") {
    const phoneMatch = utterance.match(/[\+\d][\d\s\-().]{6,}/);
    const phone = phoneMatch?.[0] || await extractSingleValue(utterance, "phone number");
    if (!phone) {
      await speak(session, "Sorry, I didn't catch that. Could you give me your phone number?");
      return { waitForInput: true };
    }
    log.info("CAL", "fallback phone captured", { phone });
    upsertBookingLead(session, { phone });
    cal.fallbackPhase = null;
    await speak(session, "Perfect, we'll be in touch shortly to arrange your appointment. Is there anything else I can help you with?");
    return { waitForInput: false, nextNodeId: node.nextNodeId };
  }

  // ── Collecting email ──────────────────────────────────────────────────────
  if (cal.phase === "need_email") {
    // Try regex first (handles typed/pasted emails)
    let email = utterance.match(EMAIL_RE)?.[0] ?? null;

    // LLM normalization for spoken formats: "malik at gmail dot com" → "malik@gmail.com"
    if (!email) {
      const raw = await extractSingleValue(
        utterance,
        'email address — convert spoken format to standard: "user at domain dot com" → "user@domain.com"'
      );
      if (raw && EMAIL_RE.test(raw.trim())) email = raw.trim();
    }

    if (!email) {
      cal.emailFailCount = (cal.emailFailCount || 0) + 1;
      log.info("CAL", "email not found in utterance", { utterance, failCount: cal.emailFailCount });
      if (cal.emailFailCount >= 2) {
        cal.phase = null;
        cal.fallbackPhase = "need_phone";
        await speak(session, "No problem. Could I take your phone number instead and we'll be in touch to arrange a time?");
        return { waitForInput: true };
      }
      await speak(session, "Sorry, I didn't catch that. Could you say your email again, spelling it out if needed?");
      return { waitForInput: true };
    }

    cal.email = email;
    cal.emailFailCount = 0;
    log.info("CAL", "email collected inline", { email: cal.email });
    upsertBookingLead(session, { email: cal.email });
    return advance(session, node, speak, send, interpolate);
  }

  // ── Collecting name ───────────────────────────────────────────────────────
  if (cal.phase === "need_name") {
    let name = await extractSingleValue(
      utterance,
      "person's name — extract just the name even if the utterance is a full sentence like \"it's John Smith\" or \"my name is Sarah\""
    );
    // Fallback: if LLM returned nothing and utterance looks like a name, use it directly
    if (!name) {
      const raw = utterance.trim();
      if (raw.length > 0 && raw.length <= 50 && !/[@\d]/.test(raw)) name = raw;
    }
    if (!name || name.trim().length < 1) {
      await speak(session, "Sorry, I didn't catch your name. Could you repeat it?");
      return { waitForInput: true };
    }
    cal.name = name.trim();
    log.info("CAL", "name collected inline", { name: cal.name });
    upsertBookingLead(session, { name: cal.name });
    return advance(session, node, speak, send, interpolate);
  }

  // ── Selecting a slot ──────────────────────────────────────────────────────
  const slots = session.calendarSlots || [];
  const { outcome, slotTime } = await parseSlotSelection(utterance, slots, timezone);
  log.info("CAL", "slot selection", { utterance, outcome, slotTime });

  if (outcome === "declined") {
    return { waitForInput: false, nextNodeId: node.nextNodeId };
  }

  if (outcome === "unclear") {
    await speak(session, "Sorry, I didn't quite catch that. Which of those times works for you?");
    return { waitForInput: true };
  }

  if (outcome === "unavailable_time") {
    const freshSlots = await fetchSlots(node, session, interpolate);
    if (freshSlots && freshSlots.length > 0) {
      session.calendarSlots = freshSlots;
      const description = await slotsToNaturalLanguage(freshSlots.slice(0, 3), timezone);
      await speak(session, `I'm sorry, that time isn't available. ${description}`);
    } else {
      await speak(session, "I'm sorry, that time isn't available and there are no other slots right now. I'll have the team follow up with you.");
      return { waitForInput: false, nextNodeId: node.nextNodeId };
    }
    return { waitForInput: true };
  }

  // outcome === "selected_slot"
  const booking = await createBooking(node, session, slotTime, interpolate);
  send(session.clientWs, { type: "workflow.calendar.result", nodeId: node.id, ok: booking.ok, message: booking.message });

  if (!booking.ok) {
    if (cfg.onFailure === "stop") {
      await speak(session, "Sorry, I wasn't able to complete the booking. We'll be in touch.");
      return { waitForInput: false, nextNodeId: null };
    }
    await speak(session, "Sorry, I wasn't able to make that booking. Would you like to try a different time?");
    const freshSlots = await fetchSlots(node, session, interpolate);
    if (freshSlots && freshSlots.length > 0) {
      session.calendarSlots = freshSlots;
      const description = await slotsToNaturalLanguage(freshSlots.slice(0, 3), timezone);
      await speak(session, description);
    }
    return { waitForInput: true };
  }

  setVar(session, cfg.bookingIdVariable, booking.bookingId);
  setVar(session, cfg.bookingTimeVariable, booking.bookingTime);
  setVar(session, cfg.bookingConfirmationVariable, true);

  const confirmMsg = interpolate(
    cfg.confirmationMessage || `Your booking is confirmed for ${booking.bookingTime}.`,
    session.variables
  );
  await speak(session, confirmMsg);
  return { waitForInput: false, nextNodeId: node.nextNodeId };
}

// ─── cal.com API ──────────────────────────────────────────────────────────────

async function fetchSlots(node, session, interpolate) {
  const cfg = node.config || {};
  const apiKey = interpolate(cfg.calComApiKey || "", session.variables);
  if (!apiKey) {
    log.error("CAL", "fetchSlots — CAL_COM_API_KEY is empty or not set in environment");
    return null;
  }

  const eventTypeId = cfg.calComEventTypeId;
  if (!eventTypeId) {
    log.error("CAL", "fetchSlots — calComEventTypeId not set in workflow config");
    return null;
  }

  log.info("CAL", "fetchSlots — calling cal.com v2", { eventTypeId, timezone: cfg.timezone });
  try {
    const now = new Date();
    const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const url = new URL("https://api.cal.com/v2/slots/available");
    url.searchParams.set("eventTypeId", String(eventTypeId));
    url.searchParams.set("startTime", now.toISOString());
    url.searchParams.set("endTime", endTime.toISOString());
    if (cfg.timezone) url.searchParams.set("timeZone", cfg.timezone);

    const res = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "cal-api-version": "2024-08-13",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.error("CAL", "fetchSlots — HTTP error", { status: res.status, body });
      return null;
    }

    const data = await res.json();
    const slotsObj = data?.data?.slots || data?.slots || {};
    const flat = Object.values(slotsObj).flat().map((s) => s.time).filter(Boolean);
    log.info("CAL", "fetchSlots — got slots", { count: flat.length, first: flat[0] });
    return flat;
  } catch (err) {
    log.error("CAL", "fetchSlots — exception", { err: err.message });
    return null;
  }
}

async function createBooking(node, session, slotTime, interpolate) {
  const cfg = node.config || {};
  const apiKey = interpolate(cfg.calComApiKey || "", session.variables);
  const attendeeName = resolveName(cfg, session) || "Caller";
  const attendeeEmail = resolveEmail(cfg, session);

  log.info("CAL", "createBooking — attempting", {
    eventTypeId: cfg.calComEventTypeId,
    slotTime,
    attendeeName,
    attendeeEmail,
    timezone: cfg.timezone,
  });

  try {
    const res = await fetch("https://api.cal.com/v2/bookings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "cal-api-version": "2024-08-13",
      },
      body: JSON.stringify({
        eventTypeId: cfg.calComEventTypeId,
        start: slotTime,
        attendee: {
          name: attendeeName,
          email: attendeeEmail,
          timeZone: cfg.timezone || "UTC",
          language: "en",
        },
        metadata: { source: "ultravoyce" },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.error("CAL", "createBooking — HTTP error", { status: res.status, body: text });
      throw new Error(`Booking failed: ${res.status} ${text}`);
    }

    const result = await res.json();
    const booking = result?.data || result;
    log.info("CAL", "createBooking — success", { bookingId: booking.uid || booking.id, startTime: booking.start || booking.startTime });
    return {
      ok: true,
      bookingId: String(booking.uid || booking.id || ""),
      bookingTime: String(booking.start || booking.startTime || slotTime),
    };
  } catch (err) {
    log.error("CAL", "createBooking — exception", { err: err.message });
    return { ok: false, message: err.message || "Booking failed." };
  }
}
