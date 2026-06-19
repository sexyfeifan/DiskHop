import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join, basename } from 'path'
import { readFile, writeFile, mkdir, readdir, rename as fsRename } from 'fs/promises'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { TaskConfig, Settings, BackupRecord } from './types'
import { BackupEngine } from './backup/BackupEngine'
import { ReportGenerator, buildWebhookText } from './backup/ReportGenerator'

const execFileAsync = promisify(execFile)

function buildWebhookPayload(url: string, text: string): object {
  if (url.includes('open.feishu.cn') || url.includes('open.larksuite.com')) {
    return { msg_type: 'text', content: { text } }
  }
  if (url.includes('oapi.dingtalk.com')) {
    return { msgtype: 'text', text: { content: text } }
  }
  if (url.includes('qyapi.weixin.qq.com')) {
    return { msgtype: 'text', text: { content: text } }
  }
  if (url.includes('discord.com/api/webhooks')) {
    return { content: text }
  }
  // Slack / generic
  return { text }
}

async function sendWebhook(url: string, text: string, retries = 3) {
  const payload = buildWebhookPayload(url, text)
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) return
      console.error(`[webhook] HTTP ${res.status} (attempt ${attempt}/${retries})`)
    } catch (err) {
      console.error(`[webhook] fetch failed (attempt ${attempt}/${retries}):`, err)
    }
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
  }
}

const isDev = !app.isPackaged
const DATA_DIR = join(app.getPath('home'), '.diskhop')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')
const HISTORY_FILE = join(DATA_DIR, 'history.json')
// 【Fix 5】进度持久化：进度快照文件路径
const PROGRESS_FILE = join(DATA_DIR, 'progress.json')
const GITHUB_REPO = 'sexyfeifan/DiskHop'

let mainWindow: BrowserWindow | null = null
const activeEngines = new Map<string, BackupEngine>()

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
}

async function loadSettings(): Promise<Settings> {
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { destinations: [], defaultVerify: true, defaultReport: true, defaultReportFormat: 'txt', lang: 'zh' as const }
  }
}

async function saveSettings(settings: Settings) {
  await ensureDataDir()
  await writeFile(SETTINGS_FILE + '.tmp', JSON.stringify(settings, null, 2), 'utf-8')
  await fsRename(SETTINGS_FILE + '.tmp', SETTINGS_FILE)
}

// History write mutex to prevent concurrent write corruption
let historyMutex: Promise<void> = Promise.resolve()

