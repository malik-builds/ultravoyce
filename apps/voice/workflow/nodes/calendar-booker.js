import { slotsToNaturalLanguage, parseSlotSelection } from "../../services/llm.js";
import { log } from "../../services/log.js";

// Interactive cal.com booking node.
// enter: fetches slots, speaks them, waits for user to pick one.
// handleInput: resolves selection, books on confirmed slot, re-prompts if unclear.

export async function enter({ session, node, speak, send, interpolate }) {
  const cfg = node.config || {};
  const attendeeEmail = session.variables[cfg.attendeeEmailVariable]?.value;
  if (!attendeeEmail) {
    await speak(session, "I'll need your email address to make a booking.");
    return { waitForInput: false, nextNodeId: null };
  }

  const slots = await fetchSlots(node, session, interpolate);
  if (!slots) {
    await speak(session, "I'm having trouble checking availability right now. I'll have the team follow up with you.");
    return { waitForInput: false, nextNodeId: node.nextNodeId };
  }
  if (slots.length === 0) {
    await speak(session, "There are no available slots in the next 7 days. I'll let the team know.");
    return { waitForInput: false, nextNodeId: node.nextNodeId };
  }

  session.calendarSlots = slots;
  const timezone = cfg.timezone || "UTC";
  const description = await slotsToNaturalLanguage(slots.slice(0, 3), timezone);
  await speak(session, description);
  return { waitForInput: true };
}

export async function handleInput({ session, node, speak, setVar, send, interpolate }, utterance) {
  const cfg = node.config || {};
  const timezone = cfg.timezone || "UTC";
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

  // outcome === "selected_slot"
  const booking = await createBooking(node, session, slotTime, interpolate);
  send(session.clientWs, { type: "workflow.calendar.result", nodeId: node.id, ok: booking.ok, message: booking.message });

  if (!booking.ok) {
    if (cfg.onFailure === "stop") {
      await speak(session, "Sorry, I wasn't able to complete the booking. We'll be in touch.");
      return { waitForInput: false, nextNodeId: null };
    }
    await speak(session, "Sorry, I wasn't able to make that booking. Would you like to try a different time?");
    // Re-fetch slots and loop
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
  const attendeeName = session.variables[cfg.attendeeNameVariable]?.value || "Caller";
  const attendeeEmail = session.variables[cfg.attendeeEmailVariable]?.value;

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
