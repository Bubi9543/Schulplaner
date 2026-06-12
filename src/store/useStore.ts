import { create } from 'zustand';
import { db, uid } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { syncRow, syncSettings, deleteRow, uploadAll, syncMergeAll, flushSyncQueue, startRealtime, stopRealtime, deleteAllCloudData } from '@/lib/sync';
import type { SyncTable } from '@/lib/sync';
import type { SharePayload } from '@/lib/scheduleShare';
import { DEFAULT_GRADING_CONFIG, DEFAULT_SETTINGS, normalizeSubjectCategory } from '@/types';
import type { Subject, Grade, AppTask, Lesson, AppSettings, GradingSystemConfig, SchoolYear, Photo, FriendTask, HomeworkSubscription, FocusSession, Deck, CardTopic, Flashcard, DeckExport, DeckFolder, ReviewOutcome } from '@/types';
import { reviewPatch, deckExportToEntities, buildDeckExport } from '@/lib/flashcards';
import { sendDeckToFriends as sendDeckToFriendsApi, fetchIncomingDeckShares, deleteDeckShare } from '@/lib/deckShare';
import type { IncomingDeckShare } from '@/lib/deckShare';
import type { SupabaseUser } from '@/lib/supabase';
import { applyTheme, resolveThemeId } from '@/lib/themes';
import { applyVisualSettings, bindAutoModeWatcher } from '@/lib/visualSettings';
import { fetchTasksFromUser, publishTask as publishSharedTask, unpublishTask as unpublishSharedTask, getOrCreateMyProfile } from '@/lib/homeworkShare';
import { sameHomework } from '@/lib/homeworkMatch';
import type { UserProfile } from '@/lib/homeworkShare';
import {
  loadFriendGraph,
  sendFriendRequestByCode,
  acceptRequest as acceptFriendshipRow,
  deleteFriendship,
} from '@/lib/friends';
import type { Friend, FriendRequest } from '@/lib/friends';
import { publishMySchedule, unpublishMySchedule, buildSchedulePayload, fetchFriendSchedule } from '@/lib/scheduleShare';

function mergeSettings(stored: Partial<AppSettings> | undefined): AppSettings {
  const base: AppSettings = { ...DEFAULT_SETTINGS, id: 'app' };
  if (!stored) return base;
  const legacyAccent = (stored as Partial<AppSettings> & { accent?: string }).accent;
  const merged: AppSettings = { ...base, ...stored, id: 'app' };
  merged.colorTheme = resolveThemeId(stored.colorTheme ?? legacyAccent);
  merged.gradingConfig = mergeGradingConfig(stored.gradingConfig);
  if (!merged.quickButtons || !Array.isArray(merged.quickButtons) || merged.quickButtons.length === 0) {
    merged.quickButtons = DEFAULT_SETTINGS.quickButtons;
  }
  if (!Array.isArray(merged.subjectGroups)) {
    merged.subjectGroups = [];
  } else {
    merged.subjectGroups = merged.subjectGroups.filter(g =>
      g && typeof g === 'object' && typeof g.id === 'string' && typeof g.label === 'string',
    );
  }
  // homeworkSubscriptions: Array sicherstellen
  if (!Array.isArray(merged.homeworkSubscriptions)) {
    merged.homeworkSubscriptions = [];
  }
  if (typeof merged.homeworkShareByDefault !== 'boolean') {
    merged.homeworkShareByDefault = false;
  }
  if (typeof merged.homeworkShareViaShortcut !== 'boolean') {
    merged.homeworkShareViaShortcut = false;
  }
  if (typeof merged.shareScheduleWithFriends !== 'boolean') {
    merged.shareScheduleWithFriends = false;
  }
  if (!merged.friendSubjectFilters || typeof merged.friendSubjectFilters !== 'object' || Array.isArray(merged.friendSubjectFilters)) {
    merged.friendSubjectFilters = {};
  }
  if (!Array.isArray(merged.dismissedFriendTaskIds)) {
    merged.dismissedFriendTaskIds = [];
  }

  // Notifications: alte Settings ohne das Feld bekommen Default; bestehende
  // werden mit Defaults „aufgefüllt" für fehlende Unter-Keys.
  const def = DEFAULT_SETTINGS.notifications;
  const n = (stored.notifications ?? {}) as Partial<typeof def>;
  merged.notifications = {
    enabled: n.enabled ?? def.enabled,
    homework: { ...def.homework, ...(n.homework ?? {}) },
    exam: { ...def.exam, ...(n.exam ?? {}) },
    lessonStart: { ...def.lessonStart, ...(n.lessonStart ?? {}) },
    studyDeadline: { ...def.studyDeadline, ...(n.studyDeadline ?? {}) },
    quietHours: { ...def.quietHours, ...(n.quietHours ?? {}) },
  };
  return merged;
}

function mergeGradingConfig(stored: Partial<GradingSystemConfig> | undefined): GradingSystemConfig {
  const def = DEFAULT_GRADING_CONFIG;
  if (!stored) return cloneCfg(def);
  return {
    bayern: { kindWeights: { ...def.bayern.kindWeights, ...(stored.bayern?.kindWeights ?? {}) } },
    oberstufe: {
      kindWeights: { ...def.oberstufe.kindWeights, ...(stored.oberstufe?.kindWeights ?? {}) },
      allowPerGradeWeight: stored.oberstufe?.allowPerGradeWeight ?? def.oberstufe.allowPerGradeWeight,
    },
    austria: { kindWeights: { ...def.austria.kindWeights, ...(stored.austria?.kindWeights ?? {}) } },
    custom: { ...def.custom, ...(stored.custom ?? {}), kindWeights: { ...def.custom.kindWeights, ...(stored.custom?.kindWeights ?? {}) } },
    customKinds: Array.isArray(stored.customKinds) ? stored.customKinds.filter(isValidCustomKind) : [],
  };
}

function isValidCustomKind(c: unknown): c is { id: string; label: string; weighting: 'large' | 'rest' } {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  return typeof o.id === 'string' && o.id.length > 0
    && typeof o.label === 'string'
    && (o.weighting === 'large' || o.weighting === 'rest');
}

function cloneCfg(c: GradingSystemConfig): GradingSystemConfig {
  return typeof structuredClone === 'function' ? structuredClone(c) : JSON.parse(JSON.stringify(c));
}

