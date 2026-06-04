import { EventEmitter } from 'events'
import { stat, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, relative, dirname, basename } from 'path'
import { spawn } from 'child_process'
import type { TaskConfig, Destination, ProgressPayload, BackupRecord, DestinationVerification } from '../types'
import { ReportGenerator } from './ReportGenerator'

const RSYNC_CANDIDATES = ['/opt/homebrew/bin/rsync', '/usr/local/bin/rsync', '/usr/bin/rsync']
const RSYNC = RSYNC_CANDIDATES.find(p => existsSync(p)) ?? '/usr/bin/rsync'
const LOG_LINES = 5

export class BackupEngine extends EventEmitter {
  private cancelled = false
  private rsyncProc: ReturnType<typeof spawn> | null = null

  constructor(
    private config: TaskConfig,
    private destinations: Destination[],
    private reportsDir: string
  ) {
    super()
  }

  cancel() {
    this.cancelled = true
    this.rsyncProc?.kill('SIGTERM')
  }

  async run(): Promise<BackupRecord> {
    const startedAt = new Date().toISOString()
    const taskId = this.config.id

    this.emit('progress', {
      taskId, phase: 'scanning', filesTotal: 0, filesDone: 0,
      bytesTotal: 0, bytesDone: 0, currentFile: ''
    } satisfies ProgressPayload)

    // Scan source to get total file count + byte count
    const files: { abs: string; rel: string; size: number }[] = []
    for (const src of this.config.sourcePaths) {
      await this.scan(src, src, files)
    }

    const bytesTotal = files.reduce((s, f) => s + f.size, 0)
    const totalBytesAllDests = bytesTotal * this.destinations.length

    if (this.cancelled) {
      return this.emitCancelled(taskId, startedAt, files.length, totalBytesAllDests)
    }

    // Copy to each destination via rsync
    let bytesDoneOffset = 0
    for (let di = 0; di < this.destinations.length; di++) {
      const dest = this.destinations[di]
      const destRoot = dest.path

      for (const srcPath of this.config.sourcePaths) {
        if (this.cancelled) {
          return this.emitCancelled(taskId, startedAt, files.length, totalBytesAllDests)
        }

        const srcName = basename(srcPath)
        const destDir = join(destRoot, srcName)

        try {
          await this.runRsync(
            srcPath, destDir, taskId,
            files.length, totalBytesAllDests, di, bytesDoneOffset
          )
        } catch (err) {
          if (this.cancelled) {
            return this.emitCancelled(taskId, startedAt, files.length, totalBytesAllDests)
          }
          const record = this.buildRecord(taskId, startedAt, 'failed', files.length, totalBytesAllDests)
          record.errorMessage = err instanceof Error ? err.message : String(err)
          this.emit('progress', {
            taskId, phase: 'error',
            filesTotal: files.length, filesDone: 0, bytesTotal: totalBytesAllDests, bytesDone: 0,
            currentFile: '', error: record.errorMessage
          } satisfies ProgressPayload)
          return record
        }
      }
      bytesDoneOffset += bytesTotal
    }

    if (this.cancelled) {
      return this.emitCancelled(taskId, startedAt, files.length, totalBytesAllDests)
    }

    // Verification: compare source files against each destination
    let verificationOk = true
    let sourceBytes = 0
    let destBytes = 0
    let destinationVerification: DestinationVerification[] | undefined

    if (this.config.verify) {
      this.emit('progress', {
        taskId, phase: 'verifying',
        filesTotal: files.length, filesDone: files.length,
        bytesTotal: totalBytesAllDests, bytesDone: totalBytesAllDests, currentFile: ''
      } satisfies ProgressPayload)

      sourceBytes = await this.sumBytes(this.config.sourcePaths)
      if (this.cancelled) {
        return this.emitCancelled(taskId, startedAt, files.length, totalBytesAllDests)
      }
      destBytes = await this.sumAllDestBytes()
      if (this.cancelled) {
        return this.emitCancelled(taskId, startedAt, files.length, totalBytesAllDests)
      }
      destinationVerification = await this.verifyPerDest(sourceBytes)
      // Overall verification passes only if ALL destinations pass per-file check
      verificationOk = destinationVerification.every(dv => dv.ok)
    }

    // Generate report only if verification passed (or not verified)
    let reportPath: string | undefined
    if (this.config.generateReport && verificationOk) {
      const generator = new ReportGenerator(this.reportsDir)
      reportPath = await generator.generate(
        this.config, files, this.destinations,
        startedAt, verificationOk, sourceBytes, destBytes
      )
    }

    const record = this.buildRecord(taskId, startedAt, 'success', files.length, totalBytesAllDests, reportPath, this.config.verify ? verificationOk : undefined, this.config.verify ? sourceBytes : undefined, this.config.verify ? destBytes : undefined, this.config.verify ? destinationVerification : undefined)

    this.emit('progress', {
      taskId, phase: 'done',
      filesTotal: files.length, filesDone: files.length,
      bytesTotal: totalBytesAllDests, bytesDone: totalBytesAllDests,
      currentFile: '', reportPath,
      verificationOk, sourceBytes, destBytes
    } satisfies ProgressPayload)

    return record
  }

