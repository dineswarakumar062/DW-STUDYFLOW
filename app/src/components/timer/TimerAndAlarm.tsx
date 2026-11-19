import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import type { CustomTimerItem, SessionReflection, TimerColorTheme } from '../../types';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  SkipForward, 
  Award, 
  Sparkles, 
  Edit3, 
  Flame, 
  AlarmClock, 
  Bell, 
  Trash2, 
  Plus, 
  X,
  Clock,
  Coffee,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { cancelTimerNotification, notifyTimerComplete, scheduleTimerNotification } from '../../services/notifications';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  formatLeaveCountMessage,
  getBreakDurationMinutes,
  getNextBreakType,
  shouldCountLeave,
} from '../../services/wellness';

const getThemeClass = (colorTheme: TimerColorTheme) => {
  switch (colorTheme) {
    case 'cyan': return 'theme-liquid-emerald';
    case 'emerald':
    default: return 'theme-liquid-emerald';
  }
};

const getThemeGradient = (colorTheme: TimerColorTheme) => {
  switch (colorTheme) {
    case 'emerald':
    default: return 'from-[#15803D] to-[#166534] shadow-emerald-600/30';
  }
};

const getThemeBadgeStyle = (colorTheme: TimerColorTheme) => {
  switch (colorTheme) {
    case 'emerald':
    default: return 'bg-[#DCFCE7] dark:bg-emerald-950/60 text-[#15803D] dark:text-emerald-300 border-emerald-200/70';
  }
};

