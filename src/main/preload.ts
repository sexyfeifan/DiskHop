import { contextBridge, ipcRenderer } from 'electron'
import type { TaskConfig, Settings } from './types'

contextBridge.exposeInMainWorld('api', {
  // File/folder dialogs
  pickFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickFolder'),

  pickFolders: (): Promise<string[]> =>
    ipcRenderer.invoke('dialog:pickFolders'),

  // Tasks
  startBackup: (config: TaskConfig): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('backup:start', config),

  cancelBackup: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('backup:cancel', taskId),

  onProgress: (cb: (payload: import('./types').ProgressPayload) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: import('./types').ProgressPayload) => cb(payload)
    ipcRenderer.on('backup:progress', handler)
    return () => ipcRenderer.removeListener('backup:progress', handler)
  },

  // History
  getHistory: (): Promise<import('./types').BackupRecord[]> =>
    ipcRenderer.invoke('history:get'),

  clearHistory: (): Promise<void> =>
    ipcRenderer.invoke('history:clear'),

  deleteHistoryRecord: (id: string): Promise<void> =>
    ipcRenderer.invoke('history:deleteRecord', id),

  // Settings
  getSettings: (): Promise<Settings> =>
    ipcRenderer.invoke('settings:get'),

  saveSettings: (settings: Settings): Promise<void> =>
    ipcRenderer.invoke('settings:save', settings),

  // Shell
  showInFinder: (path: string): Promise<void> =>
    ipcRenderer.invoke('shell:showInFinder', path),

  openFile: (path: string): Promise<void> =>
    ipcRenderer.invoke('shell:openFile', path),

  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),

  openDownloads: (): Promise<void> =>
    ipcRenderer.invoke('shell:getDownloadsPath').then((dir: string) =>
      ipcRenderer.invoke('shell:openFile', dir)
    ),

  fileExists: (path: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:fileExists', path),

  getVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:getVersion'),

  listVolumes: (): Promise<{ name: string; path: string; totalBytes: number; freeBytes: number; format: string }[]> =>
    ipcRenderer.invoke('shell:listVolumes'),

  // Report
  reportSaveAs: (reportPath: string): Promise<string | undefined> =>
    ipcRenderer.invoke('report:saveAs', reportPath),

  ejectVolume: (mountPoint: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:ejectVolume', mountPoint),

  listDir: (dirPath: string): Promise<{ name: string; path: string }[]> =>
    ipcRenderer.invoke('shell:listDir', dirPath),

  mkdir: (dirPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:mkdir', dirPath),

  testWebhook: (url: string): Promise<{ ok: boolean; status: number }> =>
    ipcRenderer.invoke('shell:testWebhook', url),

  // FX3
  fx3Scan: (sourcePaths: string[]): Promise<{ srcPath: string; untitledPath: string; suggestedName: string; videoFile: string }[]> =>
    ipcRenderer.invoke('fx3:scan', sourcePaths),
})