  private runRsync(
    src: string, dest: string, taskId: string,
    filesTotal: number, bytesTotal: number, destIndex: number, bytesDoneOffset: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // rsync -a --progress: archive mode (preserves metadata), verbose progress
      const args = ['-a', '--progress', '--', `${src}/`, `${dest}/`]
      const proc = spawn(RSYNC, args)
      this.rsyncProc = proc

      const logLines: string[] = []
      let currentFileBytesDone = 0  // bytes done for current file (from rsync)
      let completedFilesBytes = 0   // cumulative bytes of fully completed files
      let filesDone = 0
      let speedBps = 0
      let etaSec = 0
      let lastEmitTime = Date.now()
      let currentFile = ''

      const parseLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed) return

        // Progress line — matches both openrsync and standard rsync:
        // openrsync: "             40 100%    1.67MB/s   00:00:00 (xfer#1, to-check=1/2)"
        // standard:  "  1,234,567  45%  1.23MB/s  0:01:23"
        const progMatch = trimmed.match(/^([\d,]+)\s+(\d+)%\s+([\d.]+)(k|M|G)?B\/s\s+(\d+):(\d+):(\d+)/)
        if (progMatch) {
          const unitMul = progMatch[4] === 'k' ? 1024 : progMatch[4] === 'G' ? 1024 ** 3 : 1024 ** 2
          speedBps = parseFloat(progMatch[3]) * unitMul
          const h = parseInt(progMatch[5])
          const m = parseInt(progMatch[6])
          const s = parseInt(progMatch[7])
          etaSec = h * 3600 + m * 60 + s

          // Extract current file's bytes done
          currentFileBytesDone = parseInt(progMatch[1].replace(/,/g, ''))

          // Extract xfer# count for filesDone (openrsync uses "xfer#", standard uses "xfr#")
          const xfrMatch = trimmed.match(/x(?:fer|fr)#(\d+)/)
          if (xfrMatch) {
            const newXferCount = parseInt(xfrMatch[1])
            if (newXferCount > filesDone) {
              // A file just completed — add its size to cumulative total
              completedFilesBytes += currentFileBytesDone
              filesDone = newXferCount
              currentFileBytesDone = 0
            }
          }
          return
        }

        // "Number of files transferred: N" at end (summary line)
        const xferMatch = trimmed.match(/Number of files transferred:\s+(\d+)/)
        if (xferMatch) {
          filesDone = parseInt(xferMatch[1])
          return
        }

        // File lines (not starting with spaces, not summary lines)
        // When a new file starts, the previous file's final bytes should be accumulated
        if (!line.startsWith(' ') && !trimmed.match(/^(sending|receiving|sent|total|Number)/)) {
          if (currentFile && currentFileBytesDone > 0) {
            completedFilesBytes += currentFileBytesDone
            currentFileBytesDone = 0
          }
          currentFile = trimmed
          logLines.push(trimmed)
          if (logLines.length > LOG_LINES) logLines.shift()
        }
      }

