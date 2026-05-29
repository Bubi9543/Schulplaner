import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarCheck, CalendarDays, CalendarRange, GraduationCap, Settings, ChevronDown, Check, Calendar, Timer, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', short: 'Start' },
  { to: '/aufgaben', icon: CalendarCheck, label: 'Aufgaben', short: 'Aufgaben' },
  { to: '/kalender', icon: CalendarRange, label: 'Kalender', short: 'Kalender' },
  { to: '/stundenplan', icon: CalendarDays, label: 'Stundenplan', short: 'Plan' },
  { to: '/noten', icon: GraduationCap, label: 'Noten', short: 'Noten' },
  { to: '/fokus', icon: Timer, label: 'Fokus', short: 'Fokus' },
  { to: '/freunde', icon: Users, label: 'Freunde', short: 'Freunde' },
  { to: '/einstellungen', icon: Settings, label: 'Einstellungen', short: 'Mehr' },
];

function Logo({ small = false }: { small?: boolean }) {
  const size = small ? 'size-8' : 'size-10';
  return (
    <div className={`${size} rounded-2xl theme-gradient grid place-items-center shadow-glow flex-shrink-0`}>
      <GraduationCap className={small ? 'size-4 text-white' : 'size-5 text-white'} strokeWidth={2.5} />
    </div>
  );
}

function SchoolYearSwitcher() {
  const schoolYears = useStore(s => s.schoolYears);
  const activeId = useStore(s => s.activeSchoolYearId);
  const setActiveSchoolYear = useStore(s => s.setActiveSchoolYear);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = schoolYears.find(y => y.id === activeId) ?? schoolYears[0];

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!active) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/40 hover:bg-white/70 border border-white/50 transition text-left"
      >
        <Calendar className="size-3.5 text-ink-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">Schuljahr</div>
          <div className="text-sm font-semibold text-ink-900 truncate">{active.name}</div>
        </div>
        <ChevronDown className={`size-4 text-ink-400 transition flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 left-0 right-0 mt-1 rounded-2xl glass-strong shadow-soft p-1.5 max-h-[60vh] overflow-y-auto"
          >
            {schoolYears.map(y => {
              const isActive = y.id === activeId;
              return (
                <button
                  key={y.id}
                  onClick={async () => {
                    setOpen(false);
                    if (!isActive) await setActiveSchoolYear(y.id);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm transition text-left ${isActive ? 'theme-gradient text-white' : 'text-ink-700 hover:bg-white/70'}`}
                >
                  <Check className={`size-3.5 flex-shrink-0 ${isActive ? 'opacity-100' : 'opacity-0'}`} strokeWidth={3} />
                  <span className="flex-1 truncate font-medium">{y.name}</span>
                </button>
              );
            })}
            <div className="border-t border-white/40 mt-1 pt-1">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate('/einstellungen?section=schoolyears');
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-ink-600 hover:bg-white/70 transition font-medium"
              >
                <Settings className="size-3.5" />
                Schuljahre verwalten
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar() {
  const settings = useStore(s => s.settings);
  return (
    <aside className="hidden md:flex md:flex-col w-[240px] shrink-0 p-4 gap-3 sticky top-0 h-screen">
      <div className="flex items-center gap-3 px-2 py-3">
        <Logo />
        <div className="min-w-0">
          <div className="font-display font-extrabold text-ink-900 leading-tight">Notenapp</div>
          <div className="text-xs text-ink-500 truncate">{settings?.name ?? 'Schule, schöner'}</div>
        </div>
      </div>
      <SchoolYearSwitcher />
      <nav className="flex flex-col gap-1 mt-2">
        {NAV.map(item => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </nav>
      <div className="mt-auto card text-center text-xs text-ink-500">
        <div className="font-semibold text-ink-700 mb-1">Tipp</div>
        Klicke im Stundenplan auf ein Fach – du springst direkt zur Fach-Analyse.
      </div>
      <div className="flex items-center justify-center gap-3 text-[11px] text-ink-400 mt-1">
        <NavLink to="/impressum" className="hover:text-ink-700 transition">Impressum</NavLink>
        <span>·</span>
        <NavLink to="/datenschutz" className="hover:text-ink-700 transition">Datenschutz</NavLink>
      </div>
    </aside>
  );
}

function SidebarLink({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) {
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
              className="absolute inset-0 rounded-2xl theme-gradient shadow-glow"
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
      <div className="glass-strong rounded-3xl flex items-center justify-between p-1 shadow-soft">
        {NAV.map(item => {
          const active = item.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`relative flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 px-0.5 rounded-2xl text-[10px] font-semibold transition ${active ? 'text-white' : 'text-ink-600'}`}
            >
              {active && (
                <motion.span layoutId="tabbar-active" className="absolute inset-0 rounded-2xl theme-gradient" />
              )}
              <span className="relative flex flex-col items-center gap-0.5 max-w-full">
                <Icon className="size-5 flex-shrink-0" />
                <span className="max-w-full truncate leading-none">{item.short ?? item.label}</span>
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
