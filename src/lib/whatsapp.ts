// Opening a WhatsApp chat with a lead, message pre-filled.
//
// WhatsApp's click-to-chat link (wa.me) needs the number in full
// international form, digits only, with no leading + or 00. Lusha
// usually supplies numbers that way ("+20 100 123 4567"), but imported
// CSVs often carry local numbers ("0100 123 4567"), and a local number
// can't be turned into an international one without guessing the
// country — a wrong guess messages a stranger. So local numbers are
// reported as unusable rather than guessed at.

export type WhatsappTarget =
  | { ok: true; digits: string }
  | { ok: false; reason: string };

export function whatsappTarget(phone: string | null | undefined): WhatsappTarget {
  const raw = (phone ?? "").trim();
  if (!raw) return { ok: false, reason: "No phone number for this lead" };

  const international = raw.startsWith("+") || raw.startsWith("00");
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);

  if (!international) {
    return {
      ok: false,
      reason: `"${raw}" has no country code — add it (e.g. +20 for Egypt) to open WhatsApp`,
    };
  }
  // E.164 numbers are at most 15 digits; below 8 isn't a real number.
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, reason: `"${raw}" doesn't look like a valid phone number` };
  }
  return { ok: true, digits };
}

export function whatsappLink(digits: string, message?: string | null): string {
  const text = message?.trim() ? `?text=${encodeURIComponent(message.trim())}` : "";
  return `https://wa.me/${digits}${text}`;
}