export const TimerAndAlarm: React.FC = () => {
  const { 
    settings, 
    logSession, 
    updateSessionReflection,
    sessions, 
    alarms, 
    addAlarm, 
    updateAlarm, 
    deleteAlarm, 
    toggleAlarm,
    customTimers,
    saveCustomTimers,
    setLiveSession,
  } = useApp();

  const [activePanel, setActivePanel] = useState<'timer' | 'alarms'>('timer');
  
  // Custom Timers State
  const [activeTimerId, setActiveTimerId] = useState<string>(customTimers[0]?.id || 'timer-pomodoro');
  
  // Active Timer state (falls back to Pomodoro Focus when customTimers is empty in clean seed mode)
  const [selectedBuiltInPreset, setSelectedBuiltInPreset] = useState<CustomTimerItem | null>(null);
  const activeTimer = useMemo(() => {
    if (selectedBuiltInPreset && selectedBuiltInPreset.id === activeTimerId) {
      return selectedBuiltInPreset;
    }
    return customTimers.find(t => t.id === activeTimerId) || customTimers[0] || {
      id: 'timer-default',
      name: 'Pomodoro Focus',
      durationMinutes: 25,
      type: 'focus' as const,
      colorTheme: 'emerald' as const,
      createdAt: new Date().toISOString(),
    };
  }, [customTimers, activeTimerId, selectedBuiltInPreset]);

  const [timeLeft, setTimeLeft] = useState<number>(activeTimer.durationMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [leaveCount, setLeaveCount] = useState(0);
  const [focusIntention, setFocusIntention] = useState('');
  const [parkedInput, setParkedInput] = useState('');
  const [parkedThoughts, setParkedThoughts] = useState<Array<{ id: string; text: string; done: boolean }>>(() => {
    try {
      const raw = localStorage.getItem('studyflow_parked_thoughts');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const saveParkedThoughts = (items: Array<{ id: string; text: string; done: boolean }>) => {
    setParkedThoughts(items);
    try {
      localStorage.setItem('studyflow_parked_thoughts', JSON.stringify(items));
    } catch {
      // ignore storage errors
    }
  };
  const [completedWorkBlocks, setCompletedWorkBlocks] = useState(0);
  const [breakScreen, setBreakScreen] = useState<{
    type: 'shortBreak' | 'longBreak';
    totalSeconds: number;
    secondsLeft: number;
    lastLeaveCount: number;
    lastSessionId: string;
    reflection?: SessionReflection;
    startedAt: string;
  } | null>(null);

  // Modal State for Add / Edit Timer
  const [timerModalOpen, setTimerModalOpen] = useState(false);
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);
  const [formTimerName, setFormTimerName] = useState('');
  const [formTimerMins, setFormTimerMins] = useState(25);
  const [formTimerType, setFormTimerType] = useState<'focus' | 'shortBreak' | 'longBreak' | 'custom'>('focus');
  const [formTimerTheme, setFormTimerTheme] = useState<TimerColorTheme>('emerald');

  // Alarm Form State
  const [alarmLabel, setAlarmLabel] = useState('');
  const [alarmTime, setAlarmTime] = useState('08:00');
  const [alarmRepeat, setAlarmRepeat] = useState<'once' | 'daily'>('daily');
  const [alarmFormOpen, setAlarmFormOpen] = useState(false);
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetEndTimeRef = useRef<number | null>(null);
  const breakEndTimeRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<string | null>(null);
  const leaveCountRef = useRef<number>(0);
  const notificationIdRef = useRef(0);

  // Sync live session state to AppContext for Dashboard Live Session Card
  useEffect(() => {
    setLiveSession({
      isRunning,
      timerName: activeTimer.name,
      timerType: activeTimer.type,
      timeLeftSeconds: timeLeft,
      leaveCount,
      completedWorkBlocks,
    });
  }, [isRunning, activeTimer.name, activeTimer.type, timeLeft, leaveCount, completedWorkBlocks, setLiveSession]);

  // Sync timer when activeTimer changes
  useEffect(() => {
    targetEndTimeRef.current = null;
    sessionStartTimeRef.current = null;
    leaveCountRef.current = 0;
    setLeaveCount(0);
    setTimeLeft(activeTimer.durationMinutes * 60);
    setIsRunning(false);
  }, [activeTimer.id, activeTimer.durationMinutes]);

  // Phone-drift counter: count background transitions only while a focus session is running
  useEffect(() => {
    if (!shouldCountLeave(isRunning, activeTimer.type)) return;

    const recordLeave = () => {
      leaveCountRef.current += 1;
      setLeaveCount(leaveCountRef.current);
    };

    if (Capacitor.isNativePlatform()) {
      const listenerPromise = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          recordLeave();
        }
      });
      return () => {
        void listenerPromise.then(handle => handle.remove()).catch(() => {});
      };
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordLeave();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRunning, activeTimer.type]);

  // Web Audio Alarm Chime
  const playAlarmSound = useCallback(() => {
    if (!settings.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const vol = Math.max(0.05, Math.min(1, (settings.alarmVolume ?? 80) / 100)) * 0.35;
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.9);
      });
      setTimeout(() => {
        void ctx.close().catch(() => {});
      }, 1500);
    } catch {
      // Audio context error
    }
  }, [settings.soundEnabled, settings.alarmVolume]);

  // Timer Tick Interval (Wall-clock based to prevent background drift)
  useEffect(() => {
    if (isRunning) {
      if (!targetEndTimeRef.current) {
        targetEndTimeRef.current = Date.now() + timeLeft * 1000;
      }
      timerRef.current = setInterval(() => {
        if (!targetEndTimeRef.current) return;
        const remaining = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
          targetEndTimeRef.current = null;
          if (timerRef.current) clearInterval(timerRef.current);
          setIsRunning(false);
          playAlarmSound();
          if (settings.notificationsEnabled) {
            void notifyTimerComplete(activeTimer.name);
          }

          // Log session if focus type and enforce break screen
          if (activeTimer.type === 'focus' || activeTimer.type === 'custom') {
            const sessionLeaves = leaveCountRef.current;
            const startedAt = sessionStartTimeRef.current || new Date(Date.now() - activeTimer.durationMinutes * 60000).toISOString();
            const sessionId = logSession({
              subject: activeTimer.name,
              durationMinutes: activeTimer.durationMinutes,
              startedAt,
              leaveCount: sessionLeaves,
              endedEarly: false,
              intention: focusIntention.trim() || undefined,
              type: 'pomodoro',
            });
            sessionStartTimeRef.current = null;
            leaveCountRef.current = 0;
            setLeaveCount(0);

            const nextWorkCount = completedWorkBlocks + 1;
            setCompletedWorkBlocks(nextWorkCount);
            const breakType = getNextBreakType(nextWorkCount);
            const breakMins = getBreakDurationMinutes(breakType, settings.shortBreakMinutes, 15);
            const breakSecs = breakMins * 60;
            breakEndTimeRef.current = Date.now() + breakSecs * 1000;
            setBreakScreen({
              type: breakType,
              totalSeconds: breakSecs,
              secondsLeft: breakSecs,
              lastLeaveCount: sessionLeaves,
              lastSessionId: sessionId,
              startedAt: new Date().toISOString(),
            });
          } else if (activeTimer.type === 'shortBreak' || activeTimer.type === 'longBreak') {
            logSession({
              subject: activeTimer.name,
              durationMinutes: activeTimer.durationMinutes,
              startedAt: sessionStartTimeRef.current || undefined,
              breakSkipped: false,
              type: activeTimer.type,
            });
            sessionStartTimeRef.current = null;
          }
          setTimeLeft(0);
        }
      }, 500);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, activeTimer.name, activeTimer.durationMinutes, activeTimer.type, completedWorkBlocks, focusIntention, logSession, playAlarmSound, settings.notificationsEnabled, settings.shortBreakMinutes]);

  // Enforced break countdown effect
  useEffect(() => {
    if (!breakScreen) return;
    if (!breakEndTimeRef.current) {
      breakEndTimeRef.current = Date.now() + breakScreen.secondsLeft * 1000;
    }
    const interval = setInterval(() => {
      if (!breakEndTimeRef.current) return;
      const remaining = Math.max(0, Math.ceil((breakEndTimeRef.current - Date.now()) / 1000));
      if (remaining <= 0) {
        clearInterval(interval);
        breakEndTimeRef.current = null;
        playAlarmSound();
        logSession({
          subject: breakScreen.type === 'longBreak' ? 'Long Break' : 'Short Break',
          durationMinutes: Math.max(1, Math.round(breakScreen.totalSeconds / 60)),
          startedAt: breakScreen.startedAt,
          breakSkipped: false,
          type: breakScreen.type,
        });
        setBreakScreen(null);
        setTimeLeft(activeTimer.durationMinutes * 60);
      } else {
        setBreakScreen(prev => (prev ? { ...prev, secondsLeft: remaining } : null));
      }
    }, 500);
    return () => clearInterval(interval);
  }, [breakScreen, activeTimer.durationMinutes, logSession, playAlarmSound]);

  const handleSkipBreak = useCallback(() => {
    if (!breakScreen) return;
    breakEndTimeRef.current = null;
    logSession({
      subject: breakScreen.type === 'longBreak' ? 'Long Break' : 'Short Break',
      durationMinutes: 0,
      startedAt: breakScreen.startedAt,
      breakSkipped: true,
      type: breakScreen.type,
    });
    setBreakScreen(null);
    setTimeLeft(activeTimer.durationMinutes * 60);
  }, [breakScreen, activeTimer.durationMinutes, logSession]);

  const handleReset = () => {
    targetEndTimeRef.current = null;
    sessionStartTimeRef.current = null;
    leaveCountRef.current = 0;
    setLeaveCount(0);
    setIsRunning(false);
    if (notificationIdRef.current) void cancelTimerNotification(notificationIdRef.current);
    setTimeLeft(activeTimer.durationMinutes * 60);
  };

  const handleEndEarly = () => {
    const elapsedSeconds = Math.max(0, activeTimer.durationMinutes * 60 - timeLeft);
    const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    logSession({
      subject: activeTimer.name,
      durationMinutes: elapsedMinutes,
      startedAt: sessionStartTimeRef.current || undefined,
      leaveCount: leaveCountRef.current,
      endedEarly: true,
      intention: focusIntention.trim() || undefined,
      type: 'pomodoro',
    });
    handleReset();
  };

  const handleRunToggle = async () => {
    if (breakScreen) return;
    if (isRunning) {
      targetEndTimeRef.current = null;
      if (notificationIdRef.current) await cancelTimerNotification(notificationIdRef.current);
      setIsRunning(false);
      return;
    }

    if (!sessionStartTimeRef.current) {
      sessionStartTimeRef.current = new Date().toISOString();
      leaveCountRef.current = 0;
      setLeaveCount(0);
    }
    targetEndTimeRef.current = Date.now() + timeLeft * 1000;
    if (settings.notificationsEnabled) {
      notificationIdRef.current = Date.now() % 2147483647;
      await scheduleTimerNotification(notificationIdRef.current, activeTimer.name, timeLeft);
    }
    setIsRunning(true);
  };

  const handleAddBoost = (minsToAdd: number) => {
    if (targetEndTimeRef.current !== null) {
      targetEndTimeRef.current += minsToAdd * 60 * 1000;
    }
    setTimeLeft(prev => prev + minsToAdd * 60);
  };

  // Open Create Timer Modal
  const openAddTimerModal = () => {
    setEditingTimerId(null);
    setFormTimerName('');
    setFormTimerMins(25);
    setFormTimerType('focus');
    setFormTimerTheme('emerald');
    setTimerModalOpen(true);
  };

  // Open Edit Timer Modal
  const openEditTimerModal = (timer: CustomTimerItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingTimerId(timer.id);
    setFormTimerName(timer.name);
    setFormTimerMins(timer.durationMinutes);
    setFormTimerType(timer.type);
    setFormTimerTheme(timer.colorTheme);
    setTimerModalOpen(true);
  };

  const handleSaveCustomTimer = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formTimerName.trim() || 'Focus Session';
    const duration = Math.min(240, Math.max(1, Number(formTimerMins) || 25));

    if (editingTimerId) {
      const updated = customTimers.map(t => t.id === editingTimerId ? {
        ...t,
        name: cleanName,
        durationMinutes: duration,
        type: formTimerType,
        colorTheme: formTimerTheme,
      } : t);
      saveCustomTimers(updated);
      if (activeTimerId === editingTimerId) {
        setTimeLeft(duration * 60);
      }
    } else {
      const newTimer: CustomTimerItem = {
        id: 'timer_' + Date.now(),
        name: cleanName,
        durationMinutes: duration,
        type: formTimerType,
        colorTheme: formTimerTheme,
        createdAt: new Date().toISOString(),
      };
      const updated = [...customTimers, newTimer];
      saveCustomTimers(updated);
      setActiveTimerId(newTimer.id);
    }

    setTimerModalOpen(false);
  };

  const handleDeleteTimer = (timerId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (customTimers.length <= 1) return;
    const updated = customTimers.filter(t => t.id !== timerId);
    saveCustomTimers(updated);
    if (activeTimerId === timerId) {
      setActiveTimerId(updated[0]?.id || '');
    }
  };

  // Alarms Handlers
  const openAlarmForm = (alarm?: typeof alarms[number]) => {
    setEditingAlarmId(alarm?.id || null);
    setAlarmLabel(alarm?.label || '');
    setAlarmTime(alarm?.time || '08:00');
    setAlarmRepeat(alarm?.repeat || 'daily');
    setAlarmFormOpen(true);
  };

  const saveAlarm = () => {
    const details = { label: alarmLabel.trim() || 'Study reminder', time: alarmTime, repeat: alarmRepeat, enabled: true } as const;
    if (editingAlarmId) updateAlarm(editingAlarmId, details);
    else addAlarm(details);
    setAlarmFormOpen(false);
    setEditingAlarmId(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalDurationSecs = activeTimer.durationMinutes * 60;
  // Sphere starts full (100%) and drains down to empty (0%) as timer runs
  const liquidPercent = totalDurationSecs > 0 
    ? Math.max(0, Math.min(100, (timeLeft / totalDurationSecs) * 100))
    : 100;
  const elapsedPercent = totalDurationSecs > 0
    ? Math.round(((totalDurationSecs - timeLeft) / totalDurationSecs) * 100)
    : 0;

  // Calculate daily focus stats
  const todaySessions = sessions.filter(s => {
    const d = new Date(s.completedAt);
    const today = new Date();
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  });
  const totalFocusMinsToday = todaySessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const focusHours = Math.floor(totalFocusMinsToday / 60);
  const focusRemainderMins = totalFocusMinsToday % 60;

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-5 pb-28">
      
      {/* Top Toggle: Timers vs Native Alarms with Fixed Sliding Indicator */}
      <div className="relative mx-auto flex max-w-md items-center rounded-full border border-slate-200 bg-white p-1.5 shadow-md dark:border-slate-800 dark:bg-slate-900">
        <div 
          className={`absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-6px)] rounded-full bg-[#15803D] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            activePanel === 'timer' ? 'translate-x-0' : 'translate-x-full'
          }`} 
        />
        <button 
          type="button" 
          onClick={() => setActivePanel('timer')} 
          className={`relative z-10 flex-1 rounded-full py-2.5 text-xs font-black transition-colors ${activePanel === 'timer' ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}
        >
          <Play className="mr-1 inline h-4 w-4" />Liquid Timer ({customTimers.length})
        </button>
        <button 
          type="button" 
          onClick={() => setActivePanel('alarms')} 
          className={`relative z-10 flex-1 rounded-full py-2.5 text-xs font-black transition-colors ${activePanel === 'alarms' ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}
        >
          <AlarmClock className="mr-1 inline h-4 w-4" />Alarms ({alarms.length})
        </button>
      </div>

      {activePanel === 'alarms' ? (
        /* ALARMS VIEW (Vibrant Sky/Indigo Aurora Glass) */
        <section className="relative mx-auto max-w-2xl space-y-4 rounded-3xl border border-sky-200/90 dark:border-sky-800/60 bg-gradient-to-br from-sky-50/95 via-indigo-50/50 to-white/95 dark:from-sky-950/40 dark:via-indigo-950/25 dark:to-slate-900/90 p-5 pb-24 shadow-xl shadow-sky-500/5 sm:p-7 sm:pb-24 overflow-hidden">
          <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-sky-400/20 dark:bg-sky-500/10 blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-3 relative z-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-300 border border-sky-200/60">
              <AlarmClock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Study Alarms</h2>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Native alarms work in background on Android & PC.</p>
            </div>
          </div>
          
          {alarmFormOpen && (
            <div className="space-y-3 rounded-2xl bg-white/85 dark:bg-slate-800/85 p-4 border border-sky-200/60 dark:border-slate-700 shadow-xs relative z-10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    setAlarmLabel('Time to wind down. Put study and scrolling away.');
                    setAlarmTime('22:00');
                    setAlarmRepeat('daily');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 px-3 py-1 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                >
                  Bedtime wind-down
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Alarm name
                  <input value={alarmLabel} onChange={event => setAlarmLabel(event.target.value)} className="glass-input mt-1" placeholder="Study reminder" />
                </label>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Time
                  <input type="time" value={alarmTime} onChange={event => setAlarmTime(event.target.value)} className="glass-input mt-1" />
                </label>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Repeat
                  <select value={alarmRepeat} onChange={event => setAlarmRepeat(event.target.value as 'once' | 'daily')} className="glass-input mt-1">
                    <option value="daily">Daily</option>
                    <option value="once">Once</option>
                  </select>
                </label>
                <button type="button" onClick={saveAlarm} className="glass-primary-button inline-flex items-center justify-center gap-1 rounded-full px-4 py-2.5 text-xs font-black">
                  <Plus className="h-4 w-4" />{editingAlarmId ? 'Save' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {alarms.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-400 relative z-10">No alarms yet. Tap the bottom right + button to add a reminder.</p>
          ) : (
            <div className="space-y-2 relative z-10">
              {alarms.map(alarm => (
                <div key={alarm.id} className="flex items-center justify-between gap-3 rounded-2xl border border-sky-200/60 bg-white/85 p-3.5 dark:border-slate-700 dark:bg-slate-800/85 shadow-xs">
                  <div className="flex min-w-0 items-center gap-3">
                    <Bell className={`h-5 w-5 shrink-0 ${alarm.enabled ? 'text-sky-600' : 'text-slate-400'}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900 dark:text-white">{alarm.label}</p>
                      <p className="text-xs font-semibold text-slate-500">{alarm.time} · {alarm.repeat === 'daily' ? 'Every day' : 'Once'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label={`${alarm.enabled ? 'Disable' : 'Enable'} ${alarm.label}`} onClick={() => toggleAlarm(alarm.id)} className={`rounded-full px-3 py-1.5 text-xs font-black ${alarm.enabled ? 'bg-[#0284c7] text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'}`}>
                      {alarm.enabled ? 'Enabled' : 'Off'}
                    </button>
                    <button type="button" aria-label={`Edit ${alarm.label}`} onClick={() => openAlarmForm(alarm)} className="glass-icon-button h-8 w-8 p-1.5 text-sky-600">
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button type="button" aria-label={`Delete ${alarm.label}`} onClick={() => deleteAlarm(alarm.id)} className="glass-icon-button h-8 w-8 p-1.5 text-rose-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        /* =========================================================================
           DYNAMIC 3D ROUND SPHERICAL LIQUID GLASS TIMER
           ========================================================================= */
        <div className="space-y-4 sm:space-y-5">
          
          {/* Main 3D Spherical Liquid Glass Card (Vibrant Cosmic Indigo Aurora) */}
          <div className="relative overflow-hidden rounded-3xl p-5 sm:p-7 border border-indigo-200/90 dark:border-indigo-800/60 bg-gradient-to-br from-indigo-50/95 via-purple-50/50 to-white/95 dark:from-indigo-950/45 dark:via-purple-950/25 dark:to-slate-900/90 shadow-2xl shadow-indigo-500/10 max-w-2xl mx-auto text-center space-y-3 sm:space-y-4">
            
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br from-indigo-400/20 to-purple-500/20 dark:from-indigo-500/15 dark:to-purple-500/10 blur-3xl pointer-events-none" />

            {/* Header: Active Preset Name & Duration Info */}
            <div className="flex items-center justify-between border-b border-indigo-100/90 dark:border-slate-800/80 pb-2.5 relative z-10">
              <div className="flex items-center gap-2.5">
                <span className={`text-xs font-black px-3.5 py-1.5 rounded-xl border ${getThemeBadgeStyle(activeTimer.colorTheme)}`}>
                  {activeTimer.name}
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {activeTimer.durationMinutes} Minutes Preset
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-black text-indigo-600 dark:text-indigo-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>3D Flow Sphere</span>
              </div>
            </div>

            {/* =========================================================================
                THE 3D SPHERICAL LIQUID GLASS ORB
                ========================================================================= */}
            <div className={`liquid-sphere-wrapper ${getThemeClass(activeTimer.colorTheme)}`}>
              
              {/* Dynamic Ambient Glow Behind Sphere */}
              <div className="liquid-sphere-ambient-glow" />

              {/* 3D Convex Glass Sphere */}
              <div className="liquid-sphere-orb">
                
                {/* 3D Glass Depth Ring & Specular Reflections */}
                <div className="liquid-sphere-depth-ring" />
                <div className="liquid-sphere-highlight" />
                <div className="liquid-sphere-glare-arc" />
                <div className="liquid-sphere-rim-light" />

                {/* Animated Liquid Reservoir (Draining towards 0%) */}
                <div 
                  className="liquid-container" 
                  style={{ height: `${liquidPercent}%` }}
                >
                  <div className="liquid-fill" />
                  
                  {/* Wave Layer 1 */}
                  <svg className="liquid-wave-layer liquid-wave-1 text-white/30 dark:text-white/20" viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ animationPlayState: isRunning ? 'running' : 'paused' }}>
                    <path d="M0,20 C150,80 350,-20 500,40 C650,100 900,10 1200,30 L1200,120 L0,120 Z" fill="currentColor" />
                  </svg>
                  
                  {/* Wave Layer 2 */}
                  <svg className="liquid-wave-layer liquid-wave-2 text-white/45 dark:text-white/35" viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ animationPlayState: isRunning ? 'running' : 'paused' }}>
                    <path d="M0,40 C200,90 400,-10 600,50 C800,110 1000,20 1200,40 L1200,120 L0,120 Z" fill="currentColor" />
                  </svg>

                  {/* Rising Liquid Bubbles */}
                  {isRunning && liquidPercent > 5 && (
                    <>
                      <div className="liquid-bubble w-3 h-3 left-1/4 bottom-4" style={{ animationDelay: '0s' }} />
                      <div className="liquid-bubble w-2 h-2 left-1/2 bottom-2" style={{ animationDelay: '1.4s' }} />
                      <div className="liquid-bubble w-3.5 h-3.5 left-2/3 bottom-5" style={{ animationDelay: '2.6s' }} />
                    </>
                  )}
                </div>

                {/* Inner Content Floating over the 3D Liquid Glass */}
                <div className="liquid-sphere-content space-y-2.5 p-6">
                  
                  {/* Focus Badge */}
                  <span className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-widest px-3.5 py-1 rounded-full bg-white/70 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xs flex items-center gap-1.5 mx-auto">
                    {activeTimer.type === 'focus' ? (
                      <Flame className="w-3.5 h-3.5 text-amber-500 fill-current animate-pulse" />
                    ) : (
                      <Coffee className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                    <span>{activeTimer.type === 'focus' ? 'Deep Focus' : activeTimer.type === 'shortBreak' ? 'Short Break' : 'Recharge'}</span>
                  </span>

                  {/* Big 3D Digital Countdown Timer */}
                  <div className="text-5xl sm:text-6xl font-black font-headline tracking-tighter text-slate-900 dark:text-white drop-shadow-lg select-none">
                    {formatTime(timeLeft)}
                  </div>

                  {/* Flow State Status */}
                  <div className="text-xs font-black text-slate-700 dark:text-slate-200 drop-shadow-xs flex items-center justify-center gap-1">
                    <span>{isRunning ? '⚡ Flowing Now' : '✨ Ready to Begin'}</span>
                  </div>

                  {/* Progress Indicator */}
                  <div className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                    {elapsedPercent}% elapsed ({Math.ceil(timeLeft / 60)}m left)
                    {(activeTimer.type === 'focus' || activeTimer.type === 'custom') && (isRunning || leaveCount > 0) && (
                      <span className="block mt-0.5 text-[10px]">App leaves: {leaveCount}</span>
                    )}
                  </div>

                </div>
              </div>
            </div>

            {/* Optional 1-line Focus Intention */}
            {(activeTimer.type === 'focus' || activeTimer.type === 'custom') && (
              <div className="max-w-sm mx-auto">
                <input
                  type="text"
                  value={focusIntention}
                  onChange={(e) => setFocusIntention(e.target.value)}
                  placeholder="What are you focusing on? (optional)"
                  aria-label="Focus intention"
                  className="w-full rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-white/80 dark:bg-emerald-950/30 px-4 py-2 text-xs font-semibold text-[#14201A] dark:text-white placeholder:text-[#4B5B52]/70 focus:outline-none"
                />
              </div>
            )}

            {/* Playback Controls & Time Boost */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              
              {/* Quick Boosts */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAddBoost(1)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-xs"
                  title="Add 1 Minute"
                >
                  +1m
                </button>
                <button
                  onClick={() => handleAddBoost(5)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-xs"
                  title="Add 5 Minutes"
                >
                  +5m
                </button>
              </div>

              {/* Main Playback Bar */}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleReset}
                  className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200/80 dark:border-slate-700 transition-all shadow-xs"
                  title="Reset Timer"
                  aria-label="Reset Timer"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => void handleRunToggle()}
                  aria-label={isRunning ? 'Pause timer' : 'Start timer'}
                  className={`w-16 h-16 rounded-2xl bg-gradient-to-tr ${getThemeGradient(activeTimer.colorTheme)} text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all`}
                >
                  {isRunning ? (
                    <Pause className="w-7 h-7 fill-current" />
                  ) : (
                    <Play className="w-7 h-7 fill-current ml-1" />
                  )}
                </button>

                {(activeTimer.type === 'focus' || activeTimer.type === 'custom') &&
                  (isRunning || timeLeft < activeTimer.durationMinutes * 60) && (
                    <button
                      type="button"
                      onClick={handleEndEarly}
                      className="px-3.5 py-2.5 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-emerald-950/40 text-xs font-bold text-[#4B5B52] dark:text-emerald-200 hover:bg-[#DCFCE7]/50 transition-colors"
                    >
                      End early
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() => {
                    const currentIndex = customTimers.findIndex(t => t.id === activeTimerId);
                    const nextTimer = customTimers[(currentIndex + 1) % customTimers.length];
                    if (nextTimer) setActiveTimerId(nextTimer.id);
                  }}
                  className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200/80 dark:border-slate-700 transition-all shadow-xs"
                  title="Next Preset Timer"
                  aria-label="Next Preset Timer"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

            </div>

            {/* Distraction Parking Lot */}
            {(activeTimer.type === 'focus' || activeTimer.type === 'custom') && (
              <div className="pt-3 border-t border-emerald-100 dark:border-emerald-800/50 text-left space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[#14532D] dark:text-[#86EFAC]">
                    Distraction Parking Lot
                  </span>
                  {parkedThoughts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => saveParkedThoughts([])}
                      className="text-[11px] font-bold text-[#4B5B52] dark:text-emerald-200 hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = parkedInput.trim();
                    if (!text) return;
                    saveParkedThoughts([{ id: String(Date.now()), text, done: false }, ...parkedThoughts]);
                    setParkedInput('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={parkedInput}
                    onChange={(e) => setParkedInput(e.target.value)}
                    placeholder="Park an impulsive thought (e.g. Check email)..."
                    aria-label="Park a distracting thought"
                    className="flex-1 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-emerald-950/30 px-3 py-1.5 text-xs font-medium text-[#14201A] dark:text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-[#15803D] hover:bg-[#166534] text-white px-3 py-1.5 text-xs font-black"
                  >
                    Park
                  </button>
                </form>
                {parkedThoughts.length > 0 && (
                  <ul className="space-y-1 max-h-28 overflow-y-auto">
                    {parkedThoughts.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#DCFCE7]/50 dark:bg-emerald-950/40 px-3 py-1.5 text-xs">
                        <label className="flex items-center gap-2 cursor-pointer min-w-0">
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() =>
                              saveParkedThoughts(
                                parkedThoughts.map((p) => (p.id === item.id ? { ...p, done: !p.done } : p))
                              )
                            }
                            className="accent-[#15803D]"
                          />
                          <span className={`truncate ${item.done ? 'line-through text-[#4B5B52]' : 'text-[#14201A] dark:text-emerald-100'}`}>
                            {item.text}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => saveParkedThoughts(parkedThoughts.filter((p) => p.id !== item.id))}
                          aria-label={`Remove ${item.text}`}
                          className="text-[#4B5B52] hover:text-rose-600 text-xs font-bold px-1"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

          </div>

          {/* =========================================================================
              CUSTOM TIMERS PRESETS GRID (Clean without subject clutter)
              ========================================================================= */}
          <div className="space-y-4 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-lg font-black text-slate-900 dark:text-white font-headline">
                  Timer Presets ({customTimers.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={openAddTimerModal}
                className="text-xs font-bold text-[#15803D] dark:text-[#86EFAC] hover:underline flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add custom timer
              </button>
            </div>

            {/* Built-in Wellness Presets (always available even in clean seed mode) */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'preset-focus-25', name: 'Pomodoro Focus', durationMinutes: 25, type: 'focus' as const },
                { id: 'preset-short-break-5', name: 'Short Break (5 min)', durationMinutes: 5, type: 'shortBreak' as const },
                { id: 'preset-long-break-15', name: 'Long Break (15 min)', durationMinutes: 15, type: 'longBreak' as const },
              ].map((preset) => {
                const isSelected = activeTimer.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSelectedBuiltInPreset({
                        ...preset,
                        colorTheme: 'emerald',
                        createdAt: new Date().toISOString(),
                      });
                      setActiveTimerId(preset.id);
                    }}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold border transition-colors ${
                      isSelected
                        ? 'bg-[#15803D] text-white border-[#15803D]'
                        : 'bg-[#DCFCE7]/70 dark:bg-emerald-950/50 text-[#14532D] dark:text-emerald-200 border-emerald-200 dark:border-emerald-800 hover:bg-[#DCFCE7]'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>

            {customTimers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-emerald-200 dark:border-emerald-800/60 bg-white/70 dark:bg-[#13261C]/60 p-6 text-center space-y-2">
                <p className="text-sm font-bold text-[#14201A] dark:text-white">No custom timers saved yet</p>
                <p className="text-xs text-[#4B5B52] dark:text-emerald-200/80">
                  Use the presets above or add your own custom timer.
                </p>
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {customTimers.map((t) => {
                const isActive = t.id === activeTimerId;
                return (
                  <div
                    key={t.id}
                    onClick={() => setActiveTimerId(t.id)}
                    className={`relative p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 group ${
                      isActive 
                        ? 'bg-white dark:bg-slate-800/95 border-indigo-500 shadow-md ring-2 ring-indigo-500/20' 
                        : 'bg-white/70 dark:bg-slate-900/70 border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full bg-gradient-to-tr ${getThemeGradient(t.colorTheme)}`} />
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider border ${getThemeBadgeStyle(t.colorTheme)}`}>
                          {t.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => openEditTimerModal(t, e)}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Edit timer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTimer(t.id, e)}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Delete timer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className={`font-black text-base font-headline ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>
                        {t.name}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {t.durationMinutes} minutes • {t.type === 'focus' ? 'Deep Focus' : 'Break'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <span className="font-black text-slate-700 dark:text-slate-300">
                        {t.durationMinutes} mins
                      </span>
                      <span className={`text-[11px] font-bold flex items-center gap-1 ${isActive ? 'text-[#15803D] dark:text-[#86EFAC]' : 'text-slate-400'}`}>
                        {isActive ? 'Active Now' : 'Select Timer'}
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {/* =========================================================================
              DAILY FOCUS STATS & COMPLETED SESSIONS (Vibrant Aurora Cards)
              ========================================================================= */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
            
            {/* Stat Card 1: Today's Focus Hours (Vibrant Sunset Amber Aurora) */}
            <div className="relative overflow-hidden rounded-3xl p-6 border border-orange-200/90 dark:border-orange-800/60 bg-gradient-to-br from-orange-50/95 via-amber-50/50 to-white/95 dark:from-orange-950/40 dark:via-amber-950/25 dark:to-slate-900/90 shadow-xl shadow-orange-500/5 flex items-center gap-4">
              <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-orange-400/20 dark:bg-orange-500/10 blur-xl pointer-events-none" />
              <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-950/80 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold border border-orange-200/60 relative z-10 shrink-0">
                <Flame className="w-6 h-6 fill-current" />
              </div>
              <div className="relative z-10">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Today's Focus Time</p>
                <h4 className="text-2xl font-black text-slate-900 dark:text-white font-headline">
                  {focusHours > 0 ? `${focusHours}h ` : ''}{focusRemainderMins}m
                </h4>
              </div>
            </div>

            {/* Stat Card 2: Completed Sessions Count (Vibrant Indigo Aurora) */}
            <div className="relative overflow-hidden rounded-3xl p-6 border border-indigo-200/90 dark:border-indigo-800/60 bg-gradient-to-br from-indigo-50/95 via-purple-50/50 to-white/95 dark:from-indigo-950/40 dark:via-purple-950/25 dark:to-slate-900/90 shadow-xl shadow-indigo-500/5 flex items-center gap-4">
              <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-indigo-400/20 dark:bg-indigo-500/10 blur-xl pointer-events-none" />
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold border border-indigo-200/60 relative z-10 shrink-0">
                <Award className="w-6 h-6" />
              </div>
              <div className="relative z-10">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sessions Completed</p>
                <h4 className="text-2xl font-black text-slate-900 dark:text-white font-headline">
                  {todaySessions.length} sessions
                </h4>
              </div>
            </div>

            {/* Stat Card 3: Total Recorded (Vibrant Emerald Aurora) */}
            <div className="relative overflow-hidden rounded-3xl p-6 border border-emerald-200/90 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-50/95 via-teal-50/50 to-white/95 dark:from-emerald-950/40 dark:via-teal-950/25 dark:to-slate-900/90 shadow-xl shadow-emerald-500/5 flex items-center gap-4">
              <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-emerald-400/20 dark:bg-emerald-500/10 blur-xl pointer-events-none" />
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-300 flex items-center justify-center font-bold border border-emerald-200/60 relative z-10 shrink-0">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div className="relative z-10">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Lifetime Sessions</p>
                <h4 className="text-2xl font-black text-slate-900 dark:text-white font-headline">
                  {sessions.length} total
                </h4>
              </div>
            </div>

          </div>

          {/* Completed Focus Sessions List (Vibrant Orchid/Purple Aurora) */}
          <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 border border-purple-200/90 dark:border-purple-800/60 bg-gradient-to-br from-purple-50/95 via-indigo-50/50 to-white/95 dark:from-purple-950/40 dark:via-indigo-950/25 dark:to-slate-900/90 shadow-xl shadow-purple-500/5 max-w-5xl mx-auto space-y-4">
            <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-purple-400/20 dark:bg-purple-500/10 blur-2xl pointer-events-none" />
            
            <div className="flex items-center justify-between relative z-10">
              <h3 className="text-lg font-black text-slate-900 dark:text-white font-headline flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 flex items-center justify-center border border-purple-200/60">
                  <Award className="w-4 h-4 text-amber-500" />
                </div>
                <span>Recent Focus Sessions History</span>
              </h3>
            </div>

            {sessions.length === 0 ? (
              <p className="text-sm text-slate-500 font-bold py-6 text-center relative z-10">No focus sessions recorded yet today. Hit play above to begin!</p>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 relative z-10">
                {sessions.slice(0, 10).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-4 rounded-2xl bg-white/85 dark:bg-slate-800/85 border border-purple-200/60 dark:border-slate-700 shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950/70 text-orange-600 flex items-center justify-center font-bold border border-orange-200/60">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">{s.subject}</h4>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(s.completedAt).toLocaleDateString()}
                          {typeof s.leaveCount === 'number' && (s.type === 'pomodoro' || s.type === 'stopwatch') && (
                            <> • {s.leaveCount} {s.leaveCount === 1 ? 'leave' : 'leaves'}</>
                          )}
                        </span>
                      </div>
                    </div>
                    <span className="font-black text-emerald-700 dark:text-emerald-300 font-headline text-base">
                      {s.breakSkipped ? 'Skipped' : `+${s.durationMinutes} mins`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* =========================================================================
          BOTTOM-RIGHT FLOATING ACTION BUTTON (FAB) FOR ADDING/EDITING TIMERS
          ========================================================================= */}
      <button
        type="button"
        onClick={activePanel === 'timer' ? openAddTimerModal : () => openAlarmForm()}
        aria-label={activePanel === 'timer' ? 'Add custom timer' : 'Add alarm'}
        className="timer-fab glass-fab shadow-xl hover:scale-110 active:scale-95 transition-transform"
      >
        <Plus className="h-7 w-7 text-white" />
      </button>

      {/* =========================================================================
          MODAL: ADD / EDIT CUSTOM TIMER
          ========================================================================= */}
      {timerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6">
            
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white font-headline">
                {editingTimerId ? 'Edit Timer Preset' : 'Create Custom Timer'}
              </h3>
              <button
                type="button"
                onClick={() => setTimerModalOpen(false)}
                aria-label="Close timer modal"
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomTimer} className="space-y-4">
              
              {/* Timer Name */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Timer Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formTimerName}
                  onChange={(e) => setFormTimerName(e.target.value)}
                  placeholder="e.g. Deep Coding Sprint, Exam Review"
                  className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-2xl py-2.5 px-4 text-sm border border-slate-200 dark:border-slate-700 focus:border-indigo-600 focus:outline-none font-bold"
                />
              </div>

              {/* Duration & Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Duration (Minutes)</label>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    required
                    value={formTimerMins}
                    onChange={(e) => setFormTimerMins(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-2xl py-2.5 px-4 text-sm border border-slate-200 dark:border-slate-700 focus:border-indigo-600 focus:outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Type</label>
                  <select
                    value={formTimerType}
                    onChange={(e) => setFormTimerType(e.target.value as 'focus' | 'shortBreak' | 'longBreak' | 'custom')}
                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-2xl py-2.5 px-3 text-sm border border-slate-200 dark:border-slate-700 focus:border-indigo-600 focus:outline-none font-bold"
                  >
                    <option value="focus">🎯 Focus Session</option>
                    <option value="shortBreak">☕ Short Break</option>
                    <option value="longBreak">🌿 Long Recharge</option>
                    <option value="custom">⚡ Custom</option>
                  </select>
                </div>
              </div>

              {/* Liquid Color Theme */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">Timer Theme</label>
                <div className="flex gap-2">
                  {(['emerald'] as TimerColorTheme[]).map((theme) => {
                    const isSelected = formTimerTheme === theme;
                    return (
                      <button
                        key={theme}
                        type="button"
                        onClick={() => setFormTimerTheme(theme)}
                        className={`px-4 py-2 rounded-2xl border flex items-center gap-2 transition-all ${
                          isSelected 
                            ? 'border-[#15803D] bg-[#DCFCE7] dark:bg-emerald-950/50 ring-2 ring-[#15803D]/20' 
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-gradient-to-tr ${getThemeGradient(theme)}`} />
                        <span className="text-xs font-bold text-[#14201A] dark:text-emerald-200">Calm Green</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-between pt-3">
                {editingTimerId ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteTimer(editingTimerId);
                      setTimerModalOpen(false);
                    }}
                    className="px-4 py-2.5 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl"
                  >
                    Delete Timer
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTimerModalOpen(false)}
                    className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-2xl bg-[#15803D] text-white text-xs font-black shadow-md hover:bg-[#166534]"
                  >
                    {editingTimerId ? 'Save Changes' : 'Create Timer'}
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* =========================================================================
          FULL-SCREEN ENFORCED BREAK OVERLAY
          ========================================================================= */}
      {breakScreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="break-screen-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              handleSkipBreak();
            }
          }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white dark:bg-[#0F1F17] p-6 text-center"
        >
          <div className="max-w-md w-full space-y-6 rounded-3xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 p-8 shadow-xl">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/60 text-[#15803D] dark:text-emerald-300 flex items-center justify-center">
              <Coffee className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <span className="inline-block rounded-full bg-[#DCFCE7] dark:bg-emerald-900/70 px-3 py-1 text-xs font-black uppercase tracking-wider text-[#15803D] dark:text-emerald-200">
                {breakScreen.type === 'longBreak' ? 'Long Break' : 'Short Break'}
              </span>
              <h2 id="break-screen-title" className="text-3xl font-black text-[#14201A] dark:text-white font-headline">
                {formatTime(breakScreen.secondsLeft)}
              </h2>
              <p className="text-base font-bold text-[#14201A] dark:text-emerald-100">
                Stretch, drink water, leave your phone face-down.
              </p>
            </div>

            <div className="rounded-2xl bg-white/90 dark:bg-slate-900/70 border border-emerald-200/80 dark:border-emerald-800/60 p-4 text-xs font-semibold text-[#4B5B52] dark:text-emerald-200">
              {formatLeaveCountMessage(breakScreen.lastLeaveCount)}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-[#4B5B52] dark:text-emerald-200">
                How did that session feel? (optional)
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(['calm', 'neutral', 'distracted'] as const).map((mood) => {
                  const selected = breakScreen.reflection === mood;
                  return (
                    <button
                      key={mood}
                      type="button"
                      onClick={() => {
                        updateSessionReflection(breakScreen.lastSessionId, mood);
                        setBreakScreen((prev) => (prev ? { ...prev, reflection: mood } : null));
                      }}
                      className={`rounded-xl py-2 px-3 text-xs font-bold capitalize border transition-colors ${
                        selected
                          ? 'bg-[#15803D] text-white border-[#15803D]'
                          : 'bg-white dark:bg-slate-900 text-[#14201A] dark:text-emerald-200 border-emerald-200 dark:border-emerald-800 hover:bg-[#DCFCE7]'
                      }`}
                    >
                      {mood}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              autoFocus
              onClick={handleSkipBreak}
              className="w-full rounded-2xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-[#15803D] dark:text-emerald-300 hover:bg-[#DCFCE7] dark:hover:bg-emerald-950 transition-colors"
            >
              Skip break
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
