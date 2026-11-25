export function isPastDateTime(value: Date, now = new Date()): boolean {
  return value.getTime() < now.getTime();
}

function localDateKey(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isMidnight(value: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value;
  return part("hour") === "00" && part("minute") === "00" && part("second") === "00" && value.getUTCMilliseconds() === 0;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export function isBeforeTodayInTimeZone(value: Date, timeZone: string, now = new Date()): boolean {
  return localDateKey(value, timeZone) < localDateKey(now, timeZone);
}

export function isWholeDayRange(start: Date, end: Date, timeZone: string): boolean {
  return isMidnight(start, timeZone) && isMidnight(end, timeZone) && localDateKey(start, timeZone) < localDateKey(end, timeZone);
}
