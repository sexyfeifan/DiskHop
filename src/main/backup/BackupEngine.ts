import { EventEmitter } from 'events'
import { stat, readdir } from 'fs/promises'
import { existsSync, createReadStream } from 'fs'
import { join, relative, dirname, basename } from 'path'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
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
    // 记录每个目的地的失败信息，不阻断后续目的地
    // 【Fix 8】跟踪每个目的地的失败信息及是否为 SIGTERM 中断
    const destFailures: Map<number, { msg: string; isSigterm: boolean }> = new Map()
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
          // 【Fix 8】检测 rsync SIGTERM 中断，标记为 partial 而非 failed
          const errMsg = err instanceof Error ? err.message : String(err)
          const isSigterm = errMsg.includes('rsync interrupted (SIGTERM)')
          destFailures.set(di, { msg: errMsg, isSigterm })
          this.emit('progress', {
            taskId, phase: 'error',
            filesTotal: files.length, filesDone: 0, bytesTotal: totalBytesAllDests, bytesDone: bytesDoneOffset,
            currentFile: '', error: `[目的地 ${dest.name}] ${errMsg}`, destIndex: di
          } satisfies ProgressPayload)
        }
      }
      bytesDoneOffset += bytesTotal
    }

    // 如果所有目的地都失败了，直接返回失败记录
    if (destFailures.size === this.destinations.length) {
      // 【Fix 8】如果所有失败都是 SIGTERM 中断，标记为 partial 状态
      const allSigterm = [...destFailures.values()].every(f => f.isSigterm)
      const status = allSigterm ? 'partial' as const : 'failed' as const
      const record = this.buildRecord(taskId, startedAt, status, files.length, totalBytesAllDests)
      record.errorMessage = (allSigterm ? '备份被中断: ' : '所有目的地均失败: ')
        + [...destFailures.values()].map(f => f.msg).join('; ')
      return record
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

    // 最终状态：有部分目的地失败时标记为 failed，但附带各目的地独立结果
    const overallStatus = destFailures.size > 0 ? 'failed' : 'success'
    const record = this.buildRecord(taskId, startedAt, overallStatus, files.length, totalBytesAllDests, reportPath, this.config.verify ? verificationOk : undefined, this.config.verify ? sourceBytes : undefined, this.config.verify ? destBytes : undefined, this.config.verify ? destinationVerification : undefined)

    // 将目的地级别的失败信息附加到记录中
    if (destFailures.size > 0) {
      record.errorMessage = '部分目的地失败: ' + [...destFailures.entries()].map(([i, msg]) => `[${this.destinations[i].name}] ${msg}`).join('; ')
    }

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
      // rsync -a --progress --partial: archive mode, verbose progress, 断点续传
      // --partial 保留中断的不完整文件，--partial-dir 指定临时目录
      const args = ['-a', '--progress', '--partial', '--partial-dir=.diskhop-partial', '--', `${src}/`, `${dest}/`]
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
        // 【Fix 8】rsync 被 SIGTERM 杀掉时（code=20），不应静默 resolve
        // code=20 表示 rsync 收到 SIGTERM 信号被中断
        if (this.cancelled) {
          resolve()
          return
        }
        if (code === 20) {
          // 标记为中断状态，携带已传输文件数信息，让调用方知道这是部分完成
          reject(new Error(`rsync interrupted (SIGTERM): ${filesDone} files transferred before termination`))
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

  /**
   * 流式计算文件的 SHA-256 hash
   * 使用 createReadStream 流式读取，不会一次性将文件读入内存
   */
  private fileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  /**
   * 对每个目的地进行逐文件 SHA-256 hash 校验
   * - 使用流式 SHA-256 替代文件大小比对
   * - 修复路径拼接：rsync srcPath/ -> dest.path/srcName/ 目录结构
   * - 发送校验进度回调
   */
  private async verifyPerDest(sourceBytes: number): Promise<DestinationVerification[]> {
    const results: DestinationVerification[] = []

    // 预先扫描所有源文件，避免重复扫描
    const allSrcFiles: { srcPath: string; srcName: string; files: { abs: string; rel: string; size: number }[] }[] = []
    for (const srcPath of this.config.sourcePaths) {
      const srcFiles: { abs: string; rel: string; size: number }[] = []
      await this.scan(srcPath, srcPath, srcFiles)
      allSrcFiles.push({ srcPath, srcName: basename(srcPath), files: srcFiles })
    }
    // 校验总文件数 = 源文件数 × 目的地数
    const totalVerifyFiles = allSrcFiles.reduce((s, e) => s + e.files.length, 0) * this.destinations.length
    let verifyFilesDone = 0

    for (let di = 0; di < this.destinations.length; di++) {
      const dest = this.destinations[di]
      let actualBytes = 0
      // changed: failedFiles now stores hash info instead of just size
      const failedFiles: { rel: string; expectedHash: string; actualHash: string }[] = []

      for (const { srcName, files: srcFiles } of allSrcFiles) {
        actualBytes += await this.sumDir(join(dest.path, srcName))

        for (const f of srcFiles) {
          // 修复路径拼接：rsync 使用 srcPath/ -> destDir/ 的映射
          // rsync 命令是 `${srcPath}/` -> `${dest.path}/${srcName}/`
          // 因此目标文件路径应为 dest.path/srcName/相对路径
          const destFilePath = join(dest.path, srcName, f.rel)

          if (this.cancelled) break

          try {
            // 使用 SHA-256 hash 校验替代文件大小比对，确保数据完整性
            const [srcHash, destHash] = await Promise.all([
              this.fileHash(f.abs),
              this.fileHash(destFilePath)
            ])
            if (srcHash !== destHash) {
              failedFiles.push({ rel: f.rel, expectedHash: srcHash, actualHash: destHash })
            }
          } catch {
            // 文件不存在或无法读取，记录错误
            let srcHash = ''
            try { srcHash = await this.fileHash(f.abs) } catch { /* 源文件也无法读取则留空 */ }
            failedFiles.push({ rel: f.rel, expectedHash: srcHash, actualHash: '(文件不存在或无法读取)' })
          }

          verifyFilesDone++
          // 发送校验进度回调（当前只有拷贝进度，没有校验进度）
          this.emit('progress', {
            taskId: this.config.id, phase: 'verifying',
            filesTotal: totalVerifyFiles, filesDone: verifyFilesDone,
            bytesTotal: sourceBytes * this.destinations.length, bytesDone: 0,
            currentFile: f.rel, destIndex: di
          } satisfies ProgressPayload)
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
    status: 'success' | 'failed' | 'cancelled' | 'partial',
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
