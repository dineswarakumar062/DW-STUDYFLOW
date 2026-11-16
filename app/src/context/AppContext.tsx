import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import type { 
  ActiveTab, 
  StudentProfile, 
  TaskItem, 
  NoteItem, 
  ClassSchedule, 
  FocusSession, 
  BedtimeLog,
  SessionReflection,
  AlarmItem,
  CustomTimerItem,
  AppSettings,
  ThemeMode,
  ThemePreset
} from '../types';
import { storage, subscribeToSync, defaultProfile, defaultCustomTimers, getLocalDateStr } from '../services/storage';
import { LocalNotifications } from '@capacitor/local-notifications';
import { cancelAlarmNotification, scheduleAlarmNotification, playRichAlarmChime, isNativeNotificationSupported } from '../services/notifications';
import {
  firebaseConfigured,
  subscribeToFirebaseAuth,
  startFirebaseRealtimeSync,
  signInToFirebase,
  createFirebaseAccount,
  signOutOfFirebase,
  uploadDeviceDataToCloud,
  downloadCloudDataToDevice,
  safeMergeCloudAndDevice,
  wipeCloudData,
  type FirebaseSyncUser,
} from '../services/firebaseSync';

export interface AppState {
  activeTab: ActiveTab;
  mobileMenuOpen: boolean;
  profile: StudentProfile;
  tasks: TaskItem[];
  notes: NoteItem[];
  schedule: ClassSchedule[];
  sessions: FocusSession[];
  alarms: AlarmItem[];
  customTimers: CustomTimerItem[];
  settings: AppSettings;
  bedtimeLogs: BedtimeLog[];
  ringingAlarm: { id: string; label: string } | null;
  lastSyncTime: string;
  syncStatus: 'synced' | 'syncing' | 'offline';
  lastCloudUpload: string | null;
  lastCloudDownload: string | null;
  firebaseUser: FirebaseSyncUser | null;
}

