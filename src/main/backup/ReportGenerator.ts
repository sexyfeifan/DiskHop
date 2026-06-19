import { mkdir, writeFile, copyFile, readdir, stat } from 'fs/promises'
import { join, basename } from 'path'
import { app, dialog } from 'electron'
import type { TaskConfig, Destination, BackupRecord, DestinationVerification } from '../types'
import { formatBytes, formatDuration, formatDateTime, formatCount } from '../utils'

async function dirTotalSize(dir: string): Promise<number> {
  let total = 0
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const child = join(dir, e.name)
      if (e.isDirectory()) {
        total += await dirTotalSize(child)
      } else {
        const s = await stat(child)
        total += s.size
      }
    }
  } catch { /* skip inaccessible */ }
  return total
}

// Intermediate dirs (no direct files, only subdirs) show "—"; terminal dirs show total size
async function buildWebhookTree(dir: string, indent = '  '): Promise<string[]> {
  const lines: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const subdirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'))
    const hasDirectFiles = entries.some(e => e.isFile())

    const sizeStr = (hasDirectFiles || subdirs.length === 0)
      ? formatBytes(await dirTotalSize(dir))
      : '—'

    const dirName = (basename(dir) + '/').padEnd(16)
    lines.push(`${indent}${dirName} ${sizeStr}`)

    for (const sub of subdirs) {
      const subLines = await buildWebhookTree(join(dir, sub.name), indent + '  ')
      lines.push(...subLines)
    }
  } catch { /* skip */ }
  return lines
}

export async function buildWebhookText(
  config: TaskConfig,
  destinations: Destination[],
  result: BackupRecord
): Promise<string> {
  const isSuccess = result.status === 'success'
  const isCancelled = result.status === 'cancelled'

  const statusEmoji = isSuccess ? '✅' : isCancelled ? '⚠️' : '❌'
  const statusLabel = isSuccess ? '备份成功' : isCancelled ? '备份已取消' : '备份失败'
  const operator = config.operator || '—'

  const lines: string[] = []

  lines.push(`${statusEmoji} ${statusLabel}  ${operator}`)
  lines.push('')

  lines.push('📋 任务信息')
  lines.push(`  任务   ${config.projectName || config.name}`)
  // 【Fix 7】修正：DiskHop 使用 rsync 传输 + 文件大小校验，不使用 MD5 hash
  lines.push(`  校验   rsync + 文件大小校验`)
  lines.push(`  开始   ${formatDateTime(result.startedAt)}`)
  lines.push(`  完成   ${formatDateTime(result.finishedAt)}`)
  lines.push(`  耗时   ${formatDuration(result.startedAt, result.finishedAt)}`)
  lines.push(`  文件   ${formatCount(result.filesTotal)} 个 · ${formatBytes(result.bytesTotal)}`)

  if (!isSuccess && result.errorMessage) {
    lines.push(`  错误   ${result.errorMessage}`)
  }

  lines.push('')

  lines.push('📂 路径')
  for (const src of config.sourcePaths) {
    lines.push(`  🔵 来源   ${src}`)
  }

  const destVerMap = new Map<string, DestinationVerification>(
    (result.destinationVerification ?? []).map(dv => [dv.destId, dv])
  )
  const circledNums = '①②③④⑤⑥⑦⑧⑨'

  destinations.forEach((dest, i) => {
    const dv = destVerMap.get(dest.id)
    let dot: string
    if (dv) {
      dot = dv.ok ? '🟢' : '🔴'
    } else {
      dot = isSuccess ? '🟢' : '🔴'
    }
    const suffix = dv && !dv.ok ? '  ← 校验失败' : ''
    const num = circledNums[i] ?? `${i + 1}`
    lines.push(`  ${dot} 目标${num}  ${dest.path}${suffix}`)
  })

  lines.push('')

  lines.push('🔍 校验')
  if (result.verificationOk === undefined) {
    lines.push('  未执行')
  } else if (result.verificationOk) {
    lines.push(`  ✅ 全部通过（src ${formatBytes(result.sourceBytes ?? 0)} = dest ${formatBytes(result.destBytes ?? 0)}）`)
  } else {
    const failCount = (result.destinationVerification ?? []).filter(dv => !dv.ok).length
    if (failCount > 0) {
      lines.push(`  ❌ 部分失败（${failCount} 个目标校验不通过）`)
    } else {
      lines.push(`  ❌ 校验失败（src ${formatBytes(result.sourceBytes ?? 0)} ≠ dest ${formatBytes(result.destBytes ?? 0)}）`)
    }
  }

  lines.push('')

  // ⚠️ 失败文件 — only shown when there are verification failures
  const allFailedFiles: { rel: string; expectedHash: string; actualHash: string }[] = []
  for (const dv of result.destinationVerification ?? []) {
    for (const f of dv.failedFiles ?? []) {
      if (!allFailedFiles.some(x => x.rel === f.rel)) {
        allFailedFiles.push(f)
      }
    }
  }
  if (allFailedFiles.length > 0) {
    lines.push('⚠️ 失败文件')
    for (const f of allFailedFiles) {
      lines.push(`  ✗ ${f.rel}  (期望: ${f.expectedHash.slice(0, 12)}… 实际: ${f.actualHash.slice(0, 12)}…)`)
    }
    lines.push('')
  }

  lines.push('📁 目录结构')
  for (const src of config.sourcePaths) {
    const treeLines = await buildWebhookTree(src)
    lines.push(...treeLines)
  }

  lines.push('')
  return lines.join('\n')
}

