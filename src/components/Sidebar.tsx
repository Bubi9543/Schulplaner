import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, CalendarCheck, CalendarDays, GraduationCap, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', color: 'from-sky-500 to-indigo-500' },
  { to: '/aufgaben', icon: CalendarCheck, label: 'Aufgaben', color: 'from-orange-400 to-rose-500' },
  { to: '/stundenplan', icon: CalendarDays, label: 'Stundenplan', color: 'from-violet-500 to-fuchsia-500' },
  { to: '/noten', icon: GraduationCap, label: 'Noten', color: 'from-emerald-500 to-teal-500' },
  { to: '/einstellungen', icon: Settings, label: 'Einstellungen', color: 'from-slate-500 to-slate-700' },
];

export function Sidebar() {
  const settings = useStore(s => s.settings);
  return (
    <aside className="hidden md:flex md:flex-col w-[240px] shrink-0 p-4 gap-3 sticky top-0 h-screen">
      <div className="flex items-center gap-3 px-2 py-3">
        <div className="size-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 grid place-items-center shadow-glow">
          <span className="font-display font-extrabold text-white text-lg leading-none">1</span>
        </div>
        <div>
          <div className="font-display font-extrabold text-ink-900 leading-tight">Notenapp</div>
          <div className="text-xs text-ink-500">{settings?.name ?? 'Schule, schöner'}</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1 mt-2">
        {NAV.map(item => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </nav>
      <div className="mt-auto card text-center text-xs text-ink-500">
        <div className="font-semibold text-ink-700 mb-1">Tipp</div>
        Klicke im Stundenplan auf ein Fach – du springst direkt zur Fach-Analyse.
      </div>
    </aside>
  );
}

function SidebarLink({ to, icon: Icon, label, color }: { to: string; icon: typeof LayoutDashboard; label: string; color: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition ${isActive ? 'text-white' : 'text-ink-600 hover:text-ink-900 hover:bg-white/60'}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${color} shadow-glow`}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative flex items-center gap-3">
            <Icon className="size-[18px]" />
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

export function MobileTabBar() {
  const loc = useLocation();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
      <div className="glass-strong rounded-3xl flex items-center justify-between p-1.5 shadow-soft">
        {NAV.slice(0, 4).map(item => {
          const active = item.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 rounded-2xl text-[11px] font-semibold transition ${active ? 'text-white' : 'text-ink-600'}`}
            >
              {active && (
                <motion.span layoutId="tabbar-active" className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${item.color}`} />
              )}
              <span className="relative flex flex-col items-center gap-0.5">
                <Icon className="size-5" />
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
