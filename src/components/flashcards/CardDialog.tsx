import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store/useStore';
import type { Flashcard } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  deckId: string;
  /** Vorbelegtes Thema beim Neuanlegen. */
  defaultTopicId?: string;
  /** Wenn gesetzt → Bearbeiten-Modus. */
  initial?: Flashcard;
}

const NO_TOPIC = '__none__';
const NEW_TOPIC = '__new__';

export function CardDialog({ open, onClose, deckId, defaultTopicId, initial }: Props) {
  const addCard = useStore(s => s.addCard);
  const updateCard = useStore(s => s.updateCard);
  const deleteCard = useStore(s => s.deleteCard);
  const addTopic = useStore(s => s.addTopic);
  const allTopics = useStore(s => s.cardTopics);
  const topics = useMemo(() => allTopics.filter(t => t.deckId === deckId), [allTopics, deckId]);
  const editing = !!initial;

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [topicSel, setTopicSel] = useState<string>(NO_TOPIC);
  const [newTopic, setNewTopic] = useState('');
  const frontRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setFront(initial?.front ?? '');
      setBack(initial?.back ?? '');
      setTopicSel(initial?.topicId ?? defaultTopicId ?? NO_TOPIC);
      setNewTopic('');
      setTimeout(() => frontRef.current?.focus(), 60);
    }
  }, [open, initial, defaultTopicId]);

  async function resolveTopicId(): Promise<string | undefined> {
    if (topicSel === NO_TOPIC) return undefined;
    if (topicSel === NEW_TOPIC) {
      if (!newTopic.trim()) return undefined;
      const t = await addTopic({ deckId, name: newTopic.trim() });
      return t.id;
    }
    return topicSel;
  }

  /** Speichert und schließt. */
  async function save() {
    if (!front.trim() || !back.trim()) return;
    const topicId = await resolveTopicId();
    if (editing && initial) {
      await updateCard(initial.id, { front: front.trim(), back: back.trim(), topicId });
    } else {
      await addCard({ deckId, topicId, front: front.trim(), back: back.trim() });
    }
    onClose();
  }

  /** Speichert und lässt den Dialog für die nächste Karte offen (nur Neuanlage). */
  async function saveAndNext() {
    if (!front.trim() || !back.trim()) return;
    const topicId = await resolveTopicId();
    await addCard({ deckId, topicId, front: front.trim(), back: back.trim() });
    // Thema beibehalten, Felder leeren.
    if (topicSel === NEW_TOPIC) setTopicSel(topicId ?? NO_TOPIC);
    setFront('');
    setBack('');
    frontRef.current?.focus();
  }

  async function remove() {
    if (initial && confirm('Karte wirklich löschen?')) {
      await deleteCard(initial.id);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Karte bearbeiten' : 'Neue Karte'}
      footer={
        <>
          {editing && <button onClick={remove} className="btn-soft text-rose-600">Löschen</button>}
          <button onClick={onClose} className="btn-ghost">Abbrechen</button>
          {!editing && (
            <button onClick={saveAndNext} className="btn-soft" disabled={!front.trim() || !back.trim()}>
              Speichern &amp; nächste
            </button>
          )}
          <button onClick={save} className="btn-primary" disabled={!front.trim() || !back.trim()}>Speichern</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Vorderseite (Frage / Begriff)</label>
          <textarea ref={frontRef} className="input min-h-[80px] resize-y" value={front}
            onChange={e => setFront(e.target.value)} placeholder="z.B. Was ist die Ableitung von sin(x)?" />
        </div>
        <div>
          <label className="label">Rückseite (Antwort)</label>
          <textarea className="input min-h-[80px] resize-y" value={back}
            onChange={e => setBack(e.target.value)} placeholder="z.B. cos(x)" />
        </div>
        <div>
          <label className="label">Thema</label>
          <select className="input" value={topicSel} onChange={e => setTopicSel(e.target.value)}>
            <option value={NO_TOPIC}>— Kein Thema —</option>
            {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value={NEW_TOPIC}>+ Neues Thema …</option>
          </select>
          {topicSel === NEW_TOPIC && (
            <input className="input mt-2" autoFocus value={newTopic} onChange={e => setNewTopic(e.target.value)}
              placeholder="Name des neuen Themas" />
          )}
        </div>
      </div>
    </Modal>
  );
}
