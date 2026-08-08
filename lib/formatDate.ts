// Everything is shown in India Standard Time - the whole program (mentor and
// candidates) operates in IST, so times are pinned to Asia/Kolkata regardless
// of the viewer's device timezone.
const IST = "Asia/Kolkata";

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: IST,
  });
}

export function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const datePart = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: IST,
  });
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: IST,
  });
  return `${datePart}, ${timePart} IST`;
}
