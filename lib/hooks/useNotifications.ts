'use client';

import { useEffect, useRef } from 'react';

/**
 * Polls /api/notifications/check every 60 seconds and triggers browser
 * notifications for todos whose reminder time has arrived.
 * Respects last_notification_sent to prevent duplicates (handled server-side).
 */
export function useNotifications() {
  const permissionRef = useRef<NotificationPermission>('default');

  useEffect(() => {
    // Request browser notification permission
    if ('Notification' in window) {
      Notification.requestPermission().then((perm) => {
        permissionRef.current = perm;
      });
    }

    async function checkReminders() {
      if (permissionRef.current !== 'granted') return;
      try {
        const res = await fetch('/api/notifications/check');
        if (!res.ok) return;
        const { due } = await res.json();
        for (const item of due ?? []) {
          new Notification('Todo Reminder', {
            body: item.title,
            icon: '/favicon.ico',
          });
        }
      } catch {
        // Network error — silently ignore
      }
    }

    checkReminders(); // Initial check
    const interval = setInterval(checkReminders, 60_000); // Poll every minute
    return () => clearInterval(interval);
  }, []);
}