async function loadHistory(): Promise<BackupRecord[]> {
  try {
    const raw = await readFile(HISTORY_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function saveHistory(records: BackupRecord[]) {
  await ensureDataDir()
  await writeFile(HISTORY_FILE + '.tmp', JSON.stringify(records, null, 2), 'utf-8')
  await fsRename(HISTORY_FILE + '.tmp', HISTORY_FILE)
}

// 【Fix 5】进度持久化：写入当前进度快照
async function writeProgressSnapshot(snapshot: object | null) {
  await ensureDataDir()
  if (snapshot === null) {
    // 任务完成/取消时清除快照
    try { await writeFile(PROGRESS_FILE, 'null', 'utf-8') } catch { /* ignore */ }
  } else {
    await writeFile(PROGRESS_FILE, JSON.stringify(snapshot, null, 2), 'utf-8')
  }
}

// 【Fix 5】进度持久化：读取未完成任务的进度快照
async function loadProgressSnapshot(): Promise<object | null> {
  try {
    const raw = await readFile(PROGRESS_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return data ?? null
  } catch {
    return null
  }
}

async function appendToHistory(record: BackupRecord) {
  historyMutex = historyMutex.then(async () => {
    const history = await loadHistory()
    history.unshift(record)
    await saveHistory(history.slice(0, 200))
  }).catch(err => console.error('[history] write failed:', err))
  await historyMutex
}

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mxf', '.avi', '.mkv', '.r3d', '.braw', '.arri'])

/**
 * FX3 rename: rename "Untitled" folders on DESTINATION paths after backup.
 * This preserves the "read-only source" principle — source disk is never modified.
 *
 * Handles two cases:
 * 1. User selected the volume root (e.g., /Volumes/SD_CARD) → "Untitled" is a subfolder
 * 2. User selected the "Untitled" folder directly → the dest folder itself IS "Untitled"
 */
async function runFx3RenameOnDest(destinations: { name: string; path: string }[], sourcePaths: string[]): Promise<string[]> {
  const logs: string[] = []

  logs.push(`[FX3] Starting rename. Destinations: ${destinations.map(d => d.path).join(', ')}`)
  logs.push(`[FX3] Source paths: ${sourcePaths.join(', ')}`)

  async function tryRenameUntitled(dirToRename: string, parentDir: string) {
    logs.push(`[FX3] Checking ${dirToRename} for video files (recursive search)...`)
    const videoFile = await findFirstFx3VideoFile(dirToRename)
    if (!videoFile) {
      logs.push(`[FX3] Skipped ${dirToRename}: no video files found in directory tree`)
      return
    }
    logs.push(`[FX3] Found video file: ${videoFile}`)
    const featureCode = videoFile.slice(0, 4)
    let newName = featureCode
    let newPath = join(parentDir, newName)
    let suffix = 1
    while (existsSync(newPath)) {
      newName = `${featureCode}_${suffix++}`
      newPath = join(parentDir, newName)
    }
    try {
      await fsRename(dirToRename, newPath)
      logs.push(`[FX3] ✅ Renamed ${dirToRename} → ${newPath}`)
    } catch (err) {
      logs.push(`[FX3] ❌ Failed to rename ${dirToRename}: ${err}`)
    }
  }

  for (const dest of destinations) {
    for (const srcPath of sourcePaths) {
      const srcName = srcPath.split('/').filter(Boolean).pop() ?? srcPath
      const destSrcDir = join(dest.path, srcName)
      logs.push(`[FX3] Processing: srcName=${srcName}, destSrcDir=${destSrcDir}`)

      // Case 2: User selected "Untitled" folder directly as source
      if (srcName === 'Untitled') {
        logs.push(`[FX3] Case 2: source is "Untitled" directly`)
        if (existsSync(destSrcDir)) {
          await tryRenameUntitled(destSrcDir, dest.path)
        } else {
          logs.push(`[FX3] ❌ destSrcDir does not exist: ${destSrcDir}`)
        }
        continue
      }

      // Case 1: User selected volume root — look for "Untitled" subfolders
      logs.push(`[FX3] Case 1: looking for "Untitled" subfolders in ${destSrcDir}`)
      let entries: string[]
      try {
        entries = await readdir(destSrcDir)
      } catch (err) {
        logs.push(`[FX3] Cannot read ${destSrcDir}: ${err}`)
        continue
      }
      logs.push(`[FX3] Entries in ${destSrcDir}: ${entries.join(', ')}`)
      for (const entry of entries) {
        if (entry !== 'Untitled') continue
        await tryRenameUntitled(join(destSrcDir, entry), destSrcDir)
      }
    }
  }
  logs.push(`[FX3] Done. ${logs.length} log entries.`)
  return logs
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  await ensureDataDir()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// IPC: Dialogs
ipcMain.handle('dialog:pickFolder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:pickFolders', async () => {
  if (!mainWindow) return []
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'multiSelections'],
  })
  return result.canceled ? [] : result.filePaths
})

// IPC: Backup
// 【Fix 5】检查是否有未完成的任务（应用重启后）
ipcMain.handle('backup:checkInterrupted', async () => {
  return loadProgressSnapshot()
})

// 【Fix 5】清除未完成任务的进度快照（用户选择不继续时）
ipcMain.handle('backup:clearInterrupted', async () => {
  await writeProgressSnapshot(null)
})

ipcMain.handle('backup:start', async (_, config: TaskConfig) => {
  if (!mainWindow) return { success: false, error: 'No window' }

  const settings = await loadSettings()
  const destinations = settings.destinations
    .filter(d => config.destinations.includes(d.id))
    .map(d => config.destinationOverrides?.[d.id]
      ? { ...d, path: config.destinationOverrides[d.id] }
      : d
    )

  const engine = new BackupEngine(config, destinations, join(DATA_DIR, 'reports'))
  activeEngines.set(config.id, engine)

  // 【Fix 5】每 30 秒持久化进度快照
  let lastProgressPayload: any = null

  engine.on('progress', (payload) => {
    mainWindow?.webContents.send('backup:progress', payload)
    lastProgressPayload = payload
  })
  const progressTimer = setInterval(() => {
    if (lastProgressPayload) {
      writeProgressSnapshot({
        taskId: config.id,
        config,
        progress: lastProgressPayload,
        timestamp: new Date().toISOString()
      }).catch(() => {})
    }
  }, 30_000)

  try {
    const result = await engine.run()
    // Merge frontend logs with backend logs
    const taskLogs: string[] = [...(config.fx3Logs ?? [])]
    taskLogs.push(`[${new Date().toISOString()}] 备份完成: ${result.filesTotal} 文件, ${result.bytesTotal} 字节`)

    // FX3 rename on destination (after backup completes)
    if (config.fx3Rename) {
      taskLogs.push(`[${new Date().toISOString()}] FX3 重命名: config.fx3Rename=${config.fx3Rename}, 开始扫描目标目录…`)
      mainWindow?.webContents.send('backup:progress', {
        taskId: config.id, phase: 'copying',
        filesTotal: result.filesTotal, filesDone: result.filesTotal,
        bytesTotal: result.bytesTotal, bytesDone: result.bytesTotal,
        currentFile: 'FX3 重命名中…', logLines: ['[FX3] 正在扫描目标目录…']
      })
      try {
        const fx3Logs = await runFx3RenameOnDest(destinations, config.sourcePaths)
        taskLogs.push(...fx3Logs)
        if (fx3Logs.length > 0) {
          taskLogs.push(`[${new Date().toISOString()}] FX3 重命名完成`)
        } else {
          taskLogs.push(`[${new Date().toISOString()}] FX3 重命名: 未找到需要重命名的文件夹`)
        }
      } catch (err) {
        const errMsg = `[${new Date().toISOString()}] FX3 重命名失败: ${err}`
        taskLogs.push(errMsg)
        console.error(errMsg)
      }
    }

    result.logs = taskLogs

    // Re-emit done phase (FX3 rename may have overwritten it with 'copying')
    mainWindow?.webContents.send('backup:progress', {
      taskId: config.id, phase: 'done',
      filesTotal: result.filesTotal, filesDone: result.filesTotal,
      bytesTotal: result.bytesTotal, bytesDone: result.bytesTotal,
      currentFile: '', reportPath: result.reportPath,
      verificationOk: result.verificationOk,
      sourceBytes: result.sourceBytes,
      destBytes: result.destBytes,
    })

    // Save to history (mutex-protected)
    await appendToHistory(result)

    // Webhook notification with retry
    const latestSettings = await loadSettings()
    const webhookUrl = latestSettings.webhookUrl?.trim()
    if (webhookUrl) {
      const text = await buildWebhookText(config, destinations, result)
      sendWebhook(webhookUrl, text)
    }

    activeEngines.delete(config.id)
    // 【Fix 5】任务完成，清除进度快照和定时器
    clearInterval(progressTimer)
    await writeProgressSnapshot(null)
    return { success: true }
  } catch (err: unknown) {
    activeEngines.delete(config.id)
    // 【Fix 5】任务失败，清除进度快照和定时器
    clearInterval(progressTimer)
    await writeProgressSnapshot(null)

    const errRecord: BackupRecord = {
      id: `${config.id}-${Date.now()}`,
      taskId: config.id,
      taskName: config.projectName || config.name,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      filesTotal: 0,
      bytesTotal: 0,
      status: 'failed',
      errorMessage: String(err),
    }

    // Save to history (mutex-protected)
    await appendToHistory(errRecord)

    // Webhook notification with retry
    const latestSettings = await loadSettings()
    const webhookUrl = latestSettings.webhookUrl?.trim()
    if (webhookUrl) {
      const text = await buildWebhookText(config, destinations, errRecord)
      sendWebhook(webhookUrl, text)
    }

    return { success: false, error: String(err) }
  }
})

ipcMain.handle('backup:cancel', async (_, taskId: string) => {
  activeEngines.get(taskId)?.cancel()
})

// 【Fix 6】dry-run 预览：使用 rsync --dry-run --stats 运行，返回将要传输的文件列表和总量
ipcMain.handle('backup:dryRun', async (_, config: TaskConfig) => {
  if (!mainWindow) return { success: false, error: 'No window' }

  const settings = await loadSettings()
  const destinations = settings.destinations
    .filter(d => config.destinations.includes(d.id))
    .map(d => config.destinationOverrides?.[d.id]
      ? { ...d, path: config.destinationOverrides[d.id] }
      : d
    )

  const RSYNC_CANDIDATES = ['/opt/homebrew/bin/rsync', '/usr/local/bin/rsync', '/usr/bin/rsync']
  const RSYNC = RSYNC_CANDIDATES.find(p => existsSync(p)) ?? '/usr/bin/rsync'

  const results: { dest: string; output: string; transferred: number; totalSize: number }[] = []

  for (const dest of destinations) {
    for (const srcPath of config.sourcePaths) {
      const srcName = basename(srcPath)
      const destDir = join(dest.path, srcName)

      try {
        const { stdout } = await execFileAsync(RSYNC, [
          '-a', '--dry-run', '--stats', '--', `${srcPath}/`, `${destDir}/`
        ])
        // 解析 rsync --stats 输出
        const fileMatch = stdout.match(/Number of files transferred:\s+(\d+)/)
        const sizeMatch = stdout.match(/Total transferred file size:\s+([\d,]+)\s+bytes/)
        const transferred = fileMatch ? parseInt(fileMatch[1].replace(/,/g, ''), 10) : 0
        const totalSize = sizeMatch ? parseInt(sizeMatch[1].replace(/,/g, ''), 10) : 0

        results.push({
          dest: `${dest.name} (${dest.path})`,
          output: stdout,
          transferred,
          totalSize
        })
      } catch (err) {
        results.push({
          dest: `${dest.name} (${dest.path})`,
          output: `错误: ${err instanceof Error ? err.message : String(err)}`,
          transferred: 0,
          totalSize: 0
        })
      }
    }
  }

  return { success: true, results }
})
// IPC: History
ipcMain.handle('history:get', () => loadHistory())
ipcMain.handle('history:clear', async () => {
  await saveHistory([])
})
ipcMain.handle('history:deleteRecord', async (_, id: string) => {
  const history = await loadHistory()
  await saveHistory(history.filter(r => r.id !== id))
})

// IPC: Settings
ipcMain.handle('settings:get', () => loadSettings())
ipcMain.handle('settings:save', (_, settings: Settings) => saveSettings(settings))

// IPC: Shell
ipcMain.handle('shell:showInFinder', (_, path: string) => shell.showItemInFolder(path))
ipcMain.handle('shell:openFile', (_, path: string) => shell.openPath(path))
ipcMain.handle('shell:openExternal', (_, url: string) => shell.openExternal(url))
ipcMain.handle('shell:getDownloadsPath', () => app.getPath('downloads'))
ipcMain.handle('shell:fileExists', (_, path: string) => existsSync(path))
ipcMain.handle('app:getVersion', () => app.getVersion())

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

ipcMain.handle('app:checkForUpdates', async () => {
  const currentVersion = app.getVersion()
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': `DiskHop/${currentVersion}` }
    })
    if (!res.ok) return { hasUpdate: false, error: `HTTP ${res.status}` }
    const data = await res.json() as any
    const latestVersion = (data.tag_name as string).replace(/^v/, '')
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0
    const assets = (data.assets ?? []).map((a: any) => ({
      name: a.name as string,
      url: a.browser_download_url as string,
      size: a.size as number,
    }))
    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseUrl: data.html_url as string,
      releaseNotes: (data.body as string) ?? '',
      publishedAt: data.published_at as string,
      assets,
    }
  } catch (err) {
    return { hasUpdate: false, error: String(err) }
  }
})

