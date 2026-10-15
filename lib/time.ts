// Every schedule in the app is entered and shown in IST (UTC+05:30, no DST).
const IST_OFFSET_MIN = 330;

const fmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatIST(d: Date | null | undefined): string {
  return d ? fmt.format(d) + " IST" : "–";
}

/** "2026-10-20T10:00" typed as IST -> Date. Returns null if malformed. */
export function parseISTLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(value + ":00+05:30");
  return isNaN(d.getTime()) ? null : d;
}

/** Date -> "2026-10-20T10:00" in IST, for <input type="datetime-local">. */
export function toISTLocal(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 16);
}
