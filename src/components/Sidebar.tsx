import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarCheck, CalendarDays, CalendarRange, GraduationCap, Trophy, Settings, ChevronDown, Check, Calendar, CalendarClock, Timer, MoreHorizontal, Plus, Layers, Calculator, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { Avatar } from '@/components/Avatar';
import { FocusMiniWidget } from '@/components/FocusMiniWidget';
import { oberstufeTermsFor, oberstufeTermLabelFor } from '@/types';

/** Logische Gruppen der Navigation. 'system' wird unten abgesetzt. */
export type NavGroup = 'schule' | 'mehr' | 'system';

export interface NavItem { to: string; icon: typeof LayoutDashboard; label: string; short: string; group: NavGroup; }

/** Reihenfolge der Gruppen im Hauptbereich der Seitenleiste. */
export const NAV_GROUP_ORDER: NavGroup[] = ['schule', 'mehr'];

const NAV: NavItem[] = [
  // Gruppe „Schule" – der organisatorische Alltag
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', short: 'Start', group: 'schule' },
  { to: '/noten', icon: GraduationCap, label: 'Noten', short: 'Noten', group: 'schule' },
  { to: '/aufgaben', icon: CalendarCheck, label: 'Aufgaben', short: 'Aufgaben', group: 'schule' },
  { to: '/stundenplan', icon: CalendarDays, label: 'Stundenplan', short: 'Plan', group: 'schule' },
  { to: '/kalender', icon: CalendarRange, label: 'Kalender', short: 'Kalender', group: 'schule' },
  // Gruppe „Mehr" – Werkzeuge & Soziales
  { to: '/social', icon: Sparkles, label: 'Social', short: 'Social', group: 'mehr' },
  { to: '/fokus', icon: Timer, label: 'Fokus', short: 'Fokus', group: 'mehr' },
  { to: '/karteikarten', icon: Layers, label: 'Karteikarten', short: 'Karten', group: 'mehr' },
  { to: '/rechner', icon: Calculator, label: 'Rechner', short: 'Rechner', group: 'mehr' },
  // Abgesetzt ganz unten
  { to: '/einstellungen', icon: Settings, label: 'Einstellungen', short: 'Mehr', group: 'system' },
];

const ABITUR_ITEM: NavItem = { to: '/abitur', icon: Trophy, label: 'Abitur', short: 'Abi', group: 'schule' };

/** Diese Einträge lassen sich nicht ausblenden (sonst kommt man nicht mehr zu den Einstellungen). */
export const LOCKED_NAV_ROUTES = ['/einstellungen'];

/** Basis-NAV-Liste, in der Oberstufe um den Abitur-Eintrag (direkt nach Noten) erweitert. */
export function useBaseNavItems(): NavItem[] {
  const schoolYears = useStore(s => s.schoolYears);
  const activeId = useStore(s => s.activeSchoolYearId);
  const isOberstufe = !!schoolYears.find(y => y.id === activeId)?.oberstufe;
  if (!isOberstufe) return NAV;
  const i = NAV.findIndex(n => n.to === '/noten');
  return [...NAV.slice(0, i + 1), ABITUR_ITEM, ...NAV.slice(i + 1)];
}

/**
 * Wendet die vom User gesetzte Reihenfolge (`navOrder`) und das Ausblenden
 * (`navHidden`) auf die Basis-Liste an. Unbekannte Routen behalten ihre
 * Basis-Reihenfolge und werden hinten angehängt; gesperrte Routen bleiben
 * immer sichtbar.
 */
export function applyNavPrefs(base: NavItem[], order?: string[], hidden?: string[]): NavItem[] {
  let items = base;
  if (order && order.length) {
    const rank = new Map(order.map((to, i) => [to, i]));
    items = [...base].sort((a, b) => {
      const ra = rank.has(a.to) ? rank.get(a.to)! : Infinity;
      const rb = rank.has(b.to) ? rank.get(b.to)! : Infinity;
      return ra !== rb ? ra - rb : base.indexOf(a) - base.indexOf(b);
    });
  }
  if (hidden && hidden.length) {
    items = items.filter(it => LOCKED_NAV_ROUTES.includes(it.to) || !hidden.includes(it.to));
  }
  return items;
}

/** NAV-Liste inkl. User-Präferenzen (Reihenfolge + Ausblenden). */
function useNavItems(): NavItem[] {
  const base = useBaseNavItems();
  const order = useStore(s => s.settings?.navOrder);
  const hidden = useStore(s => s.settings?.navHidden);
  return applyNavPrefs(base, order, hidden);
}

