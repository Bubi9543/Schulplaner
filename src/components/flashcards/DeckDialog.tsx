import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { IconPicker } from '@/components/IconPicker';
import { SubjectIcon } from '@/components/SubjectIcon';
import { useStore } from '@/store/useStore';
import { randomDeckColor } from '@/lib/flashcards';
import { detectSubjectIcon } from '@/lib/subjectIcons';
import type { Deck } from '@/types';

const DECK_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#14b8a6', '#10b981', '#16a34a',
  '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7',
];

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Deck>;
}

const NEW_FOLDER = '__new__';

export function DeckDialog({ open, onClose, initial }: Props) {
  const addDeck = useStore(s => s.addDeck);
  const updateDeck = useStore(s => s.updateDeck);
  const deleteDeck = useStore(s => s.deleteDeck);
  const addDeckFolder = useStore(s => s.addDeckFolder);
  const subjects = useStore(s => s.subjects);
  const folders = useStore(s => s.deckFolders);
  const editing = !!initial?.id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(DECK_COLORS[0]);
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [subjectId, setSubjectId] = useState<string | undefined>(undefined);
  const [folderSel, setFolderSel] = useState<string>('');
  const [newFolder, setNewFolder] = useState('');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setColor(initial?.color ?? randomDeckColor());
      setIcon(initial?.icon);
      setSubjectId(initial?.subjectId);
      setFolderSel(initial?.folderId ?? '');
      setNewFolder('');
    }
  }, [open, initial]);

  async function save() {
    if (!name.trim()) return;
    let folderId = folderSel || undefined;
    if (folderSel === NEW_FOLDER) {
      folderId = newFolder.trim() ? (await addDeckFolder({ name: newFolder.trim() })).id : undefined;
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      icon,
      subjectId: subjectId || undefined,
      folderId,
    };
    if (editing && initial?.id) await updateDeck(initial.id, payload);
    else await addDeck(payload);
    onClose();
  }

  async function remove() {
    if (initial?.id && confirm('Kasten mit allen Themen & Karten wirklich löschen?')) {
      await deleteDeck(initial.id);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Kasten bearbeiten' : 'Neuer Kasten'}
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
          <div className="text-white min-w-0">
            <div className="font-display font-bold text-lg truncate">{name || 'Kastenname'}</div>
            <div className="text-xs opacity-80 truncate">{description || 'Karteikarten-Kasten'}</div>
          </div>
        </div>

        <div>
          <label className="label">Name</label>
          <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Mathe – Analysis" />
        </div>

        <div>
          <label className="label">Beschreibung (optional)</label>
          <input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Worum geht's?" />
        </div>

        <div>
          <label className="label">Farbe</label>
          <div className="flex flex-wrap gap-2">
            {DECK_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`size-9 rounded-2xl transition ${color === c ? 'ring-4 ring-white scale-110 shadow-soft' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="label">Icon</label>
          <IconPicker value={icon} autoIcon={detectSubjectIcon(name) || 'Layers'} onChange={setIcon} color={color} />
        </div>

        <div>
          <label className="label">Ordner (optional)</label>
          <select className="input" value={folderSel} onChange={e => setFolderSel(e.target.value)}>
            <option value="">— Kein Ordner —</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            <option value={NEW_FOLDER}>+ Neuer Ordner …</option>
          </select>
          {folderSel === NEW_FOLDER && (
            <input className="input mt-2" autoFocus value={newFolder} onChange={e => setNewFolder(e.target.value)}
              placeholder="Name des neuen Ordners" />
          )}
        </div>

        {subjects.length > 0 && (
          <div>
            <label className="label">Fach zuordnen (optional)</label>
            <select className="input" value={subjectId ?? ''} onChange={e => setSubjectId(e.target.value || undefined)}>
              <option value="">— Kein Fach —</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}