function suggestYearName(): string {
  const d = new Date();
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${String(y + 1).slice(2)}`;
}

function suggestYearStart(): number {
  const d = new Date();
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(y, 8, 1).getTime();
}

// ─── Aktives Halbjahr (Oberstufe) ─────────────────────────────────────────
// Pro Oberstufen-Schuljahr merken wir uns das zuletzt gewählte Halbjahr
// (1–4) lokal, damit es einen Reload überlebt. Kein Cloud-Sync nötig –
// das ist reine View-Präferenz.
const ACTIVE_TERM_KEY = 'notenapp.activeTerm';

function readActiveTerms(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ACTIVE_TERM_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getActiveTerm(yearId: string | null): number {
  if (!yearId) return 1;
  const t = readActiveTerms()[yearId];
  return typeof t === 'number' && t >= 1 && t <= 4 ? t : 1;
}

function writeActiveTerm(yearId: string, term: number): void {
  try {
    const all = readActiveTerms();
    all[yearId] = term;
    localStorage.setItem(ACTIVE_TERM_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

/** True, wenn die Note in der aktuellen Halbjahres-Ansicht sichtbar sein soll. */
function gradeInActiveTerm(grade: Grade, year: SchoolYear | undefined, activeTerm: number): boolean {
  if (!year?.oberstufe) return true;
  return (grade.term ?? 1) === activeTerm;
}

/**
 * Sortiert Fächer: erst nach manueller `position` (kleinere zuerst, undefined = ans Ende),
 * dann alphabetisch nach Name. Gruppen werden nicht hier gehandhabt – Gruppierung
 * passiert in der View-Layer.
 */
export function compareSubjects(a: Subject, b: Subject): number {
  const ap = typeof a.position === 'number' ? a.position : Number.POSITIVE_INFINITY;
  const bp = typeof b.position === 'number' ? b.position : Number.POSITIVE_INFINITY;
  if (ap !== bp) return ap - bp;
  return a.name.localeCompare(b.name, 'de');
}

/** Sortiert Kästen nach manueller `position`, dann alphabetisch. */
export function compareDecks(a: Deck, b: Deck): number {
  const ap = typeof a.position === 'number' ? a.position : Number.POSITIVE_INFINITY;
  const bp = typeof b.position === 'number' ? b.position : Number.POSITIVE_INFINITY;
  if (ap !== bp) return ap - bp;
  return a.name.localeCompare(b.name, 'de');
}

// Kleine, immutable Helfer für In-Memory-State.
function upsertById<T extends { id: string }>(arr: T[], item: T): T[] {
  const i = arr.findIndex(x => x.id === item.id);
  if (i === -1) return [...arr, item];
  const next = arr.slice();
  next[i] = item;
  return next;
}

export interface NewYearOptions {
  name: string;
  startDate: number;
  endDate?: number;
  copySubjectsFromYearId?: string;
  copyLessonsFromYearId?: string;
  /** Legt das Jahr als bayerische Oberstufe an (4 Halbjahre, Halbjahres-Notenführung). */
  oberstufe?: boolean;
  /** Jahrgangsstufen der Q-Phase, z. B. [12,13] (G9) oder [11,12] (G8). Default [12,13]. */
  oberstufeJahrgaenge?: [number, number];
}

export type LiveSyncStatus = 'off' | 'connecting' | 'live' | 'error';

interface State {
  loaded: boolean;
  settings: AppSettings | null;
  subjects: Subject[];
  grades: Grade[];
  /**
   * Alle Noten des aktiven Schuljahres – OHNE Halbjahres-Filter.
   * In regulären Jahren identisch zu `grades`; in der Oberstufe enthält es alle
   * 4 Ausbildungsabschnitte (für Halbjahres-Übersicht & Abi-Rechner).
   */
  allYearGrades: Grade[];
  tasks: AppTask[];
  lessons: Lesson[];
  schoolYears: SchoolYear[];
  /** Lern-/Fokus-Sessions (gefiltert nach aktivem Schuljahr). */
  focusSessions: FocusSession[];
  /** Ordner zum Gruppieren der Kästen (gefiltert nach aktivem Schuljahr). */
  deckFolders: DeckFolder[];
  /** Karteikarten-Kästen (gefiltert nach aktivem Schuljahr). */
  decks: Deck[];
  /** Themengebiete der geladenen Kästen. */
  cardTopics: CardTopic[];
  /** Karten der geladenen Kästen. */
  flashcards: Flashcard[];
  /** Von Freunden direkt erhaltene Kästen (Inbox). */
  incomingDeckShares: IncomingDeckShare[];
  /** Aktive Schuljahr-ID. Wenn null, gibt es noch keine. */
  activeSchoolYearId: string | null;
  /**
   * Aktives Halbjahr (Ausbildungsabschnitt 1–4), nur relevant wenn das aktive
   * Schuljahr eine Oberstufe ist. Steuert, welche Noten in der View erscheinen.
   */
  activeTerm: number;
  authUser: SupabaseUser | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncedAt: number | null;
  /** Verbindungsstatus des Realtime-Channels. */
  liveSync: LiveSyncStatus;
  /** Gecachte geteilte Hausaufgaben von abonnierten Mitschülern. */
  friendTasks: FriendTask[];
  friendTasksLoading: boolean;
  /** Session-level ausgeblendete Fremdaufgaben (kein Persist). */
  dismissedFriendTaskIds: Set<string>;

  /** Eigenes Cloud-Profil (Anzeigename, Freundecode, Avatar). */
  myProfile: UserProfile | null;
  /** Bestätigte, gegenseitige Freunde. */
  friends: Friend[];
  /** Eingehende Freundschaftsanfragen (annehmen/ablehnen). */
  incomingRequests: FriendRequest[];
  /** Ausgehende Freundschaftsanfragen (pending). */
  outgoingRequests: FriendRequest[];
  friendsLoading: boolean;

  load: () => Promise<void>;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setGradingConfig: (patch: Partial<GradingSystemConfig>) => Promise<void>;

  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Erstmaliger Push+Pull nach Login, danach übernimmt Realtime. */
  startAutoSync: () => Promise<void>;
  stopAutoSync: () => void;
  /** Manuell: Push lokal → Cloud (sollte selten nötig sein). */
  syncNow: () => Promise<void>;
  /** Manuell: Pull Cloud → lokal (überschreibt). */
  pullFromCloud: () => Promise<boolean>;
  /** Destruktiv: alle Cloud-Daten des Users löschen. Lokale Daten bleiben. */
  wipeCloud: () => Promise<{ rows: number; files: number } | null>;
  /**
   * Hard-Replace: Cloud-Stand wird komplett mit dem aktuellen lokalen Stand überschrieben.
   * Wird nach Massen-Operationen aufgerufen, die Dexie direkt schreiben (Import, Demo-Load),
   * damit auch in der Cloud nichts „Geister-Zeilen" zurückbleiben.
   */
  replaceCloud: () => Promise<void>;

  addSubject: (s: Omit<Subject, 'id' | 'createdAt'>) => Promise<Subject>;
  updateSubject: (id: string, patch: Partial<Subject>) => Promise<void>;
  deleteSubject: (id: string) => Promise<void>;
  /** Verschiebt ein Fach um delta Plätze in der Sortierreihenfolge (innerhalb derselben Gruppe). */
  moveSubject: (id: string, delta: -1 | 1) => Promise<void>;

  addGrade: (g: Omit<Grade, 'id'> & { id?: string }) => Promise<Grade>;
  updateGrade: (id: string, patch: Partial<Grade>) => Promise<void>;
  deleteGrade: (id: string) => Promise<void>;

  addTask: (t: Omit<AppTask, 'id' | 'createdAt'> & { id?: string }) => Promise<AppTask>;
  updateTask: (id: string, patch: Partial<AppTask>) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  addLesson: (l: Omit<Lesson, 'id'>) => Promise<Lesson>;
  updateLesson: (id: string, patch: Partial<Lesson>) => Promise<void>;
  deleteLesson: (id: string) => Promise<void>;

  /**
   * Übernimmt einen geteilten Stundenplan ins aktive Schuljahr.
   * - Subjects mit gleichem Namen (case-insensitive) werden gemerged
   *   (vorhandene Noten bleiben unangetastet).
   * - Lessons werden je nach Modus ersetzt oder ergänzt.
   * Gibt Zahlen zurück, was tatsächlich neu/ersetzt wurde.
   */
  importSharedSchedule: (
    payload: SharePayload,
    mode: 'replace' | 'append',
  ) => Promise<{ subjectsAdded: number; subjectsMatched: number; lessonsAdded: number; lessonsReplaced: number }>;

  addSchoolYear: (opts: NewYearOptions) => Promise<SchoolYear>;
  updateSchoolYear: (id: string, patch: Partial<SchoolYear>) => Promise<void>;
  deleteSchoolYear: (id: string, mode?: 'wipe' | 'orphan') => Promise<void>;
  setActiveSchoolYear: (id: string) => Promise<void>;
  /** Wechselt das aktive Halbjahr (Oberstufe) und filtert die Noten-View neu. */
  setActiveTerm: (term: number) => Promise<void>;

  /** Speichert eine abgeschlossene Fokus-Session. */
  addFocusSession: (s: Omit<FocusSession, 'id' | 'schoolYearId'> & { id?: string; schoolYearId?: string }) => Promise<FocusSession>;
  /** Aktualisiert eine bestehende Fokus-Session (Fach, Test, Dauer …). */
  updateFocusSession: (id: string, patch: Partial<FocusSession>) => Promise<void>;
  /** Löscht eine Fokus-Session. */
  deleteFocusSession: (id: string) => Promise<void>;

  // ─── Karteikarten ──────────────────────────────────────────────────────────
  /** Legt einen neuen Ordner für Kästen an. */
  addDeckFolder: (f: Omit<DeckFolder, 'id' | 'createdAt'> & { id?: string }) => Promise<DeckFolder>;
  updateDeckFolder: (id: string, patch: Partial<DeckFolder>) => Promise<void>;
  /** Löscht einen Ordner; enthaltene Kästen bleiben erhalten (ohne Ordner). */
  deleteDeckFolder: (id: string) => Promise<void>;
  /** Legt einen neuen Kasten an. */
  addDeck: (d: Omit<Deck, 'id' | 'createdAt'> & { id?: string }) => Promise<Deck>;
  updateDeck: (id: string, patch: Partial<Deck>) => Promise<void>;
  /** Löscht einen Kasten samt aller Themen & Karten (kaskadiert lokal + Cloud). */
  deleteDeck: (id: string) => Promise<void>;
  addTopic: (t: Omit<CardTopic, 'id' | 'createdAt'> & { id?: string }) => Promise<CardTopic>;
  updateTopic: (id: string, patch: Partial<CardTopic>) => Promise<void>;
  /** Löscht ein Thema. mode 'wipe' = Karten mitlöschen, 'orphan' = Karten behalten (ohne Thema). */
  deleteTopic: (id: string, mode?: 'wipe' | 'orphan') => Promise<void>;
  addCard: (c: Omit<Flashcard, 'id' | 'createdAt' | 'box'> & { id?: string; box?: number }) => Promise<Flashcard>;
  updateCard: (id: string, patch: Partial<Flashcard>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  /** Verschiebt eine Karte in ein anderes Thema (oder „kein Thema"). */
  moveCard: (id: string, topicId: string | undefined) => Promise<void>;
  /** Bewertet eine Karte (Leitner-Schritt: correct/partial/wrong). */
  reviewCard: (id: string, outcome: ReviewOutcome) => Promise<void>;
  /** Setzt den Lernfortschritt eines Kastens zurück (alle Karten → Fach 1). */
  resetDeckProgress: (deckId: string) => Promise<void>;
  /** Importiert ein DeckExport (KI/Datei/Link) als neuen oder in einen bestehenden Kasten. */
  importDeck: (exp: DeckExport, opts?: { intoDeckId?: string; subjectId?: string }) => Promise<Deck>;
  /** Schickt einen Kasten direkt an ausgewählte Freunde (In-App). Gibt die Anzahl der Empfänger zurück. */
  sendDeckToFriends: (deckId: string, recipientIds: string[]) => Promise<number>;
  /** Lädt die von Freunden erhaltenen Kästen (Inbox) neu. */
  loadDeckShares: () => Promise<void>;
  /** Übernimmt einen erhaltenen Kasten als eigene Kopie und entfernt ihn aus der Inbox. */
  acceptDeckShare: (shareId: string) => Promise<Deck | null>;
  /** Verwirft einen erhaltenen Kasten (ohne Import). */
  dismissDeckShare: (shareId: string) => Promise<void>;

  /** Holt alle geteilten Hausaufgaben der Freunde neu aus der Cloud. */
  refreshFriendTasks: () => Promise<void>;
  /** Fügt ein Hausaufgaben-Abo hinzu und holt gleich die Tasks. (Legacy) */
  addHomeworkSubscription: (sub: HomeworkSubscription) => Promise<void>;
  /** Entfernt ein Abo und löscht die gecachten Tasks des Mitschülers. (Legacy) */
  removeHomeworkSubscription: (userId: string) => Promise<void>;
  /** Aktualisiert den Fächerfilter für die Hausaufgaben eines Freundes. */
  setFriendSubjectFilter: (userId: string, subjectFilter: string[] | null) => Promise<void>;

  /** Lädt eigenes Profil + Freunde + Anfragen aus der Cloud. */
  loadFriends: () => Promise<void>;
  /** Sendet eine Freundschaftsanfrage anhand eines Freundecodes. */
  sendFriendRequest: (code: string) => Promise<void>;
  /** Nimmt eine eingehende Anfrage an. */
  acceptFriendRequest: (friendshipId: string) => Promise<void>;
  /** Lehnt eine eingehende ab bzw. zieht eine ausgehende Anfrage zurück. */
  declineFriendRequest: (friendshipId: string) => Promise<void>;
  /** Entfernt eine bestehende Freundschaft. */
  removeFriend: (friendshipId: string, userId: string) => Promise<void>;
  /** Aktualisiert das eigene Profil (Anzeigename / Avatar) im State neu. */
  setMyProfile: (profile: UserProfile) => void;
  /** Aktiviert/deaktiviert friend-basiertes Stundenplan-Teilen. */
  setShareScheduleWithFriends: (on: boolean) => Promise<void>;
  /** Republiziert den eigenen Stundenplan, falls Teilen aktiv ist. */
  republishScheduleIfShared: () => Promise<void>;
  /** Holt den geteilten Stundenplan eines Freundes (oder null). */
  getFriendSchedule: (userId: string) => Promise<SharePayload | null>;
  /** Veröffentlicht eine Aufgabe in shared_tasks (wenn shared=true). */
  publishTask: (task: AppTask) => Promise<void>;
  /** Zieht eine Aufgabe aus shared_tasks zurück. */
  unpublishTask: (taskId: string) => Promise<void>;
  /** Blendet eine oder mehrere Fremdaufgaben dauerhaft aus (abgelehnt, geräteübergreifend gemerkt). */
  dismissFriendTask: (id: string | string[]) => void;
  /** Übernimmt eine Fremdaufgabe als eigene Aufgabe und blendet die geteilte Version aus. */
  acceptFriendTask: (ft: FriendTask) => Promise<void>;
}

// ─── Modul-Singletons für Auth-Listener / Visibility-Listener ─────────────
let authListenerBound = false;
let visibilityListenerBound = false;
let autoSyncRunning = false;
/** Aktiver „wieder online"-Handler, um gemerkte Uploads sofort nachzuholen. */
let onlineHandler: (() => void) | null = null;

/** Liest gespeicherte active-Year-ID. Beim ersten Aufruf wird Default-Jahr erzeugt + alle Daten zugeordnet. */
async function ensureSchoolYears(allYears: SchoolYear[], allSubjects: Subject[], allGrades: Grade[], allTasks: AppTask[], allLessons: Lesson[]): Promise<{ years: SchoolYear[]; activeId: string | null }> {
  let years = [...allYears];
  let active = years.find(y => y.active);

  // Hat der User Daten aber keine Schuljahre? → Default-Jahr erzeugen und alles zuordnen
  const hasContent = allSubjects.length > 0 || allGrades.length > 0 || allTasks.length > 0 || allLessons.length > 0;
  if (years.length === 0 && hasContent) {
    const defaultYear: SchoolYear = {
      id: uid(),
      name: suggestYearName(),
      startDate: suggestYearStart(),
      active: true,
      createdAt: Date.now(),
    };
    await db.schoolYears.add(defaultYear);
    years = [defaultYear];
    active = defaultYear;
  }

  // Hat Years aber keinen aktiven? → erstes aktivieren
  if (years.length > 0 && !active) {
    active = years[0];
    const next = { ...active, active: true };
    await db.schoolYears.put(next);
    years = years.map(y => y.id === next.id ? next : { ...y, active: false });
  }

  // Migration: Alle Subjects/Grades/Tasks/Lessons ohne schoolYearId → aktivem Jahr zuordnen
  if (active) {
    const yid = active.id;
    const orphanSubjects = allSubjects.filter(s => !s.schoolYearId);
    const orphanGrades = allGrades.filter(g => !g.schoolYearId);
    const orphanTasks = allTasks.filter(t => !t.schoolYearId);
    const orphanLessons = allLessons.filter(l => !l.schoolYearId);
    if (orphanSubjects.length || orphanGrades.length || orphanTasks.length || orphanLessons.length) {
      await db.transaction('rw', [db.subjects, db.grades, db.tasks, db.lessons], async () => {
        await Promise.all([
          ...orphanSubjects.map(s => db.subjects.put({ ...s, schoolYearId: yid })),
          ...orphanGrades.map(g => db.grades.put({ ...g, schoolYearId: yid })),
          ...orphanTasks.map(t => db.tasks.put({ ...t, schoolYearId: yid })),
          ...orphanLessons.map(l => db.lessons.put({ ...l, schoolYearId: yid })),
        ]);
      });
      // Update in-memory representation
      orphanSubjects.forEach(s => { s.schoolYearId = yid; });
      orphanGrades.forEach(g => { g.schoolYearId = yid; });
      orphanTasks.forEach(t => { t.schoolYearId = yid; });
      orphanLessons.forEach(l => { l.schoolYearId = yid; });
    }
  }

  return { years, activeId: active?.id ?? null };
}

export const useStore = create<State>((set, get) => ({
  loaded: false,
  settings: null,
  subjects: [],
  grades: [],
  allYearGrades: [],
  tasks: [],
  lessons: [],
  schoolYears: [],
  activeSchoolYearId: null,
  activeTerm: 1,
  authUser: null,
  syncStatus: 'idle',
  lastSyncedAt: null,
  liveSync: 'off',
  focusSessions: [],
  deckFolders: [],
  decks: [],
  cardTopics: [],
  flashcards: [],
  incomingDeckShares: [],
  friendTasks: [],
  friendTasksLoading: false,
  dismissedFriendTaskIds: new Set<string>(),
  myProfile: null,
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  friendsLoading: false,

  async load() {
    const [storedSettings, allSubjects, allGrades, allTasks, allLessons, allYears, allFriendTasks, allFocusSessions, allDeckFolders, allDecks, allCardTopics, allFlashcards] = await Promise.all([
      db.settings.get('app'),
      db.subjects.toArray(),
      db.grades.toArray(),
      db.tasks.toArray(),
      db.lessons.toArray(),
      db.schoolYears.toArray(),
      db.friendTasks.toArray(),
      db.focusSessions.toArray(),
      db.deckFolders.toArray(),
      db.decks.toArray(),
      db.cardTopics.toArray(),
      db.flashcards.toArray(),
    ]);
    const settings = storedSettings ? mergeSettings(storedSettings) : null;
    if (settings) {
      applyTheme(settings.colorTheme, undefined, settings.customHue);
      applyVisualSettings(settings);
    } else {
      applyTheme('indigo');
    }
    bindAutoModeWatcher(() => get().settings);

    // Migration: alte Kategorien ('haupt' | 'neben') auf neue umstellen
    const migratedSubjects: Subject[] = allSubjects.map(s => {
      const cat = normalizeSubjectCategory(s.category);
      if (cat !== s.category) {
        const migrated = { ...s, category: cat };
        db.subjects.put(migrated).catch(() => {});
        return migrated;
      }
      return s;
    });

    // Schuljahre sicherstellen + Migration für orphaned Data
    const { years, activeId } = await ensureSchoolYears(allYears, migratedSubjects, allGrades, allTasks, allLessons);

    // Filter nach aktivem Schuljahr
    const subjFilter = (s: { schoolYearId?: string }) => !activeId || s.schoolYearId === activeId;

    // In der Oberstufe zusätzlich nach aktivem Halbjahr filtern (nur Noten).
    const activeYear = years.find(y => y.id === activeId);
    const activeTerm = activeYear?.oberstufe ? getActiveTerm(activeId) : 1;
    const gradeFilter = (g: Grade) => subjFilter(g) && gradeInActiveTerm(g, activeYear, activeTerm);

    // Karteikarten: Ordner & Kästen nach Jahr filtern, Themen & Karten über Kasten-Zugehörigkeit.
    const yearFolders = allDeckFolders.filter(subjFilter).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const yearDecks = allDecks.filter(subjFilter).sort(compareDecks);
    const deckIds = new Set(yearDecks.map(d => d.id));

    set({
      loaded: true,
      settings,
      activeSchoolYearId: activeId,
      activeTerm,
      schoolYears: years.sort((a, b) => b.startDate - a.startDate),
      subjects: migratedSubjects.filter(subjFilter).sort(compareSubjects),
      grades: allGrades.filter(gradeFilter),
      allYearGrades: allGrades.filter(subjFilter),
      tasks: allTasks.filter(subjFilter).sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)),
      lessons: allLessons.filter(subjFilter),
      focusSessions: allFocusSessions.filter(subjFilter).sort((a, b) => b.startedAt - a.startedAt),
      deckFolders: yearFolders,
      decks: yearDecks,
      cardTopics: allCardTopics.filter(t => deckIds.has(t.deckId)),
      flashcards: allFlashcards.filter(c => deckIds.has(c.deckId)),
      friendTasks: allFriendTasks,
      dismissedFriendTaskIds: new Set(settings?.dismissedFriendTaskIds ?? []),
    });

    // ─── Auth-Init nur einmal ────────────────────────────────────────────
    if (supabase && !authListenerBound) {
      authListenerBound = true;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        set({ authUser: { id: session.user.id, email: session.user.email } });
        // Bestehende Session → direkt Auto-Sync starten
        void get().startAutoSync();
      }
      supabase.auth.onAuthStateChange((event, session) => {
        const user = session?.user ?? null;
        if (event === 'SIGNED_IN' && user) {
          set({ authUser: { id: user.id, email: user.email } });
          void get().startAutoSync();
        } else if (event === 'SIGNED_OUT') {
          get().stopAutoSync();
          set({ authUser: null, lastSyncedAt: null });
        } else if (event === 'TOKEN_REFRESHED' && user) {
          set({ authUser: { id: user.id, email: user.email } });
        }
      });
    }

    // ─── Visibility-Listener nur einmal: holt Updates nach Schlaf nach ───
    if (!visibilityListenerBound && typeof document !== 'undefined') {
      visibilityListenerBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        const { authUser, liveSync } = get();
        if (!authUser) return;
        // Realtime kann nach längerer Sleep-Phase getrennt sein → sicherheitshalber neu pullen
        if (liveSync !== 'live') {
          void get().pullFromCloud();
        }
      });
    }
  },

  async setSettings(patch) {
    const current = get().settings ?? mergeSettings(undefined);
    const next: AppSettings = mergeSettings({ ...current, ...patch });
    await db.settings.put(next);
    applyTheme(next.colorTheme, undefined, next.customHue);
    applyVisualSettings(next);
    set({ settings: next });
    const { authUser } = get();
    if (authUser) syncSettings(next, authUser.id);
  },

  async setGradingConfig(patch) {
    const current = get().settings ?? mergeSettings(undefined);
    const merged: GradingSystemConfig = mergeGradingConfig({ ...current.gradingConfig, ...patch });
    const next: AppSettings = { ...current, gradingConfig: merged };
    await db.settings.put(next);
    set({ settings: next });
    const { authUser } = get();
    if (authUser) syncSettings(next, authUser.id);
  },

  async signIn(email, password) {
    if (!supabase) return 'Supabase nicht konfiguriert.';
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return error.message;
    if (data.user) {
      // authUser + Auto-Sync starten via onAuthStateChange-Listener
      set({ authUser: { id: data.user.id, email: data.user.email } });
    }
    return null;
  },

  async signUp(email, password) {
    if (!supabase) return 'Supabase nicht konfiguriert.';
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return error.message;
    if (data.user) {
      set({ authUser: { id: data.user.id, email: data.user.email } });
      // Wenn Email-Bestätigung aus ist, fängt onAuthStateChange den SIGNED_IN auf.
      // Falls nicht: zur Sicherheit hier schon einen ersten Upload anschieben.
      await uploadAll(data.user.id);
      set({ lastSyncedAt: Date.now() });
    }
    return null;
  },

  async signInWithGoogle() {
    if (!supabase) return;
    // WICHTIG: Trailing slash, sonst landet der OAuth-Redirect auf
    //   https://schulplaner.conor.at#access_token=…
    // (ohne `/`) und einzelne Browser/PWAs interpretieren das nicht sauber.
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/' },
    });
  },

  async signOut() {
    if (!supabase) return;
    get().stopAutoSync();
    await supabase.auth.signOut();
    set({
      authUser: null, lastSyncedAt: null,
      myProfile: null, friends: [], incomingRequests: [], outgoingRequests: [],
      incomingDeckShares: [],
    });
  },

  async startAutoSync() {
    const { authUser } = get();
    if (!authUser || !supabase) return;
    if (autoSyncRunning) return;
    autoSyncRunning = true;

    set({ syncStatus: 'syncing', liveSync: 'connecting' });
    try {
      // Existierende Task-IDs vor dem Sync merken (für Auto-Publish via Shortcut)
      const existingTaskIds = new Set(get().tasks.map(t => t.id));

      // Zuerst evtl. früher fehlgeschlagene Uploads nachholen, dann lokalen und
      // Cloud-Stand pro Eintrag nach Zeitstempel zusammenführen („neuester gewinnt").
      // Kein blindes Überschreiben mehr → veraltete Geräte können keine neueren
      // Daten (z. B. Lernchecklisten) mehr löschen.
      await flushSyncQueue(authUser.id);
      await syncMergeAll(authUser.id);
      await get().load(); // State frisch aus Dexie ziehen
      set({ syncStatus: 'idle', lastSyncedAt: Date.now() });

      // Via-Shortcut erstellte Hausaufgaben automatisch teilen, wenn Toggle aktiv
      if (get().settings?.homeworkShareViaShortcut) {
        const newHA = get().tasks.filter(
          t => !existingTaskIds.has(t.id) && t.kind === 'hausaufgabe' && !t.shared,
        );
        for (const t of newHA) {
          await get().updateTask(t.id, { shared: true });
        }
      }

      // Freunde + Anfragen laden (lädt anschließend die geteilten Hausaufgaben nach)
      void get().loadFriends();
      // Eigenen Stundenplan (re-)publizieren, falls Teilen aktiv
      void get().republishScheduleIfShared();
    } catch (e) {
      console.warn('Auto-Sync Initial-Push/Pull fehlgeschlagen:', e);
      set({ syncStatus: 'error' });
    }

    // Realtime-Subscription für alle Tabellen
    startRealtimeHandlers(authUser.id, set, get);

    // Sobald das Gerät wieder online ist, gemerkte Uploads sofort nachholen.
    if (!onlineHandler) {
      const uid = authUser.id;
      onlineHandler = () => { void flushSyncQueue(uid); };
      window.addEventListener('online', onlineHandler);
    }
  },

  stopAutoSync() {
    stopRealtime();
    autoSyncRunning = false;
    if (onlineHandler) {
      window.removeEventListener('online', onlineHandler);
      onlineHandler = null;
    }
    set({ liveSync: 'off' });
  },

  async syncNow() {
    const { authUser } = get();
    if (!authUser) return;
    set({ syncStatus: 'syncing' });
    try {
      await flushSyncQueue(authUser.id);
      await syncMergeAll(authUser.id);
      await get().load();
      set({ syncStatus: 'idle', lastSyncedAt: Date.now() });
    } catch {
      set({ syncStatus: 'error' });
    }
  },

  async pullFromCloud() {
    const { authUser } = get();
    if (!authUser) return false;
    set({ syncStatus: 'syncing' });
    try {
      await flushSyncQueue(authUser.id);
      const hadCloudData = await syncMergeAll(authUser.id);
      await get().load();
      set({ syncStatus: 'idle', lastSyncedAt: Date.now() });
      return hadCloudData;
    } catch {
      set({ syncStatus: 'error' });
      return false;
    }
  },

  async replaceCloud() {
    const { authUser } = get();
    if (!authUser || !supabase) return;

    // Realtime stoppen, damit unsere DELETE/UPSERT-Events nicht selbst zurückkommen.
    stopRealtime();
    autoSyncRunning = false;
    set({ syncStatus: 'syncing', liveSync: 'connecting' });
    try {
      // 1) Alles in der Cloud weg, damit „Geister-Zeilen" aus der vorherigen
      //    Datei nicht hängenbleiben.
      await deleteAllCloudData(authUser.id);
      // 2) Aktuellen lokalen Stand hochladen.
      await uploadAll(authUser.id);
      set({ syncStatus: 'idle', lastSyncedAt: Date.now() });
    } catch (e) {
      console.warn('replaceCloud fehlgeschlagen:', e);
      set({ syncStatus: 'error' });
    }
    // 3) Realtime neu aufsetzen, damit Live-Sync weiterläuft.
    autoSyncRunning = true;
    startRealtimeHandlers(authUser.id, set, get);
  },

  async wipeCloud() {
    const { authUser } = get();
    if (!authUser || !supabase) return null;

    // Realtime stoppen, damit DELETE-Events nicht in den Live-Handlern
    // lokal kaskadieren (lokale Daten sollen bleiben).
    get().stopAutoSync();
    set({ syncStatus: 'syncing' });
    try {
      const result = await deleteAllCloudData(authUser.id);
      set({ syncStatus: 'idle', lastSyncedAt: null });
      // Sicherheit: ausloggen, damit nicht sofort wieder hochgeladen wird.
      await supabase.auth.signOut();
      set({ authUser: null });
      return result;
    } catch (e) {
      console.warn('wipeCloud fehlgeschlagen:', e);
      set({ syncStatus: 'error' });
      return null;
    }
  },

  async addSubject(s) {
    const yid = get().activeSchoolYearId ?? undefined;
    const subj: Subject = { ...s, id: uid(), createdAt: Date.now(), schoolYearId: s.schoolYearId ?? yid };
    await db.subjects.add(subj);
    if (!yid || subj.schoolYearId === yid) {
      set(state => ({ subjects: [...state.subjects, subj].sort(compareSubjects) }));
    }
    const { authUser } = get();
    if (authUser) syncRow('subjects', subj.id, subj, authUser.id);
    return subj;
  },
  async updateSubject(id, patch) {
    await db.subjects.update(id, patch);
    set(state => ({
      subjects: state.subjects.map(s => s.id === id ? { ...s, ...patch } : s).sort(compareSubjects),
    }));
    const updated = await db.subjects.get(id);
    const { authUser } = get();
    if (authUser && updated) syncRow('subjects', id, updated, authUser.id);
  },
  async deleteSubject(id) {
    // IDs der zu kaskadierenden Kinder VOR dem Delete einsammeln,
    // damit wir sie auch in der Cloud löschen können.
    const [gradeRows, taskRows, lessonRows] = await Promise.all([
      db.grades.where('subjectId').equals(id).toArray(),
      db.tasks.where('subjectId').equals(id).toArray(),
      db.lessons.where('subjectId').equals(id).toArray(),
    ]);
    const gradeIds = gradeRows.map(g => g.id);
    const taskIds = taskRows.map(t => t.id);
    const lessonIds = lessonRows.map(l => l.id);

    await db.transaction('rw', [db.subjects, db.grades, db.tasks, db.lessons], async () => {
      await db.subjects.delete(id);
      await db.grades.where('subjectId').equals(id).delete();
      await db.tasks.where('subjectId').equals(id).delete();
      await db.lessons.where('subjectId').equals(id).delete();
    });
    set(state => ({
      subjects: state.subjects.filter(s => s.id !== id),
      grades: state.grades.filter(g => g.subjectId !== id),
      allYearGrades: state.allYearGrades.filter(g => g.subjectId !== id),
      tasks: state.tasks.filter(t => t.subjectId !== id),
      lessons: state.lessons.filter(l => l.subjectId !== id),
    }));
    const { authUser } = get();
    if (authUser) {
      deleteRow('subjects', id);
      gradeIds.forEach(gid => deleteRow('grades', gid));
      taskIds.forEach(tid => deleteRow('tasks', tid));
      lessonIds.forEach(lid => deleteRow('lessons', lid));
    }
  },

  async moveSubject(id, delta) {
    // Innerhalb der gleichen Gruppe um delta Plätze verschieben (Up/Down).
    // Wir normalisieren alle Positionen der Peer-Gruppe neu (0..n-1),
    // damit das Sortier-Schema sauber bleibt.
    const { subjects: stateSubjects, authUser } = get();
    const target = stateSubjects.find(s => s.id === id);
    if (!target) return;

    const peers = stateSubjects
      .filter(s => (s.groupId ?? null) === (target.groupId ?? null))
      .sort(compareSubjects);
    const idx = peers.findIndex(s => s.id === id);
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= peers.length) return;

    const reordered = peers.slice();
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, moved);

    const updates: Subject[] = [];
    reordered.forEach((s, i) => {
      if (s.position !== i) updates.push({ ...s, position: i });
    });
    if (updates.length === 0) return;

    await db.transaction('rw', db.subjects, async () => {
      for (const u of updates) await db.subjects.put(u);
    });
    set(state => ({
      subjects: state.subjects.map(s => updates.find(x => x.id === s.id) ?? s).sort(compareSubjects),
    }));
    if (authUser) updates.forEach(u => syncRow('subjects', u.id, u, authUser.id));
  },

  async addGrade(g) {
    const subj = get().subjects.find(s => s.id === g.subjectId);
    const yid = subj?.schoolYearId ?? get().activeSchoolYearId ?? undefined;
    const year = get().schoolYears.find(y => y.id === yid);
    // In der Oberstufe ohne explizites Halbjahr → aktives Halbjahr übernehmen.
    const term = year?.oberstufe ? (g.term ?? get().activeTerm) : g.term;
    const grade: Grade = { ...g, id: g.id ?? uid(), schoolYearId: g.schoolYearId ?? yid, term } as Grade;
    await db.grades.add(grade);
    const matchesYear = !get().activeSchoolYearId || grade.schoolYearId === get().activeSchoolYearId;
    set(state => ({
      // Voll-Jahres-Liste: alle Halbjahre des aktiven Jahres.
      allYearGrades: matchesYear ? [...state.allYearGrades, grade] : state.allYearGrades,
      // Gefilterte View: nur wenn passendes Halbjahr.
      grades: gradeInActiveTerm(grade, year, get().activeTerm) ? [...state.grades, grade] : state.grades,
    }));
    const { authUser } = get();
    if (authUser) syncRow('grades', grade.id, grade, authUser.id);
    return grade;
  },
  async updateGrade(id, patch) {
    await db.grades.update(id, patch);
    const updated = await db.grades.get(id);
    const { activeSchoolYearId, activeTerm, schoolYears } = get();
    const year = schoolYears.find(y => y.id === activeSchoolYearId);
    const matchesYear = updated ? (!activeSchoolYearId || updated.schoolYearId === activeSchoolYearId) : false;
    set(state => {
      // Voll-Jahres-Liste pflegen (year-match, halbjahr-unabhängig).
      const allYearGrades = updated && matchesYear
        ? (state.allYearGrades.some(g => g.id === id)
            ? state.allYearGrades.map(g => g.id === id ? updated : g)
            : [...state.allYearGrades, updated])
        : state.allYearGrades.filter(g => g.id !== id);
      // Gefilterte View (halbjahr-bewusst).
      const exists = state.grades.some(g => g.id === id);
      const grades = updated && gradeInActiveTerm(updated, year, activeTerm)
        ? (exists ? state.grades.map(g => g.id === id ? { ...g, ...patch } : g) : [...state.grades, updated])
        : state.grades.filter(g => g.id !== id);
      return { grades, allYearGrades };
    });
    const { authUser } = get();
    if (authUser && updated) syncRow('grades', id, updated, authUser.id);
  },
  async deleteGrade(id) {
    await db.grades.delete(id);
    set(state => ({
      grades: state.grades.filter(g => g.id !== id),
      allYearGrades: state.allYearGrades.filter(g => g.id !== id),
    }));
    const { authUser } = get();
    if (authUser) deleteRow('grades', id);
  },

  async addTask(t) {
    const subj = t.subjectId ? get().subjects.find(s => s.id === t.subjectId) : undefined;
    const yid = subj?.schoolYearId ?? get().activeSchoolYearId ?? undefined;
    const task: AppTask = { ...t, id: t.id ?? uid(), createdAt: Date.now(), schoolYearId: t.schoolYearId ?? yid } as AppTask;
    await db.tasks.add(task);
    set(state => ({ tasks: [...state.tasks, task].sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)) }));
    const { authUser } = get();
    if (authUser) syncRow('tasks', task.id, task, authUser.id);
    // Shared-Task veröffentlichen
    if (task.shared) void get().publishTask(task);
    return task;
  },
  async updateTask(id, patch) {
    await db.tasks.update(id, patch);
    set(state => ({ tasks: state.tasks.map(t => t.id === id ? { ...t, ...patch } : t).sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)) }));
    const updated = await db.tasks.get(id);
    const { authUser } = get();
    if (authUser && updated) syncRow('tasks', id, updated, authUser.id);
    // Sharing-Status synchronisieren
    if (updated) {
      if (updated.shared) void get().publishTask(updated);
      else if (patch.shared === false) void get().unpublishTask(id);
    }
  },
  async toggleTask(id) {
    const t = get().tasks.find(x => x.id === id);
    if (!t) return;
    const next = !t.done;
    await get().updateTask(id, { done: next, doneAt: next ? Date.now() : undefined });
  },
  async deleteTask(id) {
    const t = get().tasks.find(x => x.id === id);
    await db.tasks.delete(id);
    set(state => ({ tasks: state.tasks.filter(t => t.id !== id) }));
    const { authUser } = get();
    if (authUser) deleteRow('tasks', id);
    // Geteilte Task zurückziehen
    if (t?.shared) void get().unpublishTask(id);
  },

  async addLesson(l) {
    const subj = get().subjects.find(s => s.id === l.subjectId);
    const yid = subj?.schoolYearId ?? get().activeSchoolYearId ?? undefined;
    const lesson: Lesson = { ...l, id: uid(), schoolYearId: l.schoolYearId ?? yid };
    await db.lessons.add(lesson);
    set(state => ({ lessons: [...state.lessons, lesson] }));
    const { authUser } = get();
    if (authUser) syncRow('lessons', lesson.id, lesson, authUser.id);
    void get().republishScheduleIfShared();
    return lesson;
  },
  async updateLesson(id, patch) {
    await db.lessons.update(id, patch);
    set(state => ({ lessons: state.lessons.map(l => l.id === id ? { ...l, ...patch } : l) }));
    const updated = await db.lessons.get(id);
    const { authUser } = get();
    if (authUser && updated) syncRow('lessons', id, updated, authUser.id);
    void get().republishScheduleIfShared();
  },
  async deleteLesson(id) {
    await db.lessons.delete(id);
    set(state => ({ lessons: state.lessons.filter(l => l.id !== id) }));
    const { authUser } = get();
    if (authUser) deleteRow('lessons', id);
    void get().republishScheduleIfShared();
  },

  async importSharedSchedule(payload, mode) {
    const { activeSchoolYearId, authUser } = get();
    if (!activeSchoolYearId) {
      throw new Error('Kein aktives Schuljahr – leg erst eines an.');
    }

    // 1) Vorhandene Subjects im aktiven Jahr laden, Name → ID-Map bauen.
    const existingSubjects = await db.subjects.where('schoolYearId').equals(activeSchoolYearId).toArray();
    const byName = new Map<string, Subject>();
    for (const s of existingSubjects) {
      byName.set(s.name.toLowerCase().trim(), s);
    }

    // 2) Geteilte Subjects mergen: Treffer → bestehende ID nutzen, sonst neu anlegen.
    const subjMapping = new Map<string, string>(); // sharedSubject.id -> local subject.id
    const newSubjects: Subject[] = [];
    let subjectsMatched = 0;
    for (const sharedSubj of payload.subjects) {
      const key = sharedSubj.name.toLowerCase().trim();
      const match = byName.get(key);
      if (match) {
        subjMapping.set(sharedSubj.id, match.id);
        subjectsMatched++;
      } else {
        const newId = uid();
        const newSubj: Subject = {
          id: newId,
          name: sharedSubj.name,
          short: sharedSubj.short,
          color: sharedSubj.color,
          category: sharedSubj.category,
          system: sharedSubj.system,
          teacher: sharedSubj.teacher,
          room: sharedSubj.room,
          createdAt: Date.now(),
          schoolYearId: activeSchoolYearId,
        };
        newSubjects.push(newSubj);
        subjMapping.set(sharedSubj.id, newId);
      }
    }

    // 3) Lessons im aktiven Jahr ersetzen (falls Replace-Modus).
    let lessonsReplaced = 0;
    if (mode === 'replace') {
      const oldLessons = await db.lessons.where('schoolYearId').equals(activeSchoolYearId).toArray();
      lessonsReplaced = oldLessons.length;
      if (oldLessons.length) {
        await db.lessons.bulkDelete(oldLessons.map(l => l.id));
        if (authUser) oldLessons.forEach(l => deleteRow('lessons', l.id));
      }
    }

    // 4) Neue Subjects schreiben.
    if (newSubjects.length) {
      await db.subjects.bulkAdd(newSubjects);
      if (authUser) newSubjects.forEach(s => syncRow('subjects', s.id, s, authUser.id));
    }

    // 5) Geteilte Lessons mit gemappten Subject-IDs + neuen Lesson-IDs schreiben.
    const newLessons: Lesson[] = payload.lessons.map(l => ({
      id: uid(),
      subjectId: subjMapping.get(l.subjectId) ?? l.subjectId,
      weekday: l.weekday,
      start: l.start,
      end: l.end,
      room: l.room,
      weekParity: l.weekParity,
      schoolYearId: activeSchoolYearId,
    }));
    if (newLessons.length) {
      await db.lessons.bulkAdd(newLessons);
      if (authUser) newLessons.forEach(l => syncRow('lessons', l.id, l, authUser.id));
    }

    // 6) State neu aus Dexie ziehen.
    await get().load();

    return {
      subjectsAdded: newSubjects.length,
      subjectsMatched,
      lessonsAdded: newLessons.length,
      lessonsReplaced,
    };
  },

  async addSchoolYear(opts) {
    const year: SchoolYear = {
      id: uid(),
      name: opts.name.trim() || suggestYearName(),
      startDate: opts.startDate,
      endDate: opts.endDate,
      active: true, // neues Jahr direkt aktiv
      createdAt: Date.now(),
      oberstufe: opts.oberstufe || undefined,
      oberstufeJahrgaenge: opts.oberstufe ? (opts.oberstufeJahrgaenge ?? [12, 13]) : undefined,
    };
    // Alle anderen Jahre deaktivieren
    const existing = await db.schoolYears.toArray();
    const deactivated = existing.map(y => ({ ...y, active: false }));
    await db.transaction('rw', db.schoolYears, async () => {
      await db.schoolYears.bulkPut(deactivated);
      await db.schoolYears.add(year);
    });

    // Optional: Fächer (und damit Stundenplan) aus anderem Jahr kopieren
    let copiedSubjects: Subject[] = [];
    let copiedLessons: Lesson[] = [];
    if (opts.copySubjectsFromYearId) {
      const sourceYearId = opts.copySubjectsFromYearId;
      const sourceSubjects = await db.subjects.where('schoolYearId').equals(sourceYearId).toArray();
      const idMap = new Map<string, string>();
      copiedSubjects = sourceSubjects.map(s => {
        const newId = uid();
        idMap.set(s.id, newId);
        return { ...s, id: newId, schoolYearId: year.id, createdAt: Date.now() };
      });
      if (copiedSubjects.length) await db.subjects.bulkAdd(copiedSubjects);

      if (opts.copyLessonsFromYearId) {
        const sourceLessons = await db.lessons.where('schoolYearId').equals(sourceYearId).toArray();
        for (const l of sourceLessons) {
          const newSubjId = idMap.get(l.subjectId);
          if (!newSubjId) continue;
          copiedLessons.push({ ...l, id: uid(), subjectId: newSubjId, schoolYearId: year.id });
        }
        if (copiedLessons.length) await db.lessons.bulkAdd(copiedLessons);
      }
    }

    // Reload um neuen Filter-State herzustellen
    await get().load();

    // Cloud-Sync: alle deaktivierten Jahre, das neue Jahr, sowie alle kopierten Subjects/Lessons
    const { authUser } = get();
    if (authUser) {
      deactivated.forEach(y => syncRow('school_years', y.id, y, authUser.id));
      syncRow('school_years', year.id, year, authUser.id);
      copiedSubjects.forEach(s => syncRow('subjects', s.id, s, authUser.id));
      copiedLessons.forEach(l => syncRow('lessons', l.id, l, authUser.id));
    }

    return year;
  },
  async updateSchoolYear(id, patch) {
    await db.schoolYears.update(id, patch);
    set(state => ({ schoolYears: state.schoolYears.map(y => y.id === id ? { ...y, ...patch } : y) }));
    const updated = await db.schoolYears.get(id);
    const { authUser } = get();
    if (authUser && updated) syncRow('school_years', id, updated, authUser.id);
  },
  async deleteSchoolYear(id, mode = 'wipe') {
    const wasActive = get().activeSchoolYearId === id;

    // IDs der Kinder sammeln, falls wir wipen
    let childIds: { subjects: string[]; grades: string[]; tasks: string[]; lessons: string[] } | null = null;
    if (mode === 'wipe') {
      const [subj, gr, tk, le] = await Promise.all([
        db.subjects.where('schoolYearId').equals(id).toArray(),
        db.grades.where('schoolYearId').equals(id).toArray(),
        db.tasks.where('schoolYearId').equals(id).toArray(),
        db.lessons.where('schoolYearId').equals(id).toArray(),
      ]);
      childIds = {
        subjects: subj.map(s => s.id),
        grades: gr.map(g => g.id),
        tasks: tk.map(t => t.id),
        lessons: le.map(l => l.id),
      };
    }

    if (mode === 'wipe') {
      await db.transaction('rw', [db.subjects, db.grades, db.tasks, db.lessons, db.schoolYears], async () => {
        await db.subjects.where('schoolYearId').equals(id).delete();
        await db.grades.where('schoolYearId').equals(id).delete();
        await db.tasks.where('schoolYearId').equals(id).delete();
        await db.lessons.where('schoolYearId').equals(id).delete();
        await db.schoolYears.delete(id);
      });
    } else {
      await db.schoolYears.delete(id);
    }
    if (wasActive) {
      const remaining = await db.schoolYears.toArray();
      if (remaining.length > 0) {
        await get().setActiveSchoolYear(remaining[0].id);
      } else {
        set({ schoolYears: [], activeSchoolYearId: null, subjects: [], grades: [], tasks: [], lessons: [] });
      }
    } else {
      set(state => ({ schoolYears: state.schoolYears.filter(y => y.id !== id) }));
    }
    const { authUser } = get();
    if (authUser) {
      deleteRow('school_years', id);
      if (childIds) {
        childIds.subjects.forEach(sid => deleteRow('subjects', sid));
        childIds.grades.forEach(gid => deleteRow('grades', gid));
        childIds.tasks.forEach(tid => deleteRow('tasks', tid));
        childIds.lessons.forEach(lid => deleteRow('lessons', lid));
      }
    }
  },
  async setActiveSchoolYear(id) {
    const years = get().schoolYears;
    const updated = years.map(y => ({ ...y, active: y.id === id }));
    await db.schoolYears.bulkPut(updated);
    set({ activeSchoolYearId: id, schoolYears: updated });
    // Re-load all data filtered by new active year
    await get().load();

    // Geänderte active-Flags in die Cloud spiegeln, damit andere Geräte mitschalten.
    const { authUser } = get();
    if (authUser) {
      updated.forEach(y => syncRow('school_years', y.id, y, authUser.id));
    }
  },
  async setActiveTerm(term) {
    const { activeSchoolYearId, activeTerm } = get();
    if (!activeSchoolYearId || term === activeTerm) return;
    writeActiveTerm(activeSchoolYearId, term);
    set({ activeTerm: term });
    // Noten-View neu aus Dexie filtern (load liest das gemerkte Halbjahr).
    await get().load();
  },

  // ─── Fokus / Lern-Sessions ───────────────────────────────────────────────

  async addFocusSession(s) {
    const subj = s.subjectId ? get().subjects.find(x => x.id === s.subjectId) : undefined;
    const yid = s.schoolYearId ?? subj?.schoolYearId ?? get().activeSchoolYearId ?? undefined;
    const session: FocusSession = { ...s, id: s.id ?? uid(), schoolYearId: yid } as FocusSession;
    await db.focusSessions.add(session);
    if (!yid || session.schoolYearId === yid) {
      set(state => ({ focusSessions: [session, ...state.focusSessions].sort((a, b) => b.startedAt - a.startedAt) }));
    }
    const { authUser } = get();
    if (authUser) syncRow('focus_sessions', session.id, session, authUser.id);
    return session;
  },
  async updateFocusSession(id, patch) {
    await db.focusSessions.update(id, patch);
    const updated = await db.focusSessions.get(id);
    set(state => ({
      focusSessions: state.focusSessions
        .map(f => (f.id === id ? { ...f, ...patch } : f))
        .sort((a, b) => b.startedAt - a.startedAt),
    }));
    const { authUser } = get();
    if (authUser && updated) syncRow('focus_sessions', id, updated, authUser.id);
  },
  async deleteFocusSession(id) {
    await db.focusSessions.delete(id);
    set(state => ({ focusSessions: state.focusSessions.filter(f => f.id !== id) }));
    const { authUser } = get();
    if (authUser) deleteRow('focus_sessions', id);
  },

  // ─── Karteikarten ──────────────────────────────────────────────────────────

  async addDeckFolder(f) {
    const yid = f.schoolYearId ?? get().activeSchoolYearId ?? undefined;
    const maxPos = get().deckFolders.reduce((m, x) => Math.max(m, x.position ?? 0), -1);
    const folder: DeckFolder = { ...f, id: f.id ?? uid(), createdAt: Date.now(), schoolYearId: yid, position: f.position ?? maxPos + 1 };
    await db.deckFolders.add(folder);
    if (!get().activeSchoolYearId || folder.schoolYearId === get().activeSchoolYearId) {
      set(state => ({ deckFolders: [...state.deckFolders, folder].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) }));
    }
    const { authUser } = get();
    if (authUser) syncRow('deck_folders', folder.id, folder, authUser.id);
    return folder;
  },
  async updateDeckFolder(id, patch) {
    await db.deckFolders.update(id, patch);
    set(state => ({ deckFolders: state.deckFolders.map(f => f.id === id ? { ...f, ...patch } : f).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) }));
    const updated = await db.deckFolders.get(id);
    const { authUser } = get();
    if (authUser && updated) syncRow('deck_folders', id, updated, authUser.id);
  },
  async deleteDeckFolder(id) {
    // Enthaltene Kästen behalten – nur die Ordner-Zuordnung lösen.
    const deckRows = await db.decks.where('folderId').equals(id).toArray();
    await db.transaction('rw', [db.deckFolders, db.decks], async () => {
      await db.deckFolders.delete(id);
      for (const d of deckRows) await db.decks.update(d.id, { folderId: undefined });
    });
    set(state => ({
      deckFolders: state.deckFolders.filter(f => f.id !== id),
      decks: state.decks.map(d => d.folderId === id ? { ...d, folderId: undefined } : d),
    }));
    const { authUser } = get();
    if (authUser) {
      deleteRow('deck_folders', id);
      for (const d of deckRows) syncRow('decks', d.id, { ...d, folderId: undefined }, authUser.id);
    }
  },

  async addDeck(d) {
    const yid = d.schoolYearId ?? get().activeSchoolYearId ?? undefined;
    const maxPos = get().decks.reduce((m, x) => Math.max(m, x.position ?? 0), -1);
    const deck: Deck = { ...d, id: d.id ?? uid(), createdAt: Date.now(), schoolYearId: yid, position: d.position ?? maxPos + 1 };
    await db.decks.add(deck);
    if (!get().activeSchoolYearId || deck.schoolYearId === get().activeSchoolYearId) {
      set(state => ({ decks: [...state.decks, deck].sort(compareDecks) }));
    }
    const { authUser } = get();
    if (authUser) syncRow('decks', deck.id, deck, authUser.id);
    return deck;
  },
  async updateDeck(id, patch) {
    await db.decks.update(id, patch);
    set(state => ({ decks: state.decks.map(d => d.id === id ? { ...d, ...patch } : d).sort(compareDecks) }));
    const updated = await db.decks.get(id);
    const { authUser } = get();
    if (authUser && updated) syncRow('decks', id, updated, authUser.id);
  },
  async deleteDeck(id) {
    const [topicRows, cardRows] = await Promise.all([
      db.cardTopics.where('deckId').equals(id).toArray(),
      db.flashcards.where('deckId').equals(id).toArray(),
    ]);
    const topicIds = topicRows.map(t => t.id);
    const cardIds = cardRows.map(c => c.id);
    await db.transaction('rw', [db.decks, db.cardTopics, db.flashcards], async () => {
      await db.decks.delete(id);
      await db.cardTopics.where('deckId').equals(id).delete();
      await db.flashcards.where('deckId').equals(id).delete();
    });
    set(state => ({
      decks: state.decks.filter(d => d.id !== id),
      cardTopics: state.cardTopics.filter(t => t.deckId !== id),
      flashcards: state.flashcards.filter(c => c.deckId !== id),
    }));
    const { authUser } = get();
    if (authUser) {
      deleteRow('decks', id);
      topicIds.forEach(tid => deleteRow('card_topics', tid));
      cardIds.forEach(cid => deleteRow('flashcards', cid));
    }
  },

  async addTopic(t) {
    const maxPos = get().cardTopics.filter(x => x.deckId === t.deckId).reduce((m, x) => Math.max(m, x.position ?? 0), -1);
    const topic: CardTopic = { ...t, id: t.id ?? uid(), createdAt: Date.now(), position: t.position ?? maxPos + 1 };
    await db.cardTopics.add(topic);
    set(state => ({ cardTopics: [...state.cardTopics, topic] }));
    const { authUser } = get();
    if (authUser) syncRow('card_topics', topic.id, topic, authUser.id);
    return topic;
  },
  async updateTopic(id, patch) {
    await db.cardTopics.update(id, patch);
    set(state => ({ cardTopics: state.cardTopics.map(t => t.id === id ? { ...t, ...patch } : t) }));
    const updated = await db.cardTopics.get(id);
    const { authUser } = get();
    if (authUser && updated) syncRow('card_topics', id, updated, authUser.id);
  },
  async deleteTopic(id, mode = 'orphan') {
    const { authUser } = get();
    if (mode === 'wipe') {
      const cardRows = await db.flashcards.where('topicId').equals(id).toArray();
      const cardIds = cardRows.map(c => c.id);
      await db.transaction('rw', [db.cardTopics, db.flashcards], async () => {
        await db.cardTopics.delete(id);
        await db.flashcards.where('topicId').equals(id).delete();
      });
      set(state => ({
        cardTopics: state.cardTopics.filter(t => t.id !== id),
        flashcards: state.flashcards.filter(c => c.topicId !== id),
      }));
      if (authUser) {
        deleteRow('card_topics', id);
        cardIds.forEach(cid => deleteRow('flashcards', cid));
      }
    } else {
      // Karten behalten, nur Thema-Zuordnung entfernen.
      const cardRows = await db.flashcards.where('topicId').equals(id).toArray();
      await db.transaction('rw', [db.cardTopics, db.flashcards], async () => {
        await db.cardTopics.delete(id);
        for (const c of cardRows) await db.flashcards.update(c.id, { topicId: undefined });
      });
      set(state => ({
        cardTopics: state.cardTopics.filter(t => t.id !== id),
        flashcards: state.flashcards.map(c => c.topicId === id ? { ...c, topicId: undefined } : c),
      }));
      if (authUser) {
        deleteRow('card_topics', id);
        for (const c of cardRows) {
          const updated = { ...c, topicId: undefined };
          syncRow('flashcards', c.id, updated, authUser.id);
        }
      }
    }
  },

  async addCard(c) {
    const deck = get().decks.find(d => d.id === c.deckId);
    const yid = c.schoolYearId ?? deck?.schoolYearId ?? get().activeSchoolYearId ?? undefined;
    const card: Flashcard = {
      ...c,
      id: c.id ?? uid(),
      box: c.box ?? 1,
      correctCount: c.correctCount ?? 0,
      wrongCount: c.wrongCount ?? 0,
      createdAt: Date.now(),
      schoolYearId: yid,
    };
    await db.flashcards.add(card);
    set(state => ({ flashcards: [...state.flashcards, card] }));
    const { authUser } = get();
    if (authUser) syncRow('flashcards', card.id, card, authUser.id);
    return card;
  },
  async updateCard(id, patch) {
    await db.flashcards.update(id, patch);
    set(state => ({ flashcards: state.flashcards.map(c => c.id === id ? { ...c, ...patch } : c) }));
    const updated = await db.flashcards.get(id);
    const { authUser } = get();
    if (authUser && updated) syncRow('flashcards', id, updated, authUser.id);
  },
  async deleteCard(id) {
    await db.flashcards.delete(id);
    set(state => ({ flashcards: state.flashcards.filter(c => c.id !== id) }));
    const { authUser } = get();
    if (authUser) deleteRow('flashcards', id);
  },
  async moveCard(id, topicId) {
    await get().updateCard(id, { topicId });
  },
  async reviewCard(id, outcome) {
    const card = get().flashcards.find(c => c.id === id);
    if (!card) return;
    await get().updateCard(id, reviewPatch(card, outcome));
  },
  async resetDeckProgress(deckId) {
    const cards = get().flashcards.filter(c => c.deckId === deckId);
    if (cards.length === 0) return;
    const patch = { box: 1, reviewedAt: undefined, correctCount: 0, wrongCount: 0 };
    await db.transaction('rw', db.flashcards, async () => {
      for (const c of cards) await db.flashcards.update(c.id, patch);
    });
    set(state => ({
      flashcards: state.flashcards.map(c => c.deckId === deckId ? { ...c, ...patch } : c),
    }));
    const { authUser } = get();
    if (authUser) {
      for (const c of cards) syncRow('flashcards', c.id, { ...c, ...patch }, authUser.id);
    }
  },
  async importDeck(exp, opts = {}) {
    const yid = get().activeSchoolYearId ?? undefined;
    const intoDeck = opts.intoDeckId ? get().decks.find(d => d.id === opts.intoDeckId) : undefined;
    const existingTopics = intoDeck ? get().cardTopics.filter(t => t.deckId === intoDeck.id) : [];
    const { deck, topics, cards } = deckExportToEntities(exp, {
      schoolYearId: yid,
      subjectId: opts.subjectId,
      existingDeck: intoDeck,
      existingTopics,
    });

    await db.transaction('rw', [db.decks, db.cardTopics, db.flashcards], async () => {
      if (!intoDeck) await db.decks.add(deck);
      if (topics.length) await db.cardTopics.bulkAdd(topics);
      if (cards.length) await db.flashcards.bulkAdd(cards);
    });

    set(state => ({
      decks: intoDeck ? state.decks : [...state.decks, deck].sort(compareDecks),
      cardTopics: [...state.cardTopics, ...topics],
      flashcards: [...state.flashcards, ...cards],
    }));

    const { authUser } = get();
    if (authUser) {
      if (!intoDeck) syncRow('decks', deck.id, deck, authUser.id);
      topics.forEach(t => syncRow('card_topics', t.id, t, authUser.id));
      cards.forEach(c => syncRow('flashcards', c.id, c, authUser.id));
    }
    return deck;
  },

  async sendDeckToFriends(deckId, recipientIds) {
    const { decks, cardTopics, flashcards, myProfile, settings } = get();
    const deck = decks.find(d => d.id === deckId);
    if (!deck || recipientIds.length === 0) return 0;
    const topics = cardTopics.filter(t => t.deckId === deckId);
    const cards = flashcards.filter(c => c.deckId === deckId);
    const payload = buildDeckExport(deck, topics, cards);
    const senderName = myProfile?.displayName ?? settings?.name ?? 'Ein Freund';
    return sendDeckToFriendsApi(payload, recipientIds, senderName);
  },
  async loadDeckShares() {
    if (!get().authUser) {
      if (get().incomingDeckShares.length) set({ incomingDeckShares: [] });
      return;
    }
    try {
      const shares = await fetchIncomingDeckShares();
      set({ incomingDeckShares: shares });
    } catch (e) {
      console.warn('loadDeckShares failed:', e);
    }
  },
  async acceptDeckShare(shareId) {
    const share = get().incomingDeckShares.find(s => s.id === shareId);
    if (!share) return null;
    const deck = await get().importDeck(share.payload);
    await deleteDeckShare(shareId);
    set(state => ({ incomingDeckShares: state.incomingDeckShares.filter(s => s.id !== shareId) }));
    return deck;
  },
  async dismissDeckShare(shareId) {
    await deleteDeckShare(shareId);
    set(state => ({ incomingDeckShares: state.incomingDeckShares.filter(s => s.id !== shareId) }));
  },

  // ─── Homework Sharing ────────────────────────────────────────────────────

  async refreshFriendTasks() {
    const { friends, settings } = get();
    if (friends.length === 0) {
      // Keine Freunde → eventuell veraltete Caches leeren.
      if (get().friendTasks.length) {
        await db.friendTasks.clear();
        set({ friendTasks: [] });
      }
      return;
    }
    const filters = settings?.friendSubjectFilters ?? {};
    set({ friendTasksLoading: true });
    try {
      const results = await Promise.all(
        friends.map(f => fetchTasksFromUser(f.userId, f.displayName)),
      );
      // Pro Freund den Fächerfilter anwenden:
      //   undefined/null = alle; []/['Mathe'] = nur Aufgaben mit passendem Fach.
      const all: FriendTask[] = results.flat().filter(t => {
        const filter = filters[t.ownerUserId];
        if (filter == null) return true;            // alle Fächer
        if (!t.subjectName) return false;            // kein Fach → bei aktivem Filter raus
        return filter.includes(t.subjectName);
      });

      await db.friendTasks.clear();
      if (all.length) await db.friendTasks.bulkAdd(all);
      set({ friendTasks: all, friendTasksLoading: false });
    } catch (e) {
      console.warn('refreshFriendTasks failed:', e);
      set({ friendTasksLoading: false });
    }
  },

  // Legacy-Abo-Aktionen (für Altcode/Migration; primärer Pfad ist jetzt der Freundes-Graph).
  async addHomeworkSubscription(sub) {
    const current = get().settings ?? mergeSettings(undefined);
    const existing = current.homeworkSubscriptions ?? [];
    if (existing.some(s => s.userId === sub.userId)) return;
    await get().setSettings({ homeworkSubscriptions: [...existing, sub] });
  },

  async removeHomeworkSubscription(userId) {
    const current = get().settings ?? mergeSettings(undefined);
    const updated = (current.homeworkSubscriptions ?? []).filter(s => s.userId !== userId);
    await get().setSettings({ homeworkSubscriptions: updated });
    await db.friendTasks.where('ownerUserId').equals(userId).delete();
    set(state => ({ friendTasks: state.friendTasks.filter(t => t.ownerUserId !== userId) }));
  },

  async setFriendSubjectFilter(userId, subjectFilter) {
    const current = get().settings ?? mergeSettings(undefined);
    const updated = { ...(current.friendSubjectFilters ?? {}) };
    if (subjectFilter == null) delete updated[userId];
    else updated[userId] = subjectFilter;
    await get().setSettings({ friendSubjectFilters: updated });
    await get().refreshFriendTasks();
  },

  // ─── Freundes-Graph ──────────────────────────────────────────────────────

  async loadFriends() {
    const { authUser } = get();
    if (!authUser || !supabase) {
      set({ myProfile: null, friends: [], incomingRequests: [], outgoingRequests: [] });
      return;
    }
    set({ friendsLoading: true });
    try {
      const [profile, graph] = await Promise.all([
        getOrCreateMyProfile(get().settings?.name).catch(() => null),
        loadFriendGraph(),
      ]);
      set({
        myProfile: profile,
        friends: graph.friends,
        incomingRequests: graph.incoming,
        outgoingRequests: graph.outgoing,
        friendsLoading: false,
      });
      // Geteilte Hausaufgaben der (jetzt geladenen) Freunde nachziehen.
      void get().refreshFriendTasks();
      // Erhaltene Kästen (Inbox) nachziehen.
      void get().loadDeckShares();
    } catch (e) {
      console.warn('loadFriends failed:', e);
      set({ friendsLoading: false });
    }
  },

  async sendFriendRequest(code) {
    await sendFriendRequestByCode(code);
    await get().loadFriends();
  },

  async acceptFriendRequest(friendshipId) {
    await acceptFriendshipRow(friendshipId);
    await get().loadFriends();
  },

  async declineFriendRequest(friendshipId) {
    await deleteFriendship(friendshipId);
    await get().loadFriends();
  },

  async removeFriend(friendshipId, userId) {
    await deleteFriendship(friendshipId);
    // Gecachte Hausaufgaben + Fächerfilter dieses Freundes aufräumen.
    await db.friendTasks.where('ownerUserId').equals(userId).delete();
    const current = get().settings ?? mergeSettings(undefined);
    if (current.friendSubjectFilters?.[userId] !== undefined) {
      const updated = { ...current.friendSubjectFilters };
      delete updated[userId];
      await get().setSettings({ friendSubjectFilters: updated });
    }
    set(state => ({ friendTasks: state.friendTasks.filter(t => t.ownerUserId !== userId) }));
    await get().loadFriends();
  },

  setMyProfile(profile) {
    set({ myProfile: profile });
  },

  async setShareScheduleWithFriends(on) {
    await get().setSettings({ shareScheduleWithFriends: on });
    if (on) await get().republishScheduleIfShared();
    else await unpublishMySchedule().catch(() => {});
  },

  async republishScheduleIfShared() {
    const { settings, authUser, activeSchoolYearId } = get();
    if (!authUser || !settings?.shareScheduleWithFriends || !activeSchoolYearId) return;
    try {
      const year = get().schoolYears.find(y => y.id === activeSchoolYearId);
      const payload = await buildSchedulePayload({
        schoolYearId: activeSchoolYearId,
        ownerName: settings.name,
        schoolYearName: year?.name,
      });
      await publishMySchedule(payload);
    } catch (e) {
      console.warn('republishScheduleIfShared failed:', e);
    }
  },

  async getFriendSchedule(userId) {
    return fetchFriendSchedule(userId);
  },

  async publishTask(task) {
    const { subjects } = get();
    const subj = subjects.find(s => s.id === task.subjectId);
    await publishSharedTask(task, subj?.name);
  },

  async unpublishTask(taskId) {
    await unpublishSharedTask(taskId);
  },

  dismissFriendTask(id) {
    const ids = Array.isArray(id) ? id : [id];
    if (ids.length === 0) return;
    set(state => ({ dismissedFriendTaskIds: new Set([...state.dismissedFriendTaskIds, ...ids]) }));
    // Dauerhaft + geräteübergreifend merken (über die synchronisierten Settings).
    const current = get().settings;
    if (current) {
      const nextIds = Array.from(new Set([...(current.dismissedFriendTaskIds ?? []), ...ids]));
      void get().setSettings({ dismissedFriendTaskIds: nextIds });
    }
  },

  async acceptFriendTask(ft) {
    // Aus einer Freundes-Hausaufgabe eine eigene Aufgabe machen. Fach über den
    // Namen auf ein eigenes Fach mappen (sonst „Allgemein"/ohne Fach).
    const subj = ft.subjectName
      ? get().subjects.find(s => s.name.toLowerCase() === ft.subjectName!.toLowerCase())
      : undefined;
    await get().addTask({
      title: ft.title,
      description: ft.description,
      kind: ft.kind,
      subjectId: subj?.id,
      dueDate: ft.dueDate,
      done: false,
      priority: get().settings?.defaultTaskPriority ?? 2,
      shared: false,
    });
    // Diese Hausaufgabe gehört jetzt dir – ALLE geteilten Kopien davon ausblenden
    // (auch dieselbe Aufgabe von anderen Mitschülern), damit nichts doppelt steht.
    const sameIds = get().friendTasks
      .filter(o => o.id === ft.id || sameHomework(ft, o))
      .map(o => o.id);
    get().dismissFriendTask(sameIds);
  },
}));

// ─── Realtime-Handler ────────────────────────────────────────────────────
// Werden in startAutoSync() registriert und beim Stop wieder unsubscribed.

type SetFn = (partial: Partial<State> | ((state: State) => Partial<State>)) => void;
type GetFn = () => State;

/** Schmaler Wrapper, damit startAutoSync und replaceCloud die gleichen Handler installieren. */
function startRealtimeHandlers(userId: string, set: SetFn, get: GetFn): void {
  startRealtime(userId, {
    onUpsert: async (table, data) => {
      await applyRealtimeUpsert(table, data, set, get);
    },
    onDelete: async (table, id) => {
      await applyRealtimeDelete(table, id, set, get);
    },
    onSettings: async (data) => {
      await applyRealtimeSettings(data, set);
    },
    onStatusChange: (status) => {
      if (status === 'connected') {
        set({ liveSync: 'live' });
        // Verbindung (wieder) da → evtl. gemerkte Uploads nachholen.
        void flushSyncQueue(userId);
      }
      else if (status === 'connecting') set({ liveSync: 'connecting' });
      else if (status === 'error') set({ liveSync: 'error' });
      else if (status === 'closed') set({ liveSync: 'off' });
    },
  });
}

/**
 * Liefert die lokale Dexie-Tabelle zu einem Cloud-Tabellennamen (oder null).
 * Wird nur gebraucht, um beim Live-Sync den lokalen Zeitstempel zu prüfen.
 */
function realtimeLocalTable(table: SyncTable): { get(id: string): Promise<{ updatedAt?: number } | undefined> } | null {
  switch (table) {
    case 'subjects': return db.subjects;
    case 'grades': return db.grades;
    case 'tasks': return db.tasks;
    case 'lessons': return db.lessons;
    case 'photos': return db.photos;
    case 'school_years': return db.schoolYears;
    case 'focus_sessions': return db.focusSessions;
    case 'deck_folders': return db.deckFolders;
    case 'decks': return db.decks;
    case 'card_topics': return db.cardTopics;
    case 'flashcards': return db.flashcards;
    default: return null;
  }
}

async function applyRealtimeUpsert(table: SyncTable, raw: unknown, set: SetFn, get: GetFn): Promise<void> {
  const data = raw as Record<string, unknown> & { id: string };
  if (!data || typeof data !== 'object' || !data.id) return;

  // „Neuester gewinnt" auch live: einen hereinkommenden Stand ignorieren, wenn
  // unsere lokale Version neuer ist – sonst macht ein verspätetes Broadcast eine
  // gerade erst gemachte Änderung wieder kaputt.
  const localTable = realtimeLocalTable(table);
  if (localTable) {
    const existing = await localTable.get(data.id);
    const incomingTs = typeof data.updatedAt === 'number' ? data.updatedAt : 0;
    if (existing && (existing.updatedAt ?? 0) > incomingTs) return;
  }

  switch (table) {
    case 'subjects': {
      const subj = data as unknown as Subject;
      await db.subjects.put(subj);
      const yid = get().activeSchoolYearId;
      if (!yid || subj.schoolYearId === yid) {
        set(state => ({
          subjects: upsertById(state.subjects, subj).sort(compareSubjects),
        }));
      } else {
        // Fach gehört zu anderem Jahr; nicht in In-Memory-View aufnehmen, aber falls vorhanden entfernen.
        set(state => ({ subjects: state.subjects.filter(s => s.id !== subj.id) }));
      }
      break;
    }
    case 'grades': {
      const grade = data as unknown as Grade;
      await db.grades.put(grade);
      const yid = get().activeSchoolYearId;
      const year = get().schoolYears.find(y => y.id === yid);
      const matchesYear = !yid || grade.schoolYearId === yid;
      const inView = matchesYear && gradeInActiveTerm(grade, year, get().activeTerm);
      set(state => ({
        allYearGrades: matchesYear ? upsertById(state.allYearGrades, grade) : state.allYearGrades.filter(g => g.id !== grade.id),
        grades: inView ? upsertById(state.grades, grade) : state.grades.filter(g => g.id !== grade.id),
      }));
      break;
    }
    case 'tasks': {
      const task = data as unknown as AppTask;
      await db.tasks.put(task);
      const yid = get().activeSchoolYearId;
      if (!yid || task.schoolYearId === yid) {
        set(state => ({
          tasks: upsertById(state.tasks, task).sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)),
        }));
      } else {
        set(state => ({ tasks: state.tasks.filter(t => t.id !== task.id) }));
      }
      break;
    }
    case 'lessons': {
      const lesson = data as unknown as Lesson;
      await db.lessons.put(lesson);
      const yid = get().activeSchoolYearId;
      if (!yid || lesson.schoolYearId === yid) {
        set(state => ({ lessons: upsertById(state.lessons, lesson) }));
      } else {
        set(state => ({ lessons: state.lessons.filter(l => l.id !== lesson.id) }));
      }
      break;
    }
    case 'school_years': {
      const year = data as unknown as SchoolYear;
      await db.schoolYears.put(year);
      const prevActive = get().activeSchoolYearId;
      const merged = upsertById(get().schoolYears, year).sort((a, b) => b.startDate - a.startDate);
      const nowActive = merged.find(y => y.active);
      set({ schoolYears: merged, activeSchoolYearId: nowActive?.id ?? prevActive });
      // Wenn sich das aktive Jahr ändert, alle Filter neu aufbauen.
      if (nowActive && nowActive.id !== prevActive) {
        await get().load();
      }
      break;
    }
    case 'photos': {
      const photo = data as unknown as Photo;
      await db.photos.put(photo);
      // Photos stehen nicht im Store-State, das reicht.
      break;
    }
    case 'focus_sessions': {
      const session = data as unknown as FocusSession;
      await db.focusSessions.put(session);
      const yid = get().activeSchoolYearId;
      if (!yid || session.schoolYearId === yid) {
        set(state => ({
          focusSessions: upsertById(state.focusSessions, session).sort((a, b) => b.startedAt - a.startedAt),
        }));
      } else {
        set(state => ({ focusSessions: state.focusSessions.filter(f => f.id !== session.id) }));
      }
      break;
    }
    case 'deck_folders': {
      const folder = data as unknown as DeckFolder;
      await db.deckFolders.put(folder);
      const yid = get().activeSchoolYearId;
      if (!yid || folder.schoolYearId === yid) {
        set(state => ({ deckFolders: upsertById(state.deckFolders, folder).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) }));
      } else {
        set(state => ({ deckFolders: state.deckFolders.filter(f => f.id !== folder.id) }));
      }
      break;
    }
    case 'decks': {
      const deck = data as unknown as Deck;
      await db.decks.put(deck);
      const yid = get().activeSchoolYearId;
      if (!yid || deck.schoolYearId === yid) {
        set(state => ({ decks: upsertById(state.decks, deck).sort(compareDecks) }));
      } else {
        set(state => ({ decks: state.decks.filter(d => d.id !== deck.id) }));
      }
      break;
    }
    case 'card_topics': {
      const topic = data as unknown as CardTopic;
      await db.cardTopics.put(topic);
      // Nur aufnehmen, wenn der zugehörige Kasten in der aktuellen Jahres-View ist.
      if (get().decks.some(d => d.id === topic.deckId)) {
        set(state => ({ cardTopics: upsertById(state.cardTopics, topic) }));
      } else {
        set(state => ({ cardTopics: state.cardTopics.filter(t => t.id !== topic.id) }));
      }
      break;
    }
    case 'flashcards': {
      const card = data as unknown as Flashcard;
      await db.flashcards.put(card);
      if (get().decks.some(d => d.id === card.deckId)) {
        set(state => ({ flashcards: upsertById(state.flashcards, card) }));
      } else {
        set(state => ({ flashcards: state.flashcards.filter(c => c.id !== card.id) }));
      }
      break;
    }
  }
}

async function applyRealtimeDelete(table: SyncTable, id: string, set: SetFn, get: GetFn): Promise<void> {
  switch (table) {
    case 'subjects':
      await db.subjects.delete(id);
      set(state => ({
        subjects: state.subjects.filter(s => s.id !== id),
        grades: state.grades.filter(g => g.subjectId !== id),
        allYearGrades: state.allYearGrades.filter(g => g.subjectId !== id),
        tasks: state.tasks.filter(t => t.subjectId !== id),
        lessons: state.lessons.filter(l => l.subjectId !== id),
      }));
      break;
    case 'grades':
      await db.grades.delete(id);
      set(state => ({
        grades: state.grades.filter(g => g.id !== id),
        allYearGrades: state.allYearGrades.filter(g => g.id !== id),
      }));
      break;
    case 'tasks':
      await db.tasks.delete(id);
      set(state => ({ tasks: state.tasks.filter(t => t.id !== id) }));
      break;
    case 'lessons':
      await db.lessons.delete(id);
      set(state => ({ lessons: state.lessons.filter(l => l.id !== id) }));
      break;
    case 'school_years': {
      const wasActive = get().activeSchoolYearId === id;
      await db.schoolYears.delete(id);
      set(state => ({ schoolYears: state.schoolYears.filter(y => y.id !== id) }));
      if (wasActive) await get().load();
      break;
    }
    case 'photos':
      await db.photos.delete(id);
      break;
    case 'focus_sessions':
      await db.focusSessions.delete(id);
      set(state => ({ focusSessions: state.focusSessions.filter(f => f.id !== id) }));
      break;
    case 'deck_folders':
      await db.deckFolders.delete(id);
      set(state => ({
        deckFolders: state.deckFolders.filter(f => f.id !== id),
        decks: state.decks.map(d => d.folderId === id ? { ...d, folderId: undefined } : d),
      }));
      break;
    case 'decks':
      await db.transaction('rw', [db.decks, db.cardTopics, db.flashcards], async () => {
        await db.decks.delete(id);
        await db.cardTopics.where('deckId').equals(id).delete();
        await db.flashcards.where('deckId').equals(id).delete();
      });
      set(state => ({
        decks: state.decks.filter(d => d.id !== id),
        cardTopics: state.cardTopics.filter(t => t.deckId !== id),
        flashcards: state.flashcards.filter(c => c.deckId !== id),
      }));
      break;
    case 'card_topics':
      await db.cardTopics.delete(id);
      set(state => ({ cardTopics: state.cardTopics.filter(t => t.id !== id) }));
      break;
    case 'flashcards':
      await db.flashcards.delete(id);
      set(state => ({ flashcards: state.flashcards.filter(c => c.id !== id) }));
      break;
  }
}

async function applyRealtimeSettings(data: AppSettings, set: SetFn): Promise<void> {
  const merged = mergeSettings({ ...data, id: 'app' });
  await db.settings.put(merged);
  applyTheme(merged.colorTheme, undefined, merged.customHue);
  applyVisualSettings(merged);
  set({ settings: merged });
}
