import { useEffect } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { Sidebar, MobileTabBar } from '@/components/Sidebar';
import { Onboarding } from '@/pages/Onboarding';
import { Dashboard } from '@/pages/Dashboard';
import { TasksPage } from '@/pages/Tasks';
import { SchedulePage } from '@/pages/Schedule';
import { GradesPage } from '@/pages/Grades';
import { SubjectDetailPage } from '@/pages/SubjectDetail';
import { SettingsPage } from '@/pages/Settings';
import { ImpressumPage, DatenschutzPage } from '@/pages/Legal';
import { applyTheme } from '@/lib/themes';

export default function App() {
  const loaded = useStore(s => s.loaded);
  const settings = useStore(s => s.settings);
  const load = useStore(s => s.load);
  const location = useLocation();

  useEffect(() => { load(); }, [load]);

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
            <Route path="/stundenplan" element={<SchedulePage />} />
            <Route path="/noten" element={<GradesPage />} />
            <Route path="/noten/:subjectId" element={<SubjectDetailPage />} />
            <Route path="/einstellungen" element={<SettingsPage />} />
            <Route path="/impressum" element={<ImpressumPage />} />
            <Route path="/datenschutz" element={<DatenschutzPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </main>
      {settings?.onboarded && <MobileTabBar />}
    </div>
  );
}