export type AppAction =
  | { type: 'SET_ACTIVE_TAB'; payload: ActiveTab }
  | { type: 'SET_MOBILE_MENU_OPEN'; payload: boolean }
  | { type: 'SET_PROFILE'; payload: StudentProfile }
  | { type: 'UPDATE_PROFILE'; payload: Partial<StudentProfile> }
  | { type: 'SET_TASKS'; payload: TaskItem[] }
  | { type: 'ADD_TASK'; payload: TaskItem }
  | { type: 'UPDATE_TASK'; payload: { id: string; updated: Partial<TaskItem> } }
  | { type: 'TOGGLE_TASK'; payload: string }
  | { type: 'DELETE_TASK'; payload: string }
  | { type: 'TOGGLE_SUBTASK'; payload: { taskId: string; subtaskId: string } }
  | { type: 'ADD_SUBTASK'; payload: { taskId: string; title: string } }
  | { type: 'SET_NOTES'; payload: NoteItem[] }
  | { type: 'ADD_NOTE'; payload: NoteItem }
  | { type: 'UPDATE_NOTE'; payload: { id: string; updated: Partial<NoteItem> } }
  | { type: 'DELETE_NOTE'; payload: string }
  | { type: 'TOGGLE_PIN_NOTE'; payload: string }
  | { type: 'SET_SCHEDULE'; payload: ClassSchedule[] }
  | { type: 'ADD_CLASS'; payload: ClassSchedule }
  | { type: 'BATCH_ADD_CLASSES'; payload: ClassSchedule[] }
  | { type: 'REPLACE_SCHEDULE'; payload: ClassSchedule[] }
  | { type: 'UPDATE_CLASS'; payload: { id: string; updated: Partial<ClassSchedule> } }
  | { type: 'DELETE_CLASS'; payload: string }
  | { type: 'SET_SESSIONS'; payload: FocusSession[] }
  | { type: 'LOG_SESSION'; payload: FocusSession }
  | { type: 'SET_ALARMS'; payload: AlarmItem[] }
  | { type: 'ADD_ALARM'; payload: AlarmItem }
  | { type: 'UPDATE_ALARM'; payload: { id: string; updated: Partial<AlarmItem> } }
  | { type: 'DELETE_ALARM'; payload: string }
  | { type: 'SET_CUSTOM_TIMERS'; payload: CustomTimerItem[] }
  | { type: 'SET_SETTINGS'; payload: AppSettings }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'UPDATE_SESSION_REFLECTION'; payload: { id: string; reflection: SessionReflection } }
  | { type: 'SET_BEDTIME_LOGS'; payload: BedtimeLog[] }
  | { type: 'SET_RINGING_ALARM'; payload: { id: string; label: string } | null }
  | { type: 'SET_SYNC_STATUS'; payload: 'synced' | 'syncing' | 'offline' }
  | { type: 'SET_LAST_SYNC_TIME'; payload: string }
  | { type: 'SET_LAST_CLOUD_UPLOAD'; payload: string | null }
  | { type: 'SET_LAST_CLOUD_DOWNLOAD'; payload: string | null }
  | { type: 'SET_FIREBASE_USER'; payload: FirebaseSyncUser | null }
  | { type: 'RELOAD_STORAGE'; payload: Partial<AppState> }
  | { type: 'RESET_ALL'; payload: Partial<AppState> };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };

    case 'SET_MOBILE_MENU_OPEN':
      return { ...state, mobileMenuOpen: action.payload };

    case 'SET_PROFILE':
      return { ...state, profile: action.payload };

    case 'UPDATE_PROFILE':
      return { ...state, profile: { ...state.profile, ...action.payload } };

    case 'SET_TASKS':
      return { ...state, tasks: action.payload };

    case 'ADD_TASK':
      return { ...state, tasks: [action.payload, ...state.tasks] };

    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.payload.id ? { ...t, ...action.payload.updated } : t)),
      };

    case 'TOGGLE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.payload ? { ...t, completed: !t.completed } : t)),
      };

    case 'DELETE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.payload),
      };

    case 'TOGGLE_SUBTASK': {
      const { taskId, subtaskId } = action.payload;
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id === taskId && t.subtasks) {
            return {
              ...t,
              subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, completed: !s.completed } : s)),
            };
          }
          return t;
        }),
      };
    }

    case 'ADD_SUBTASK': {
      const { taskId, title } = action.payload;
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                subtasks: [
                  ...(task.subtasks || []),
                  { id: `sub_${Date.now()}`, title, completed: false },
                ],
              }
            : task
        ),
      };
    }

    case 'SET_NOTES':
      return { ...state, notes: action.payload };

    case 'ADD_NOTE':
      return { ...state, notes: [action.payload, ...state.notes] };

    case 'UPDATE_NOTE':
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.payload.id ? { ...n, ...action.payload.updated, updatedAt: new Date().toISOString() } : n
        ),
      };

    case 'DELETE_NOTE':
      return {
        ...state,
        notes: state.notes.filter((n) => n.id !== action.payload),
      };

    case 'TOGGLE_PIN_NOTE':
      return {
        ...state,
        notes: state.notes.map((n) => (n.id === action.payload ? { ...n, isPinned: !n.isPinned } : n)),
      };

    case 'SET_SCHEDULE':
      return { ...state, schedule: action.payload };

    case 'ADD_CLASS':
      return { ...state, schedule: [...state.schedule, action.payload] };

    case 'BATCH_ADD_CLASSES':
      return { ...state, schedule: [...state.schedule, ...action.payload] };

    case 'REPLACE_SCHEDULE':
      return { ...state, schedule: action.payload };

    case 'UPDATE_CLASS':
      return {
        ...state,
        schedule: state.schedule.map((c) => (c.id === action.payload.id ? { ...c, ...action.payload.updated } : c)),
      };

    case 'DELETE_CLASS':
      return {
        ...state,
        schedule: state.schedule.filter((c) => c.id !== action.payload),
      };

    case 'SET_SESSIONS':
      return { ...state, sessions: action.payload };

    case 'LOG_SESSION':
      return { ...state, sessions: [action.payload, ...state.sessions] };

    case 'SET_ALARMS':
      return { ...state, alarms: action.payload };

    case 'ADD_ALARM':
      return { ...state, alarms: [...state.alarms, action.payload] };

    case 'UPDATE_ALARM':
      return {
        ...state,
        alarms: state.alarms.map((a) => (a.id === action.payload.id ? { ...a, ...action.payload.updated } : a)),
      };

    case 'DELETE_ALARM':
      return {
        ...state,
        alarms: state.alarms.filter((a) => a.id !== action.payload),
      };

    case 'SET_CUSTOM_TIMERS':
      return { ...state, customTimers: action.payload };

    case 'SET_SETTINGS':
      return { ...state, settings: action.payload };

    case 'UPDATE_SETTINGS': {
      const nextSettings = { ...state.settings, ...action.payload };
      nextSettings.pomodoroMinutes = Math.min(120, Math.max(1, Number(nextSettings.pomodoroMinutes) || 25));
      nextSettings.shortBreakMinutes = Math.min(30, Math.max(1, Number(nextSettings.shortBreakMinutes) || 5));
      return { ...state, settings: nextSettings };
    }

    case 'UPDATE_SESSION_REFLECTION':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.id ? { ...s, reflection: action.payload.reflection } : s
        ),
      };

    case 'SET_BEDTIME_LOGS':
      return { ...state, bedtimeLogs: action.payload };

    case 'SET_RINGING_ALARM':
      return { ...state, ringingAlarm: action.payload };

    case 'SET_SYNC_STATUS':
      return { ...state, syncStatus: action.payload };

    case 'SET_LAST_SYNC_TIME':
      return { ...state, lastSyncTime: action.payload };

    case 'SET_LAST_CLOUD_UPLOAD':
      return { ...state, lastCloudUpload: action.payload };

    case 'SET_LAST_CLOUD_DOWNLOAD':
      return { ...state, lastCloudDownload: action.payload };

    case 'SET_FIREBASE_USER':
      return { ...state, firebaseUser: action.payload };

    case 'RELOAD_STORAGE':
    case 'RESET_ALL':
      return { ...state, ...action.payload };

    default:
      return state;
  }
}

