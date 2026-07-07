import { addMinutes, set } from "date-fns";

export const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0);

export const endOfToday = new Date();
endOfToday.setHours(23, 59, 59, 999);

function getTimezoneOffset(timeZone: string, date: Date = new Date()): number {
  const tzString = date.toLocaleString("en-US", { timeZone, hour12: false });
  const localString = date.toLocaleString("en-US", { timeZone: "UTC", hour12: false });
  const g = new Date(tzString).getTime();
  const l = new Date(localString).getTime();
  return (g - l) / 60000;
}

export function generateSlots(
  date: Date,
  startTime: string,
  endTime: string,
  duration: number,
  timezone: string = "UTC",
): Date[] {
  // startTime/endTime like "09:00"
  const [sHour, sMin] = startTime.split(":").map(Number);
  const [eHour, eMin] = endTime.split(":").map(Number);

  const tempStart = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    sHour,
    sMin,
    0,
    0
  ));
  const sOffset = getTimezoneOffset(timezone, tempStart);
  let start = new Date(tempStart.getTime() - sOffset * 60000);

  const tempEnd = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    eHour,
    eMin,
    0,
    0
  ));
  const eOffset = getTimezoneOffset(timezone, tempEnd);
  let end = new Date(tempEnd.getTime() - eOffset * 60000);

  const slots: Date[] = [];
  while (start < end) {
    slots.push(new Date(start.getTime()));
    start = addMinutes(start, duration);
  }
  return slots;
}
