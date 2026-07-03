// All date/time operations MUST use these utilities — never use new Date() directly.
// Timezone: Asia/Singapore (UTC+8)

const SINGAPORE_TZ = 'Asia/Singapore';

/**
 * Returns the current date/time as a Date object representing Singapore local time.
 */
export function getSingaporeNow(): Date {
  const now = new Date();
  const sgString = now.toLocaleString('en-US', { timeZone: SINGAPORE_TZ });
  return new Date(sgString);
}

/**
 * Formats a Date (or ISO string) as a Singapore-local datetime string.
 * Output: "YYYY-MM-DDTHH:mm" (suitable for datetime-local inputs)
 */
export function formatSingaporeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const sgString = d.toLocaleString('en-CA', {
    timeZone: SINGAPORE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // en-CA gives YYYY-MM-DD, HH:mm — normalise to YYYY-MM-DDTHH:mm
  return sgString.replace(', ', 'T').replace(',', 'T');
}

/**
 * Returns an ISO string for the current Singapore datetime.
 */
export function getSingaporeISOString(): string {
  return getSingaporeNow().toISOString();
}

/**
 * Parses an ISO datetime string and returns a Date adjusted for SG timezone.
 */
export function parseSingaporeDate(isoString: string): Date {
  return new Date(isoString);
}

/**
 * Calculates the next due date for a recurring todo based on its pattern.
 * All arithmetic done in Singapore timezone.
 */
export function getNextDueDate(
  currentDueDate: string,
  pattern: 'daily' | 'weekly' | 'monthly' | 'yearly'
): string {
  const d = new Date(currentDueDate);
  switch (pattern) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d.toISOString();
}

/**
 * Returns true if the given reminder should fire now (Singapore time).
 * @param dueDate  ISO string of the todo due date
 * @param reminderMinutes  minutes before due date to trigger reminder
 * @param lastNotificationSent  ISO string of when last notification was sent (or null)
 */
export function shouldSendReminder(
  dueDate: string,
  reminderMinutes: number,
  lastNotificationSent: string | null
): boolean {
  const now = getSingaporeNow();
  const due = new Date(dueDate);
  const triggerAt = new Date(due.getTime() - reminderMinutes * 60 * 1000);

  // Already past trigger time but not yet past due
  if (now < triggerAt || now > due) return false;

  // Prevent duplicate notifications
  if (lastNotificationSent) {
    const last = new Date(lastNotificationSent);
    // If already sent within the reminder window, skip
    if (last >= triggerAt) return false;
  }

  return true;
}