function initializeAppState(): AppState {
  return {
    activeTab: 'dashboard',
    mobileMenuOpen: false,
    profile: storage.getProfile(),
    tasks: storage.getTasks(),
    notes: storage.getNotes(),
    schedule: storage.getSchedule(),
    sessions: storage.getSessions(),
    alarms: storage.getAlarms(),
    customTimers: storage.getCustomTimers(),
    settings: storage.getSettings(),
    bedtimeLogs: storage.getBedtimeLogs(),
    ringingAlarm: null,
    lastSyncTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    syncStatus: 'synced',
    lastCloudUpload: storage.getLastCloudUpload(),
    lastCloudDownload: storage.getLastCloudDownload(),
    firebaseUser: null,
  };
}

interface AppContextType {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  profile: StudentProfile;
  updateProfile: (updated: Partial<StudentProfile>) => void;
  tasks: TaskItem[];
  addTask: (task: Omit<TaskItem, 'id' | 'createdAt'>) => void;
  updateTask: (id: string, updated: Partial<TaskItem>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  addSubtask: (taskId: string, title: string) => void;
  notes: NoteItem[];
  addNote: (note: Omit<NoteItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateNote: (id: string, updated: Partial<NoteItem>) => void;
  deleteNote: (id: string) => void;
  togglePinNote: (id: string) => void;
  schedule: ClassSchedule[];
  addClass: (item: Omit<ClassSchedule, 'id'>) => void;
  batchAddClasses: (items: Omit<ClassSchedule, 'id'>[]) => void;
  replaceSchedule: (items: Omit<ClassSchedule, 'id'>[]) => void;
  updateClass: (id: string, updated: Partial<ClassSchedule>) => void;
  deleteClass: (id: string) => void;
  sessions: FocusSession[];
  logSession: (session: Omit<FocusSession, 'id' | 'completedAt'>) => string;
  updateSessionReflection: (id: string, reflection: SessionReflection) => void;
  alarms: AlarmItem[];
  addAlarm: (alarm: Omit<AlarmItem, 'id' | 'createdAt'>) => void;
  updateAlarm: (id: string, updated: Partial<AlarmItem>) => void;
  deleteAlarm: (id: string) => void;
  toggleAlarm: (id: string) => void;
  customTimers: CustomTimerItem[];
  saveCustomTimers: (timers: CustomTimerItem[]) => void;
  bedtimeLogs: BedtimeLog[];
  logBedtime: (status: 'on-time' | 'late', targetTime?: string) => void;
  ringingAlarm: { id: string; label: string } | null;
  dismissRingingAlarm: () => void;
  settings: AppSettings;
  updateSettings: (updated: Partial<AppSettings>) => void;
  toggleThemeMode: () => void;
  setThemePreset: (preset: ThemePreset) => void;
  lastSyncTime: string;
  syncStatus: 'synced' | 'syncing' | 'offline';
  lastCloudUpload: string | null;
  lastCloudDownload: string | null;
  triggerSync: () => void;
  uploadToCloud: () => Promise<{ success: boolean; message: string }>;
  downloadFromCloud: () => Promise<{ success: boolean; message: string }>;
  safeMergeSync: () => Promise<{ success: boolean; message: string }>;
  exportData: () => string;
  importData: (json: string) => boolean;
  resetAllData: () => Promise<boolean>;
  firebaseConfigured: boolean;
  firebaseUser: FirebaseSyncUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  createAccount: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  liveSession: {
    isRunning: boolean;
    timerName: string;
    timerType: CustomTimerItem['type'];
    timeLeftSeconds: number;
    leaveCount: number;
    completedWorkBlocks: number;
  } | null;
  setLiveSession: React.Dispatch<React.SetStateAction<{
    isRunning: boolean;
    timerName: string;
    timerType: CustomTimerItem['type'];
    timeLeftSeconds: number;
    leaveCount: number;
    completedWorkBlocks: number;
  } | null>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, undefined, initializeAppState);
  const [liveSession, setLiveSession] = React.useState<AppContextType['liveSession']>(null);

  const activeChimeRef = useRef<{ stop: () => void } | null>(null);
  const lastTriggeredAlarmMinuteRef = useRef<string>('');

  // Reload state from storage atomically in one dispatch
  const reloadAllFromStorage = () => {
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    const loadedAlarms = storage.getAlarms();
    loadedAlarms.forEach((a) => {
      if (a.enabled) void scheduleAlarmNotification(a.id, a.label, a.time, a.repeat);
      else void cancelAlarmNotification(a.id);
    });
    dispatch({
      type: 'RELOAD_STORAGE',
      payload: {
        profile: storage.getProfile(),
        tasks: storage.getTasks(),
        notes: storage.getNotes(),
        schedule: storage.getSchedule(),
        sessions: storage.getSessions(),
        alarms: loadedAlarms,
        customTimers: storage.getCustomTimers(),
        settings: storage.getSettings(),
        bedtimeLogs: storage.getBedtimeLogs(),
        lastCloudUpload: storage.getLastCloudUpload(),
        lastCloudDownload: storage.getLastCloudDownload(),
        lastSyncTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        syncStatus: 'synced',
      },
    });
  };

  const uploadToCloud = async () => {
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    const result = await uploadDeviceDataToCloud();
    if (result.success) {
      dispatch({ type: 'SET_LAST_CLOUD_UPLOAD', payload: storage.getLastCloudUpload() });
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'synced' });
    } else {
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'offline' });
    }
    return result;
  };

  const downloadFromCloud = async () => {
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    const result = await downloadCloudDataToDevice();
    if (result.success) {
      reloadAllFromStorage();
      dispatch({ type: 'SET_LAST_CLOUD_DOWNLOAD', payload: storage.getLastCloudDownload() });
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'synced' });
    } else {
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'offline' });
    }
    return result;
  };

  const safeMergeSync = async () => {
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
    const result = await safeMergeCloudAndDevice();
    if (result.success) {
      reloadAllFromStorage();
      dispatch({ type: 'SET_LAST_CLOUD_UPLOAD', payload: storage.getLastCloudUpload() });
      dispatch({ type: 'SET_LAST_CLOUD_DOWNLOAD', payload: storage.getLastCloudDownload() });
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'synced' });
    } else {
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'offline' });
    }
    return result;
  };

  // Subscribe to real-time storage sync updates
  useEffect(() => {
    const unsubscribe = subscribeToSync(() => {
      reloadAllFromStorage();
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return subscribeToFirebaseAuth((user) => {
      dispatch({ type: 'SET_FIREBASE_USER', payload: user });
    });
  }, []);

  // Handle HTML document Theme classes
  useEffect(() => {
    const root = document.documentElement;
    
    if (state.settings.themeMode === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else if (state.settings.themeMode === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isDark) {
        root.classList.add('dark');
        root.classList.remove('light');
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
      }
    }

    root.setAttribute('data-theme-preset', state.settings.themePreset);
  }, [state.settings.themeMode, state.settings.themePreset]);

  const updateProfile = (updated: Partial<StudentProfile>) => {
    const newProfile = { ...state.profile, ...updated };
    dispatch({ type: 'UPDATE_PROFILE', payload: updated });
    storage.saveProfile(newProfile);
  };

  const addTask = (item: Omit<TaskItem, 'id' | 'createdAt'>) => {
    const newTask: TaskItem = {
      ...item,
      id: 'task_' + Date.now(),
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_TASK', payload: newTask });
    storage.saveTasks([newTask, ...state.tasks]);
  };

  const updateTask = (id: string, updated: Partial<TaskItem>) => {
    const updatedTasks = state.tasks.map((t) => (t.id === id ? { ...t, ...updated } : t));
    dispatch({ type: 'UPDATE_TASK', payload: { id, updated } });
    storage.saveTasks(updatedTasks);
  };

  const toggleTask = (id: string) => {
    const updatedTasks = state.tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    dispatch({ type: 'TOGGLE_TASK', payload: id });
    storage.saveTasks(updatedTasks);
  };

  const deleteTask = (id: string) => {
    const updatedTasks = state.tasks.filter((t) => t.id !== id);
    dispatch({ type: 'DELETE_TASK', payload: id });
    storage.saveTasks(updatedTasks);
  };

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    const updatedTasks = state.tasks.map((t) => {
      if (t.id === taskId && t.subtasks) {
        const updatedSubtasks = t.subtasks.map((s) => 
          s.id === subtaskId ? { ...s, completed: !s.completed } : s
        );
        return { ...t, subtasks: updatedSubtasks };
      }
      return t;
    });
    dispatch({ type: 'TOGGLE_SUBTASK', payload: { taskId, subtaskId } });
    storage.saveTasks(updatedTasks);
  };

  const addSubtask = (taskId: string, title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const updatedTasks = state.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            subtasks: [
              ...(task.subtasks || []),
              { id: `sub_${Date.now()}`, title: cleanTitle, completed: false },
            ],
          }
        : task
    );
    dispatch({ type: 'ADD_SUBTASK', payload: { taskId, title: cleanTitle } });
    storage.saveTasks(updatedTasks);
  };

  const addNote = (note: Omit<NoteItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newNote: NoteItem = {
      ...note,
      id: 'note_' + Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_NOTE', payload: newNote });
    storage.saveNotes([newNote, ...state.notes]);
  };

  const updateNote = (id: string, updated: Partial<NoteItem>) => {
    const updatedNotes = state.notes.map((n) => 
      n.id === id 
        ? { ...n, ...updated, updatedAt: new Date().toISOString() } 
        : n
    );
    dispatch({ type: 'UPDATE_NOTE', payload: { id, updated } });
    storage.saveNotes(updatedNotes);
  };

  const deleteNote = (id: string) => {
    const updatedNotes = state.notes.filter((n) => n.id !== id);
    dispatch({ type: 'DELETE_NOTE', payload: id });
    storage.saveNotes(updatedNotes);
  };

  const togglePinNote = (id: string) => {
    const updatedNotes = state.notes.map((n) => 
      n.id === id ? { ...n, isPinned: !n.isPinned } : n
    );
    dispatch({ type: 'TOGGLE_PIN_NOTE', payload: id });
    storage.saveNotes(updatedNotes);
  };

  const addClass = (item: Omit<ClassSchedule, 'id'>) => {
    const newClass: ClassSchedule = {
      ...item,
      id: 'class_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    };
    const updated = [...state.schedule, newClass];
    dispatch({ type: 'ADD_CLASS', payload: newClass });
    storage.saveSchedule(updated);
  };

  const batchAddClasses = (items: Omit<ClassSchedule, 'id'>[]) => {
    if (!items || items.length === 0) return;
    const newClasses: ClassSchedule[] = items.map((item, idx) => ({
      ...item,
      id: 'class_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 7),
    }));
    const updated = [...state.schedule, ...newClasses];
    dispatch({ type: 'BATCH_ADD_CLASSES', payload: newClasses });
    storage.saveSchedule(updated);
  };

  const replaceSchedule = (items: Omit<ClassSchedule, 'id'>[]) => {
    const newClasses: ClassSchedule[] = (items || []).map((item, idx) => ({
      ...item,
      id: 'class_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 7),
    }));
    dispatch({ type: 'REPLACE_SCHEDULE', payload: newClasses });
    storage.saveSchedule(newClasses);
  };

  const updateClass = (id: string, updated: Partial<ClassSchedule>) => {
    const updatedSchedule = state.schedule.map((c) => (c.id === id ? { ...c, ...updated } : c));
    dispatch({ type: 'UPDATE_CLASS', payload: { id, updated } });
    storage.saveSchedule(updatedSchedule);
  };

  const deleteClass = (id: string) => {
    const updatedSchedule = state.schedule.filter((c) => c.id !== id);
    dispatch({ type: 'DELETE_CLASS', payload: id });
    storage.saveSchedule(updatedSchedule);
  };

  const logSession = (session: Omit<FocusSession, 'id' | 'completedAt'>): string => {
    const id = 'session_' + Date.now();
    const newSession: FocusSession = {
      ...session,
      id,
      completedAt: new Date().toISOString(),
    };
    const updated = [newSession, ...state.sessions];
    dispatch({ type: 'LOG_SESSION', payload: newSession });
    storage.saveSessions(updated);
    return id;
  };

  const updateSessionReflection = (id: string, reflection: SessionReflection) => {
    const updated = state.sessions.map((s) => (s.id === id ? { ...s, reflection } : s));
    dispatch({ type: 'UPDATE_SESSION_REFLECTION', payload: { id, reflection } });
    storage.saveSessions(updated);
  };

  const addAlarm = (alarm: Omit<AlarmItem, 'id' | 'createdAt'>) => {
    const newAlarm: AlarmItem = { ...alarm, id: `alarm_${Date.now()}`, createdAt: new Date().toISOString() };
    const updated = [...state.alarms, newAlarm];
    dispatch({ type: 'ADD_ALARM', payload: newAlarm });
    storage.saveAlarms(updated);
    if (newAlarm.enabled) void scheduleAlarmNotification(newAlarm.id, newAlarm.label, newAlarm.time, newAlarm.repeat);
  };

  const updateAlarm = (id: string, updatedFields: Partial<AlarmItem>) => {
    const current = state.alarms.find((alarm) => alarm.id === id);
    const updated = state.alarms.map((alarm) => (alarm.id === id ? { ...alarm, ...updatedFields } : alarm));
    dispatch({ type: 'UPDATE_ALARM', payload: { id, updated: updatedFields } });
    storage.saveAlarms(updated);
    void cancelAlarmNotification(id);
    const next = updated.find((alarm) => alarm.id === id);
    if (next?.enabled) void scheduleAlarmNotification(id, next.label, next.time, next.repeat);
    else if (current) void cancelAlarmNotification(current.id);
  };

  const deleteAlarm = (id: string) => {
    const updated = state.alarms.filter((alarm) => alarm.id !== id);
    dispatch({ type: 'DELETE_ALARM', payload: id });
    storage.saveAlarms(updated);
    void cancelAlarmNotification(id);
  };

  const toggleAlarm = (id: string) => {
    const current = state.alarms.find((alarm) => alarm.id === id);
    if (current) updateAlarm(id, { enabled: !current.enabled });
  };

  const saveCustomTimers = (timers: CustomTimerItem[]) => {
    dispatch({ type: 'SET_CUSTOM_TIMERS', payload: timers });
    storage.saveCustomTimers(timers);
  };

  const logBedtime = (status: 'on-time' | 'late', targetTime = '22:00') => {
    const today = getLocalDateStr();
    const newEntry: BedtimeLog = {
      id: `bed_${today}`,
      date: today,
      status,
      targetTime,
      loggedAt: new Date().toISOString(),
    };
    const filtered = state.bedtimeLogs.filter((b) => b.date !== today);
    const updated = [newEntry, ...filtered];
    dispatch({ type: 'SET_BEDTIME_LOGS', payload: updated });
    storage.saveBedtimeLogs(updated);
  };

  const dismissRingingAlarm = () => {
    if (activeChimeRef.current) {
      activeChimeRef.current.stop();
      activeChimeRef.current = null;
    }
    dispatch({ type: 'SET_RINGING_ALARM', payload: null });
  };

  const alarmsRef = useRef(state.alarms);
  useEffect(() => {
    alarmsRef.current = state.alarms;
  }, [state.alarms]);

  const setActiveTab = React.useCallback((tab: ActiveTab) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tab });
  }, []);

  const setRingingAlarm = (alarm: { id: string; label: string } | null) => {
    dispatch({ type: 'SET_RINGING_ALARM', payload: alarm });
  };

  // In-app alarm watcher: check every 5 seconds for scheduled alarm triggers
  const alarmWatchRef = useRef({ alarms: state.alarms, settings: state.settings, updateAlarm });
  useEffect(() => {
    alarmWatchRef.current = { alarms: state.alarms, settings: state.settings, updateAlarm };
  });

  const checkAlarms = () => {
    if (typeof document !== 'undefined' && document.hidden && isNativeNotificationSupported()) return;
    const { alarms, settings, updateAlarm: watchUpdateAlarm } = alarmWatchRef.current;
    const now = new Date();
    const currentHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (lastTriggeredAlarmMinuteRef.current === currentHM) return;

    const matchingAlarms = alarms.filter((a) => a.enabled && a.time === currentHM);
    if (matchingAlarms.length > 0) {
      lastTriggeredAlarmMinuteRef.current = currentHM;
      if (settings.soundEnabled) {
        activeChimeRef.current?.stop();
        activeChimeRef.current = playRichAlarmChime(settings.alarmVolume);
      }
      dispatch({
        type: 'SET_RINGING_ALARM',
        payload: {
          id: matchingAlarms[0].id,
          label: matchingAlarms.map((a) => a.label).join(' & '),
        },
      });
      matchingAlarms.forEach((alarm) => {
        if (alarm.repeat === 'once') {
          watchUpdateAlarm(alarm.id, { enabled: false });
        }
      });
    }
  };

  useEffect(() => {
    const hasEnabledAlarms = state.alarms.some((a) => a.enabled);
    if (!hasEnabledAlarms) return;

    const interval = setInterval(checkAlarms, 5000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        checkAlarms();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [state.alarms]);

  useEffect(() => {
    if (!isNativeNotificationSupported()) return;
    const listenerPromise = LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const alarmId = action.notification?.extra?.alarmId as string | undefined;
      if (alarmId) {
        const found = alarmsRef.current.find((a) => a.id === alarmId);
        if (found) {
          setRingingAlarm(found);
          if (found.repeat === 'once') {
            const updatedAlarms = alarmsRef.current.map((a) =>
              a.id === found.id ? { ...a, enabled: false } : a
            );
            storage.saveAlarms(updatedAlarms);
            dispatch({ type: 'SET_ALARMS', payload: updatedAlarms });
          }
        }
      }
      setActiveTab('timer');
    });
    return () => {
      listenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, [setActiveTab]);

  const updateSettings = (updated: Partial<AppSettings>) => {
    const newSettings = { ...state.settings, ...updated };
    newSettings.pomodoroMinutes = Math.min(120, Math.max(1, Number(newSettings.pomodoroMinutes) || 25));
    newSettings.shortBreakMinutes = Math.min(30, Math.max(1, Number(newSettings.shortBreakMinutes) || 5));
    dispatch({ type: 'UPDATE_SETTINGS', payload: updated });
    storage.saveSettings(newSettings);
  };

  const toggleThemeMode = () => {
    const nextMode: ThemeMode = state.settings.themeMode === 'dark' ? 'light' : 'dark';
    updateSettings({ themeMode: nextMode });
  };

  const setThemePreset = (preset: ThemePreset) => {
    updateSettings({ themePreset: preset });
  };

  const triggerSync = () => {
    reloadAllFromStorage();
  };

  const exportData = () => {
    return storage.exportAllData();
  };

  const importData = (json: string): boolean => {
    const ok = storage.importAllData(json);
    if (ok) reloadAllFromStorage();
    return ok;
  };

  const resetAllData = async (): Promise<boolean> => {
    storage.resetAllData();
    dispatch({
      type: 'RESET_ALL',
      payload: {
        profile: { ...defaultProfile },
        tasks: [],
        notes: [],
        schedule: [],
        bedtimeLogs: [],
        sessions: [],
        alarms: [],
        customTimers: defaultCustomTimers,
        lastCloudUpload: null,
        lastCloudDownload: null,
        syncStatus: 'synced',
      },
    });

    if (state.firebaseUser) {
      await wipeCloudData();
    }
    return true;
  };

  useEffect(() => {
    return startFirebaseRealtimeSync(() => {
      reloadAllFromStorage();
    }, (status) => dispatch({ type: 'SET_SYNC_STATUS', payload: status }));
  }, []);

  return (
    <AppContext.Provider value={{
      activeTab: state.activeTab,
      setActiveTab,
      profile: state.profile,
      updateProfile,
      tasks: state.tasks,
      addTask,
      updateTask,
      toggleTask,
      deleteTask,
      toggleSubtask,
      addSubtask,
      notes: state.notes,
      addNote,
      updateNote,
      deleteNote,
      togglePinNote,
      schedule: state.schedule,
      addClass,
      batchAddClasses,
      replaceSchedule,
      updateClass,
      deleteClass,
      sessions: state.sessions,
      logSession,
      updateSessionReflection,
      alarms: state.alarms,
      addAlarm,
      updateAlarm,
      deleteAlarm,
      toggleAlarm,
      customTimers: state.customTimers,
      saveCustomTimers,
      bedtimeLogs: state.bedtimeLogs,
      logBedtime,
      ringingAlarm: state.ringingAlarm,
      dismissRingingAlarm,
      settings: state.settings,
      updateSettings,
      toggleThemeMode,
      setThemePreset,
      lastSyncTime: state.lastSyncTime,
      syncStatus: state.syncStatus,
      lastCloudUpload: state.lastCloudUpload,
      lastCloudDownload: state.lastCloudDownload,
      triggerSync,
      uploadToCloud,
      downloadFromCloud,
      safeMergeSync,
      exportData,
      importData,
      resetAllData,
      firebaseConfigured,
      firebaseUser: state.firebaseUser,
      signIn: async (email, password) => { await signInToFirebase(email, password); },
      createAccount: async (email, password) => { await createFirebaseAccount(email, password); },
      signOut: signOutOfFirebase,
      mobileMenuOpen: state.mobileMenuOpen,
      setMobileMenuOpen: (open) => dispatch({ type: 'SET_MOBILE_MENU_OPEN', payload: open }),
      liveSession,
      setLiveSession,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
