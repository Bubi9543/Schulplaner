import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { IconPicker } from '@/components/IconPicker';
import { SubjectIcon } from '@/components/SubjectIcon';
import { useStore } from '@/store/useStore';
import { SUBJECT_COLORS, SUBJECT_COLORS_ALL, DEFAULT_GRADING_CONFIG } from '@/types';
import type { Subject, SubjectCategory, GradingSystem } from '@/types';
import { CATEGORY_LABEL, CATEGORY_DESCRIPTION, getSystemMeta } from '@/lib/grading';
import { detectSubjectIcon } from '@/lib/subjectIcons';

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Subject>;
}

export function SubjectDialog({ open, onClose, initial }: Props) {
  const addSubject = useStore(s => s.addSubject);
  const updateSubject = useStore(s => s.updateSubject);
  const deleteSubject = useStore(s => s.deleteSubject);
  const settings = useStore(s => s.settings);
  const schoolYears = useStore(s => s.schoolYears);
  const activeSchoolYearId = useStore(s => s.activeSchoolYearId);
  const editing = !!initial?.id;

  // System eines Fachs: beim Bearbeiten beibehalten; sonst aus dem aktiven Jahr
  // ableiten – in einer Oberstufe immer Punkte (0–15), sonst das Standard-System.
  const activeYear = schoolYears.find(y => y.id === activeSchoolYearId);
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const system: GradingSystem = initial?.system
    ?? (activeYear?.oberstufe ? 'oberstufe' : (settings?.system ?? 'bayern'));
  const systemLabel = getSystemMeta(system, config).label;

  const [name, setName] = useState(initial?.name ?? '');
  const [short, setShort] = useState(initial?.short ?? '');
  const [color, setColor] = useState(initial?.color ?? SUBJECT_COLORS[0]);
  const [icon, setIcon] = useState<string | undefined>(initial?.icon);
  const [category, setCategory] = useState<SubjectCategory>(initial?.category ?? 'nebenfach');
  const [leistungsfach, setLeistungsfach] = useState<boolean>(initial?.leistungsfach ?? false);
  const [teacher, setTeacher] = useState(initial?.teacher ?? '');
  const [room, setRoom] = useState(initial?.room ?? '');
  const [targetAverage, setTargetAverage] = useState<string>(initial?.targetAverage?.toString() ?? '');
  const [showAllColors, setShowAllColors] = useState(false);

  // Eigene Farbe = ein Farbcode, der in keinem der Voreinstellungs-Raster vorkommt.
  const isCustomColor = !(SUBJECT_COLORS_ALL as readonly string[]).includes(color);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setShort(initial?.short ?? '');
      setColor(initial?.color ?? SUBJECT_COLORS[0]);
      setIcon(initial?.icon);
      setCategory(initial?.category ?? 'nebenfach');
      setLeistungsfach(initial?.leistungsfach ?? false);
      setTeacher(initial?.teacher ?? '');
      setRoom(initial?.room ?? '');
      setTargetAverage(initial?.targetAverage?.toString() ?? '');
      // Panel aufklappen, falls die aktuelle Farbe nur im vollen Raster vorkommt.
      const c = initial?.color ?? '';
      setShowAllColors(
        !(SUBJECT_COLORS as readonly string[]).includes(c)
        && (SUBJECT_COLORS_ALL as readonly string[]).includes(c)
      );
    }
  }, [open, initial]);

  async function save() {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      short: short.trim() || name.trim().slice(0, 2),
      color,
      icon,
      category,
      system,
      leistungsfach: system === 'oberstufe' ? leistungsfach : undefined,
      teacher: teacher.trim() || undefined,
      room: room.trim() || undefined,
      targetAverage: targetAverage ? parseFloat(targetAverage.replace(',', '.')) : undefined,
    };
    if (editing && initial?.id) {
      await updateSubject(initial.id, payload);
    } else {
      await addSubject(payload);
    }
    onClose();
  }

  async function remove() {
    if (initial?.id && confirm('Fach mit allen Noten/Stunden/Aufgaben wirklich löschen?')) {
      await deleteSubject(initial.id);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Fach bearbeiten' : 'Neues Fach'}
      footer={
        <>
          {editing && <button onClick={remove} className="btn-soft text-rose-600">Löschen</button>}
          <button onClick={onClose} className="btn-ghost">Abbrechen</button>
          <button onClick={save} className="btn-primary" disabled={!name.trim()}>Speichern</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-3xl p-5 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
          <div className="size-16 rounded-2xl bg-white/25 grid place-items-center text-white">
            <SubjectIcon subject={{ icon, name }} className="size-8" strokeWidth={2.25} />
          </div>
          <div className="text-white">
            <div className="font-display font-bold text-lg">{name || 'Fachname'}</div>
            <div className="text-xs opacity-80">{system === 'oberstufe' ? (leistungsfach ? 'Leistungsfach' : 'Kurs') : CATEGORY_LABEL[category]} · {systemLabel}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">Name</label>
            <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Mathematik" />
          </div>
          <div>
            <label className="label">Kürzel</label>
            <input className="input" value={short} onChange={e => setShort(e.target.value)} placeholder="M" maxLength={4} />
          </div>
        </div>

        <div>
          <label className="label">Farbe</label>
          {/* Eigene Farbe: auffällige Zeile ganz oben, öffnet den nativen Farbwähler */}
          <label
            title="Eigene Farbe wählen"
            className={`mb-3 flex items-center gap-3 rounded-2xl border-2 border-dashed px-3 py-2.5 cursor-pointer transition ${isCustomColor ? 'border-transparent ring-4 ring-white shadow-soft' : 'border-ink-200 hover:border-ink-300'}`}
            style={isCustomColor ? { background: `linear-gradient(135deg, ${color}, ${color}cc)` } : undefined}
          >
            <span
              className="size-9 shrink-0 rounded-xl grid place-items-center"
              style={{ background: isCustomColor ? 'rgba(255,255,255,0.3)' : 'conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#8b5cf6,#ec4899,#ef4444)' }}
            >
              <svg viewBox="0 0 24 24" className="size-4 text-white drop-shadow" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className={`flex flex-col ${isCustomColor ? 'text-white' : ''}`}>
              <span className="font-semibold text-sm">Eigene Farbe</span>
              <span className={`text-[11px] leading-tight ${isCustomColor ? 'text-white/85' : 'text-ink-500'}`}>
                {isCustomColor ? color.toUpperCase() : 'Beliebige Farbe frei wählen'}
              </span>
            </span>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="sr-only" />
          </label>

          <div className="grid grid-cols-8 gap-2 justify-items-center">
            {(showAllColors ? SUBJECT_COLORS_ALL : SUBJECT_COLORS).map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`size-9 rounded-2xl transition ${color === c ? 'ring-4 ring-white scale-110 shadow-soft' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <button type="button" onClick={() => setShowAllColors(v => !v)}
            className="mt-2 text-xs font-semibold text-ink-500 hover:text-ink-700 transition">
            {showAllColors ? 'Weniger Farben ▲' : 'Mehr Farben ▼'}
          </button>
        </div>

        <div>
          <label className="label">Icon</label>
          <IconPicker value={icon} autoIcon={detectSubjectIcon(name)} onChange={setIcon} color={color} />
        </div>

        {system === 'oberstufe' ? (
          <div>
            <label className="label">Niveau</label>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
              <button type="button" onClick={() => setLeistungsfach(false)}
                className={`btn flex-col items-start text-left h-auto py-2.5 px-3 ${!leistungsfach ? 'btn-primary' : 'btn-ghost'}`}>
                <span className="font-semibold text-sm">Grundlegendes Niveau</span>
                <span className={`text-[10px] mt-0.5 leading-tight font-normal ${!leistungsfach ? 'text-white/85' : 'text-ink-500'}`}>Reguläres Oberstufenfach</span>
              </button>
              <button type="button" onClick={() => setLeistungsfach(true)}
                className={`btn flex-col items-start text-left h-auto py-2.5 px-3 ${leistungsfach ? 'btn-primary' : 'btn-ghost'}`}>
                <span className="font-semibold text-sm">Leistungsfach</span>
                <span className={`text-[10px] mt-0.5 leading-tight font-normal ${leistungsfach ? 'text-white/85' : 'text-ink-500'}`}>Erhöhtes Anforderungsniveau (z. B. Deutsch, Mathe + 1)</span>
              </button>
            </div>
            <div className="subtle mt-1.5 text-xs">
              Halbjahresleistung = Klausur ⊕ kleine Leistungen (1:1). Das Leistungsfach zählt in Bayern <strong>nicht doppelt</strong> – die Kennzeichnung dient nur der Übersicht.
            </div>
          </div>
        ) : (
          <div>
            <label className="label">Kategorie</label>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
              {(['hauptfach', 'hauptfach-1zu1', 'nebenfach'] as const).map(c => (
                <button key={c} type="button" onClick={() => setCategory(c)}
                  className={`btn flex-col items-start text-left h-auto py-2.5 px-3 ${category === c ? 'btn-primary' : 'btn-ghost'}`}>
                  <span className="font-semibold text-sm">{CATEGORY_LABEL[c]}</span>
                  <span className={`text-[10px] mt-0.5 leading-tight font-normal ${category === c ? 'text-white/85' : 'text-ink-500'}`}>{CATEGORY_DESCRIPTION[c]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">Lehrer:in (optional)</label>
            <input className="input" value={teacher} onChange={e => setTeacher(e.target.value)} />
          </div>
          <div>
            <label className="label">Raum (optional)</label>
            <input className="input" value={room} onChange={e => setRoom(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Zielnote (optional)</label>
          <input className="input" placeholder="z.B. 2,5" value={targetAverage} onChange={e => setTargetAverage(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
