const dateTime = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const timeOnly = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export const formatDateTime = (iso: string | Date) => dateTime.format(new Date(iso));

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1000],
];

export function formatRelative(iso: string | Date, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === "second") {
      return relative.format(Math.round(diff / ms), unit);
    }
  }
  return "";
}

export function formatDuration(ms: number) {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  return `${Math.round(hours / 24)} days`;
}

/** Value for <input type="datetime-local"> in the viewer's timezone. */
export function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const initials = (nameOrEmail: string) =>
  nameOrEmail
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

const chipWeekday = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", second: "2-digit" });
const chipDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** "Tue 9:15:12 AM" within the coming/past week, otherwise "Nov 3, 9:15 AM" (as in the design's time chips). */
export function formatChipTime(iso: string | Date, now = Date.now()) {
  const d = new Date(iso);
  return Math.abs(d.getTime() - now) < 6 * 86_400_000 ? chipWeekday.format(d) : chipDate.format(d);
}

/** Gmail-style list time: "2:15 PM" today, otherwise "Oct 23". */
export function formatListTime(iso: string | Date, now = new Date()) {
  const d = new Date(iso);
  return d.toDateString() === now.toDateString() ? timeOnly.format(d) : shortDate.format(d);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
