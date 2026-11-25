export interface TimeRange {
  startDateTime: Date;
  endDateTime: Date;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startDateTime < b.endDateTime && b.startDateTime < a.endDateTime;
}
