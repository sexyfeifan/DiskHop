import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useBackupStore } from '../store/backupStore'
import { HeatMap } from '../components/HeatMap'
import { TaskRow } from '../components/TaskRow'
import { VerifyModal } from '../components/VerifyModal'

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
      <HeatMap history={history} t={t} />

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
          <TaskRow
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
        <VerifyModal
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
