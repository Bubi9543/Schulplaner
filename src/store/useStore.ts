import { create } from 'zustand';
import { db, uid } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { syncRow, syncSettings, deleteRow, uploadAll, downloadAll } from '@/lib/sync';
import { DEFAULT_GRADING_CONFIG, DEFAULT_SETTINGS } from '@/types';
import type { Subject, Grade, AppTask, Lesson, AppSettings, GradingSystemConfig, SchoolYear } from '@/types';
import type { SupabaseUser } from '@/lib/supabase';

function mergeSettings(stored: Partial<AppSettings> | undefined): AppSettings {
  const base: AppSettings = { ...DEFAULT_SETTINGS, id: 'app' };
  if (!stored) return base;
  const merged: AppSettings = { ...base, ...stored, id: 'app' };
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

interface State {
  loaded: boolean;
  settings: AppSettings | null;
  subjects: Subject[];
  grades: Grade[];
  tasks: AppTask[];
  lessons: Lesson[];
  schoolYears: SchoolYear[];
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

  addSchoolYear: (y: Omit<SchoolYear, 'id' | 'createdAt'>) => Promise<SchoolYear>;
  updateSchoolYear: (id: string, patch: Partial<SchoolYear>) => Promise<void>;
  deleteSchoolYear: (id: string) => Promise<void>;
  setActiveSchoolYear: (id: string) => Promise<void>;
}

export const useStore = create<State>((set, get) => ({
  loaded: false,
  settings: null,
  subjects: [],
  grades: [],
  tasks: [],
  lessons: [],
  schoolYears: [],
  authUser: null,
  syncStatus: 'idle',
  lastSyncedAt: null,

  async load() {
    const [storedSettings, subjects, grades, tasks, lessons, schoolYears] = await Promise.all([
      db.settings.get('app'),
      db.subjects.toArray(),
      db.grades.toArray(),
      db.tasks.toArray(),
      db.lessons.toArray(),
      db.schoolYears.toArray(),
    ]);
    const settings = storedSettings ? mergeSettings(storedSettings) : null;
    set({
      loaded: true,
      settings,
      subjects: subjects.sort((a, b) => a.name.localeCompare(b.name, 'de')),
      grades,
      tasks: tasks.sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)),
      lessons,
      schoolYears: schoolYears.sort((a, b) => b.startDate - a.startDate),
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
    const subj: Subject = { ...s, id: uid(), createdAt: Date.now() };
    await db.subjects.add(subj);
    set(state => ({ subjects: [...state.subjects, subj].sort((a, b) => a.name.localeCompare(b.name, 'de')) }));
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
    const grade: Grade = { ...g, id: g.id ?? uid() } as Grade;
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
    const task: AppTask = { ...t, id: t.id ?? uid(), createdAt: Date.now() } as AppTask;
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
    const lesson: Lesson = { ...l, id: uid() };
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

  async addSchoolYear(y) {
    const year: SchoolYear = { ...y, id: uid(), createdAt: Date.now() };
    await db.schoolYears.add(year);
    set(state => ({ schoolYears: [year, ...state.schoolYears] }));
    return year;
  },
  async updateSchoolYear(id, patch) {
    await db.schoolYears.update(id, patch);
    set(state => ({ schoolYears: state.schoolYears.map(y => y.id === id ? { ...y, ...patch } : y) }));
  },
  async deleteSchoolYear(id) {
    await db.schoolYears.delete(id);
    set(state => ({ schoolYears: state.schoolYears.filter(y => y.id !== id) }));
  },
  async setActiveSchoolYear(id) {
    const years = get().schoolYears;
    await db.schoolYears.bulkPut(years.map(y => ({ ...y, active: y.id === id })));
    set(state => ({ schoolYears: state.schoolYears.map(y => ({ ...y, active: y.id === id })) }));
  },
}));
