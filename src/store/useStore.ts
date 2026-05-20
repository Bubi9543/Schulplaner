import { create } from 'zustand';
import { db, uid } from '@/lib/db';
import { DEFAULT_GRADING_CONFIG, DEFAULT_SETTINGS } from '@/types';
import type { Subject, Grade, AppTask, Lesson, AppSettings, GradingSystemConfig } from '@/types';

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

  load: () => Promise<void>;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setGradingConfig: (patch: Partial<GradingSystemConfig>) => Promise<void>;

  addSubject: (s: Omit<Subject, 'id' | 'createdAt'>) => Promise<Subject>;
  updateSubject: (id: string, patch: Partial<Subject>) => Promise<void>;
  deleteSubject: (id: string) => Promise<void>;

  addGrade: (g: Omit<Grade, 'id'>) => Promise<Grade>;
  updateGrade: (id: string, patch: Partial<Grade>) => Promise<void>;
  deleteGrade: (id: string) => Promise<void>;

  addTask: (t: Omit<AppTask, 'id' | 'createdAt'>) => Promise<AppTask>;
  updateTask: (id: string, patch: Partial<AppTask>) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  addLesson: (l: Omit<Lesson, 'id'>) => Promise<Lesson>;
  updateLesson: (id: string, patch: Partial<Lesson>) => Promise<void>;
  deleteLesson: (id: string) => Promise<void>;
}

export const useStore = create<State>((set, get) => ({
  loaded: false,
  settings: null,
  subjects: [],
  grades: [],
  tasks: [],
  lessons: [],

  async load() {
    const [storedSettings, subjects, grades, tasks, lessons] = await Promise.all([
      db.settings.get('app'),
      db.subjects.toArray(),
      db.grades.toArray(),
      db.tasks.toArray(),
      db.lessons.toArray(),
    ]);
    const settings = storedSettings ? mergeSettings(storedSettings) : null;
    set({
      loaded: true,
      settings,
      subjects: subjects.sort((a, b) => a.name.localeCompare(b.name, 'de')),
      grades,
      tasks: tasks.sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)),
      lessons,
    });
  },

  async setSettings(patch) {
    const current = get().settings ?? mergeSettings(undefined);
    const next: AppSettings = mergeSettings({ ...current, ...patch });
    await db.settings.put(next);
    set({ settings: next });
  },

  async setGradingConfig(patch) {
    const current = get().settings ?? mergeSettings(undefined);
    const merged: GradingSystemConfig = mergeGradingConfig({ ...current.gradingConfig, ...patch });
    const next: AppSettings = { ...current, gradingConfig: merged };
    await db.settings.put(next);
    set({ settings: next });
  },

  async addSubject(s) {
    const subj: Subject = { ...s, id: uid(), createdAt: Date.now() };
    await db.subjects.add(subj);
    set(state => ({ subjects: [...state.subjects, subj].sort((a, b) => a.name.localeCompare(b.name, 'de')) }));
    return subj;
  },
  async updateSubject(id, patch) {
    await db.subjects.update(id, patch);
    set(state => ({
      subjects: state.subjects.map(s => s.id === id ? { ...s, ...patch } : s).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    }));
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
  },

  async addGrade(g) {
    const grade: Grade = { ...g, id: uid() };
    await db.grades.add(grade);
    set(state => ({ grades: [...state.grades, grade] }));
    return grade;
  },
  async updateGrade(id, patch) {
    await db.grades.update(id, patch);
    set(state => ({ grades: state.grades.map(g => g.id === id ? { ...g, ...patch } : g) }));
  },
  async deleteGrade(id) {
    await db.grades.delete(id);
    set(state => ({ grades: state.grades.filter(g => g.id !== id) }));
  },

  async addTask(t) {
    const task: AppTask = { ...t, id: uid(), createdAt: Date.now() };
    await db.tasks.add(task);
    set(state => ({ tasks: [...state.tasks, task].sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)) }));
    return task;
  },
  async updateTask(id, patch) {
    await db.tasks.update(id, patch);
    set(state => ({ tasks: state.tasks.map(t => t.id === id ? { ...t, ...patch } : t).sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)) }));
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
  },

  async addLesson(l) {
    const lesson: Lesson = { ...l, id: uid() };
    await db.lessons.add(lesson);
    set(state => ({ lessons: [...state.lessons, lesson] }));
    return lesson;
  },
  async updateLesson(id, patch) {
    await db.lessons.update(id, patch);
    set(state => ({ lessons: state.lessons.map(l => l.id === id ? { ...l, ...patch } : l) }));
  },
  async deleteLesson(id) {
    await db.lessons.delete(id);
    set(state => ({ lessons: state.lessons.filter(l => l.id !== id) }));
  },
}));
