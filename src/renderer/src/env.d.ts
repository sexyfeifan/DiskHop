import type { TaskConfig, Settings, BackupRecord, ProgressPayload } from '../../main/types'

declare global {
  interface Window {
    api: {
      pickFolder: () => Promise<string | null>
      pickFolders: () => Promise<string[]>
      startBackup: (config: TaskConfig) => Promise<{ success: boolean; error?: string }>
      cancelBackup: (taskId: string) => Promise<void>
      onProgress: (cb: (payload: ProgressPayload) => void) => () => void
      getHistory: () => Promise<BackupRecord[]>
      clearHistory: () => Promise<void>
      deleteHistoryRecord: (id: string) => Promise<void>
      getSettings: () => Promise<Settings>
      saveSettings: (settings: Settings) => Promise<void>
      showInFinder: (path: string) => Promise<void>
      openFile: (path: string) => Promise<void>
      openExternal: (url: string) => Promise<void>
      reportSaveAs: (reportPath: string) => Promise<string | undefined>
      openDownloads: () => Promise<void>
      fileExists: (path: string) => Promise<boolean>
      getVersion: () => Promise<string>
      listVolumes: () => Promise<{ name: string; path: string; totalBytes: number; freeBytes: number; format: string }[]>
      ejectVolume: (mountPoint: string) => Promise<{ success: boolean; error?: string }>
      listDir: (dirPath: string) => Promise<{ name: string; path: string }[]>
      mkdir: (dirPath: string) => Promise<{ success: boolean; error?: string }>
      testWebhook: (url: string) => Promise<{ ok: boolean; status: number }>
      fx3Scan: (sourcePaths: string[]) => Promise<{ srcPath: string; untitledPath: string; suggestedName: string; videoFile: string }[]>
    }
  }
}
