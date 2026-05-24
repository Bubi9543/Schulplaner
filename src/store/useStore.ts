import { create } from 'zustand';
import { db, uid } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { syncRow, syncSettings, deleteRow, uploadAll, downloadAll } from '@/lib/sync';
import { DEFAULT_GRADING_CONFIG, DEFAULT_SETTINGS, normalizeSubjectCategory } from '@/types';
import type { Subject, Grade, AppTask, Lesson, AppSettings, GradingSystemConfig, SchoolYear } from '@/types';
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

export interface NewYearOptions {
  name: string;
  startDate: number;
  endDate?: number;
  copySubjectsFromYearId?: string;
  copyLessonsFromYearId?: string;
}

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

  load: () => Promise<void>;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setGradingConfig: (patch: Partial<GradingSystemConfig>) => Promise<void>;

  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
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

    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        set({ authUser: { id: session.user.id, email: session.user.email } });
      }
      supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user ?? null;
        set({ authUser: user ? { id: user.id, email: user.email } : null });
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
      set({ authUser: { id: data.user.id, email: data.user.email } });
      await get().syncNow();
    }
    return null;
  },

  async signUp(email, password) {
    if (!supabase) return 'Supabase nicht konfiguriert.';
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return error.message;
    if (data.user) {
      set({ authUser: { id: data.user.id, email: data.user.email } });
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
    await supabase.auth.signOut();
    set({ authUser: null, lastSyncedAt: null });
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
    const updated = get().subjects.find(s => s.id === id);
    const { authUser } = get();
    if (authUser && updated) syncRow('subjects', id, updated, authUser.id);
  },
  async deleteSubject(id) {
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
      supabase?.from('grades').delete().eq('id', id);
      supabase?.from('tasks').delete().eq('id', id);
      supabase?.from('lessons').delete().eq('id', id);
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
    const updated = get().grades.find(g => g.id === id);
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
    const updated = get().tasks.find(t => t.id === id);
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
    const updated = get().lessons.find(l => l.id === id);
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
    await db.transaction('rw', db.schoolYears, async () => {
      await db.schoolYears.bulkPut(existing.map(y => ({ ...y, active: false })));
      await db.schoolYears.add(year);
    });

    // Optional: Fächer (und damit Stundenplan) aus anderem Jahr kopieren
    if (opts.copySubjectsFromYearId) {
      const sourceYearId = opts.copySubjectsFromYearId;
      const sourceSubjects = await db.subjects.where('schoolYearId').equals(sourceYearId).toArray();
      const idMap = new Map<string, string>();
      const newSubjects: Subject[] = sourceSubjects.map(s => {
        const newId = uid();
        idMap.set(s.id, newId);
        return { ...s, id: newId, schoolYearId: year.id, createdAt: Date.now() };
      });
      if (newSubjects.length) await db.subjects.bulkAdd(newSubjects);

      if (opts.copyLessonsFromYearId) {
        const sourceLessons = await db.lessons.where('schoolYearId').equals(sourceYearId).toArray();
        const newLessons: Lesson[] = [];
        for (const l of sourceLessons) {
          const newSubjId = idMap.get(l.subjectId);
          if (!newSubjId) continue;
          newLessons.push({ ...l, id: uid(), subjectId: newSubjId, schoolYearId: year.id });
        }
        if (newLessons.length) await db.lessons.bulkAdd(newLessons);
      }
    }

    // Reload um neuen Filter-State herzustellen
    await get().load();
    return year;
  },
  async updateSchoolYear(id, patch) {
    await db.schoolYears.update(id, patch);
    set(state => ({ schoolYears: state.schoolYears.map(y => y.id === id ? { ...y, ...patch } : y) }));
  },
  async deleteSchoolYear(id, mode = 'wipe') {
    const wasActive = get().activeSchoolYearId === id;
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
      // Anderes Jahr aktivieren
      const remaining = await db.schoolYears.toArray();
      if (remaining.length > 0) {
        await get().setActiveSchoolYear(remaining[0].id);
      } else {
        set({ schoolYears: [], activeSchoolYearId: null, subjects: [], grades: [], tasks: [], lessons: [] });
      }
    } else {
      set(state => ({ schoolYears: state.schoolYears.filter(y => y.id !== id) }));
    }
  },
  async setActiveSchoolYear(id) {
    const years = get().schoolYears;
    const updated = years.map(y => ({ ...y, active: y.id === id }));
    await db.schoolYears.bulkPut(updated);
    set({ activeSchoolYearId: id, schoolYears: updated });
    // Re-load all data filtered by new active year
    await get().load();
  },
}));
