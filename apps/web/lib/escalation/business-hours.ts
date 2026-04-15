/**
 * Business hours utilities.
 *
 * Checks whether the current time falls within configured business hours
 * for an assistant, accounting for timezone.
 */

import type { DaySchedule } from "@bizassist/types";

export interface BusinessHoursConfig {
  timezone: string;
  schedule: DaySchedule[];
  outsideHoursMsg: string;
}

/**
 * Returns true if the current time is within business hours.
 */
export function isWithinBusinessHours(config: BusinessHoursConfig): boolean {
  const now = getNowInTimezone(config.timezone);
  const dayOfWeek = now.getDay(); // 0=Sunday
  const currentTime = formatTime(now.getHours(), now.getMinutes());

  const dayConfig = config.schedule.find((d) => d.day === dayOfWeek);
  if (!dayConfig || !dayConfig.open || !dayConfig.close) {
    return false; // Closed today
  }

  return currentTime >= dayConfig.open && currentTime < dayConfig.close;
}

/**
 * Returns the next opening time as a human-readable string.
 */
export function getNextOpenTime(config: BusinessHoursConfig): string | null {
  const now = getNowInTimezone(config.timezone);
  const currentDay = now.getDay();

  // Check next 7 days starting from today
  for (let offset = 0; offset < 7; offset++) {
    const checkDay = (currentDay + offset) % 7;
    const dayConfig = config.schedule.find((d) => d.day === checkDay);

    if (dayConfig?.open) {
      if (offset === 0) {
        const currentTime = formatTime(now.getHours(), now.getMinutes());
        if (currentTime < dayConfig.open) {
          return `Today at ${dayConfig.open}`;
        }
        // Already past today's hours, check next day
        continue;
      }

      const dayName = DAY_NAMES[checkDay];
      if (offset === 1) return `Tomorrow at ${dayConfig.open}`;
      return `${dayName} at ${dayConfig.open}`;
    }
  }

  return null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getNowInTimezone(timezone: string): Date {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

    return new Date(
      parseInt(get("year")),
      parseInt(get("month")) - 1,
      parseInt(get("day")),
      parseInt(get("hour")),
      parseInt(get("minute")),
    );
  } catch {
    return new Date(); // Fallback to server time
  }
}

function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
