import crypto from "crypto";

// Books a cal.com appointment using real availability data.
export async function enter({ session, node, speak, setVar, send, interpolate }) {
  const result = await bookCalCom(node, session, setVar, interpolate);
  send(session.clientWs, { type: "workflow.calendar.result", nodeId: node.id, ...result });
  await speak(session, result.message);

  if (!result.ok && node.config?.onFailure === "stop") {
    return { waitForInput: false, nextNodeId: null };
  }
  return { waitForInput: false, nextNodeId: node.nextNodeId };
}

async function bookCalCom(node, session, setVar, interpolate) {
  const cfg = node.config || {};
  const apiKey = interpolate(cfg.calComApiKey || "", session.variables);
  if (!apiKey) return { ok: false, message: "CAL_COM_API_KEY secret missing." };

  const attendeeName = session.variables[cfg.attendeeNameVariable]?.value || "Caller";
  const attendeeEmail = session.variables[cfg.attendeeEmailVariable]?.value;
  if (!attendeeEmail) return { ok: false, message: "Attendee email missing; cannot book appointment." };

  const eventTypeId = cfg.calComEventTypeId;
  const timezone = cfg.timezone || "UTC";

  try {
    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const slotsUrl = new URL("https://api.cal.com/v1/slots/available");
    slotsUrl.searchParams.set("apiKey", apiKey);
    slotsUrl.searchParams.set("eventTypeId", String(eventTypeId));
    slotsUrl.searchParams.set("startTime", startTime);
    slotsUrl.searchParams.set("endTime", endTime);
    slotsUrl.searchParams.set("timeZone", timezone);

    const slotsRes = await fetch(slotsUrl.toString());
    if (!slotsRes.ok) throw new Error(`Slots fetch failed: ${slotsRes.status}`);

    const slotsData = await slotsRes.json();
    const firstEntry = Object.values(slotsData.slots || {}).find((times) => times.length > 0);
    if (!firstEntry) return { ok: false, message: "No available slots found in the next week. Please call back to reschedule." };

    const slotTime = firstEntry[0].time;
    const bookingRes = await fetch(`https://api.cal.com/v1/bookings?apiKey=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTypeId,
        start: slotTime,
        timeZone: timezone,
        responses: { name: attendeeName, email: attendeeEmail },
        metadata: { source: "ultravoyce" },
      }),
    });

    if (!bookingRes.ok) {
      const errText = await bookingRes.text().catch(() => "");
      throw new Error(`Booking failed: ${bookingRes.status} ${errText}`);
    }

    const booking = await bookingRes.json();
    const bookingId = String(booking.uid || booking.id || crypto.randomUUID().slice(0, 10));
    const bookingTime = String(booking.startTime || slotTime);

    setVar(session, cfg.bookingIdVariable, bookingId);
    setVar(session, cfg.bookingTimeVariable, bookingTime);
    setVar(session, cfg.bookingConfirmationVariable, true);

    const message = interpolate(
      cfg.confirmationMessage || `Done ${attendeeName}, your booking is confirmed for ${bookingTime}.`,
      session.variables
    );
    return { ok: true, message };
  } catch (err) {
    console.error("cal.com booking error:", err);
    return { ok: false, message: "I was unable to complete the booking at this time. Please try again." };
  }
}
