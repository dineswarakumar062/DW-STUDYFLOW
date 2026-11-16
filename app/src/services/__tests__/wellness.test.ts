import { describe, it, expect } from 'vitest';
import type { BedtimeLog, FocusSession } from '../../types';
import {
  calculateDailyActivity,
  calculateWeeklyReflection,
  formatLeaveCountMessage,
  getBreakDurationMinutes,
  getNextBreakType,
  shouldCountLeave,
} from '../wellness';
import { getLocalDateStr } from '../storage';

describe('wellness.ts', () => {
  describe('getNextBreakType & getBreakDurationMinutes', () => {
    it('returns shortBreak for blocks 1, 2, 3 and longBreak on block 4', () => {
      expect(getNextBreakType(1)).toBe('shortBreak');
      expect(getNextBreakType(2)).toBe('shortBreak');
      expect(getNextBreakType(3)).toBe('shortBreak');
      expect(getNextBreakType(4)).toBe('longBreak');
    });

    it('repeats longBreak every fourth work block (8, 12)', () => {
      expect(getNextBreakType(5)).toBe('shortBreak');
      expect(getNextBreakType(7)).toBe('shortBreak');
      expect(getNextBreakType(8)).toBe('longBreak');
      expect(getNextBreakType(12)).toBe('longBreak');
    });

    it('returns shortBreak when 0 blocks completed', () => {
      expect(getNextBreakType(0)).toBe('shortBreak');
    });

    it('computes break durations for short and long breaks', () => {
      expect(getBreakDurationMinutes('shortBreak', 5, 15)).toBe(5);
      expect(getBreakDurationMinutes('longBreak', 5, 15)).toBe(15);
    });
  });

  describe('shouldCountLeave & formatLeaveCountMessage', () => {
    it('increments leave counter only while a focus or custom session is running', () => {
      expect(shouldCountLeave(true, 'focus')).toBe(true);
      expect(shouldCountLeave(true, 'custom')).toBe(true);
      expect(shouldCountLeave(false, 'focus')).toBe(false);
      expect(shouldCountLeave(false, 'custom')).toBe(false);
      expect(shouldCountLeave(true, 'shortBreak')).toBe(false);
      expect(shouldCountLeave(true, 'longBreak')).toBe(false);
    });

    it('formats neutral, non-shaming leave count messages', () => {
      expect(formatLeaveCountMessage(0)).toBe('You stayed in the app for the entire session.');
      expect(formatLeaveCountMessage(1)).toBe(
        'You left the app 1 time during this session. Try keeping your phone in another room next time.',
      );
      expect(formatLeaveCountMessage(3)).toBe(
        'You left the app 3 times during this session. Try keeping your phone in another room next time.',
      );
    });
  });

  describe('calculateWeeklyReflection', () => {
    const anchor = new Date('2026-11-16T15:00:00.000Z');

    it('returns zeros when there are no sessions (zero days)', () => {
      expect(calculateWeeklyReflection([], anchor)).toEqual({
        plannedSessions: 0,
        completedSessions: 0,
        endedEarlySessions: 0,
        totalFocusMinutes: 0,
        breaksTaken: 0,
        breaksSkipped: 0,
      });
    });

    it('computes stats for a partial week including ended-early sessions and skipped breaks', () => {
      const sessions: FocusSession[] = [
        {
          id: 's1',
          subject: 'Algorithms',
          durationMinutes: 25,
          completedAt: '2026-11-16T10:00:00.000Z',
          type: 'pomodoro',
          leaveCount: 1,
        },
        {
          id: 's2',
          subject: 'Algorithms',
          durationMinutes: 10,
          completedAt: '2026-11-16T11:00:00.000Z',
          type: 'pomodoro',
          endedEarly: true,
          leaveCount: 2,
        },
        {
          id: 'b1',
          subject: 'Short Break',
          durationMinutes: 5,
          completedAt: '2026-11-16T10:30:00.000Z',
          type: 'shortBreak',
          breakSkipped: false,
        },
        {
          id: 'b2',
          subject: 'Short Break',
          durationMinutes: 0,
          completedAt: '2026-11-15T10:30:00.000Z',
          type: 'shortBreak',
          breakSkipped: true,
        },
        {
          id: 'old',
          subject: 'Old Session',
          durationMinutes: 50,
          completedAt: '2026-11-01T10:00:00.000Z',
          type: 'pomodoro',
        },
      ];

      expect(calculateWeeklyReflection(sessions, anchor)).toEqual({
        plannedSessions: 2,
        completedSessions: 1,
        endedEarlySessions: 1,
        totalFocusMinutes: 35,
        breaksTaken: 1,
        breaksSkipped: 1,
      });
    });

    it('computes stats across a full 7-day week including long breaks', () => {
      const sessions: FocusSession[] = [];
      for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
        const d = new Date(anchor);
        d.setDate(d.getDate() - dayOffset);
        sessions.push({
          id: `f-${dayOffset}`,
          subject: 'Study',
          durationMinutes: 25,
          completedAt: d.toISOString(),
          type: 'pomodoro',
        });
        sessions.push({
          id: `b-${dayOffset}`,
          subject: dayOffset === 3 ? 'Long Break' : 'Short Break',
          durationMinutes: dayOffset === 3 ? 15 : 5,
          completedAt: d.toISOString(),
          type: dayOffset === 3 ? 'longBreak' : 'shortBreak',
          breakSkipped: false,
        });
      }

      expect(calculateWeeklyReflection(sessions, anchor)).toEqual({
        plannedSessions: 7,
        completedSessions: 7,
        endedEarlySessions: 0,
        totalFocusMinutes: 175,
        breaksTaken: 7,
        breaksSkipped: 0,
      });
    });
  });

  describe('calculateDailyActivity', () => {
    it('builds a 7-day activity series with focus minutes, leaves, and bedtime logs', () => {
      const anchor = new Date(2026, 10, 16, 15, 0, 0);
      const todayStr = getLocalDateStr(anchor);
      const sessions: FocusSession[] = [
        {
          id: 's1',
          subject: 'Pomodoro Focus',
          durationMinutes: 25,
          completedAt: new Date(2026, 10, 16, 10, 0, 0).toISOString(),
          type: 'pomodoro',
          leaveCount: 2,
        },
        {
          id: 's2',
          subject: 'Pomodoro Focus',
          durationMinutes: 10,
          completedAt: new Date(2026, 10, 16, 12, 0, 0).toISOString(),
          type: 'pomodoro',
          endedEarly: true,
          leaveCount: 1,
        },
      ];
      const bedtimeLogs: BedtimeLog[] = [
        {
          id: `bed_${todayStr}`,
          date: todayStr,
          status: 'on-time',
          targetTime: '22:00',
          loggedAt: new Date(2026, 10, 16, 22, 5, 0).toISOString(),
        },
      ];

      const series = calculateDailyActivity(sessions, bedtimeLogs, anchor);
      expect(series).toHaveLength(7);
      const todayPoint = series[6];
      expect(todayPoint.dateStr).toBe(todayStr);
      expect(todayPoint.focusMinutes).toBe(35);
      expect(todayPoint.completedCount).toBe(1);
      expect(todayPoint.endedEarlyCount).toBe(1);
      expect(todayPoint.leaveCount).toBe(3);
      expect(todayPoint.bedtimeStatus).toBe('on-time');
    });
  });
});
