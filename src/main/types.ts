export interface Destination {
  id: string
  name: string
  path: string
}

export interface TaskConfig {
  id: string
  name: string
  projectName: string
  dateRangeStart: string
  dateRangeEnd: string
  operator: string
  sourcePaths: string[]
  destinations: string[]  // destination IDs
  verify: boolean
  generateReport: boolean
  reportFormat: 'txt'
  fx3Rename?: boolean
  fx3Logs?: string[]
  destinationOverrides?: Record<string, string>  // destId → overridden path
}

export interface FileProgress {
  file: string
  bytesCopied: number
  totalBytes: number
}

export interface ProgressPayload {
  taskId: string
  phase: 'scanning' | 'copying' | 'verifying' | 'done' | 'error' | 'cancelled'
  filesTotal: number
  filesDone: number
  bytesTotal: number
  bytesDone: number
  currentFile: string
  speedBps?: number
  etaSec?: number
  logLines?: string[]
  sourceBytes?: number
  destBytes?: number
  verificationOk?: boolean
  error?: string
  reportPath?: string
  destIndex?: number
}

export interface DestinationVerification {
  destId: string
  name: string
  path: string
  ok: boolean
  actualBytes: number
  failedFiles?: { rel: string; size: number }[]
}

export interface BackupRecord {
  id: string
  taskId: string
  taskName: string
  startedAt: string
  finishedAt: string
  filesTotal: number
  bytesTotal: number
  status: 'success' | 'failed' | 'cancelled'
  verificationOk?: boolean
  sourceBytes?: number
  destBytes?: number
  destinationVerification?: DestinationVerification[]
  reportPath?: string
  errorMessage?: string
  sourcePaths?: string[]
  destinationPaths?: { name: string; path: string }[]
  dateRangeStart?: string
  dateRangeEnd?: string
  operator?: string
  logs?: string[]
}

export interface Settings {
  destinations: Destination[]
  defaultVerify: boolean
  defaultReport: boolean
  defaultReportFormat: 'txt'
  lang: 'zh' | 'en'
  webhookUrl?: string
}
