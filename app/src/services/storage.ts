import DOMPurify from 'dompurify';
import type { StudentProfile, TaskItem, NoteItem, ClassSchedule, FocusSession, BedtimeLog, AppSettings, AlarmItem, CustomTimerItem, ThemeMode, ThemePreset } from '../types';

export function getLocalDateStr(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isDateOverdue(dueDateStr: string): boolean {
  if (!dueDateStr) return false;
  const cleanDate = dueDateStr.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    return cleanDate < getLocalDateStr();
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  if (Number.isNaN(due.getTime())) return false;
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export const sanitizeHtml = (dirty: unknown): string => {
  if (typeof dirty !== 'string') return '';
  const clean = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'span',
      'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'code', 'pre', 'blockquote', 'table',
      'thead', 'tbody', 'tr', 'th', 'td', 'br', 'hr', 'a'
    ],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'style'],
  });
  return clean.replace(/<a\s+([^>]*?)>/gi, (_match, attrs: string) => {
    const cleanedAttrs = attrs.replace(/\brel\s*=\s*(['"])[^'"]*\1/gi, '').trim();
    return `<a ${cleanedAttrs} rel="noopener noreferrer">`;
  });
};

export const sanitizeText = (dirty: unknown): string => {
  if (typeof dirty !== 'string') return '';
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
};

const STORAGE_KEYS = {
  PROFILE: 'studyflow_profile',
  TASKS: 'studyflow_tasks',
  NOTES: 'studyflow_notes',
  SCHEDULE: 'studyflow_schedule',
  SESSIONS: 'studyflow_sessions',
  SETTINGS: 'studyflow_settings',
  ALARMS: 'studyflow_alarms',
  CUSTOM_TIMERS: 'studyflow_custom_timers',
  BEDTIME_LOGS: 'studyflow_bedtime_logs',
};
const PENDING_CLOUD_SYNC_KEY = 'studyflow_pending_cloud_sync';

export const ENABLE_DEV_SAMPLE_DATA = false;

export const defaultBedtimeLogs: BedtimeLog[] = [];

const localChangeListeners = new Set<() => void>();

export const defaultProfile: StudentProfile = {
  name: '',
  major: '',
  academicYear: '',
  weeklyGoalHours: 15,
  email: '',
  bio: '',
};

export const defaultSettings: AppSettings = {
  themeMode: 'light',
  themePreset: 'green',
  soundEnabled: true,
  notificationsEnabled: false,
  alarmVolume: 80,
  autoStartBreaks: false,
  autoStartPomodoros: false,
  pomodoroMinutes: 25,
  shortBreakMinutes: 5,
  autoSync: false,
  deviceSyncId: 'device_' + Math.random().toString(36).substring(2, 9),
};

export const defaultTasks: TaskItem[] = ENABLE_DEV_SAMPLE_DATA ? [
  {
    id: 'sample-task-1',
    title: 'Review lecture notes',
    dueDate: getLocalDateStr(),
    priority: 'medium',
    completed: false,
    subject: 'Computer Science',
    createdAt: new Date().toISOString(),
  },
] : [];
export const defaultNotes: NoteItem[] = ENABLE_DEV_SAMPLE_DATA ? [
  {
    id: 'sample-note-1',
    title: 'Week 1 Summary',
    content: '<p>Key concepts from today’s lecture.</p>',
    subject: 'Computer Science',
    tags: ['lecture'],
    isPinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
] : [];
export const defaultAlarms: AlarmItem[] = [];

export const defaultCustomTimers: CustomTimerItem[] = ENABLE_DEV_SAMPLE_DATA ? [
  {
    id: 'timer-pomodoro',
    name: 'Pomodoro Focus',
    durationMinutes: 25,
    type: 'focus',
    colorTheme: 'emerald',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'timer-short-break',
    name: 'Short Break (5 min)',
    durationMinutes: 5,
    type: 'shortBreak',
    colorTheme: 'emerald',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'timer-long-break',
    name: 'Long Break (15 min)',
    durationMinutes: 15,
    type: 'longBreak',
    colorTheme: 'emerald',
    createdAt: new Date().toISOString(),
  },
] : [];

export const defaultSchedule: ClassSchedule[] = ENABLE_DEV_SAMPLE_DATA ? [
  {
    id: 'sample-class-1',
    subjectName: 'Computer Science',
    code: 'CS101',
    instructor: 'Dr. Rao',
    location: 'Room 204',
    dayOfWeek: 'Monday',
    startTime: '10:00',
    endTime: '11:00',
    color: '#15803D',
  },
] : [];
export const defaultSessions: FocusSession[] = [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isObjectArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isRecord);

function readStored<T>(key: string, fallback: T, validate: (value: unknown) => boolean): T {
  const data = localStorage.getItem(key);
  if (!data) return fallback;

  try {
    const parsed: unknown = JSON.parse(data);
    return validate(parsed) ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeSettingsObject(raw: Record<string, unknown>): AppSettings {
  const current = storage.getSettings();
  const validModes: ThemeMode[] = ['light', 'dark', 'system'];
  const validPresets: ThemePreset[] = ['green'];
  return {
    ...defaultSettings,
    themeMode: validModes.includes(raw.themeMode as ThemeMode) ? (raw.themeMode as ThemeMode) : current.themeMode,
    themePreset: validPresets.includes(raw.themePreset as ThemePreset) ? (raw.themePreset as ThemePreset) : current.themePreset,
    soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : current.soundEnabled,
    notificationsEnabled: typeof raw.notificationsEnabled === 'boolean' ? raw.notificationsEnabled : current.notificationsEnabled,
    alarmVolume: typeof raw.alarmVolume === 'number' ? Math.min(100, Math.max(0, raw.alarmVolume)) : current.alarmVolume,
    autoStartBreaks: typeof raw.autoStartBreaks === 'boolean' ? raw.autoStartBreaks : current.autoStartBreaks,
    autoStartPomodoros: typeof raw.autoStartPomodoros === 'boolean' ? raw.autoStartPomodoros : current.autoStartPomodoros,
    pomodoroMinutes: typeof raw.pomodoroMinutes === 'number' ? Math.min(120, Math.max(1, raw.pomodoroMinutes)) : current.pomodoroMinutes,
    shortBreakMinutes: typeof raw.shortBreakMinutes === 'number' ? Math.min(30, Math.max(1, raw.shortBreakMinutes)) : current.shortBreakMinutes,
    autoSync: typeof raw.autoSync === 'boolean' ? raw.autoSync : current.autoSync,
    deviceSyncId: current.deviceSyncId || defaultSettings.deviceSyncId,
  };
}

// Helper functions for LocalStorage
export const storage = {
  getProfile: (): StudentProfile => {
    return {
      ...defaultProfile,
      ...readStored(STORAGE_KEYS.PROFILE, defaultProfile, isRecord),
    };
  },
  saveProfile: (profile: StudentProfile, opts?: { skipCloud?: boolean }) => {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    notifySync(opts);
  },
  getTasks: (): TaskItem[] => {
    return readStored(STORAGE_KEYS.TASKS, defaultTasks, isObjectArray) as TaskItem[];
  },
  saveTasks: (tasks: TaskItem[], opts?: { skipCloud?: boolean }) => {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    notifySync(opts);
  },
  getNotes: (): NoteItem[] => {
    return readStored(STORAGE_KEYS.NOTES, defaultNotes, isObjectArray) as NoteItem[];
  },
  saveNotes: (notes: NoteItem[], opts?: { skipCloud?: boolean }) => {
    const cleanNotes = notes.map((n) => ({
      ...n,
      content: sanitizeHtml(n.content),
    }));
    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(cleanNotes));
    notifySync(opts);
  },
  getSchedule: (): ClassSchedule[] => {
    return readStored(STORAGE_KEYS.SCHEDULE, defaultSchedule, isObjectArray) as ClassSchedule[];
  },
  saveSchedule: (schedule: ClassSchedule[], opts?: { skipCloud?: boolean }) => {
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(schedule));
    notifySync(opts);
  },
  getSessions: (): FocusSession[] => {
    return readStored(STORAGE_KEYS.SESSIONS, defaultSessions, isObjectArray) as FocusSession[];
  },
  saveSessions: (sessions: FocusSession[], opts?: { skipCloud?: boolean }) => {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    notifySync(opts);
  },
  getSettings: (): AppSettings => {
    return {
      ...defaultSettings,
      ...readStored(STORAGE_KEYS.SETTINGS, defaultSettings, isRecord),
    };
  },
  saveSettings: (settings: AppSettings, opts?: { skipCloud?: boolean }) => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    notifySync(opts);
  },
  getAlarms: (): AlarmItem[] => readStored(STORAGE_KEYS.ALARMS, defaultAlarms, isObjectArray) as AlarmItem[],
  saveAlarms: (alarms: AlarmItem[], opts?: { skipCloud?: boolean }) => {
    localStorage.setItem(STORAGE_KEYS.ALARMS, JSON.stringify(alarms));
    notifySync(opts);
  },
  getCustomTimers: (): CustomTimerItem[] => {
    return readStored(STORAGE_KEYS.CUSTOM_TIMERS, defaultCustomTimers, isObjectArray) as CustomTimerItem[];
  },
  saveCustomTimers: (timers: CustomTimerItem[], opts?: { skipCloud?: boolean }) => {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_TIMERS, JSON.stringify(timers));
    notifySync(opts);
  },
  getBedtimeLogs: (): BedtimeLog[] => {
    return readStored(STORAGE_KEYS.BEDTIME_LOGS, defaultBedtimeLogs, isObjectArray) as BedtimeLog[];
  },
  saveBedtimeLogs: (logs: BedtimeLog[], opts?: { skipCloud?: boolean }) => {
    localStorage.setItem(STORAGE_KEYS.BEDTIME_LOGS, JSON.stringify(logs));
    notifySync(opts);
  },
  getAllData: () => ({
    profile: storage.getProfile(),
    tasks: storage.getTasks(),
    notes: storage.getNotes(),
    schedule: storage.getSchedule(),
    sessions: storage.getSessions(),
    settings: storage.getSettings(),
    alarms: storage.getAlarms(),
    customTimers: storage.getCustomTimers(),
    bedtimeLogs: storage.getBedtimeLogs(),
  }),
  hasPendingCloudSync: () => localStorage.getItem(PENDING_CLOUD_SYNC_KEY) === '1',
  clearPendingCloudSync: () => localStorage.removeItem(PENDING_CLOUD_SYNC_KEY),
  exportAllData: () => {
    return JSON.stringify({
      ...storage.getAllData(),
      exportTimestamp: new Date().toISOString(),
    }, null, 2);
  },
  getLastCloudUpload: (): string | null => localStorage.getItem('study_flow_last_cloud_upload'),
  setLastCloudUpload: (time: string) => localStorage.setItem('study_flow_last_cloud_upload', time),
  getLastCloudDownload: (): string | null => localStorage.getItem('study_flow_last_cloud_download'),
  setLastCloudDownload: (time: string) => localStorage.setItem('study_flow_last_cloud_download', time),
  mergeAllData: (remote: unknown, opts?: { skipCloud?: boolean }): boolean => {
    if (!remote || !isRecord(remote)) return false;
    try {
      // 1. Merge Tasks (Deduplicate by ID; prefer remote state on conflict so unchecking/editing works)
      const localTasks = storage.getTasks();
      const remoteTasks = (remote.tasks && isObjectArray(remote.tasks) ? remote.tasks : []) as unknown as TaskItem[];
      const taskMap = new Map<string, TaskItem>();
      localTasks.forEach(t => taskMap.set(t.id, t));
      remoteTasks.forEach(rt => {
        if (!rt.id) return;
        const sanitizedRt: TaskItem = {
          ...rt,
          title: sanitizeText(rt.title),
          description: rt.description ? sanitizeText(rt.description) : undefined,
          subject: rt.subject ? sanitizeText(rt.subject) : undefined,
          subtasks: Array.isArray(rt.subtasks)
            ? rt.subtasks.map(st => ({ ...st, title: sanitizeText(st.title) }))
            : undefined,
        };
        if (!taskMap.has(rt.id)) {
          taskMap.set(rt.id, sanitizedRt);
        } else {
          const local = taskMap.get(rt.id)!;
          taskMap.set(rt.id, {
            ...local,
            ...sanitizedRt,
            completed: typeof sanitizedRt.completed === 'boolean' ? sanitizedRt.completed : local.completed,
            subtasks: Array.from(
              new Map([
                ...(local.subtasks || []).map(s => [s.id, s] as const),
                ...(sanitizedRt.subtasks || []).map(s => [s.id, s] as const),
              ]).values()
            ),
          });
        }
      });
      storage.saveTasks(Array.from(taskMap.values()), opts);

      // 2. Merge Notes (Deduplicate by ID, keep newer updatedAt)
      const localNotes = storage.getNotes();
      const remoteNotes = (remote.notes && isObjectArray(remote.notes) ? remote.notes : []) as unknown as NoteItem[];
      const noteMap = new Map<string, NoteItem>();
      localNotes.forEach(n => noteMap.set(n.id, n));
      remoteNotes.forEach(rn => {
        if (!rn.id) return;
        const sanitizedRn: NoteItem = {
          ...rn,
          title: sanitizeText(rn.title),
          subject: sanitizeText(rn.subject),
          content: sanitizeHtml(rn.content),
          tags: Array.isArray(rn.tags) ? rn.tags.map(sanitizeText).filter(Boolean) : [],
        };
        if (!noteMap.has(rn.id)) {
          noteMap.set(rn.id, sanitizedRn);
        } else {
          const local = noteMap.get(rn.id)!;
          const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
          const remoteTime = new Date(sanitizedRn.updatedAt || sanitizedRn.createdAt || 0).getTime();
          if (remoteTime >= localTime) {
            noteMap.set(rn.id, sanitizedRn);
          }
        }
      });
      storage.saveNotes(Array.from(noteMap.values()), opts);

      // 3. Merge Schedule (Deduplicate by ID or dayOfWeek+startTime+subjectName; update existing IDs)
      const localSchedule = storage.getSchedule();
      const remoteSchedule = (remote.schedule && isObjectArray(remote.schedule) ? remote.schedule : []) as unknown as ClassSchedule[];
      const schedMap = new Map<string, ClassSchedule>();
      localSchedule.forEach(s => schedMap.set(s.id, s));
      remoteSchedule.forEach(rs => {
        if (!rs.id) return;
        const sanitizedRs: ClassSchedule = {
          ...rs,
          subjectName: sanitizeText(rs.subjectName),
          code: rs.code ? sanitizeText(rs.code) : undefined,
          instructor: sanitizeText(rs.instructor),
          location: sanitizeText(rs.location),
        };
        if (schedMap.has(rs.id)) {
          schedMap.set(rs.id, { ...schedMap.get(rs.id)!, ...sanitizedRs });
          return;
        }
        const isDuplicate = Array.from(schedMap.values()).some(
          s => s.dayOfWeek === sanitizedRs.dayOfWeek && s.startTime === sanitizedRs.startTime && s.subjectName.toLowerCase() === sanitizedRs.subjectName.toLowerCase()
        );
        if (!isDuplicate) {
          schedMap.set(rs.id, sanitizedRs);
        }
      });
      storage.saveSchedule(Array.from(schedMap.values()), opts);

      // 4. Merge Sessions (Deduplicate by ID)
      const localSessions = storage.getSessions();
      const remoteSessions = (remote.sessions && isObjectArray(remote.sessions) ? remote.sessions : []) as unknown as FocusSession[];
      const sessionMap = new Map<string, FocusSession>();
      localSessions.forEach(s => sessionMap.set(s.id, s));
      remoteSessions.forEach(rs => {
        if (rs.id && !sessionMap.has(rs.id)) {
          sessionMap.set(rs.id, { ...rs, subject: sanitizeText(rs.subject) });
        }
      });
      storage.saveSessions(Array.from(sessionMap.values()), opts);

      // 5. Merge Alarms (Update existing IDs or add new)
      const localAlarms = storage.getAlarms();
      const remoteAlarms = (remote.alarms && isObjectArray(remote.alarms) ? remote.alarms : []) as unknown as AlarmItem[];
      const alarmMap = new Map<string, AlarmItem>();
      localAlarms.forEach(a => alarmMap.set(a.id, a));
      remoteAlarms.forEach(ra => {
        if (ra.id) {
          alarmMap.set(ra.id, { ...alarmMap.get(ra.id), ...ra, label: sanitizeText(ra.label) });
        }
      });
      storage.saveAlarms(Array.from(alarmMap.values()), opts);

      // 6. Merge Custom Timers (Update existing IDs or add new)
      const localTimers = storage.getCustomTimers();
      const remoteTimers = (remote.customTimers && isObjectArray(remote.customTimers) ? remote.customTimers : []) as unknown as CustomTimerItem[];
      const timerMap = new Map<string, CustomTimerItem>();
      localTimers.forEach(t => timerMap.set(t.id, t));
      remoteTimers.forEach(rt => {
        if (rt.id) {
          timerMap.set(rt.id, { ...timerMap.get(rt.id), ...rt, name: sanitizeText(rt.name) });
        }
      });
      storage.saveCustomTimers(Array.from(timerMap.values()), opts);

      // 7. Merge Bedtime Logs (Deduplicate by date)
      const localBedtimeLogs = storage.getBedtimeLogs();
      const remoteBedtimeLogs = (remote.bedtimeLogs && isObjectArray(remote.bedtimeLogs) ? remote.bedtimeLogs : []) as unknown as BedtimeLog[];
      const bedtimeMap = new Map<string, BedtimeLog>();
      localBedtimeLogs.forEach(b => bedtimeMap.set(b.date, b));
      remoteBedtimeLogs.forEach(rb => {
        if (rb.date && !bedtimeMap.has(rb.date)) {
          bedtimeMap.set(rb.date, rb);
        }
      });
      storage.saveBedtimeLogs(Array.from(bedtimeMap.values()), opts);

      notifySync(opts);
      return true;
    } catch {
      return false;
    }
  },
  importAllData: (jsonData: string, opts?: { skipCloud?: boolean }): boolean => {
    try {
      const parsed: unknown = JSON.parse(jsonData);
      if (!isRecord(parsed)) return false;

      const hasInvalidSection =
        (parsed.profile !== undefined && !isRecord(parsed.profile)) ||
        (parsed.tasks !== undefined && !isObjectArray(parsed.tasks)) ||
        (parsed.notes !== undefined && !isObjectArray(parsed.notes)) ||
        (parsed.schedule !== undefined && !isObjectArray(parsed.schedule)) ||
        (parsed.sessions !== undefined && !isObjectArray(parsed.sessions)) ||
        (parsed.settings !== undefined && !isRecord(parsed.settings)) ||
        (parsed.alarms !== undefined && !isObjectArray(parsed.alarms)) ||
        (parsed.customTimers !== undefined && !isObjectArray(parsed.customTimers)) ||
        (parsed.bedtimeLogs !== undefined && !isObjectArray(parsed.bedtimeLogs));

      if (hasInvalidSection) return false;

      if (parsed.profile && isRecord(parsed.profile)) {
        const p = parsed.profile;
        const sanitizedProfile: StudentProfile = {
          ...defaultProfile,
          name: sanitizeText(p.name),
          major: sanitizeText(p.major),
          academicYear: sanitizeText(p.academicYear),
          weeklyGoalHours: typeof p.weeklyGoalHours === 'number' ? p.weeklyGoalHours : defaultProfile.weeklyGoalHours,
          email: sanitizeText(p.email),
          bio: sanitizeText(p.bio),
        };
        storage.saveProfile(sanitizedProfile, opts);
      }

      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        const sanitizedTasks: TaskItem[] = (parsed.tasks as TaskItem[]).map((t) => ({
          ...t,
          title: sanitizeText(t.title),
          description: t.description ? sanitizeText(t.description) : undefined,
          subject: t.subject ? sanitizeText(t.subject) : undefined,
          completed: Boolean(t.completed),
          subtasks: Array.isArray(t.subtasks)
            ? t.subtasks.map((st) => ({ ...st, title: sanitizeText(st.title), completed: Boolean(st.completed) }))
            : undefined,
        }));
        storage.saveTasks(sanitizedTasks, opts);
      }

      if (parsed.notes && Array.isArray(parsed.notes)) {
        const sanitizedNotes: NoteItem[] = (parsed.notes as NoteItem[]).map((n) => ({
          ...n,
          title: sanitizeText(n.title),
          subject: sanitizeText(n.subject),
          content: sanitizeHtml(n.content),
          tags: Array.isArray(n.tags) ? n.tags.map(sanitizeText).filter(Boolean) : [],
        }));
        storage.saveNotes(sanitizedNotes, opts);
      }

      if (parsed.schedule && Array.isArray(parsed.schedule)) {
        const sanitizedSchedule: ClassSchedule[] = (parsed.schedule as ClassSchedule[]).map((s) => ({
          ...s,
          subjectName: sanitizeText(s.subjectName),
          code: s.code ? sanitizeText(s.code) : undefined,
          instructor: sanitizeText(s.instructor),
          location: sanitizeText(s.location),
        }));
        storage.saveSchedule(sanitizedSchedule, opts);
      }

      if (parsed.sessions && Array.isArray(parsed.sessions)) {
        const sanitizedSessions: FocusSession[] = (parsed.sessions as FocusSession[]).map((s) => ({
          ...s,
          subject: sanitizeText(s.subject),
          durationMinutes: Math.max(0, Number(s.durationMinutes) || 0),
          leaveCount: typeof s.leaveCount === 'number' ? Math.max(0, s.leaveCount) : undefined,
          breakSkipped: typeof s.breakSkipped === 'boolean' ? s.breakSkipped : undefined,
          endedEarly: typeof s.endedEarly === 'boolean' ? s.endedEarly : undefined,
          reflection: s.reflection === 'calm' || s.reflection === 'neutral' || s.reflection === 'distracted' ? s.reflection : undefined,
          intention: s.intention ? sanitizeText(s.intention) : undefined,
        }));
        storage.saveSessions(sanitizedSessions, opts);
      }

      if (parsed.settings && isRecord(parsed.settings)) {
        storage.saveSettings(sanitizeSettingsObject(parsed.settings), opts);
      }

      if (parsed.alarms && Array.isArray(parsed.alarms)) {
        const sanitizedAlarms: AlarmItem[] = (parsed.alarms as AlarmItem[]).map((a) => ({
          ...a,
          label: sanitizeText(a.label),
          enabled: Boolean(a.enabled),
        }));
        storage.saveAlarms(sanitizedAlarms, opts);
      }

      if (parsed.customTimers && Array.isArray(parsed.customTimers)) {
        const sanitizedTimers: CustomTimerItem[] = (parsed.customTimers as CustomTimerItem[]).map((t) => ({
          ...t,
          name: sanitizeText(t.name) || 'Focus Timer',
          durationMinutes: Math.min(240, Math.max(1, Number(t.durationMinutes) || 25)),
        }));
        storage.saveCustomTimers(sanitizedTimers, opts);
      }

      if (parsed.bedtimeLogs && Array.isArray(parsed.bedtimeLogs)) {
        const sanitizedBedtime: BedtimeLog[] = (parsed.bedtimeLogs as BedtimeLog[]).map((b) => ({
          ...b,
          status: b.status === 'on-time' ? 'on-time' : 'late',
          targetTime: sanitizeText(b.targetTime) || '22:00',
        }));
        storage.saveBedtimeLogs(sanitizedBedtime, opts);
      }
      notifySync(opts);
      return true;
    } catch {
      return false;
    }
  },
  resetAllData: () => {
    storage.saveProfile({ ...defaultProfile }, { skipCloud: true });
    storage.saveTasks([], { skipCloud: true });
    storage.saveNotes([], { skipCloud: true });
    storage.saveSchedule([], { skipCloud: true });
    storage.saveSessions([], { skipCloud: true });
    storage.saveAlarms([], { skipCloud: true });
    storage.saveBedtimeLogs([], { skipCloud: true });
    storage.saveCustomTimers(defaultCustomTimers, { skipCloud: true });
    localStorage.removeItem(PENDING_CLOUD_SYNC_KEY);
    localStorage.removeItem('study_flow_last_cloud_upload');
    localStorage.removeItem('study_flow_last_cloud_download');
    notifySync({ skipCloud: true });
  },
};

