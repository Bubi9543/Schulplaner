import { useState } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Plus, RefreshCw, Trash2, Sparkles, Wand2 } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Empty } from '@/components/Empty';
import { SubjectDialog } from '@/components/dialogs/SubjectDialog';
import { useStore } from '@/store/useStore';
import { installDemo, resetAll } from '@/lib/demo';
import type { Subject } from '@/types';

export function SettingsPage() {
  const settings = useStore(s => s.settings);
  const subjects = useStore(s => s.subjects);
  const setSettings = useStore(s => s.setSettings);
  const load = useStore(s => s.load);
  const [subjDialog, setSubjDialog] = useState<{ open: boolean; subject?: Subject }>({ open: false });
  const [name, setName] = useState(settings?.name ?? '');

  async function saveName() {
    await setSettings({ name: name.trim() || undefined });
  }

  async function changeSystem(system: 'bayern' | 'oberstufe') {
    await setSettings({ system });
  }

  async function loadDemo() {
    if (!confirm('Demodaten laden? Bestehende Daten werden ersetzt.')) return;
    await installDemo();
    await load();
  }

  async function reset() {
    if (!confirm('Wirklich ALLE Daten zurücksetzen? Das kann nicht rückgängig gemacht werden.')) return;
    await resetAll();
    location.reload();
  }

  async function exportJson() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      subjects,
      grades: useStore.getState().grades,
      tasks: useStore.getState().tasks,
      lessons: useStore.getState().lessons,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notenapp-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell accent="rose" title="Einstellungen" subtitle="Profil, Fächer und Daten verwalten">
      <div className="grid grid-cols-12 gap-4 md:gap-5">
        <Card className="col-span-12 md:col-span-6">
          <h3 className="h3 mb-3">Profil</h3>
          <div className="space-y-3">
            <div>
              <label className="label">Name</label>
              <div className="flex gap-2">
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Dein Name" />
                <button onClick={saveName} className="btn-primary">Speichern</button>
              </div>
            </div>
            <div>
              <label className="label">Standard-Notensystem</label>
              <div className="flex gap-2">
                <button onClick={() => changeSystem('bayern')} className={`flex-1 btn ${settings?.system === 'bayern' ? 'btn-primary' : 'btn-ghost'}`}>Bayern (1–6)</button>
                <button onClick={() => changeSystem('oberstufe')} className={`flex-1 btn ${settings?.system === 'oberstufe' ? 'btn-primary' : 'btn-ghost'}`}>Oberstufe (0–15)</button>
              </div>
              <div className="subtle mt-2">Wirkt sich nur auf neu angelegte Fächer aus.</div>
            </div>
          </div>
        </Card>

        <Card className="col-span-12 md:col-span-6">
          <h3 className="h3 mb-3 flex items-center gap-2"><Sparkles className="size-5 text-rose-500" />Daten</h3>
          <div className="space-y-2">
            <button onClick={exportJson} className="btn-ghost w-full justify-start">
              <RefreshCw className="size-4" /> Daten als JSON exportieren
            </button>
            <button onClick={loadDemo} className="btn-ghost w-full justify-start">
              <Wand2 className="size-4" /> Demodaten laden (überschreibt)
            </button>
            <button onClick={reset} className="btn-soft w-full justify-start text-rose-600">
              <Trash2 className="size-4" /> Alles zurücksetzen
            </button>
          </div>
        </Card>

        <Card className="col-span-12">
          <div className="flex items-center justify-between mb-3">
            <h3 className="h3">Fächer ({subjects.length})</h3>
            <button onClick={() => setSubjDialog({ open: true })} className="btn-primary"><Plus className="size-4" />Fach anlegen</button>
          </div>
          {!subjects.length ? (
            <Empty icon={Plus} title="Noch keine Fächer" description="Lege jetzt dein erstes Fach an." />
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {subjects.map(s => (
                <motion.li key={s.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-3 bg-white/70 flex items-center gap-3">
                  <div className="size-11 rounded-xl grid place-items-center text-white font-display font-extrabold" style={{ background: s.color }}>{s.short}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink-800 truncate">{s.name}</div>
                    <div className="text-xs text-ink-500">{s.category === 'haupt' ? 'Hauptfach' : 'Nebenfach'} · {s.system === 'bayern' ? '1–6' : '0–15'}</div>
                  </div>
                  <button onClick={() => setSubjDialog({ open: true, subject: s })} className="size-9 grid place-items-center rounded-full hover:bg-white"><Pencil className="size-4" /></button>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <SubjectDialog open={subjDialog.open} initial={subjDialog.subject} onClose={() => setSubjDialog({ open: false })} defaultSystem={settings?.system ?? 'bayern'} />
    </PageShell>
  );
}
