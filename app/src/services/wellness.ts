import type { BedtimeLog, CustomTimerItem, FocusSession } from '../types';
import { getLocalDateStr } from './storage';

export interface WeeklyReflectionStats {
  plannedSessions: number;
  completedSessions: number;
  endedEarlySessions: number;
  totalFocusMinutes: number;
  breaksTaken: number;
  breaksSkipped: number;
}

export interface DailyActivityPoint {
  dateStr: string;
  label: string;
  focusMinutes: number;
  completedCount: number;
  endedEarlyCount: number;
  breaksTaken: number;
  breaksSkipped: number;
  leaveCount: number;
  bedtimeStatus: 'on-time' | 'late' | null;
}

/**
 * Returns 'longBreak' after every 4th completed work block, otherwise 'shortBreak'.
 */
export function getNextBreakType(completedWorkBlocks: number): 'shortBreak' | 'longBreak' {
  if (completedWorkBlocks > 0 && completedWorkBlocks % 4 === 0) {
    return 'longBreak';
  }
  return 'shortBreak';
}

export function getBreakDurationMinutes(
  breakType: 'shortBreak' | 'longBreak',
  shortBreakMinutes = 5,
  longBreakMinutes = 15,
): number {
  return breakType === 'longBreak' ? longBreakMinutes : shortBreakMinutes;
}

/**
 * Returns true only when a focus-type timer is actively running.
 */
export function shouldCountLeave(isRunning: boolean, timerType: CustomTimerItem['type']): boolean {
  return isRunning && (timerType === 'focus' || timerType === 'custom');
}

/**
 * Neutral, non-shaming summary of app backgrounding events during a focus session.
 */
export function formatLeaveCountMessage(leaveCount: number): string {
  if (leaveCount <= 0) {
    return 'You stayed in the app for the entire session.';
  }
  const timesLabel = leaveCount === 1 ? '1 time' : `${leaveCount} times`;
  return `You left the app ${timesLabel} during this session. Try keeping your phone in another room next time.`;
}

/**
 * Computes weekly reflection stats for the past 7 days (inclusive of today)
 * strictly from stored FocusSession records.
 */
export function calculateWeeklyReflection(
  sessions: FocusSession[],
  now: Date = new Date(),
): WeeklyReflectionStats {
  const endOfWindow = new Date(now);
  endOfWindow.setHours(23, 59, 59, 999);

  const startOfWindow = new Date(now);
  startOfWindow.setHours(0, 0, 0, 0);
  startOfWindow.setDate(startOfWindow.getDate() - 6);

  const startMs = startOfWindow.getTime();
  const endMs = endOfWindow.getTime();

  let plannedSessions = 0;
  let completedSessions = 0;
  let endedEarlySessions = 0;
  let totalFocusMinutes = 0;
  let breaksTaken = 0;
  let breaksSkipped = 0;

  for (const session of sessions) {
    const ts = new Date(session.completedAt).getTime();
    if (Number.isNaN(ts) || ts < startMs || ts > endMs) {
      continue;
    }

    if (session.type === 'pomodoro' || session.type === 'stopwatch') {
      plannedSessions += 1;
      if (session.endedEarly) {
        endedEarlySessions += 1;
      } else {
        completedSessions += 1;
      }
      totalFocusMinutes += Math.max(0, session.durationMinutes || 0);
    } else if (session.type === 'shortBreak' || session.type === 'longBreak') {
      if (session.breakSkipped) {
        breaksSkipped += 1;
      } else {
        breaksTaken += 1;
      }
    }
  }

  return {
    plannedSessions,
    completedSessions,
    endedEarlySessions,
    totalFocusMinutes,
    breaksTaken,
    breaksSkipped,
  };
}

/**
 * Builds a 7-day activity series (oldest to today) for the Activity tab charts.
 */
export function calculateDailyActivity(
  sessions: FocusSession[],
  bedtimeLogs: BedtimeLog[],
  now: Date = new Date(),
): DailyActivityPoint[] {
  const days: DailyActivityPoint[] = [];
  const byDate = new Map<string, DailyActivityPoint>();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - offset);
    const dateStr = getLocalDateStr(d);
    const label = d.toLocaleDateString(undefined, { weekday: 'short' });
    const point: DailyActivityPoint = {
      dateStr,
      label,
      focusMinutes: 0,
      completedCount: 0,
      endedEarlyCount: 0,
      breaksTaken: 0,
      breaksSkipped: 0,
      leaveCount: 0,
      bedtimeStatus: null,
    };
    days.push(point);
    byDate.set(dateStr, point);
  }

  for (const session of sessions) {
    const parsed = new Date(session.completedAt);
    if (Number.isNaN(parsed.getTime())) continue;
    const point = byDate.get(getLocalDateStr(parsed));
    if (!point) continue;

    if (session.type === 'pomodoro' || session.type === 'stopwatch') {
      point.focusMinutes += Math.max(0, session.durationMinutes || 0);
      point.leaveCount += Math.max(0, session.leaveCount || 0);
      if (session.endedEarly) {
        point.endedEarlyCount += 1;
      } else {
        point.completedCount += 1;
      }
    } else if (session.type === 'shortBreak' || session.type === 'longBreak') {
      if (session.breakSkipped) {
        point.breaksSkipped += 1;
      } else {
        point.breaksTaken += 1;
      }
    }
  }

  for (const log of bedtimeLogs) {
    const point = byDate.get(log.date);
    if (point) {
      point.bedtimeStatus = log.status;
    }
  }

  return days;
}
