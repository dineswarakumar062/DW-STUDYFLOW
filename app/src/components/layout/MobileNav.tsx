import React from 'react';
import { useApp } from '../../context/AppContext';
import type { ActiveTab } from '../../types';
import { LayoutDashboard, CheckSquare, Timer, CalendarCheck } from 'lucide-react';

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: React.FC<{ className?: string }>;
  matchTabs: ActiveTab[];
}

export const MobileNav: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard, matchTabs: ['dashboard'] },
    { id: 'attendance', label: 'Classes', icon: CalendarCheck, matchTabs: ['attendance', 'schedule'] },
    { id: 'notes', label: 'Tasks', icon: CheckSquare, matchTabs: ['notes', 'tasks'] },
    { id: 'timer', label: 'Focus', icon: Timer, matchTabs: ['timer'] },
  ];

  const activeIndex = navItems.findIndex(item => item.matchTabs.includes(activeTab));

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#0F1F17]/95 backdrop-blur-xl border-t border-emerald-100 dark:border-emerald-900/60 z-50 lg:hidden px-3 py-1.5 shadow-lg">
      <div className="relative flex justify-around items-center w-full max-w-lg mx-auto">
        {activeIndex !== -1 && (
          <div 
            className="absolute top-0 bottom-0 rounded-2xl bg-[#DCFCE7] dark:bg-emerald-950/70 border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform"
            style={{
              width: `calc(${100 / navItems.length}% - 8px)`,
              left: `calc(${activeIndex * (100 / navItems.length)}% + 4px)`,
            }}
          >
            <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-[#15803D]" />
          </div>
        )}

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.matchTabs.includes(activeTab);

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`
                relative z-10 flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-2xl transition-all duration-200
                ${isActive ? 'text-[#15803D] dark:text-[#86EFAC] font-black scale-105' : 'text-[#4B5B52] dark:text-emerald-200/70 hover:text-[#14201A] dark:hover:text-white font-medium'}
              `}
            >
              <div className="p-1 rounded-xl transition-all">
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight font-bold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
