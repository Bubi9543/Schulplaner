import { create } from 'zustand';
import { db, uid } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { syncRow, syncSettings, deleteRow, uploadAll, downloadAll, startRealtime, stopRealtime } from '@/lib/sync';
import type { SyncTable } from '@/lib/sync';
import { DEFAULT_GRADING_CONFIG, DEFAULT_SETTINGS, normalizeSubjectCategory } from '@/types';
import type { Subject, Grade, AppTask, Lesson, AppSettings, GradingSystemConfig, SchoolYear, Photo } from '@/types';
import type { SupabaseUser } from '@/lib/supabase';
import { applyTheme, resolveThemeId } from '@/lib/themes';
import { applyVisualSettings, bindAutoModeWatcher } from '@/lib/visualSettings';

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
  };
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
}

export type LiveSyncStatus = 'off' | 'connecting' | 'live' | 'error';

interface State {
  loaded: boolean;
  settings: AppSettings | null;
  subjects: Subject[];
  grades: Grade[];
  tasks: AppTask[];
  lessons: Lesson[];
  schoolYears: SchoolYear[];
  /** Aktive Schuljahr-ID. Wenn null, gibt es noch keine. */
  activeSchoolYearId: string | null;
  authUser: SupabaseUser | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncedAt: number | null;
  /** Verbindungsstatus des Realtime-Channels. */
  liveSync: LiveSyncStatus;

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

  addSubject: (s: Omit<Subject, 'id' | 'createdAt'>) => Promise<Subject>;
  updateSubject: (id: string, patch: Partial<Subject>) => Promise<void>;
  deleteSubject: (id: string) => Promise<void>;

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

  addSchoolYear: (opts: NewYearOptions) => Promise<SchoolYear>;
  updateSchoolYear: (id: string, patch: Partial<SchoolYear>) => Promise<void>;
  deleteSchoolYear: (id: string, mode?: 'wipe' | 'orphan') => Promise<void>;
  setActiveSchoolYear: (id: string) => Promise<void>;
}

