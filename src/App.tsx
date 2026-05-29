import { useEffect, useState } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { Sidebar, MobileTabBar } from '@/components/Sidebar';
import { WelcomeTour, shouldShowTour } from '@/components/WelcomeTour';
import { Onboarding } from '@/pages/Onboarding';
import { Dashboard } from '@/pages/Dashboard';
import { TasksPage } from '@/pages/Tasks';
import { CalendarPage } from '@/pages/Calendar';
import { SchedulePage } from '@/pages/Schedule';
import { GradesPage } from '@/pages/Grades';
import { SubjectDetailPage } from '@/pages/SubjectDetail';
import { FokusPage } from '@/pages/Fokus';
import { FriendsPage } from '@/pages/Friends';
import { SettingsPage } from '@/pages/Settings';
import { ImpressumPage, DatenschutzPage } from '@/pages/Legal';
import { applyTheme } from '@/lib/themes';

export default function App() {
  const loaded = useStore(s => s.loaded);
  const settings = useStore(s => s.settings);
  const load = useStore(s => s.load);
  const location = useLocation();
  const [tourOpen, setTourOpen] = useState(false);

  // Tour einmalig anzeigen, sobald onboarded + noch nicht gesehen.
  useEffect(() => {
    if (settings?.onboarded && shouldShowTour()) {
      // Kleine Verzögerung, damit das Dashboard erst kurz sichtbar wird.
      const t = setTimeout(() => setTourOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, [settings?.onboarded]);

  useEffect(() => { load(); }, [load]);

  // OAuth-Callback (Google) hinterlässt einen leeren oder token-haltigen
  // Hash in der URL. Sobald Supabase-js die Session konsumiert hat,
  // wegputzen — sonst sieht der Nutzer kurz "/#" und manche Browser/PWAs
  // rendern den Hintergrund komisch (deshalb war das Schwarzbild).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Etwas verzögert, damit Supabase erst seine Tokens aus dem Fragment
    // ziehen kann, bevor wir es löschen.
    const t = setTimeout(() => {
      const h = window.location.hash;
      if (!h) return;
      if (h === '#' || /access_token|refresh_token|provider_token|error=/.test(h)) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }, 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (settings?.colorTheme === 'rainbow') {
      applyTheme('rainbow', location.pathname);
    }
  }, [settings?.colorTheme, location.pathname]);

  if (!loaded) {
    return (
      <div className="h-full grid place-items-center theme-aurora">
        <div className="animate-pulse text-ink-500 font-medium">Lädt …</div>
      </div>
    );
  }

  // Impressum & Datenschutz sind immer erreichbar - auch im Onboarding (rechtlich nötig)
  const isLegalRoute = location.pathname === '/impressum' || location.pathname === '/datenschutz';

  if (!settings?.onboarded && !isLegalRoute) {
    return <Onboarding />;
  }

  return (
    <div className="min-h-full flex">
      {settings?.onboarded && <Sidebar />}
      <main className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/aufgaben" element={<TasksPage />} />
            <Route path="/kalender" element={<CalendarPage />} />
            <Route path="/stundenplan" element={<SchedulePage />} />
            <Route path="/noten" element={<GradesPage />} />
            <Route path="/noten/:subjectId" element={<SubjectDetailPage />} />
            <Route path="/fokus" element={<FokusPage />} />
            <Route path="/freunde" element={<FriendsPage />} />
            <Route path="/einstellungen" element={<SettingsPage />} />
            <Route path="/impressum" element={<ImpressumPage />} />
            <Route path="/datenschutz" element={<DatenschutzPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </main>
      {settings?.onboarded && <MobileTabBar />}
      {tourOpen && <WelcomeTour onFinish={() => setTourOpen(false)} />}
    </div>
  );
}
