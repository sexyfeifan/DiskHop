import { create } from 'zustand'
import type { TaskConfig, BackupRecord, Settings, ProgressPayload } from '../../../main/types'
import { getT } from '../i18n'
import type { Lang } from '../i18n'

export type Page = 'dashboard' | 'progress' | 'history' | 'settings'

interface BackupStore {
  activePage: Page
  setActivePage: (p: Page) => void

  settings: Settings
  setSettings: (s: Settings) => void

  history: BackupRecord[]
  setHistory: (h: BackupRecord[]) => void

  activeTask: TaskConfig | null
  setActiveTask: (t: TaskConfig | null) => void

  progress: ProgressPayload | null
  setProgress: (p: ProgressPayload | null) => void

  lang: Lang
  setLang: (l: Lang) => void
  t: (key: Parameters<ReturnType<typeof getT>>[0]) => string
}

/** Global Zustand store for DiskHop UI state (page, settings, history, progress). */
export const useBackupStore = create<BackupStore>((set, get) => ({
  activePage: 'dashboard',
  setActivePage: (p) => set({ activePage: p }),

  settings: { destinations: [], defaultVerify: true, defaultReport: true, defaultReportFormat: 'txt', lang: 'zh' },
  setSettings: (s) => {
    set({ settings: s, lang: s.lang ?? 'zh', t: getT(s.lang ?? 'zh') })
  },

  history: [],
  setHistory: (h) => set({ history: h }),

  activeTask: null,
  setActiveTask: (t) => set({ activeTask: t }),

  progress: null,
  setProgress: (p) => set({ progress: p }),

  lang: 'zh',
  setLang: (l) => set({ lang: l, t: getT(l) }),
  t: getT('zh'),
}))