// Purge any old fake data left over in localStorage from earlier runs
try {
  const storedProfile = localStorage.getItem(STORAGE_KEYS.PROFILE);
  const storedTasks = localStorage.getItem(STORAGE_KEYS.TASKS);
  if (
    (storedProfile && storedProfile.includes('Alex Vance')) ||
    (storedTasks && storedTasks.includes('Finish BST & Binary Tree Assignment'))
  ) {
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
    localStorage.removeItem(STORAGE_KEYS.TASKS);
    localStorage.removeItem(STORAGE_KEYS.NOTES);
    localStorage.removeItem(STORAGE_KEYS.SCHEDULE);
    localStorage.removeItem(STORAGE_KEYS.SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.BEDTIME_LOGS);
    localStorage.removeItem(STORAGE_KEYS.ALARMS);
  }
} catch {
  // Ignore in SSR / restricted environments
}

export const subscribeToLocalChanges = (listener: () => void) => {
  localChangeListeners.add(listener);
  return () => localChangeListeners.delete(listener);
};

// Cross-tab real-time broadcast channel
const syncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('studyflow_sync_channel')
  : null;

let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let pendingCloudPublish = false;

function notifySync(opts?: { skipCloud?: boolean }) {
  if (!opts?.skipCloud) {
    localStorage.setItem(PENDING_CLOUD_SYNC_KEY, '1');
    pendingCloudPublish = true;
  }
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    const shouldPublishToCloud = pendingCloudPublish;
    pendingCloudPublish = false;
    if (shouldPublishToCloud) {
      localChangeListeners.forEach(listener => listener());
    }
    if (syncChannel) {
      syncChannel.postMessage({ type: 'SYNC_UPDATE', timestamp: Date.now() });
    }
  }, 400);
}

export function subscribeToSync(onSync: () => void) {
  if (syncChannel) {
    const handler = (e: MessageEvent) => {
      if (e.data && e.data.type === 'SYNC_UPDATE') {
        onSync();
      }
    };
    syncChannel.addEventListener('message', handler);
    return () => syncChannel.removeEventListener('message', handler);
  }
  return () => {};
}
