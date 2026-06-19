import { useState } from 'react'
import { FileText, Lock, Trash2 } from 'lucide-react'
import { formatBytes, formatDuration, formatTime, formatDate } from '../utils'
import type { BackupRecord } from '../../../../main/types'

// ─── Task Row ────────────────────────────────────────────────────────────────
export function TaskRow({
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
  const isPartial = record.status === 'partial'

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
  } else if (isPartial) {
    bannerMsg = t('historyBannerPartial') || '备份被中断'
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
          {isPartial && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-400 border border-amber-600/30 font-medium">
              {t('statusPartial') || '中断'}
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
              📋 {showLogs ? t('taskHideLogs') : t('taskShowLogs')}
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
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">{t('taskExecLog')}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(record.logs!.join('\n'))
              }}
              className="no-drag text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              {t('taskCopy')}
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