      let partial = ''
      proc.stdout.on('data', (chunk: Buffer) => {
        const text = partial + chunk.toString()
        const parts = text.split('\n')
        partial = parts.pop() ?? ''
        for (const line of parts) {
          parseLine(line)
        }

        const now = Date.now()
        if (now - lastEmitTime > 300) {
          lastEmitTime = now
          this.emit('progress', {
            taskId, phase: 'copying',
            filesTotal, filesDone, bytesTotal, bytesDone: bytesDoneOffset + completedFilesBytes + currentFileBytesDone,
            currentFile, speedBps, etaSec,
            logLines: [...logLines], destIndex
          } satisfies ProgressPayload)
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim()
        if (msg) {
          logLines.push(msg)
          if (logLines.length > LOG_LINES) logLines.shift()
        }
      })

      proc.on('close', (code) => {
        // Process any remaining partial line
        if (partial.trim()) {
          parseLine(partial)
        }
        this.rsyncProc = null
        if (this.cancelled || code === 20) {
          resolve()
          return
        }
        if (code !== 0) {
          reject(new Error(`rsync exited with code ${code}`))
        } else {
          resolve()
        }
      })

      proc.on('error', reject)
    })
  }

  private async scan(base: string, dir: string, out: { abs: string; rel: string; size: number }[]) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (this.cancelled) return
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        await this.scan(base, abs, out)
      } else if (entry.isFile()) {
        const s = await stat(abs)
        out.push({ abs, rel: relative(dirname(base), abs), size: s.size })
      }
    }
  }

  private async sumBytes(paths: string[]): Promise<number> {
    let total = 0
    for (const p of paths) {
      total += await this.sumDir(p)
    }
    return total
  }

  private async sumDir(dir: string): Promise<number> {
    if (this.cancelled) return 0
    let total = 0
    try {
      const s = await stat(dir)
      if (s.isFile()) return s.size
      const entries = await readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        if (this.cancelled) return 0
        total += await this.sumDir(join(dir, e.name))
      }
    } catch { /* skip inaccessible */ }
    return total
  }

  private async sumAllDestBytes(): Promise<number> {
    let total = 0
    for (const dest of this.destinations) {
      for (const srcPath of this.config.sourcePaths) {
        const srcName = basename(srcPath)
        total += await this.sumDir(join(dest.path, srcName))
      }
    }
    return total
  }

  // verifyBytes removed — verification now uses per-file comparison via verifyPerDest

  private async verifyPerDest(sourceBytes: number): Promise<DestinationVerification[]> {
    const results: DestinationVerification[] = []
    for (const dest of this.destinations) {
      let actualBytes = 0
      const failedFiles: { rel: string; size: number }[] = []

      for (const srcPath of this.config.sourcePaths) {
        const srcName = basename(srcPath)
        actualBytes += await this.sumDir(join(dest.path, srcName))

        const srcFiles: { abs: string; rel: string; size: number }[] = []
        await this.scan(srcPath, srcPath, srcFiles)

        for (const f of srcFiles) {
          const destFilePath = join(dest.path, f.rel)
          try {
            const s = await stat(destFilePath)
            if (s.size !== f.size) failedFiles.push({ rel: f.rel, size: f.size })
          } catch {
            failedFiles.push({ rel: f.rel, size: f.size })
          }
        }
      }

      results.push({
        destId: dest.id,
        name: dest.name,
        path: dest.path,
        ok: failedFiles.length === 0,
        actualBytes,
        failedFiles: failedFiles.length > 0 ? failedFiles : undefined,
      })
    }
    return results
  }

  private emitCancelled(taskId: string, startedAt: string, filesTotal: number, bytesTotal: number): BackupRecord {
    this.emit('progress', {
      taskId, phase: 'cancelled',
      filesTotal, filesDone: 0,
      bytesTotal, bytesDone: 0, currentFile: ''
    } satisfies ProgressPayload)
    return this.buildRecord(taskId, startedAt, 'cancelled', filesTotal, bytesTotal)
  }

  private buildRecord(
    taskId: string, startedAt: string,
    status: 'success' | 'failed' | 'cancelled',
    filesTotal: number, bytesTotal: number,
    reportPath?: string,
    verificationOk?: boolean,
    sourceBytes?: number,
    destBytes?: number,
    destinationVerification?: DestinationVerification[]
  ): BackupRecord {
    return {
      id: `${taskId}-${Date.now()}`,
      taskId,
      taskName: this.config.projectName || this.config.name,
      startedAt,
      finishedAt: new Date().toISOString(),
      filesTotal,
      bytesTotal,
      status,
      reportPath,
      verificationOk,
      sourceBytes,
      destBytes,
      destinationVerification,
      sourcePaths: this.config.sourcePaths,
      destinationPaths: this.destinations.map(d => ({ name: d.name, path: d.path })),
      dateRangeStart: this.config.dateRangeStart,
      dateRangeEnd: this.config.dateRangeEnd,
      operator: this.config.operator,
    }
  }
}
