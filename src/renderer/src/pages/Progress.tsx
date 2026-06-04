import { CheckCircle, XCircle, Loader2, FileText, FolderOpen, Download } from 'lucide-react'
import { useBackupStore } from '../store/backupStore'
import { formatBytes, formatSpeed, formatEta } from '../utils'

export function Progress() {
  const { progress, activeTask, setActivePage, t } = useBackupStore()

  if (!activeTask) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        {t('noActiveTask')}
      </div>
    )
  }

  const isDone = progress?.phase === 'done'
  const isError = progress?.phase === 'error'
  const isCancelled = progress?.phase === 'cancelled'
  const filesTotal = progress?.filesTotal ?? 0
  const filesDone = progress?.filesDone ?? 0
  const bytesTotal = progress?.bytesTotal ?? 0
  const bytesDone = progress?.bytesDone ?? 0
  const pct = bytesTotal > 0 ? Math.round((bytesDone / bytesTotal) * 100) : 0

  const phaseLabel = () => {
    switch (progress?.phase) {
      case 'scanning': return t('phaseScanning')
      case 'copying': return t('phaseCopying')
      case 'verifying': return t('phaseVerifying')
      case 'done': return t('phaseDone')
      case 'cancelled': return t('phaseCancelled')
      case 'error': return t('phaseError')
      default: return '…'
    }
  }

  const verificationOk = progress?.verificationOk
  const verificationDone = progress?.phase === 'done' && progress?.verificationOk !== undefined

  return (
    <div className="flex flex-col h-full p-6 gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3">
        {isDone && <CheckCircle size={22} className="text-accent-green shrink-0" />}
        {isError && <XCircle size={22} className="text-accent-red shrink-0" />}
        {isCancelled && <XCircle size={22} className="text-amber-400 shrink-0" />}
        {!isDone && !isError && !isCancelled && <Loader2 size={22} className="text-accent-blue shrink-0 animate-spin" />}
        <div>
          <div className="text-base font-medium text-gray-100">{activeTask.projectName || activeTask.name}</div>
          <div className={`text-xs ${isDone ? 'text-accent-green font-medium' : isError ? 'text-accent-red' : 'text-gray-500'}`}>{phaseLabel()}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-gray-400">
          <span>{filesDone} / {filesTotal} {t('progressFiles')}</span>
          <span className={isDone ? 'text-accent-green font-medium' : ''}>{pct}%</span>
        </div>
        <div className="h-2 bg-bg-card rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-200 ${isDone ? 'bg-accent-green' : isError ? 'bg-accent-red' : 'bg-accent-blue'}`}
            style={{ width: `${isDone ? 100 : pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>{formatBytes(bytesDone)}</span>
          <span>{formatBytes(bytesTotal)}</span>
        </div>
      </div>

      {/* Speed + ETA */}
      {!isDone && !isError && !isCancelled && (
        <div className="flex gap-4 text-xs text-gray-500">
          {(progress?.speedBps ?? 0) > 0 && (
            <span>{t('progressSpeed')}: <span className="text-gray-300">{formatSpeed(progress!.speedBps!)}</span></span>
          )}
          {(progress?.etaSec ?? 0) > 0 && (
            <span>{t('progressEta')}: <span className="text-gray-300">{formatEta(progress!.etaSec!)}</span></span>
          )}
        </div>
      )}

      {/* Current file */}
      {progress?.currentFile && !isDone && !isError && (
        <div className="bg-bg-card border border-border-subtle rounded-lg px-3 py-2">
          <div className="text-xs text-gray-500 mb-0.5">
            {progress.phase === 'verifying' ? t('phaseVerifying') : t('progressCurrentFile')}
          </div>
          <div className="text-xs text-gray-300 truncate font-mono">{progress.currentFile}</div>
        </div>
      )}

      {/* Rolling log */}
      {progress?.logLines && progress.logLines.length > 0 && !isDone && !isError && (
        <div className="bg-bg-card border border-border-subtle rounded-lg px-3 py-2 space-y-0.5">
          <div className="text-xs text-gray-500 mb-1">{t('progressLog')}</div>
          {progress.logLines.map((line, i) => (
            <div key={i} className="text-xs text-gray-400 font-mono truncate">{line}</div>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-3 text-sm text-red-400">
          {progress.error}
        </div>
      )}

      {/* Verification result */}
      {verificationDone && (
        <div className={`rounded-lg px-3 py-3 text-sm ${verificationOk
          ? 'bg-green-500/10 border border-green-500/30 text-green-400'
          : 'bg-red-500/10 border border-red-500/30 text-red-400'
        }`}>
          <div>{verificationOk ? t('verificationPassed') : t('verificationFailed')}</div>
          {progress?.sourceBytes !== undefined && (
            <div className="text-xs mt-1 opacity-80">
              {t('labelSourceBytes')}: {formatBytes(progress.sourceBytes ?? 0)}
              {' / '}
              {t('labelDestBytes')}: {formatBytes(progress.destBytes ?? 0)}
            </div>
          )}
        </div>
      )}

      {/* Done actions */}
      {isDone && (
        <div className="flex flex-col gap-2 mt-auto">
          {progress?.reportPath && (
            <div className="flex gap-2">
              <button
                onClick={() => window.api.openFile(progress.reportPath!)}
                className="no-drag flex items-center gap-2 flex-1 justify-center bg-bg-card border border-border hover:border-gray-500 text-gray-300 rounded-lg py-2.5 text-sm transition-colors"
              >
                <FileText size={15} /> {t('btnViewReport')}
              </button>
              <button
                onClick={() => window.api.reportSaveAs(progress.reportPath!)}
                className="no-drag flex items-center gap-2 flex-1 justify-center bg-bg-card border border-border hover:border-gray-500 text-gray-300 rounded-lg py-2.5 text-sm transition-colors"
              >
                {t('btnSaveAs')}
              </button>
              <button
                onClick={() => window.api.openDownloads()}
                className="no-drag flex items-center gap-2 justify-center bg-bg-card border border-border hover:border-gray-500 text-gray-300 rounded-lg py-2.5 px-3 text-sm transition-colors"
                title={t('btnOpenDownloads')}
              >
                <Download size={15} />
              </button>
            </div>
          )}
          <button
            onClick={() => setActivePage('dashboard')}
            className="no-drag flex items-center gap-2 justify-center bg-accent-blue hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            {t('btnNewBackup')}
          </button>
        </div>
      )}

      {/* Cancel */}
      {!isDone && !isError && !isCancelled && activeTask && (
        <div className="mt-auto">
          <button
            onClick={() => window.api.cancelBackup(activeTask.id)}
            className="no-drag w-full text-sm text-gray-500 hover:text-gray-300 transition-colors py-2"
          >
            {t('cancelBackup')}
          </button>
        </div>
      )}

      {/* Cancelled return */}
      {isCancelled && (
        <div className="mt-auto">
          <button
            onClick={() => setActivePage('dashboard')}
            className="no-drag w-full flex items-center gap-2 justify-center bg-bg-card border border-border hover:border-gray-500 text-gray-300 rounded-lg py-2.5 text-sm transition-colors"
          >
            {t('btnNewBackup')}
          </button>
        </div>
      )}
    </div>
  )
}
