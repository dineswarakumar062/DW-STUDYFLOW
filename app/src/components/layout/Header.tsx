import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Sun, 
  Moon, 
  RefreshCw, 
  Menu, 
  LayoutDashboard, 
  BookOpen, 
  Calendar, 
  Timer, 
  User, 
  Settings as SettingsIcon,
  Sparkles,
  Flame,
  Plus,
  CalendarCheck
} from 'lucide-react';
import { QuickTaskModal } from '../tasks/QuickTaskModal';
import { ENABLE_CLOUD_SYNC } from '../../services/firebaseSync';

export const Header: React.FC = () => {
  const { 
    activeTab, 
    settings, 
    toggleThemeMode, 
    syncStatus, 
    triggerSync,
    setActiveTab,
    setMobileMenuOpen,
    tasks
  } = useApp();
  const [quickTaskOpen, setQuickTaskOpen] = React.useState(false);

  const pendingTasksCount = tasks.filter(t => !t.completed).length;

  const getViewMeta = () => {
    switch (activeTab) {
      case 'dashboard':
        return {
          title: 'Dashboard',
          subtitle: 'Academic Command Center',
          icon: LayoutDashboard,
        };
      case 'attendance':
        return {
          title: 'Attendance Hub',
          subtitle: 'Daily class marking & 75% criteria tracker',
          icon: CalendarCheck,
        };
      case 'notes':
      case 'tasks':
        return {
          title: 'Tasks & Notes',
          subtitle: 'Lectures, assignments & to-dos',
          icon: BookOpen,
        };
      case 'schedule':
        return {
          title: 'Weekly Timetable',
          subtitle: 'Timetable, venues & instructors',
          icon: Calendar,
        };
      case 'timer':
        return {
          title: 'Focus Timer',
          subtitle: 'Pomodoro timer & study logs',
          icon: Timer,
        };
      case 'profile':
        return {
          title: 'Student Profile',
          subtitle: 'Academic records & personal info',
          icon: User,
        };
      case 'settings':
        return {
          title: 'Settings & Backup',
          subtitle: 'Preferences & same-browser synchronization',
          icon: SettingsIcon,
        };
      default:
        return {
          title: 'studyzflow',
          subtitle: 'Academic Workspace',
          icon: Sparkles,
        };
    }
  };

  const meta = getViewMeta();
  const IconComponent = meta.icon;

  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date());

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-[#0F1F17]/95 backdrop-blur-md border-b border-emerald-100 dark:border-emerald-900/60 shadow-2xs">
      <div className="px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
        
        {/* Left: Mobile Drawer Trigger & Context Indicator */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 text-[#4B5B52] dark:text-emerald-200 hover:text-[#15803D] dark:hover:text-[#86EFAC] rounded-2xl hover:bg-[#DCFCE7] dark:hover:bg-emerald-950 transition-colors"
            title="Open Menu"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#DCFCE7] dark:bg-emerald-950/60 text-[#15803D] dark:text-[#86EFAC] flex items-center justify-center shadow-xs border border-emerald-200 dark:border-emerald-800/50">
              <IconComponent className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-headline tracking-tight">
                  {meta.title}
                </h2>
                {/* Crisp High-Contrast Date Pill */}
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-2xs">
                  📅 {todayFormatted}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden xs:block">
                {meta.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Quick Actions, Live Sync, Dark/Light Mode Toggle */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Action: New Task Trigger on Desktop */}
          <button
            onClick={() => setQuickTaskOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#15803D] hover:bg-[#166534] text-white font-bold text-xs active:scale-95 transition-all shadow-xs"
            title="Add Quick Task"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>+ New Task</span>
          </button>

          {/* Quick Focus Mode Button on Desktop */}
          {activeTab !== 'timer' && (
            <button
              onClick={() => setActiveTab('timer')}
              className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#DCFCE7] dark:bg-emerald-950/60 text-[#15803D] dark:text-[#86EFAC] font-bold text-xs hover:bg-[#86EFAC]/50 active:scale-95 transition-all border border-emerald-200 dark:border-emerald-800/50 shadow-2xs"
              title="Launch Focus Session"
            >
              <Flame className="w-3.5 h-3.5 fill-current text-[#15803D] dark:text-[#86EFAC]" />
              <span>Start Focus</span>
            </button>
          )}

          {/* Task Countdown Pill */}
          {pendingTasksCount > 0 && activeTab !== 'notes' && (
            <button
              onClick={() => setActiveTab('notes')}
              className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#DCFCE7]/60 dark:bg-emerald-950/50 text-[#14201A] dark:text-emerald-200 hover:text-[#15803D] font-bold text-xs border border-emerald-200 dark:border-emerald-800/60 transition-all shadow-2xs"
              title="View pending tasks"
            >
              <span className="w-2 h-2 rounded-full bg-[#15803D]"></span>
              <span>{pendingTasksCount} Tasks Left</span>
            </button>
          )}

          {/* Storage / Sync Status */}
          {ENABLE_CLOUD_SYNC ? (
            <button
              onClick={triggerSync}
              aria-label="Sync data"
              className={`flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-full text-xs font-bold border transition-all ${
                syncStatus === 'syncing' 
                  ? 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC] dark:bg-emerald-950/60 dark:text-emerald-300' 
                  : 'bg-white dark:bg-emerald-950/40 text-[#4B5B52] dark:text-emerald-200 hover:text-[#14201A] dark:hover:text-white border-emerald-200 dark:border-emerald-800/60'
              }`}
              title="Sync data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin text-[#15803D]' : 'text-[#4B5B52] dark:text-emerald-300'}`} />
              <span className="hidden sm:inline">
                {syncStatus === 'syncing' ? 'Syncing...' : 'Cloud Sync'}
              </span>
            </button>
          ) : (
            <span className="hidden md:inline-block text-xs font-semibold text-[#4B5B52] dark:text-emerald-200/80 px-2.5 py-1">
              Data stored on this device
            </span>
          )}

          {/* Theme Mode Toggle Button */}
          <button
            onClick={toggleThemeMode}
            className="p-2 rounded-xl text-[#4B5B52] dark:text-emerald-200 hover:text-[#15803D] hover:bg-[#DCFCE7] dark:hover:bg-emerald-950 transition-all"
            title={`Switch to ${settings.themeMode === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label="Toggle Theme Mode"
          >
            {settings.themeMode === 'dark' ? (
              <Sun className="w-4 h-4 text-[#86EFAC] transition-transform" />
            ) : (
              <Moon className="w-4 h-4 text-[#15803D] transition-transform" />
            )}
          </button>
        </div>

      </div>
      <QuickTaskModal open={quickTaskOpen} onClose={() => setQuickTaskOpen(false)} />
    </header>
  );
};
