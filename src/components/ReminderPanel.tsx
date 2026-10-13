import { Bell, CalendarClock, ClockAlert, Repeat2 } from 'lucide-react';
import type { Reminder } from '../domain/insights';

export function ReminderPanel({ reminders, onOpen }: { reminders: Reminder[]; onOpen: (taskId: string) => void }) {
  if (!reminders.length) return null;
  const icons = { current: Repeat2, deadline: CalendarClock, overdue: ClockAlert };
  return (
    <section className="reminder-panel" aria-labelledby="reminder-title">
      <div className="reminder-heading">
        <Bell size={18} />
        <div><h2 id="reminder-title">Godt at have på radaren</h2><p>Kun relevante påmindelser – opgaver forsvinder aldrig.</p></div>
      </div>
      <div className="reminder-list">
        {reminders.slice(0, 4).map((reminder) => {
          const Icon = icons[reminder.kind];
          return <button key={reminder.id} onClick={() => onOpen(reminder.taskId)}><Icon size={17}/><span><strong>{reminder.title}</strong><small>{reminder.detail}</small></span></button>;
        })}
      </div>
    </section>
  );
}
