import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { calculateDailyActivity, calculateWeeklyReflection } from '../../services/wellness';
import { getLocalDateStr } from '../../services/storage';
import { Activity as ActivityIcon, Moon, CheckCircle2, Clock, Coffee, Smartphone } from 'lucide-react';

export const Activity: React.FC = () => {
  const { sessions, bedtimeLogs, logBedtime, alarms, setActiveTab } = useApp();

  const weekly = useMemo(() => calculateWeeklyReflection(sessions), [sessions]);
  const daily = useMemo(() => calculateDailyActivity(sessions, bedtimeLogs), [sessions, bedtimeLogs]);

  const maxFocusMinutes = Math.max(25, ...daily.map((d) => d.focusMinutes));
  const maxLeaves = Math.max(1, ...daily.map((d) => d.leaveCount));
  const totalLeaves7d = daily.reduce((sum, d) => sum + d.leaveCount, 0);

  const bedtimeAlarm = alarms.find((a) => a.enabled && /wind down|bedtime/i.test(a.label));
  const todayStr = getLocalDateStr();
  const todayBedtimeLog = bedtimeLogs.find((b) => b.date === todayStr);

  const reflectionCounts = useMemo(() => {
    let calm = 0;
    let neutral = 0;
    let distracted = 0;
    for (const s of sessions) {
      if (s.reflection === 'calm') calm += 1;
      else if (s.reflection === 'neutral') neutral += 1;
      else if (s.reflection === 'distracted') distracted += 1;
    }
    return { calm, neutral, distracted };
  }, [sessions]);

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6 pb-28">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#14201A] dark:text-white font-headline">
            Wellness Activity
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[#4B5B52] dark:text-emerald-200/80">
            Past 7 days of focus sessions, breaks, phone-drift, and bedtime wind-down habits.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('timer')}
          className="self-start sm:self-auto rounded-2xl bg-[#15803D] hover:bg-[#166534] text-white px-4 py-2.5 text-xs font-black transition-colors"
        >
          Open Focus &amp; Alarms
        </button>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-3xl border border-emerald-200/80 dark:border-emerald-800/60 bg-white dark:bg-[#13261C] p-4 sm:p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-[#4B5B52] dark:text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-[#15803D] dark:text-[#86EFAC]" />
            <span>Completed Sessions</span>
          </div>
          <p className="text-2xl font-black text-[#14201A] dark:text-white font-headline">
            {weekly.completedSessions}
          </p>
          <p className="text-[11px] font-medium text-[#4B5B52] dark:text-emerald-200/75">
            Ended early: {weekly.endedEarlySessions}
          </p>
        </div>

        <div className="rounded-3xl border border-emerald-200/80 dark:border-emerald-800/60 bg-white dark:bg-[#13261C] p-4 sm:p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-[#4B5B52] dark:text-emerald-200">
            <Clock className="w-4 h-4 text-[#15803D] dark:text-[#86EFAC]" />
            <span>Focus Minutes (7d)</span>
          </div>
          <p className="text-2xl font-black text-[#14201A] dark:text-white font-headline">
            {weekly.totalFocusMinutes}m
          </p>
          <p className="text-[11px] font-medium text-[#4B5B52] dark:text-emerald-200/75">
            Planned sessions: {weekly.plannedSessions}
          </p>
        </div>

        <div className="rounded-3xl border border-emerald-200/80 dark:border-emerald-800/60 bg-white dark:bg-[#13261C] p-4 sm:p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-[#4B5B52] dark:text-emerald-200">
            <Coffee className="w-4 h-4 text-[#15803D] dark:text-[#86EFAC]" />
            <span>Breaks Taken</span>
          </div>
          <p className="text-2xl font-black text-[#14201A] dark:text-white font-headline">
            {weekly.breaksTaken}
          </p>
          <p className="text-[11px] font-medium text-[#4B5B52] dark:text-emerald-200/75">
            Breaks skipped: {weekly.breaksSkipped}
          </p>
        </div>

        <div className="rounded-3xl border border-emerald-200/80 dark:border-emerald-800/60 bg-white dark:bg-[#13261C] p-4 sm:p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-[#4B5B52] dark:text-emerald-200">
            <Smartphone className="w-4 h-4 text-[#15803D] dark:text-[#86EFAC]" />
            <span>App Leaves (7d)</span>
          </div>
          <p className="text-2xl font-black text-[#14201A] dark:text-white font-headline">
            {totalLeaves7d}
          </p>
          <p className="text-[11px] font-medium text-[#4B5B52] dark:text-emerald-200/75">
            Tracked only during active focus
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Focus Minutes & Session Completion Graph */}
        <section
          aria-label="7-day focus activity chart"
          className="rounded-3xl border border-emerald-200/80 dark:border-emerald-800/60 bg-white dark:bg-[#13261C] p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#14201A] dark:text-white font-headline flex items-center gap-2">
                <ActivityIcon className="w-4 h-4 text-[#15803D] dark:text-[#86EFAC]" />
                <span>7-Day Focus Activity</span>
              </h2>
              <p className="text-xs font-medium text-[#4B5B52] dark:text-emerald-200/80">
                Daily focus minutes and completed vs. ended-early sessions
              </p>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-44 pt-4 border-b border-emerald-100 dark:border-emerald-800/60 pb-2">
            {daily.map((day) => {
              const heightPct = day.focusMinutes > 0
                ? Math.max(10, Math.round((day.focusMinutes / maxFocusMinutes) * 100))
                : 0;
              return (
                <div key={day.dateStr} className="flex flex-col items-center justify-end h-full gap-1.5">
                  <span className="text-[10px] font-bold text-[#4B5B52] dark:text-emerald-200">
                    {day.focusMinutes > 0 ? `${day.focusMinutes}m` : '0'}
                  </span>
                  <div className="w-full max-w-[34px] flex-1 flex items-end justify-center bg-[#DCFCE7]/50 dark:bg-emerald-950/40 rounded-t-xl overflow-hidden">
                    <div
                      className="w-full bg-[#15803D] dark:bg-[#22C55E] rounded-t-xl transition-all"
                      style={{ height: `${heightPct}%` }}
                      title={`${day.label}: ${day.focusMinutes} mins (${day.completedCount} completed, ${day.endedEarlyCount} ended early)`}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-[#14201A] dark:text-emerald-100">
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#4B5B52] dark:text-emerald-200/80">
            <span>Completed: {weekly.completedSessions} · Ended early: {weekly.endedEarlySessions}</span>
            <span>Breaks taken: {weekly.breaksTaken} · Skipped: {weekly.breaksSkipped}</span>
          </div>
        </section>

        {/* Phone-Drift (App Leaves) & Session Mood Reflections */}
        <section
          aria-label="Phone-drift and session reflections"
          className="rounded-3xl border border-emerald-200/80 dark:border-emerald-800/60 bg-white dark:bg-[#13261C] p-5 sm:p-6 space-y-4"
        >
          <div>
            <h2 className="text-base sm:text-lg font-black text-[#14201A] dark:text-white font-headline flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#15803D] dark:text-[#86EFAC]" />
              <span>Phone-Drift &amp; Reflections</span>
            </h2>
            <p className="text-xs font-medium text-[#4B5B52] dark:text-emerald-200/80">
              App leaves per day during focus sessions
            </p>
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-36 pt-2 border-b border-emerald-100 dark:border-emerald-800/60 pb-2">
            {daily.map((day) => {
              const heightPct = day.leaveCount > 0
                ? Math.max(14, Math.round((day.leaveCount / maxLeaves) * 100))
                : 0;
              return (
                <div key={day.dateStr} className="flex flex-col items-center justify-end h-full gap-1.5">
                  <span className="text-[10px] font-bold text-[#4B5B52] dark:text-emerald-200">
                    {day.leaveCount}
                  </span>
                  <div className="w-full max-w-[34px] flex-1 flex items-end justify-center bg-[#DCFCE7]/40 dark:bg-emerald-950/30 rounded-t-xl overflow-hidden">
                    <div
                      className="w-full bg-[#166534] dark:bg-[#86EFAC] rounded-t-xl transition-all"
                      style={{ height: `${heightPct}%` }}
                      title={`${day.label}: ${day.leaveCount} app leaves`}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-[#14201A] dark:text-emerald-100">
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="rounded-2xl bg-[#DCFCE7]/60 dark:bg-emerald-950/40 p-3 text-center">
              <span className="text-[11px] font-bold text-[#14532D] dark:text-emerald-200 block">Calm</span>
              <span className="text-lg font-black text-[#14201A] dark:text-white">{reflectionCounts.calm}</span>
            </div>
            <div className="rounded-2xl bg-[#DCFCE7]/60 dark:bg-emerald-950/40 p-3 text-center">
              <span className="text-[11px] font-bold text-[#14532D] dark:text-emerald-200 block">Neutral</span>
              <span className="text-lg font-black text-[#14201A] dark:text-white">{reflectionCounts.neutral}</span>
            </div>
            <div className="rounded-2xl bg-[#DCFCE7]/60 dark:bg-emerald-950/40 p-3 text-center">
              <span className="text-[11px] font-bold text-[#14532D] dark:text-emerald-200 block">Distracted</span>
              <span className="text-lg font-black text-[#14201A] dark:text-white">{reflectionCounts.distracted}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Bedtime Wind-Down Report & Reminders */}
      <section
        aria-label="Bedtime wind-down report"
        className="rounded-3xl border border-emerald-200/80 dark:border-emerald-800/60 bg-white dark:bg-[#13261C] p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-[#14201A] dark:text-white font-headline flex items-center gap-2">
              <Moon className="w-4 h-4 text-[#15803D] dark:text-[#86EFAC]" />
              <span>Bedtime Wind-Down Report</span>
            </h2>
            <p className="text-xs font-medium text-[#4B5B52] dark:text-emerald-200/80">
              {bedtimeAlarm
                ? `Daily reminder active at ${bedtimeAlarm.time}: "${bedtimeAlarm.label}"`
                : 'No active bedtime wind-down alarm yet. Set one in Focus & Alarms.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => logBedtime('on-time', bedtimeAlarm?.time || '22:00')}
              className={`rounded-2xl px-4 py-2 text-xs font-black border transition-colors ${
                todayBedtimeLog?.status === 'on-time'
                  ? 'bg-[#15803D] text-white border-[#15803D]'
                  : 'bg-[#DCFCE7] text-[#14532D] border-emerald-200 hover:bg-[#86EFAC]/50'
              }`}
            >
              Wound down on time
            </button>
            <button
              type="button"
              onClick={() => logBedtime('late', bedtimeAlarm?.time || '22:00')}
              className={`rounded-2xl px-4 py-2 text-xs font-black border transition-colors ${
                todayBedtimeLog?.status === 'late'
                  ? 'bg-[#14201A] text-white border-[#14201A] dark:bg-emerald-900 dark:border-emerald-700'
                  : 'bg-white dark:bg-emerald-950/40 text-[#4B5B52] dark:text-emerald-200 border-emerald-200 dark:border-emerald-800 hover:bg-[#DCFCE7]/40'
              }`}
            >
              Stayed up late
            </button>
          </div>
        </div>

        {/* 7-day Bedtime Strip */}
        <div className="grid grid-cols-7 gap-2 pt-2">
          {daily.map((day) => {
            const statusText =
              day.bedtimeStatus === 'on-time'
                ? 'On time'
                : day.bedtimeStatus === 'late'
                ? 'Late'
                : '—';
            const cardClass =
              day.bedtimeStatus === 'on-time'
                ? 'bg-[#DCFCE7] dark:bg-emerald-900/60 text-[#14532D] dark:text-emerald-100 border-emerald-300 dark:border-emerald-700'
                : day.bedtimeStatus === 'late'
                ? 'bg-slate-100 dark:bg-slate-800 text-[#4B5B52] dark:text-slate-300 border-slate-200 dark:border-slate-700'
                : 'bg-white dark:bg-emerald-950/20 text-[#4B5B52] dark:text-emerald-200/60 border-emerald-100 dark:border-emerald-900/50';
            return (
              <div
                key={day.dateStr}
                className={`rounded-2xl border p-2.5 text-center space-y-1 ${cardClass}`}
              >
                <span className="text-[11px] font-bold block">{day.label}</span>
                <span className="text-[10px] font-black block">{statusText}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
