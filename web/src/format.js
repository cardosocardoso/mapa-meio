// Small formatting helpers shared by the UI.

/** Seconds -> "5h 12m" / "47m" / "30s". */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  if (m) return `${m}m`;
  return `${s}s`;
}

/** Kilometers -> "703 mi" (the UI shows miles like the reference screenshot). */
export function formatMiles(km) {
  return `${Math.round(km * 0.621371)} mi`;
}
