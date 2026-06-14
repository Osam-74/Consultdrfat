import { AvailabilityTemplate, AvailabilityException, PracticeSettings } from "./types";

export interface Slot {
  start: Date;
  end: Date;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function atMinutes(day: Date, minutes: number): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Generate every open, bookable slot inside the rolling window.
 *
 * The hard rule: a slot is offered only if it is in the future and starts no
 * later than `now + bookingWindowDays`. The window rolls forward each day.
 */
export function generateSlots(
  settings: PracticeSettings,
  templates: AvailabilityTemplate[],
  exceptions: AvailabilityException[],
  takenStartMs: Set<number>,
  now: Date = new Date()
): Slot[] {
  const slots: Slot[] = [];
  const windowEnd = new Date(now);
  windowEnd.setDate(now.getDate() + settings.bookingWindowDays);

  const step = settings.sessionLengthMin + settings.bufferMin;

  for (let i = 0; i <= settings.bookingWindowDays; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    day.setHours(0, 0, 0, 0);
    const dateStr = ymd(day);

    const dayExceptions = exceptions.filter((e) => e.date === dateStr);
    const fullDayBlock = dayExceptions.some((e) => e.type === "block" && !e.start);
    if (fullDayBlock) continue;

    // Build the day's open windows: matching active templates + "extra" exceptions.
    const windows: Array<{ start: number; end: number }> = [];
    templates
      .filter((t) => t.active && t.weekday === day.getDay())
      .forEach((t) => windows.push({ start: toMin(t.start), end: toMin(t.end) }));
    dayExceptions
      .filter((e) => e.type === "extra" && e.start && e.end)
      .forEach((e) => windows.push({ start: toMin(e.start!), end: toMin(e.end!) }));

    const partialBlocks = dayExceptions
      .filter((e) => e.type === "block" && e.start && e.end)
      .map((e) => ({ start: toMin(e.start!), end: toMin(e.end!) }));

    for (const w of windows) {
      for (let m = w.start; m + settings.sessionLengthMin <= w.end; m += step) {
        const start = atMinutes(day, m);
        const end = atMinutes(day, m + settings.sessionLengthMin);

        if (start <= now) continue; // must be in the future
        if (start > windowEnd) continue; // the two-week limit
        if (takenStartMs.has(start.getTime())) continue; // already booked/held

        const blocked = partialBlocks.some((b) => m < b.end && m + settings.sessionLengthMin > b.start);
        if (blocked) continue;

        slots.push({ start, end });
      }
    }
  }

  slots.sort((a, b) => a.start.getTime() - b.start.getTime());
  return slots;
}

export function groupByDay(slots: Slot[]): Map<string, Slot[]> {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = ymd(s.start);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(s);
  }
  return map;
}