async function buildDirectoryTree(
  dirs: string[],
  prefix = ''
): Promise<string[]> {
  const lines: string[] = []

  for (const dir of dirs) {
    const dirName = basename(dir)
    const children: string[] = []

    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        const child = join(dir, e.name)
        if (e.isDirectory()) {
          children.push(child)
        } else {
          const s = await stat(child)
          lines.push(`${prefix}  ${e.name}  (${formatBytes(s.size)})`)
        }
      }
      if (children.length) {
        const subLines = await buildDirectoryTree(children, prefix + '  ')
        lines.push(...subLines)
      }
    } catch { /* skip */ }
    const dirSize = await dirTotalSize(dir)
    lines.unshift(`${prefix}📁 ${dirName}/  (${formatBytes(dirSize)})`)
  }

  return lines
}

export class ReportGenerator {
  constructor(private reportsDir: string) {}

  async generate(
    config: TaskConfig,
    files: { abs: string; rel: string; size: number }[],
    destinations: Destination[],
    startedAt: string,
    verificationOk?: boolean,
    sourceBytes?: number,
    destBytes?: number
  ): Promise<string> {
    await mkdir(this.reportsDir, { recursive: true })

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const safeName = (config.projectName || config.name).replace(/[^a-zA-Z0-9一-鿿]/g, '_')
    const filename = `${safeName}_${stamp}.txt`

    const totalBytes = files.reduce((s, f) => s + f.size, 0)

    const border = '═'.repeat(60)
    const thin = '─'.repeat(60)

    const verLine = verificationOk === undefined
      ? '  未校验 / Not verified'
      : verificationOk
        ? `  ✓ 通过 / Passed  (src ${formatBytes(sourceBytes ?? 0)} = dest ${formatBytes(destBytes ?? 0)})`
        : `  ✗ 失败 / FAILED  (src ${formatBytes(sourceBytes ?? 0)} ≠ dest ${formatBytes(destBytes ?? 0)})`

    const lines: string[] = [
      border,
      '  DiskHop — 拷贝报告 / Transfer Report',
      border,
      `  项目名称 / Project:   ${config.projectName || config.name}`,
      `  起止日期 / Date Range: ${config.dateRangeStart || '—'} ~ ${config.dateRangeEnd || '—'}`,
      `  操作人 / Operator:    ${config.operator || '—'}`,
      `  开始时间 / Started:   ${new Date(startedAt).toLocaleString()}`,
      `  完成时间 / Finished:  ${new Date().toLocaleString()}`,
      `  文件数量 / Files:     ${files.length}`,
      `  总大小 / Total Size:  ${formatBytes(totalBytes)}`,
      border,
      '',
      '  源路径 / Sources:',
      ...config.sourcePaths.map(p => `    • ${p}`),
      '',
      '  目标路径 / Destinations:',
      ...destinations.map(d => `    • ${d.name}  →  ${d.path}`),
      '',
      thin,
      '  校验结果 / Verification:',
      verLine,
      thin,
      '',
    ]

    lines.push('  目录结构 / Directory Tree:')
    for (const src of config.sourcePaths) {
      const treeLines = await buildDirectoryTree([src], '    ')
      lines.push(...treeLines)
    }
    lines.push('')

    const content = lines.join('\n')
    const reportPath = join(this.reportsDir, filename)
    await writeFile(reportPath, content, 'utf-8')

    for (const dest of destinations) {
      for (const src of config.sourcePaths) {
        try {
          await copyFile(reportPath, join(dest.path, basename(src), filename))
        } catch { /* skip if dest unavailable */ }
      }
    }

    try {
      const downloadsDir = app.getPath('downloads')
      await copyFile(reportPath, join(downloadsDir, filename))
    } catch { /* skip */ }

    return reportPath
  }

  async saveAs(reportPath: string): Promise<string | undefined> {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: basename(reportPath),
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (canceled || !filePath) return undefined
    await copyFile(reportPath, filePath)
    return filePath
  }
}