// ─── Modul-Singletons für Auth-Listener / Visibility-Listener ─────────────
let authListenerBound = false;
let visibilityListenerBound = false;
let autoSyncRunning = false;

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
  tasks: [],
  lessons: [],
  schoolYears: [],
  activeSchoolYearId: null,
  authUser: null,
  syncStatus: 'idle',
  lastSyncedAt: null,
  liveSync: 'off',

  async load() {
    const [storedSettings, allSubjects, allGrades, allTasks, allLessons, allYears] = await Promise.all([
      db.settings.get('app'),
      db.subjects.toArray(),
      db.grades.toArray(),
      db.tasks.toArray(),
      db.lessons.toArray(),
      db.schoolYears.toArray(),
    ]);
    const settings = storedSettings ? mergeSettings(storedSettings) : null;
    if (settings) {
      applyTheme(settings.colorTheme);
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

    set({
      loaded: true,
      settings,
      activeSchoolYearId: activeId,
      schoolYears: years.sort((a, b) => b.startDate - a.startDate),
      subjects: migratedSubjects.filter(subjFilter).sort((a, b) => a.name.localeCompare(b.name, 'de')),
      grades: allGrades.filter(subjFilter),
      tasks: allTasks.filter(subjFilter).sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)),
      lessons: allLessons.filter(subjFilter),
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
    applyTheme(next.colorTheme);
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
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  },

  async signOut() {
    if (!supabase) return;
    get().stopAutoSync();
    await supabase.auth.signOut();
    set({ authUser: null, lastSyncedAt: null });
  },

  async startAutoSync() {
    const { authUser } = get();
    if (!authUser || !supabase) return;
    if (autoSyncRunning) return;
    autoSyncRunning = true;

    set({ syncStatus: 'syncing', liveSync: 'connecting' });
    try {
      // Erst lokale Daten hochladen (eigene Edits behalten), dann Cloud-Stand ziehen.
      // → Konflikte: local-row gewinnt für IDs, die beide Seiten haben (gewünscht beim Geräte-Login).
      await uploadAll(authUser.id);
      await downloadAll(authUser.id);
      await get().load(); // State frisch aus Dexie ziehen
      set({ syncStatus: 'idle', lastSyncedAt: Date.now() });
    } catch (e) {
      console.warn('Auto-Sync Initial-Push/Pull fehlgeschlagen:', e);
      set({ syncStatus: 'error' });
    }

    // Realtime-Subscription für alle Tabellen
    startRealtime(authUser.id, {
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
        if (status === 'connected') set({ liveSync: 'live' });
        else if (status === 'connecting') set({ liveSync: 'connecting' });
        else if (status === 'error') set({ liveSync: 'error' });
        else if (status === 'closed') set({ liveSync: 'off' });
      },
    });
  },

  stopAutoSync() {
    stopRealtime();
    autoSyncRunning = false;
    set({ liveSync: 'off' });
  },

  async syncNow() {
    const { authUser } = get();
    if (!authUser) return;
    set({ syncStatus: 'syncing' });
    try {
      await uploadAll(authUser.id);
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
      const pulled = await downloadAll(authUser.id);
      if (pulled) await get().load();
      set({ syncStatus: 'idle', lastSyncedAt: Date.now() });
      return pulled;
    } catch {
      set({ syncStatus: 'error' });
      return false;
    }
  },

  async addSubject(s) {
    const yid = get().activeSchoolYearId ?? undefined;
    const subj: Subject = { ...s, id: uid(), createdAt: Date.now(), schoolYearId: s.schoolYearId ?? yid };
    await db.subjects.add(subj);
    if (!yid || subj.schoolYearId === yid) {
      set(state => ({ subjects: [...state.subjects, subj].sort((a, b) => a.name.localeCompare(b.name, 'de')) }));
    }
    const { authUser } = get();
    if (authUser) syncRow('subjects', subj.id, subj, authUser.id);
    return subj;
  },
  async updateSubject(id, patch) {
    await db.subjects.update(id, patch);
    set(state => ({
      subjects: state.subjects.map(s => s.id === id ? { ...s, ...patch } : s).sort((a, b) => a.name.localeCompare(b.name, 'de')),
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

  async addGrade(g) {
    const subj = get().subjects.find(s => s.id === g.subjectId);
    const yid = subj?.schoolYearId ?? get().activeSchoolYearId ?? undefined;
    const grade: Grade = { ...g, id: g.id ?? uid(), schoolYearId: g.schoolYearId ?? yid } as Grade;
    await db.grades.add(grade);
    set(state => ({ grades: [...state.grades, grade] }));
    const { authUser } = get();
    if (authUser) syncRow('grades', grade.id, grade, authUser.id);
    return grade;
  },
  async updateGrade(id, patch) {
    await db.grades.update(id, patch);
    set(state => ({ grades: state.grades.map(g => g.id === id ? { ...g, ...patch } : g) }));
    const updated = await db.grades.get(id);
    const { authUser } = get();
    if (authUser && updated) syncRow('grades', id, updated, authUser.id);
  },
  async deleteGrade(id) {
    await db.grades.delete(id);
    set(state => ({ grades: state.grades.filter(g => g.id !== id) }));
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
    return task;
  },
  async updateTask(id, patch) {
    await db.tasks.update(id, patch);
    set(state => ({ tasks: state.tasks.map(t => t.id === id ? { ...t, ...patch } : t).sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)) }));
    const updated = await db.tasks.get(id);
    const { authUser } = get();
    if (authUser && updated) syncRow('tasks', id, updated, authUser.id);
  },
  async toggleTask(id) {
    const t = get().tasks.find(x => x.id === id);
    if (!t) return;
    const next = !t.done;
    await get().updateTask(id, { done: next, doneAt: next ? Date.now() : undefined });
  },
  async deleteTask(id) {
    await db.tasks.delete(id);
    set(state => ({ tasks: state.tasks.filter(t => t.id !== id) }));
    const { authUser } = get();
    if (authUser) deleteRow('tasks', id);
  },

  async addLesson(l) {
    const subj = get().subjects.find(s => s.id === l.subjectId);
    const yid = subj?.schoolYearId ?? get().activeSchoolYearId ?? undefined;
    const lesson: Lesson = { ...l, id: uid(), schoolYearId: l.schoolYearId ?? yid };
    await db.lessons.add(lesson);
    set(state => ({ lessons: [...state.lessons, lesson] }));
    const { authUser } = get();
    if (authUser) syncRow('lessons', lesson.id, lesson, authUser.id);
    return lesson;
  },
  async updateLesson(id, patch) {
    await db.lessons.update(id, patch);
    set(state => ({ lessons: state.lessons.map(l => l.id === id ? { ...l, ...patch } : l) }));
    const updated = await db.lessons.get(id);
    const { authUser } = get();
    if (authUser && updated) syncRow('lessons', id, updated, authUser.id);
  },
  async deleteLesson(id) {
    await db.lessons.delete(id);
    set(state => ({ lessons: state.lessons.filter(l => l.id !== id) }));
    const { authUser } = get();
    if (authUser) deleteRow('lessons', id);
  },

  async addSchoolYear(opts) {
    const year: SchoolYear = {
      id: uid(),
      name: opts.name.trim() || suggestYearName(),
      startDate: opts.startDate,
      endDate: opts.endDate,
      active: true, // neues Jahr direkt aktiv
      createdAt: Date.now(),
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
}));

// ─── Realtime-Handler ────────────────────────────────────────────────────
// Werden in startAutoSync() registriert und beim Stop wieder unsubscribed.

type SetFn = (partial: Partial<State> | ((state: State) => Partial<State>)) => void;
type GetFn = () => State;

async function applyRealtimeUpsert(table: SyncTable, raw: unknown, set: SetFn, get: GetFn): Promise<void> {
  const data = raw as Record<string, unknown> & { id: string };
  if (!data || typeof data !== 'object' || !data.id) return;

  switch (table) {
    case 'subjects': {
      const subj = data as unknown as Subject;
      await db.subjects.put(subj);
      const yid = get().activeSchoolYearId;
      if (!yid || subj.schoolYearId === yid) {
        set(state => ({
          subjects: upsertById(state.subjects, subj).sort((a, b) => a.name.localeCompare(b.name, 'de')),
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
      if (!yid || grade.schoolYearId === yid) {
        set(state => ({ grades: upsertById(state.grades, grade) }));
      } else {
        set(state => ({ grades: state.grades.filter(g => g.id !== grade.id) }));
      }
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
  }
}

async function applyRealtimeDelete(table: SyncTable, id: string, set: SetFn, get: GetFn): Promise<void> {
  switch (table) {
    case 'subjects':
      await db.subjects.delete(id);
      set(state => ({
        subjects: state.subjects.filter(s => s.id !== id),
        grades: state.grades.filter(g => g.subjectId !== id),
        tasks: state.tasks.filter(t => t.subjectId !== id),
        lessons: state.lessons.filter(l => l.subjectId !== id),
      }));
      break;
    case 'grades':
      await db.grades.delete(id);
      set(state => ({ grades: state.grades.filter(g => g.id !== id) }));
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
  }
}

async function applyRealtimeSettings(data: AppSettings, set: SetFn): Promise<void> {
  const merged = mergeSettings({ ...data, id: 'app' });
  await db.settings.put(merged);
  applyTheme(merged.colorTheme);
  applyVisualSettings(merged);
  set({ settings: merged });
}
