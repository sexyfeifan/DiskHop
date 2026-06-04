import { useEffect, useState, useRef } from 'react'
import { FileText, Lock, Trash2, X } from 'lucide-react'
import { useBackupStore } from '../store/backupStore'
import { formatBytes, formatDuration, formatTime, formatDate } from '../utils'
import type { BackupRecord } from '../../../../main/types'

// ─── Confirm Dialog ──────────────────────────────────────────────────────────
function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel: string
  cancelLabel: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-2xl shadow-2xl w-72 overflow-hidden">
        <div className="px-5 py-4">
          <p className="text-sm text-gray-200 leading-relaxed">{message}</p>
        </div>
        <div className="flex border-t border-border">
          <button
            onClick={onCancel}
            className="no-drag flex-1 py-2.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
          >
            {cancelLabel}
          </button>
          <div className="w-px bg-border" />
          <button
            onClick={onConfirm}
            className="no-drag flex-1 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors font-medium"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────
function BackupHeatmap({ history }: { history: BackupRecord[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; header: string; rows: { name: string; bytes: number; status: string }[] } | null>(null)
  const [pageOffset, setPageOffset] = useState(0) // in weeks; 0 = current, positive = further back
  const containerRef = useRef<HTMLDivElement>(null)

  // Build a map: dateKey (YYYY-MM-DD) → aggregated data + per-record list
  const countMap = new Map<string, { count: number; bytes: number; success: number; records: { name: string; bytes: number; status: string }[] }>()
  for (const r of history) {
    const d = new Date(r.startedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const prev = countMap.get(key) ?? { count: 0, bytes: 0, success: 0, records: [] }
    countMap.set(key, {
      count: prev.count + 1,
      bytes: prev.bytes + (r.bytesTotal || 0),
      success: prev.success + (r.status === 'success' ? 1 : 0),
      records: [...prev.records, { name: r.taskName, bytes: r.bytesTotal || 0, status: r.status }],
    })
  }

  // Build 91 days (13 weeks) grid anchored by pageOffset weeks back from today
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const windowEnd = new Date(today)
  windowEnd.setDate(today.getDate() - pageOffset * 7)
  const days: { key: string; date: Date }[] = []
  for (let i = 90; i >= 0; i--) {
    const d = new Date(windowEnd)
    d.setDate(windowEnd.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({ key, date: d })
  }

  const isCurrentPage = pageOffset === 0

  const maxCount = Math.max(1, ...Array.from(countMap.values()).map(v => v.count))

  function cellColor(key: string) {
    const data = countMap.get(key)
    if (!data || data.count === 0) return 'bg-gray-800/60'
    const intensity = data.count / maxCount
    if (intensity < 0.25) return 'bg-blue-700/50'
    if (intensity < 0.5) return 'bg-blue-600/70'
    if (intensity < 0.75) return 'bg-blue-500/85'
    return 'bg-blue-400'
  }

  function handleMouseEnter(e: React.MouseEvent, key: string) {
    const data = countMap.get(key)
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const [year, month, day] = key.split('-')
    const dateStr = `${year}/${month}/${day}`

    if (!data || data.count === 0) {
      setTooltip({ x, y, header: `${dateStr}  无备份`, rows: [] })
    } else {
      const successRate = Math.round((data.success / data.count) * 100)
      setTooltip({
        x,
        y,
        header: `${dateStr}  ${data.count} 次备份  成功率 ${successRate}%  共 ${formatBytes(data.bytes)}`,
        rows: data.records,
      })
    }
  }

  // Build weeks: columns of 7 days
  const weeks: { key: string; date: Date }[][] = []
  let week: { key: string; date: Date }[] = []
  // Pad start so week aligns to Sunday
  const firstDow = days[0].date.getDay() // 0=Sun
  for (let i = 0; i < firstDow; i++) {
    week.push({ key: '', date: new Date(0) })
  }
  for (const d of days) {
    week.push(d)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push({ key: '', date: new Date(0) })
    weeks.push(week)
  }

  // Month labels
  const monthLabels: { label: string; col: number }[] = []
  let lastMonth = -1
  weeks.forEach((wk, wi) => {
    const firstReal = wk.find(d => d.key !== '')
    if (firstReal) {
      const m = firstReal.date.getMonth()
      if (m !== lastMonth) {
        monthLabels.push({ label: `${firstReal.date.getMonth() + 1}月`, col: wi })
        lastMonth = m
      }
    }
  })

  return (
    <div
      ref={containerRef}
      className="relative px-6 pt-3 pb-2 border-b border-border-subtle select-none"
      onMouseLeave={() => setTooltip(null)}
    >
      {/* Month labels + nav buttons */}
      <div className="flex items-center mb-1" style={{ gap: '3px' }}>
        <button
          onClick={() => { setPageOffset(o => o + 13); setTooltip(null) }}
          className="no-drag shrink-0 mr-1 text-gray-600 hover:text-gray-300 transition-colors text-[10px] leading-none px-1"
          title="往前翻页"
        >‹</button>
        {weeks.map((_, wi) => {
          const label = monthLabels.find(m => m.col === wi)
          return (
            <div key={wi} className="flex flex-col flex-1">
              <span className="text-[9px] text-gray-600 leading-none">{label?.label ?? ''}</span>
            </div>
          )
        })}
        <button
          onClick={() => { setPageOffset(o => Math.max(0, o - 13)); setTooltip(null) }}
          className={`no-drag shrink-0 ml-1 transition-colors text-[10px] leading-none px-1 ${isCurrentPage ? 'text-gray-800 cursor-default' : 'text-gray-600 hover:text-gray-300'}`}
          disabled={isCurrentPage}
          title="往后翻页"
        >›</button>
      </div>

      {/* Grid: weeks as columns, days as rows */}
      <div className="flex" style={{ gap: '3px' }}>
        {weeks.map((wk, wi) => (
          <div key={wi} className="flex flex-col flex-1" style={{ gap: '3px' }}>
            {wk.map((day, di) => (
              <div
                key={di}
                className={`rounded-sm cursor-default transition-opacity ${day.key ? cellColor(day.key) : 'opacity-0'}`}
                style={{ height: 12 }}
                onMouseEnter={day.key ? e => handleMouseEnter(e, day.key) : undefined}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 bg-gray-900 border border-border rounded-lg px-2.5 py-2 whitespace-nowrap shadow-lg"
          style={{
            left: Math.min(tooltip.x + 10, (containerRef.current?.clientWidth ?? 600) - 300),
            top: tooltip.y - (tooltip.rows.length > 0 ? tooltip.rows.length * 18 + 44 : 36),
          }}
        >
          <div className="text-[11px] text-gray-200">{tooltip.header}</div>
          {tooltip.rows.length > 0 && (
            <div className="mt-1 space-y-0.5 border-t border-gray-700/60 pt-1">
              {tooltip.rows.map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`text-[10px] shrink-0 ${row.status === 'success' ? 'text-green-400' : row.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>
                    {row.status === 'success' ? '✓' : row.status === 'failed' ? '✗' : '○'}
                  </span>
                  <span className="text-[10px] text-gray-300 flex-1">{row.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{formatBytes(row.bytes)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── History Card ─────────────────────────────────────────────────────────────
function HistoryCard({
  record,
  hasReport,
  t,
  lang,
  onDelete,
}: {
  record: BackupRecord
  hasReport: boolean
  t: (key: string) => string
  lang: string
  onDelete: (id: string) => void
}) {
  const [showLogs, setShowLogs] = useState(false)
  const isSuccess = record.status === 'success'
  const isFailed = record.status === 'failed'
  const isCancelled = record.status === 'cancelled'

  const bannerBg = isSuccess ? 'bg-green-600/20 border-green-600/30' : isFailed ? 'bg-red-600/20 border-red-600/30' : 'bg-amber-600/20 border-amber-600/30'
  const bannerText = isSuccess ? 'text-green-400' : isFailed ? 'text-red-400' : 'text-amber-400'

  let bannerMsg = ''
  if (isSuccess) {
    if (record.verificationOk) {
      bannerMsg = t('historyBannerSuccess').replace('{n}', String(record.filesTotal))
    } else if (record.verificationOk === false) {
      bannerMsg = t('historyBannerVerifyFail')
    } else {
      bannerMsg = t('historyBannerSuccessNoVerify').replace('{n}', String(record.filesTotal))
    }
  } else if (isFailed) {
    bannerMsg = t('historyBannerFailed')
  } else {
    bannerMsg = t('historyBannerCancelled')
  }

  const cardTitle = `${record.taskName}_${formatDate(record.startedAt)}`

  return (
    <div className="bg-bg-card border border-border-subtle rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="text-sm font-semibold text-gray-200 flex-1 truncate font-mono">{cardTitle}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {isSuccess && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600/20 text-green-400 border border-green-600/30 font-medium">
              {t('statusSuccess')}
            </span>
          )}
          {isFailed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30 font-medium">
              {t('statusFailed')}
            </span>
          )}
          {isCancelled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-400 border border-amber-600/30 font-medium">
              {t('statusCancelled')}
            </span>
          )}
          {record.verificationOk === true && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400 border border-blue-600/30 font-medium">
              {t('historyVerified')}
            </span>
          )}
          {record.verificationOk === false && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30 font-medium">
              {t('historyUnverified')}
            </span>
          )}
          <button
            onClick={() => onDelete(record.id)}
            className="no-drag ml-1 text-gray-600 hover:text-red-400 transition-colors"
            title={t('historyDelete')}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Project meta: date range + operator */}
      {(record.dateRangeStart || record.dateRangeEnd || record.operator) && (
        <div className="px-4 pb-1 flex flex-wrap gap-x-4 gap-y-0.5">
          {(record.dateRangeStart || record.dateRangeEnd) && (
            <span className="text-[11px] text-gray-500">
              {record.dateRangeStart ?? ''}{record.dateRangeStart && record.dateRangeEnd ? ' → ' : ''}{record.dateRangeEnd ?? ''}
            </span>
          )}
          {record.operator && (
            <span className="text-[11px] text-gray-500">
              {t('historyOperator')}: {record.operator}
            </span>
          )}
        </div>
      )}

      {/* Source paths */}
      {record.sourcePaths && record.sourcePaths.length > 0 && (
        <div className="px-4 pb-1 space-y-0.5">
          {record.sourcePaths.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-400 border border-gray-600/30 shrink-0 flex items-center gap-0.5">
                <Lock size={9} className="inline" /> {t('historySource')}
              </span>
              <span className="text-[11px] text-gray-500 truncate font-mono">{p}</span>
            </div>
          ))}
        </div>
      )}

      {/* Destination paths */}
      {record.destinationPaths && record.destinationPaths.length > 0 && (
        <div className="px-4 pb-2 space-y-0.5">
          {record.destinationPaths.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400 border border-blue-700/30 shrink-0">
                {t('historyDest')}
              </span>
              <span className="text-[11px] text-gray-500 truncate font-mono">{d.name}  →  {d.path}</span>
            </div>
          ))}
        </div>
      )}

      {/* Status banner */}
      <div className={`mx-4 mb-2 rounded-lg border px-3 py-2 ${bannerBg}`}>
        <span className={`text-xs font-medium ${bannerText}`}>{bannerMsg}</span>
        {record.errorMessage && (
          <div className="text-xs text-red-400 mt-0.5 truncate">{record.errorMessage}</div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mx-4 mb-3 h-1.5 rounded-full bg-gray-700/50 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isSuccess ? 'bg-green-500' : isFailed ? 'bg-red-500' : 'bg-amber-500'}`}
          style={{ width: '100%' }}
        />
      </div>

      {/* File count + size row */}
      <div className="flex items-center justify-between px-4 mb-2">
        <span className="text-xs text-gray-400">
          {record.filesTotal} {t('historyFiles')}
        </span>
        <span className="text-xs text-gray-400">
          {formatBytes(record.bytesTotal)}
        </span>
      </div>

      {/* Time row */}
      <div className="flex items-center gap-4 px-4 mb-3 text-[11px] text-gray-500">
        <span>{t('historyTimeStart')} {formatTime(record.startedAt, lang)}</span>
        <span>{t('historyTimeEnd')} {formatTime(record.finishedAt, lang)}</span>
        <span>{t('historyTimeDuration')} {formatDuration(record.startedAt, record.finishedAt)}</span>
      </div>

      {/* Bottom row: dest tags + report + logs button */}
      <div className="flex items-center justify-between px-4 pb-3 gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {record.destinationPaths?.map((d, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-700/30 text-indigo-300 border border-indigo-600/30"
            >
              {d.name}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {record.logs && record.logs.length > 0 && (
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="no-drag flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              📋 {showLogs ? '隐藏日志' : '查看日志'}
            </button>
          )}
          {record.reportPath && hasReport && (
            <button
              onClick={() => window.api.openFile(record.reportPath!)}
              className="no-drag flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <FileText size={11} /> {t('btnViewReport')}
            </button>
          )}
        </div>
      </div>

      {/* Log viewer */}
      {showLogs && record.logs && (
        <div className="mx-4 mb-3 bg-gray-900 border border-border-subtle rounded-lg px-3 py-2 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">执行日志</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(record.logs!.join('\n'))
              }}
              className="no-drag text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              复制
            </button>
          </div>
          {record.logs.map((line, i) => (
            <div key={i} className="text-[11px] text-gray-400 font-mono whitespace-pre-wrap break-all leading-relaxed">{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main History Page ────────────────────────────────────────────────────────
export function History() {
  const { history, setHistory, settings, t } = useBackupStore()
  const [existingReports, setExistingReports] = useState<Set<string>>(new Set())
  const [confirmAction, setConfirmAction] = useState<null | { type: 'delete'; id: string } | { type: 'clearAll' }>(null)

  useEffect(() => {
    window.api.getHistory().then(setHistory)
  }, [])

  useEffect(() => {
    const paths = history.map(r => r.reportPath).filter((p): p is string => !!p)
    if (!paths.length) return
    Promise.all(paths.map(p => window.api.fileExists(p).then(ok => ({ p, ok })))).then(results => {
      const existing = new Set(results.filter(r => r.ok).map(r => r.p))
      setExistingReports(existing)
    })
  }, [history])

  async function handleClearAll() {
    setConfirmAction(null)
    await window.api.clearHistory()
    setHistory([])
  }

  async function handleDeleteRecord(id: string) {
    setConfirmAction(null)
    await window.api.deleteHistoryRecord(id)
    setHistory(history.filter(r => r.id !== id))
  }

  function requestDelete(id: string) {
    setConfirmAction({ type: 'delete', id })
  }

  function requestClearAll() {
    setConfirmAction({ type: 'clearAll' })
  }

  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        {t('noHistory')}
      </div>
    )
  }

  const confirmMessage = confirmAction?.type === 'clearAll'
    ? t('clearHistoryConfirmMsg')
    : t('historyDeleteConfirm')

  return (
    <div className="flex flex-col h-full">
      {/* Heatmap */}
      <BackupHeatmap history={history} />

      {/* Toolbar */}
      <div className="flex items-center justify-end px-6 py-2.5 border-b border-border-subtle">
        <button
          onClick={requestClearAll}
          className="no-drag flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors"
        >
          <Trash2 size={12} /> {t('clearAll')}
        </button>
      </div>

      {/* Records */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {history.map(record => (
          <HistoryCard
            key={record.id}
            record={record}
            hasReport={!!(record.reportPath && existingReports.has(record.reportPath))}
            t={t}
            lang={settings.lang}
            onDelete={requestDelete}
          />
        ))}
      </div>

      {/* Confirmation dialog */}
      {confirmAction && (
        <ConfirmDialog
          message={confirmMessage}
          confirmLabel={t('confirmYes')}
          cancelLabel={t('confirmCancel')}
          onConfirm={() => {
            if (confirmAction.type === 'clearAll') handleClearAll()
            else handleDeleteRecord(confirmAction.id)
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