ipcMain.handle('shell:listVolumes', async () => {
  function extractPlistValue(plistXml: string, key: string, type: 'string' | 'integer' | 'boolean'): string | number | boolean | null {
    // Use CDATA-safe regex that handles nested content
    if (type === 'string') {
      const m = plistXml.match(new RegExp(`<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`))
      return m ? m[1].trim() : null
    }
    if (type === 'integer') {
      const m = plistXml.match(new RegExp(`<key>${key}</key>\\s*<integer>(\\d+)</integer>`))
      return m ? parseInt(m[1], 10) : null
    }
    if (type === 'boolean') {
      const trueM = plistXml.match(new RegExp(`<key>${key}</key>\\s*<true/>`))
      return !!trueM
    }
    return null
  }

  async function getDiskutilInfo(mountPoint: string): Promise<{
    totalBytes: number
    freeBytes: number
    format: string
    isInternal: boolean
  } | null> {
    try {
      const { stdout } = await execFileAsync('diskutil', ['info', '-plist', mountPoint])
      const extractStr = (key: string) => extractPlistValue(stdout, key, 'string') as string ?? ''
      const extractInt = (key: string) => extractPlistValue(stdout, key, 'integer') as number ?? 0
      const extractBool = (key: string) => extractPlistValue(stdout, key, 'boolean') as boolean

      const format = extractStr('FilesystemType') || extractStr('FileSystemPersonality') || extractStr('Content')
      const isInternal = extractBool('Internal')

      // Use df for accurate free/total — works for all fs types (APFS, exFAT, HFS+)
      let totalBytes = 0
      let freeBytes = 0
      try {
        const { stdout: dfOut } = await execFileAsync('df', ['-k', mountPoint])
        const lines = dfOut.trim().split('\n')
        if (lines.length >= 2) {
          const parts = lines[1].trim().split(/\s+/)
          // df -k columns: Filesystem 1K-blocks Used Available Capacity iused ifree %iused Mounted
          const blocks = parseInt(parts[1], 10)
          const avail = parseInt(parts[3], 10)
          totalBytes = blocks * 1024
          freeBytes = avail * 1024
        }
      } catch {
        // fallback to diskutil size fields (less accurate for APFS)
        totalBytes = extractInt('TotalSize') || extractInt('Size')
        freeBytes = extractInt('APFSContainerFree') || extractInt('FreeSpace')
      }

      return { totalBytes, freeBytes, format, isInternal }
    } catch {
      return null
    }
  }

  try {
    const entries = await readdir('/Volumes')
    const results = await Promise.all(
      entries
        .filter(name => !name.startsWith('.'))
        .map(async name => {
          const path = `/Volumes/${name}`
          const info = await getDiskutilInfo(path)
          if (!info) return null
          // Skip the internal system volume (Macintosh HD and any internal disk)
          if (info.isInternal) return null
          return {
            name,
            path,
            totalBytes: info.totalBytes,
            freeBytes: info.freeBytes,
            format: info.format,
          }
        })
    )
    return results.filter(Boolean)
  } catch {
    return []
  }
})

