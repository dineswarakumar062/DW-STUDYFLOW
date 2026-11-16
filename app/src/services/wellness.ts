import type { CustomTimerItem, FocusSession } from '../types';

export interface WeeklyReflectionStats {
  plannedSessions: number;
  completedSessions: number;
  totalFocusMinutes: number;
  breaksTaken: number;
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
  let totalFocusMinutes = 0;
  let breaksTaken = 0;

  for (const session of sessions) {
    const ts = new Date(session.completedAt).getTime();
    if (Number.isNaN(ts) || ts < startMs || ts > endMs) {
      continue;
    }

    if (session.type === 'pomodoro' || session.type === 'stopwatch') {
      plannedSessions += 1;
      completedSessions += 1;
      totalFocusMinutes += Math.max(0, session.durationMinutes || 0);
    } else if (session.type === 'shortBreak' || session.type === 'longBreak') {
      if (!session.breakSkipped) {
        breaksTaken += 1;
      }
    }
  }

  return {
    plannedSessions,
    completedSessions,
    totalFocusMinutes,
    breaksTaken,
  };
}
