/** Time helpers for session windows. Accepts "HH:MM" (24h) and "h:MM AM/PM". */
function parseTimeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3] ? m[3].toLowerCase() : null;
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

/** Format a Date as zero-padded 24h "HH:MM" in server-local time (what the Session schema documents). */
function toHHMM(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Is `nowMinutes` inside [start, end]? Handles windows that cross midnight (e.g. 23:00-01:00).
 */
function isWithinWindow(startMinutes, endMinutes, nowMinutes) {
  if (startMinutes == null || endMinutes == null) return false;
  if (endMinutes >= startMinutes) return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}

module.exports = { parseTimeToMinutes, toHHMM, isWithinWindow };