/**
 * Sony FX3 video file naming pattern:
 * B165C001_260203YY.mp4
 * Single uppercase letter + digits + uppercase letter + digits + underscore + date + .mp4
 */
const FX3_VIDEO_PATTERN = /^[A-Z]\d+[A-Z]\d+_\d+[A-Za-z]*\.mp4$/i

function isFx3VideoFile(filename: string): boolean {
  return FX3_VIDEO_PATTERN.test(filename)
}

/**
 * Recursively search for the first Sony FX3 video file in a directory tree.
 * Searches up to maxDepth levels deep.
 * Returns the filename if found, null if no FX3 video file exists.
 */
async function findFirstFx3VideoFile(dir: string, maxDepth = 5): Promise<string | null> {
  if (maxDepth <= 0) return null
  let entries: { name: string; isFile(): boolean; isDirectory(): boolean }[]
  try {
    entries = await readdir(dir, { withFileTypes: true }) as any
  } catch {
    return null
  }
  // Check files first
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
    if (VIDEO_EXTS.has(ext) && isFx3VideoFile(entry.name)) return entry.name
  }
  // Then recurse into subdirectories
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const found = await findFirstFx3VideoFile(join(dir, entry.name), maxDepth - 1)
    if (found) return found
  }
  return null
}

// IPC: FX3 scan — scan source paths for "Untitled" folders and extract rename candidates
// Handles two cases:
// 1. User selected volume root (e.g., /Volumes/SD_CARD) → "Untitled" is a subfolder
// 2. User selected the "Untitled" folder directly → the source itself is "Untitled"
ipcMain.handle('fx3:scan', async (_, sourcePaths: string[]) => {
  const results: { srcPath: string; untitledPath: string; suggestedName: string; videoFile: string }[] = []
  for (const srcPath of sourcePaths) {
    const srcName = srcPath.split('/').filter(Boolean).pop() ?? srcPath

    // Case 2: User selected "Untitled" folder directly
    if (srcName === 'Untitled') {
      const videoFile = await findFirstFx3VideoFile(srcPath)
      if (videoFile) {
        results.push({
          srcPath,
          untitledPath: srcPath,
          suggestedName: videoFile.slice(0, 4),
          videoFile,
        })
      }
      continue
    }

    // Case 1: User selected volume root — look for "Untitled" subfolders
    let entries: string[]
    try {
      entries = await readdir(srcPath)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry !== 'Untitled') continue
      const untitledPath = join(srcPath, entry)
      const videoFile = await findFirstFx3VideoFile(untitledPath)
      if (videoFile) {
        results.push({
          srcPath,
          untitledPath,
          suggestedName: videoFile.slice(0, 4),
          videoFile,
        })
      }
    }
  }
  return results
})

// IPC: Report
ipcMain.handle('report:saveAs', async (_, reportPath: string) => {
  const generator = new ReportGenerator(join(DATA_DIR, 'reports'))
  return generator.saveAs(reportPath)
})

ipcMain.handle('shell:ejectVolume', async (_, mountPoint: string) => {
  try {
    await execFileAsync('diskutil', ['eject', mountPoint])
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('shell:listDir', async (_, dirPath: string) => {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, path: join(dirPath, e.name) }))
  } catch {
    return []
  }
})

ipcMain.handle('shell:mkdir', async (_, dirPath: string) => {
  try {
    await mkdir(dirPath, { recursive: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('shell:testWebhook', async (_, url: string) => {
  const msg = 'DiskHop — webhook test ✓'
  const payload = buildWebhookPayload(url, msg)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return { ok: res.ok, status: res.status }
  } catch {
    return { ok: false, status: 0 }
  }
})