const MOBILE_PRIMARY_ROUTES = ['/', '/aufgaben', '/stundenplan', '/noten'];

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
  const activeTerm = useStore(s => s.activeTerm);
  const setActiveSchoolYear = useStore(s => s.setActiveSchoolYear);
  const setActiveTerm = useStore(s => s.setActiveTerm);
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

  const isOberstufe = !!active.oberstufe;
  const terms = oberstufeTermsFor(active.oberstufeJahrgaenge);
  // Andere Jahre, zwischen denen man weiterhin schnell wechseln kann.
  const otherYears = schoolYears.filter(y => y.id !== active.id);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/40 hover:bg-white/70 border border-white/50 transition text-left"
      >
        {isOberstufe
          ? <CalendarClock className="size-3.5 text-ink-500 flex-shrink-0" />
          : <Calendar className="size-3.5 text-ink-500 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
            {isOberstufe ? 'Halbjahr' : 'Schuljahr'}
          </div>
          <div className="text-sm font-semibold text-ink-900 truncate">
            {isOberstufe ? `${active.name} · ${oberstufeTermLabelFor(activeTerm, active.oberstufeJahrgaenge)}` : active.name}
          </div>
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
            {isOberstufe ? (
              <>
                {/* Halbjahres-Auswähler */}
                {terms.map(t => {
                  const isActive = t.term === activeTerm;
                  return (
                    <button
                      key={t.term}
                      onClick={async () => {
                        setOpen(false);
                        if (!isActive) await setActiveTerm(t.term);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm transition text-left ${isActive ? 'theme-gradient text-white' : 'text-ink-700 hover:bg-white/70'}`}
                    >
                      <Check className={`size-3.5 flex-shrink-0 ${isActive ? 'opacity-100' : 'opacity-0'}`} strokeWidth={3} />
                      <span className="flex-1 truncate font-medium">Halbjahr {t.label}</span>
                    </button>
                  );
                })}
                {otherYears.length > 0 && (
                  <div className="border-t border-white/40 mt-1 pt-1">
                    <div className="px-2.5 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Andere Schuljahre</div>
                    {otherYears.map(y => (
                      <button
                        key={y.id}
                        onClick={async () => {
                          setOpen(false);
                          await setActiveSchoolYear(y.id);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm text-ink-700 hover:bg-white/70 transition text-left"
                      >
                        {y.oberstufe
                          ? <CalendarClock className="size-3.5 flex-shrink-0 text-ink-400" />
                          : <Calendar className="size-3.5 flex-shrink-0 text-ink-400" />}
                        <span className="flex-1 truncate font-medium">{y.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              schoolYears.map(y => {
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
              })
            )}
            <div className="border-t border-white/40 mt-1 pt-1">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate('/einstellungen?section=schoolyears&new=1');
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-theme-deep hover:bg-white/70 transition font-semibold"
              >
                <Plus className="size-3.5" />
                Neues Schuljahr
              </button>
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
  const navItems = useNavItems();
  // Nach Gruppen aufteilen – die vom User gesetzte Reihenfolge bleibt dabei erhalten.
  const groups = NAV_GROUP_ORDER.map(g => navItems.filter(it => it.group === g)).filter(list => list.length);
  const systemItems = navItems.filter(it => it.group === 'system');
  return (
    <aside className="hidden md:flex md:flex-col w-[240px] shrink-0 p-4 gap-3 sticky top-0 h-screen">
      <div className="flex items-center gap-3 px-2 py-3">
        {settings?.avatarUrl
          ? <Avatar name={settings?.name ?? ''} avatarUrl={settings.avatarUrl} className="size-10" textClassName="text-xl" />
          : <Logo />}
        <div className="min-w-0">
          <div className="font-display font-extrabold text-ink-900 leading-tight">{settings?.name || 'Schulplaner'}</div>
          <div className="text-xs text-ink-500 truncate">{settings?.name ? (settings?.school || 'Schulplaner') : 'Schule, schöner'}</div>
        </div>
      </div>
      <SchoolYearSwitcher />
      <nav className="flex flex-col gap-1 mt-2">
        {groups.map((list, gi) => (
          <div key={gi} className="flex flex-col gap-1">
            {gi > 0 && <div className="mx-3 my-2 border-t border-white/50" />}
            {list.map(item => (
              <SidebarLink key={item.to} {...item} />
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        {systemItems.length > 0 && (
          <nav className="flex flex-col gap-1">
            <div className="mx-3 mb-1 border-t border-white/50" />
            {systemItems.map(item => (
              <SidebarLink key={item.to} {...item} />
            ))}
          </nav>
        )}
        <FocusMiniWidget />
        <div className="flex items-center justify-center gap-3 text-[11px] text-ink-400">
          <NavLink to="/impressum" className="hover:text-ink-700 transition">Impressum</NavLink>
          <span>·</span>
          <NavLink to="/datenschutz" className="hover:text-ink-700 transition">Datenschutz</NavLink>
        </div>
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
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const navItems = useNavItems();
  const MOBILE_PRIMARY = navItems.filter(item => MOBILE_PRIMARY_ROUTES.includes(item.to));
  const MOBILE_MORE = navItems.filter(item => !MOBILE_PRIMARY_ROUTES.includes(item.to));

  // Sheet schließen bei Routenwechsel (z.B. Browser-Back)
  useEffect(() => { setMoreOpen(false); }, [loc.pathname]);

  const isMoreActive = MOBILE_MORE.some(item =>
    item.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(item.to)
  );

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="md:hidden fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mehr-Sheet */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="md:hidden fixed inset-x-3 z-50"
            style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 0.5rem) + 4.5rem)' }}
          >
            <div className="glass-strong rounded-3xl p-2 shadow-soft grid grid-cols-2 gap-1">
              {MOBILE_MORE.map(item => {
                const active = item.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    onClick={() => { navigate(item.to); setMoreOpen(false); }}
                    className={`relative flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition text-left ${active ? 'text-white' : 'text-ink-600'}`}
                  >
                    {active && (
                      <motion.span layoutId="more-sheet-active" className="absolute inset-0 rounded-2xl theme-gradient" />
                    )}
                    <span className="relative flex items-center gap-3">
                      <Icon className="size-5 flex-shrink-0" />
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab-Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
        <div className="glass-strong rounded-3xl flex items-center justify-between p-1 shadow-soft">
          {MOBILE_PRIMARY.map(item => {
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

          {/* Mehr-Button */}
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={`relative flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 px-0.5 rounded-2xl text-[10px] font-semibold transition ${isMoreActive || moreOpen ? 'text-white' : 'text-ink-600'}`}
          >
            {(isMoreActive || moreOpen) && (
              <motion.span layoutId="tabbar-active" className="absolute inset-0 rounded-2xl theme-gradient" />
            )}
            <span className="relative flex flex-col items-center gap-0.5">
              <MoreHorizontal className="size-5 flex-shrink-0" />
              <span className="leading-none">Mehr</span>
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
