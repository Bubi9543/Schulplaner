export type GradingSystem = 'bayern' | 'oberstufe' | 'austria' | 'custom';

/**
 * Fachkategorie - bestimmt die Notenberechnung in Bayern.
 * - hauptfach: Schulaufgaben zählen doppelt → (SA-Schnitt × 2 + Rest-Schnitt) / 3
 * - hauptfach-1zu1: Schulaufgaben 1:1 mit Rest → (SA-Schnitt + Rest-Schnitt) / 2 (z.B. Physik/Chemie)
 * - nebenfach: einfacher Schnitt aller Noten
 */
export type SubjectCategory = 'hauptfach' | 'hauptfach-1zu1' | 'nebenfach';

/** Migriert Legacy-Kategorien ('haupt' | 'neben') zu neuen Werten. */
export function normalizeSubjectCategory(input: unknown): SubjectCategory {
  if (input === 'hauptfach' || input === 'hauptfach-1zu1' || input === 'nebenfach') return input;
  if (input === 'haupt') return 'hauptfach';
  if (input === 'neben') return 'nebenfach';
  return 'nebenfach';
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Notenart. Vordefiniert sind die Werte aus BUILTIN_GRADE_KINDS, zusätzlich
 * können in den Einstellungen eigene Kategorien angelegt werden – ihre ID
 * wird dann hier abgelegt (Format frei wählbar).
 */
export type GradeKind = string;

export const BUILTIN_GRADE_KINDS = ['schulaufgabe', 'stegreif', 'muendlich', 'referat', 'klausur', 'projekt', 'sonstige'] as const;
export type BuiltinGradeKind = typeof BUILTIN_GRADE_KINDS[number];

/**
 * Vom User definierte zusätzliche Notenart.
 * - `weighting = 'large'`: zählt wie eine Schulaufgabe/Klausur
 *   (geht in den Schulaufgaben-Block beim Bayern-Hauptfach-Schnitt).
 * - `weighting = 'rest'`: zählt wie Mündlich/Stegreif (kleine Leistung).
 */
export interface CustomGradeKind {
  id: string;
  label: string;
  weighting: 'large' | 'rest';
}

export type GradeKindWeight = { haupt: number; neben: number };

export interface BayernConfig {
  kindWeights: Record<GradeKind, GradeKindWeight>;
}
export interface OberstufeConfig {
  kindWeights: Record<GradeKind, GradeKindWeight>;
  allowPerGradeWeight: boolean;
}
export interface AustriaConfig {
  kindWeights: Record<GradeKind, GradeKindWeight>;
}
export interface CustomConfig {
  min: number;
  max: number;
  step: number;
  goodIsLow: boolean;
  defaultValue: number;
  label: string;
  kindWeights: Record<GradeKind, GradeKindWeight>;
}

export interface GradingSystemConfig {
  bayern: BayernConfig;
  oberstufe: OberstufeConfig;
  austria: AustriaConfig;
  custom: CustomConfig;
  /** Vom User angelegte Leistungsnachweis-Kategorien (über Schulaufgabe/Mündlich hinaus). */
  customKinds: CustomGradeKind[];
}

export interface Subject {
  id: string;
  name: string;
  short: string;
  color: string;
  /** Name eines lucide-Icons (siehe src/lib/subjectIcons.ts). Wenn leer, wird automatisch aus dem Fachnamen erkannt. */
  icon?: string;
  category: SubjectCategory;
  system: GradingSystem;
  teacher?: string;
  room?: string;
  targetAverage?: number;
  createdAt: number;
  /** Zugehöriges Schuljahr. Wenn nicht gesetzt, gehört das Fach zum aktuellen Jahr (Migration). */
  schoolYearId?: string;
  /** Optionale Zugehörigkeit zu einer User-definierten Fächergruppe (SubjectGroup.id). */
  groupId?: string;
  /** Manuelle Sortierreihenfolge. Kleinere Werte zuerst. Fehlende Werte werden ans Ende gehängt und alphabetisch sortiert. */
  position?: number;
  /**
   * Oberstufe (Bayern G9): Fach auf erhöhtem Anforderungsniveau (Leistungsfach).
   * Rein organisatorisch/kennzeichnend – ändert die Punkteberechnung NICHT
   * (in Bayern zählen Leistungsfächer nicht doppelt).
   */
  leistungsfach?: boolean;
}

/**
 * Vom User angelegte Fächergruppe – rein organisatorisch (keine Auswirkung auf
 * Notenberechnung). Z. B. "Naturwissenschaften", "Sprachen", "Sport".
 */
export interface SubjectGroup {
  id: string;
  label: string;
  color?: string;
  /** Reihenfolge der Gruppen untereinander. */
  position?: number;
}

/** Standard-Gewichtsoptionen für einzelne Noten - "custom" erlaubt beliebigen Wert via weightMultiplier. */
export type GradeWeightPreset = 0.5 | 1 | 1.5 | 2;

export interface Grade {
  id: string;
  subjectId: string;
  value: number;
  kind: GradeKind;
  title?: string;
  date: number;
  /** Legacy-Feld (älteres Kind-Gewicht). Wird vom neuen System ignoriert. */
  weight: number;
  /** Per-Note Gewichts-Multiplikator. Default 1. Erlaubt 0.5/1/1.5/2 oder beliebige Zahl. */
  weightMultiplier?: number;
  isPending?: boolean;
  /** Zugehöriges Schuljahr. Wird vom Subject geerbt beim Anlegen. */
  schoolYearId?: string;
  /**
   * Ausbildungsabschnitt / Halbjahr in der Oberstufe (1–4 → 12/1, 12/2, 13/1, 13/2).
   * Nur relevant, wenn das zugehörige Schuljahr eine Oberstufe ist (SchoolYear.oberstufe).
   * Fehlt der Wert, wird das Halbjahr 1 angenommen (Migration).
   */
  term?: number;
  /** Lerncheckliste – Themen die du können musst, mit Ampel-Status. */
  studyChecklist?: StudyChecklistItem[];
  /** Ziel-Datum bis wann du die Checkliste durchhaben willst (ms timestamp). */
  studyDeadline?: number;
}

export type StudyStatus = 'red' | 'yellow' | 'green';

export interface StudyChecklistItem {
  id: string;
  label: string;
  status: StudyStatus;
}

/**
 * Aufgaben-Art. Built-ins in BUILTIN_TASK_KINDS, zusätzlich können die
 * vom User angelegten Custom-Kategorien (gradingConfig.customKinds) als
 * Aufgaben-Art verwendet werden – ihre ID landet dann hier als String.
 */
export type TaskKind = string;

// „test"/„schulaufgabe" sind bewusst NICHT mehr wählbar — anstehende Prüfungen
// werden über „Note steht aus" im Noten-Dialog vorgemerkt. Die Labels/Icons
// (BUILTIN_TASK_KIND_LABEL/ICON in lib/grading.ts) bleiben erhalten, damit
// bereits vorhandene Aufgaben dieser Art weiterhin korrekt angezeigt werden.
export const BUILTIN_TASK_KINDS = ['hausaufgabe', 'projekt', 'todo'] as const;
export type BuiltinTaskKind = typeof BUILTIN_TASK_KINDS[number];

export interface AppTask {
  id: string;
  title: string;
  description?: string;
  subjectId?: string;
  kind: TaskKind;
  dueDate?: number;
  reminder?: number;
  done: boolean;
  doneAt?: number;
  priority: 1 | 2 | 3;
  createdAt: number;
  /** Zugehöriges Schuljahr. */
  schoolYearId?: string;
  /** Lerncheckliste – Themen die du können musst, mit Ampel-Status. */
  studyChecklist?: StudyChecklistItem[];
  /** Ziel-Datum bis wann du die Checkliste durchhaben willst (ms timestamp). */
  studyDeadline?: number;
  /** Ob diese Hausaufgabe mit Mitschülern geteilt wird (wird in shared_tasks veröffentlicht). */
  shared?: boolean;
}

/**
 * Abonnement eines Mitschülers für geteilte Hausaufgaben.
 * Wird in AppSettings.homeworkSubscriptions gespeichert.
 */
export interface HomeworkSubscription {
  /** Supabase user_id des Mitschülers. */
  userId: string;
  /** Anzeigename des Mitschülers. */
  displayName: string;
  /** Der 6-stellige permanente Freundecode des Mitschülers. */
  friendCode: string;
  /**
   * Fächerfilter:
   * - `null` = alle Fächer empfangen
   * - `string[]` = nur Hausaufgaben für diese Fachnamen empfangen (kann leer sein = nichts)
   */
  subjectFilter: string[] | null;
  /** ms-Timestamp wann das Abo hinzugefügt wurde. */
  addedAt: number;
}

/**
 * Eine von einem Mitschüler geteilte Hausaufgabe.
 * Wird lokal in der Dexie-Tabelle `friendTasks` gecacht.
 */
export interface FriendTask {
  id: string;
  ownerUserId: string;
  /** Anzeigename des Mitschülers. */
  ownerName: string;
  title: string;
  description?: string;
  /** Fachname im Kontext des Mitschülers (plain text, kein subjectId). */
  subjectName?: string;
  kind: string;
  dueDate?: number;
  createdAt: number;
  /** ms-Timestamp des letzten Fetches. */
  fetchedAt: number;
}

/**
 * Art einer Fokus-/Lern-Session.
 * - pomodoro: Wechsel aus Fokus-/Pausenblöcken; gezählt wird nur die Fokuszeit.
 * - timer: einfacher Countdown auf eine gewählte Dauer.
 * - stopwatch: offene Stoppuhr, hochzählend.
 */
export type FocusMode = 'pomodoro' | 'timer' | 'stopwatch';

/**
 * Eine abgeschlossene Lern-/Fokus-Session. Wird lokal in Dexie (`focusSessions`)
 * gespeichert und – wenn eingeloggt – in die Cloud gesynct.
 */
export interface FocusSession {
  id: string;
  /** Optional zugeordnetes Fach. */
  subjectId?: string;
  /** Optional verknüpfter Test/Prüfung (Grade-ID, oft isPending). */
  gradeId?: string;
  /** Art der Session. */
  mode: FocusMode;
  /** Effektiv fokussierte Zeit in Millisekunden (Pausen nicht eingerechnet). */
  focusedMs: number;
  /** Startzeitpunkt (ms timestamp). */
  startedAt: number;
  /** Endzeitpunkt (ms timestamp). */
  endedAt: number;
  /** Zugehöriges Schuljahr. */
  schoolYearId?: string;
}

export interface Lesson {
  id: string;
  subjectId: string;
  weekday: Weekday;
  start: string;
  end: string;
  room?: string;
  weekParity?: 'A' | 'B' | 'ALL';
  /** Zugehöriges Schuljahr. Wird vom Subject geerbt beim Anlegen. */
  schoolYearId?: string;
}

// ─── Karteikarten / Spaced Repetition (Leitner) ─────────────────────────────

/** Anzahl der Leitner-Fächer (Boxen). Eine Karte wandert von 1 bis LEITNER_BOXES. */
export const LEITNER_BOXES = 5;

/**
 * Abfragerichtung einer Lern-Session.
 * - front-back: Vorderseite zeigen, Rückseite abfragen (Default).
 * - back-front: umgekehrt.
 * - mixed: pro Karte zufällig.
 */
export type ReviewDirection = 'front-back' | 'back-front' | 'mixed';

/** Lernmodus einer Session. */
export type ReviewMode = 'flip' | 'match';

/**
 * Ergebnis einer Karten-Bewertung (Leitner).
 * - correct: ein Fach weiter.
 * - partial: weder richtig noch falsch → bleibt im selben Fach.
 * - wrong: zurück in Fach 1.
 */
export type ReviewOutcome = 'correct' | 'partial' | 'wrong';

/** Ein Ordner zum Gruppieren mehrerer Karteikästen (rein organisatorisch). */
export interface DeckFolder {
  id: string;
  name: string;
  color?: string;
  position?: number;
  /** Zugehöriges Schuljahr. Wird beim Anlegen vom aktiven Jahr geerbt. */
  schoolYearId?: string;
  createdAt: number;
}

/**
 * Ein „Kasten" – das Haupt-Behältnis für Karteikarten (z. B. „Mathe").
 * Optional einem Fach (Subject) zugeordnet.
 */
export interface Deck {
  id: string;
  name: string;
  description?: string;
  color: string;
  /** Name eines lucide-Icons (siehe src/lib/subjectIcons.ts). Optional. */
  icon?: string;
  /** Optionales übergeordnetes Fach (Subject.id). */
  subjectId?: string;
  /** Optionaler Ordner (DeckFolder.id) zum Gruppieren. */
  folderId?: string;
  /** Zugehöriges Schuljahr. Wird beim Anlegen vom aktiven Jahr geerbt. */
  schoolYearId?: string;
  /** Manuelle Sortierreihenfolge. Kleinere Werte zuerst. */
  position?: number;
  createdAt: number;
}

/** Ein Themengebiet/Kapitel innerhalb eines Kastens. */
export interface CardTopic {
  id: string;
  deckId: string;
  name: string;
  color?: string;
  position?: number;
  createdAt: number;
}

/**
 * Eine Karteikarte mit Vorder- und Rückseite. Der Lernfortschritt wird über
 * das Leitner-Fach (`box`, 1–LEITNER_BOXES) getrackt.
 */
export interface Flashcard {
  id: string;
  deckId: string;
  /** Optionales Themengebiet (CardTopic.id). */
  topicId?: string;
  front: string;
  back: string;
  /** Leitner-Fach (1 = neu/oft, LEITNER_BOXES = sitzt). */
  box: number;
  /** Letzter Abruf (ms timestamp). */
  reviewedAt?: number;
  /** Statistik: wie oft richtig/falsch beantwortet. */
  correctCount?: number;
  wrongCount?: number;
  createdAt: number;
  /** Zugehöriges Schuljahr. Vom Deck geerbt beim Anlegen. */
  schoolYearId?: string;
}

/** Standardisiertes Austauschformat für KI-Import & Sharing eines Kastens. */
export interface DeckExport {
  /** Schema-Version für Vorwärtskompatibilität. */
  version: 1;
  kind: 'notenapp-deck';
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  /** Themengebiete (optional). Karten referenzieren sie über `topic`. */
  topics?: string[];
  cards: Array<{
    front: string;
    back: string;
    /** Name des Themengebiets (muss nicht in `topics` stehen – wird sonst angelegt). */
    topic?: string;
  }>;
}

export type ColorThemeId = 'indigo' | 'ocean' | 'sunset' | 'forest' | 'rose' | 'crimson' | 'sunshine' | 'mono' | 'rainbow';
export type ThemeMode = 'light' | 'dark' | 'auto';
export type DensityMode = 'comfortable' | 'compact';
export type FontScale = 0.9 | 1 | 1.1;
export type AnimationLevel = 'rich' | 'reduced' | 'minimal';
export type GreetingStyle = 'casual' | 'formal' | 'fun';

export interface Photo {
  id: string;
  refId: string;
  refType: 'grade' | 'task';
  /** Pfad in Supabase Storage, Form: "{userId}/{photoId}.jpg". Neue Fotos haben das. */
  storagePath?: string;
  /** Legacy: base64 Data-URL. Ältere Fotos vor der Cloud-Migration. */
  dataUrl?: string;
  createdAt: number;
  /** Falls schon vom Cloud-Sync gepushed. */
  userId?: string;
}

export interface AppSettings {
  id: 'app';
  name?: string;
  /** Profilbild – Data-URL (lokal) oder öffentliche Cloud-URL (für Freunde). */
  avatarUrl?: string;
  school?: string;
  classLevel?: string;
  system: GradingSystem;
  onboarded: boolean;
  demo: boolean;
  /** Aktive Abonnements für geteilte Hausaufgaben (Legacy – wird über den Freundes-Graph migriert). */
  homeworkSubscriptions: HomeworkSubscription[];
  /** Hausaufgaben standardmäßig teilen? */
  homeworkShareByDefault: boolean;
  /** Aufgaben die via Apple Shortcut erstellt werden automatisch teilen? */
  homeworkShareViaShortcut: boolean;
  /** Eigenen Stundenplan automatisch mit Freunden teilen? */
  shareScheduleWithFriends: boolean;
  /**
   * Pro Freund (Supabase user_id): aus welchen Fächern dessen Hausaufgaben empfangen werden.
   * - fehlend/`null` = alle Fächer
   * - `string[]` = nur diese Fachnamen (kann leer sein = keine)
   */
  friendSubjectFilters: Record<string, string[] | null>;
  theme: ThemeMode;
  colorTheme: ColorThemeId;
  density: DensityMode;
  fontScale: FontScale;
  animationLevel: AnimationLevel;
  glassEffects: boolean;
  confettiOnGood: boolean;
  schoolStart: string;
  schoolEnd: string;
  weekStart: 0 | 1;
  dashboardGreetingStyle: GreetingStyle;
  quickButtons: TaskKind[];
  autoSelectActiveSubject: boolean;
  activeSubjectThresholdMin: number;
  defaultTaskPriority: 1 | 2 | 3;
  averageDigits: 1 | 2 | 3;
  trendThreshold: number;
  gradingConfig: GradingSystemConfig;
  /** Vom User angelegte Fächergruppen. */
  subjectGroups: SubjectGroup[];
  /** Push-Notification-Konfiguration. */
  notifications: NotificationSettings;
  /** Region für Schulferien-Lookup (z. B. DE-BY, DE-NW, AT-9). */
  region?: RegionCode;
}

/** ISO 3166-2 Subdivision Code; null = nur Country, kein Bundesland (z. B. nur "DE"). */
export interface RegionCode {
  /** ISO-Country-Code, z. B. 'DE', 'AT'. */
  country: string;
  /** ISO-Subdivision-Code, z. B. 'DE-BY', 'AT-9'. */
  subdivision?: string;
}

/** Eine Ferienzeit, wie sie von openholidaysapi.org kommt. */
export interface SchoolHoliday {
  id: string;
  /** YYYY-MM-DD lokal */
  startDate: string;
  /** YYYY-MM-DD lokal (inkl., letzter Schulferientag) */
  endDate: string;
  /** Lokaler Name, z. B. "Herbstferien". */
  name: string;
  /** Cache-Key zum Aufräumen, z. B. "DE-BY:2025". */
  cacheKey: string;
}

/** Konfiguration der Push-Benachrichtigungen – pro Event-Typ einzeln steuerbar. */
export interface NotificationSettings {
  /** Master-Switch. Wenn false, wird gar nichts gesendet. */
  enabled: boolean;
  /** Hausaufgaben-Erinnerung. */
  homework: {
    enabled: boolean;
    /** Wieviele Stunden vor `dueDate` benachrichtigen. */
    hoursBefore: number;
  };
  /** Klausuren & Tests. */
  exam: {
    enabled: boolean;
    /** Erste Benachrichtigung in X Tagen vorher (0 = aus). */
    daysBefore: number;
    /** Zweite Benachrichtigung in X Stunden vorher (0 = aus). */
    hoursBefore: number;
  };
  /** Stundenbeginn-Erinnerung. */
  lessonStart: {
    enabled: boolean;
    /** Minuten vor Stundenbeginn. */
    minutesBefore: number;
    /** Nur Montag–Freitag. */
    onlyWeekdays: boolean;
  };
  /** Lerncheckliste-Deadline (studyDeadline). */
  studyDeadline: {
    enabled: boolean;
    /** Stunden vor `studyDeadline`. */
    hoursBefore: number;
  };
  /** Stille Zeit – während dieses Fensters nicht benachrichtigen. */
  quietHours: {
    enabled: boolean;
    /** HH:MM Start (z. B. "22:00"). */
    from: string;
    /** HH:MM Ende (z. B. "07:00"). Wenn from > to, läuft das Fenster über Mitternacht. */
    to: string;
  };
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  homework: { enabled: true, hoursBefore: 12 },
  exam: { enabled: true, daysBefore: 3, hoursBefore: 12 },
  lessonStart: { enabled: false, minutesBefore: 10, onlyWeekdays: true },
  studyDeadline: { enabled: true, hoursBefore: 24 },
  quietHours: { enabled: true, from: '22:00', to: '07:00' },
};

export const SUBJECT_COLORS = [
  '#dc2626', '#ea580c', '#f97316', '#f59e0b',
  '#ca8a04', '#84cc16', '#16a34a', '#10b981',
  '#059669', '#14b8a6', '#06b6d4', '#0891b2',
  '#0284c7', '#3b82f6', '#6366f1', '#4f46e5',
  '#8b5cf6', '#7c3aed', '#a855f7', '#9333ea',
  '#d946ef', '#ec4899', '#e11d48', '#f43f5e',
] as const;

export const DEFAULT_KIND_WEIGHTS: Record<GradeKind, GradeKindWeight> = {
  schulaufgabe: { haupt: 2, neben: 1 },
  stegreif:     { haupt: 1, neben: 1 },
  muendlich:    { haupt: 1, neben: 1 },
  referat:      { haupt: 1, neben: 1 },
  klausur:      { haupt: 2, neben: 1 },
  projekt:      { haupt: 1, neben: 1 },
  sonstige:     { haupt: 1, neben: 1 },
};

export interface SchoolYear {
  id: string;
  name: string;        // e.g. "2024/25"
  startDate: number;   // ms timestamp
  endDate?: number;    // ms timestamp, open if undefined
  active: boolean;
  createdAt: number;
  /**
   * Wenn true, ist dieses „Schuljahr" eine bayerische gymnasiale Oberstufe
   * (Qualifikationsphase). Es umfasst dann 4 Ausbildungsabschnitte
   * (12/1, 12/2, 13/1, 13/2 → siehe OBERSTUFE_TERMS); Noten werden je Halbjahr
   * (Grade.term) geführt, und der Schuljahres-Auswähler wird zum Halbjahres-Auswähler.
   */
  oberstufe?: boolean;
  /**
   * Die beiden Jahrgangsstufen der Q-Phase, z. B. [12, 13] (G9) oder [11, 12] (G8).
   * Bestimmt die Halbjahres-Labels (12/1 …). Default: [12, 13].
   */
  oberstufeJahrgaenge?: [number, number];
  /** Abitur-Konfiguration (nur bei Oberstufen-Jahren relevant). */
  abitur?: AbiturConfig;
}

/** Konfiguration für den Abitur-Rechner eines Oberstufen-Jahres (Bayern G9). */
export interface AbiturConfig {
  /** Bis zu 5 Abiturprüfungsfächer (Subject.id). */
  examSubjectIds: string[];
  /** Erreichte Punkte (0–15) je Abiturfach (Subject.id → Punkte). */
  examPoints: Record<string, number>;
  /**
   * Fächer, deren ALLE Halbjahresleistungen verpflichtend eingebracht werden
   * (zusätzlich zu den Abiturfächern, die immer komplett zählen). Z. B. Deutsch,
   * Mathematik, fortgeführte Fremdsprache, Naturwissenschaft.
   */
  fullSubjectIds?: string[];
  /** Manuell gestrichene einzelne Halbjahresleistungen (Schlüssel "subjectId:term"). */
  struckKeys?: string[];
}

/** Ein Ausbildungsabschnitt der bayerischen Oberstufe (Q-Phase). */
export interface OberstufeTerm {
  /** 1–4, in chronologischer Reihenfolge. */
  term: number;
  /** Anzeige-Label, z. B. "12/1". */
  label: string;
  /** Jahrgangsstufe (G9: 12 oder 13). */
  jahrgang: number;
  /** Halbjahr innerhalb der Jahrgangsstufe. */
  half: 1 | 2;
}

/** Default-Jahrgangsstufen der Q-Phase (G9). */
export const DEFAULT_OBERSTUFE_JAHRGAENGE: [number, number] = [12, 13];

/** Baut die 4 Ausbildungsabschnitte für gegebene Jahrgangsstufen (z. B. [12,13] G9, [11,12] G8). */
export function oberstufeTermsFor(jg?: [number, number]): OberstufeTerm[] {
  const [a, b] = jg ?? DEFAULT_OBERSTUFE_JAHRGAENGE;
  return [
    { term: 1, label: `${a}/1`, jahrgang: a, half: 1 },
    { term: 2, label: `${a}/2`, jahrgang: a, half: 2 },
    { term: 3, label: `${b}/1`, jahrgang: b, half: 1 },
    { term: 4, label: `${b}/2`, jahrgang: b, half: 2 },
  ];
}

/** Die vier Ausbildungsabschnitte der bayerischen Q-Phase – Default (G9, 12/13). */
export const OBERSTUFE_TERMS: OberstufeTerm[] = oberstufeTermsFor();

/** Label eines Halbjahres für gegebene Jahrgangsstufen (Fallback: erstes Halbjahr). */
export function oberstufeTermLabelFor(term: number | undefined, jg?: [number, number]): string {
  const terms = oberstufeTermsFor(jg);
  return terms.find(t => t.term === term)?.label ?? terms[0].label;
}

/** Label eines Halbjahres mit Default-Jahrgängen (Back-Compat). */
export function oberstufeTermLabel(term: number | undefined): string {
  return oberstufeTermLabelFor(term);
}

export const DEFAULT_GRADING_CONFIG: GradingSystemConfig = {
  bayern: { kindWeights: structuredCloneSafe(DEFAULT_KIND_WEIGHTS) },
  oberstufe: { kindWeights: structuredCloneSafe(DEFAULT_KIND_WEIGHTS), allowPerGradeWeight: true },
  austria: { kindWeights: structuredCloneSafe(DEFAULT_KIND_WEIGHTS) },
  custom: { min: 1, max: 6, step: 1/3, goodIsLow: true, defaultValue: 2, label: 'Frei', kindWeights: structuredCloneSafe(DEFAULT_KIND_WEIGHTS) },
  customKinds: [],
};

export const DEFAULT_QUICK_BUTTONS: TaskKind[] = ['todo', 'hausaufgabe', 'projekt'];

export const DEFAULT_SETTINGS: Omit<AppSettings, 'id'> = {
  system: 'bayern',
  onboarded: false,
  demo: false,
  homeworkSubscriptions: [],
  homeworkShareByDefault: false,
  homeworkShareViaShortcut: false,
  shareScheduleWithFriends: false,
  friendSubjectFilters: {},
  theme: 'auto',
  colorTheme: 'indigo',
  density: 'comfortable',
  fontScale: 1,
  animationLevel: 'rich',
  glassEffects: true,
  confettiOnGood: true,
  schoolStart: '08:00',
  schoolEnd: '17:00',
  weekStart: 1,
  dashboardGreetingStyle: 'casual',
  quickButtons: DEFAULT_QUICK_BUTTONS,
  autoSelectActiveSubject: true,
  activeSubjectThresholdMin: 10,
  defaultTaskPriority: 2,
  averageDigits: 2,
  trendThreshold: 0.2,
  gradingConfig: DEFAULT_GRADING_CONFIG,
  subjectGroups: [],
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  region: { country: 'DE' },
};

function structuredCloneSafe<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}
