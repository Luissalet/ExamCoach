import { create } from 'zustand';
import type { Subject, Topic, Question, PracticeSession, AppSettings } from '@/domain/models';
import { subjectRepo, topicRepo, questionRepo, sessionRepo } from '@/data/repos';
import { getSettings, saveSettings } from '@/data/db';
import { syncWithGlobalBank, type GlobalBankSyncResult } from '@/data/globalBank';

interface AppStore {
  // Data
  subjects: Subject[];
  topics: Topic[];
  questions: Question[];
  currentSession: PracticeSession | null;
  settings: AppSettings;

  // Loading state
  loading: boolean;
  error: string | null;

  // Global bank sync state
  syncing: boolean;
  lastSyncResult: GlobalBankSyncResult | null;

  // Actions - Subjects
  loadSubjects: () => Promise<void>;
  createSubject: (data: Omit<Subject, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Subject>;
  updateSubject: (id: string, data: Partial<Subject>) => Promise<void>;
  deleteSubject: (id: string) => Promise<void>;

  // Actions - Topics
  loadTopics: (subjectId: string) => Promise<void>;
  createTopic: (data: Omit<Topic, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Topic>;
  updateTopic: (id: string, data: Partial<Topic>) => Promise<void>;
  deleteTopic: (id: string) => Promise<void>;

  // Actions - Questions
  loadQuestions: (subjectId: string) => Promise<void>;
  createQuestion: (data: Omit<Question, 'id' | 'stats' | 'createdAt' | 'updatedAt' | 'contentHash'>) => Promise<Question>;
  updateQuestion: (id: string, data: Partial<Question>) => Promise<void>;
  deleteQuestion: (id: string) => Promise<void>;
  duplicateQuestion: (id: string) => Promise<void>;

  // Actions - Sessions
  setCurrentSession: (session: PracticeSession | null) => void;
  loadSession: (id: string) => Promise<void>;

  // Actions - Settings
  loadSettings: () => Promise<void>;
  updateSettings: (data: Partial<AppSettings>) => Promise<void>;

  // Actions - Global bank
  /**
   * Sincroniza con /data/global-bank.json.
   * - Primera vez (nunca sincronizado): siempre lo hace.
   * - Siguientes veces: solo si force=true o han pasado más de 1h.
   * - Es idempotente: deduplicación por contentHash.
   */
  syncGlobalBank: (force?: boolean) => Promise<GlobalBankSyncResult | null>;
}

export const useStore = create<AppStore>((set, get) => ({
  subjects: [],
  topics: [],
  questions: [],
  currentSession: null,
  settings: { alias: '', importedPackIds: [] },
  loading: false,
  error: null,
  syncing: false,
  lastSyncResult: null,

  loadSubjects: async () => {
    set({ loading: true });
    try {
      const subjects = await subjectRepo.getAll();
      set({ subjects, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  createSubject: async (data) => {
    const subject = await subjectRepo.create(data);
    set((s) => ({ subjects: [...s.subjects, subject] }));
    return subject;
  },

  updateSubject: async (id, data) => {
    await subjectRepo.update(id, data);
    set((s) => ({
      subjects: s.subjects.map((sub) => (sub.id === id ? { ...sub, ...data } : sub)),
    }));
  },

  deleteSubject: async (id) => {
    await subjectRepo.delete(id);
    set((s) => ({ subjects: s.subjects.filter((sub) => sub.id !== id) }));
  },

  loadTopics: async (subjectId) => {
    const topics = await topicRepo.getBySubject(subjectId);
    set({ topics });
  },

  createTopic: async (data) => {
    const topic = await topicRepo.create(data);
    set((s) => ({ topics: [...s.topics, topic] }));
    return topic;
  },

  updateTopic: async (id, data) => {
    await topicRepo.update(id, data);
    set((s) => ({
      topics: s.topics.map((t) => (t.id === id ? { ...t, ...data } : t)),
    }));
  },

  deleteTopic: async (id) => {
    await topicRepo.delete(id);
    set((s) => ({
      topics: s.topics.filter((t) => t.id !== id),
      questions: s.questions.filter((q) => q.topicId !== id),
    }));
  },

  loadQuestions: async (subjectId) => {
    const questions = await questionRepo.getBySubject(subjectId);
    set({ questions });
  },

  createQuestion: async (data) => {
    const { settings } = get();
    const question = await questionRepo.create(data, settings.alias);
    set((s) => ({ questions: [...s.questions, question] }));
    return question;
  },

  updateQuestion: async (id, data) => {
    await questionRepo.update(id, data);
    set((s) => ({
      questions: s.questions.map((q) => (q.id === id ? { ...q, ...data } : q)),
    }));
  },

  deleteQuestion: async (id) => {
    await questionRepo.delete(id);
    set((s) => ({ questions: s.questions.filter((q) => q.id !== id) }));
  },

  duplicateQuestion: async (id) => {
    const copy = await questionRepo.duplicate(id);
    set((s) => ({ questions: [...s.questions, copy] }));
  },

  setCurrentSession: (session) => set({ currentSession: session }),

  loadSession: async (id) => {
    const session = await sessionRepo.getById(id);
    set({ currentSession: session ?? null });
  },

  loadSettings: async () => {
    const settings = await getSettings();
    set({ settings });
  },

  updateSettings: async (data) => {
    await saveSettings(data);
    set((s) => ({ settings: { ...s.settings, ...data } }));
  },

  syncGlobalBank: async (force = false) => {
    const { syncing, settings } = get();
    if (syncing) return null;

    // Decidir si sincronizar
    if (!force && settings.globalBankSyncedAt) {
      const lastSync = new Date(settings.globalBankSyncedAt).getTime();
      const oneHour = 60 * 60 * 1000;
      if (Date.now() - lastSync < oneHour) {
        // Menos de 1h desde la última sync → no volver a hacerlo automáticamente
        return null;
      }
    }

    set({ syncing: true });
    try {
      const result = await syncWithGlobalBank();
      // Si hubo cambios, recargar asignaturas
      if (result.subjectsAdded > 0 || result.topicsAdded > 0 || result.questionsAdded > 0) {
        const subjects = await subjectRepo.getAll();
        set({ subjects });
      }
      // Actualizar settings en memoria
      const updatedSettings = await getSettings();
      set({ settings: updatedSettings, lastSyncResult: result, syncing: false });
      return result;
    } catch (e) {
      set({ syncing: false });
      return null;
    }
  },
}));