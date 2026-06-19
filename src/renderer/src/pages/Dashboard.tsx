import { useState, useEffect } from 'react'
import { Play, Loader2 } from 'lucide-react'
import { useBackupStore } from '../store/backupStore'
import { SourceCard, type Volume } from '../components/SourceCard'
import { DestinationsCard } from '../components/DestinationsCard'
import { OptionsCard } from '../components/OptionsCard'
import type { TaskConfig } from '../../../../main/types'

// ─── Dashboard ────────────────────────────────────────────────────────────────
export function Dashboard() {
  const { settings, setActiveTask, setActivePage, setProgress, t } = useBackupStore()

  const [projectName, setProjectName] = useState('')
  const [dateRangeStart, setDateRangeStart] = useState('')
  const [dateRangeEnd, setDateRangeEnd] = useState('')
  const [operator, setOperator] = useState('')
  const [sources, setSources] = useState<string[]>([])
  const [selectedDests, setSelectedDests] = useState<string[]>([])
  const [verify, setVerify] = useState(settings.defaultVerify)
  const [generateReport, setGenerateReport] = useState(settings.defaultReport)
  const [fx3Rename, setFx3Rename] = useState(false)
  const [error, setError] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [volumes, setVolumes] = useState<Volume[]>([])
  const [destOverrides, setDestOverrides] = useState<Record<string, string>>({})
  const [subdirModal, setSubdirModal] = useState<{ destId: string; rootPath: string; destName: string } | null>(null)
  const [mkdirStatus, setMkdirStatus] = useState<string>('')

  useEffect(() => {
    setVerify(settings.defaultVerify)
    setGenerateReport(settings.defaultReport)
  }, [settings.defaultVerify, settings.defaultReport])

  useEffect(() => {
    window.api.listVolumes().then(setVolumes)
  }, [])

  // 【Fix 5】启动时检查是否有未完成的任务
  useEffect(() => {
    window.api.checkInterrupted().then((snapshot) => {
      if (snapshot && typeof snapshot === 'object' && 'taskId' in snapshot) {
        const s = snapshot as { taskId: string; config: TaskConfig; progress: any; timestamp: string }
        const userConfirm = window.confirm(
          `检测到上次未完成的备份任务：\n\n` +
          `项目: ${s.config?.projectName ?? s.config?.name ?? '未知'}\n` +
          `时间: ${s.timestamp}\n\n` +
          `是否继续该任务？\n（选择「取消」将清除该记录）`
        )
        if (userConfirm && s.config) {
          // 用户选择继续 → 重新开始备份
          startBackupWithConfig(s.config)
        } else {
          // 用户选择不继续 → 清除快照
          window.api.clearInterrupted()
        }
      }
    }).catch(() => {})
  }, [])

  const showWebhookWarning = !settings.webhookUrl?.trim()

  function setToday() {
    const today = new Date().toISOString().slice(0, 10)
    setDateRangeStart(today)
    setDateRangeEnd(today)
  }

  async function pickSource() {
    const folders = await window.api.pickFolders()
    if (folders.length) setSources(prev => [...new Set([...prev, ...folders])])
  }

  function removeSource(path: string) {
    setSources(prev => prev.filter(p => p !== path))
  }

  function toggleSource(path: string) {
    setSources(prev =>
      prev.includes(path)
        ? prev.filter(p => p !== path)
        : [...new Set([...prev, path])]
    )
  }

  function toggleDest(id: string) {
    setSelectedDests(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    )
    setDestOverrides(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function ejectVolume(e: React.MouseEvent, vol: Volume) {
    e.stopPropagation()
    const result = await window.api.ejectVolume(vol.path)
    if (result.success) {
      setVolumes(prev => prev.filter(v => v.path !== vol.path))
      setSources(prev => prev.filter(p => p !== vol.path))
    }
  }

  async function createFolderStructure() {
    if (!projectName.trim()) { setError(t('validationProjectName')); return }
    if (!selectedDests.length) { setError(t('validationDest')); return }
    setError('')
    setMkdirStatus('')

    const msgs: string[] = []
    for (const destId of selectedDests) {
      const dest = settings.destinations.find(d => d.id === destId)
      if (!dest) continue
      const basePath = destOverrides[destId] ?? dest.path
      const projectPath = `${basePath}/${projectName.trim()}`
      const r1 = await window.api.mkdir(projectPath)
      if (!r1.success) { msgs.push(`${dest.name}: ${r1.error}`); continue }

      if (dateRangeStart && dateRangeEnd && dateRangeStart !== dateRangeEnd) {
        const start = new Date(dateRangeStart)
        const end = new Date(dateRangeEnd)
        const cur = new Date(start)
        while (cur <= end) {
          const y = cur.getFullYear()
          const m = String(cur.getMonth() + 1).padStart(2, '0')
          const d = String(cur.getDate()).padStart(2, '0')
          await window.api.mkdir(`${projectPath}/${y}${m}${d}`)
          cur.setDate(cur.getDate() + 1)
        }
        msgs.push(`${dest.name} ✓`)
      } else {
        msgs.push(`${dest.name} ✓`)
      }
    }
    setMkdirStatus(msgs.join('  '))
  }

  function openSubdirModal(destId: string) {
    if (!selectedDests.includes(destId)) return
    const dest = settings.destinations.find(d => d.id === destId)
    if (!dest) return
    setSubdirModal({ destId, rootPath: dest.path, destName: dest.name })
  }

  function applySubdirOverride(path: string) {
    if (!subdirModal) return
    setDestOverrides(prev => ({ ...prev, [subdirModal.destId]: path }))
    setSubdirModal(null)
  }

  function resetDestOverride(destId: string) {
    setDestOverrides(prev => {
      const n = { ...prev }
      delete n[destId]
      return n
    })
  }

  async function startBackupWithConfig(config: TaskConfig) {
    setIsRunning(true)
    setActiveTask(config)
    setProgress(null)
    setActivePage('progress')

    const unlisten = window.api.onProgress(setProgress)
    try {
      await window.api.startBackup(config)
    } finally {
      unlisten()
      setIsRunning(false)
    }
  }

  async function startBackup() {
    if (isRunning) return
    setError('')
    if (!projectName.trim()) return setError(t('validationProjectName'))
    if (!dateRangeStart || !dateRangeEnd) return setError(t('validationDateRange'))
    if (!operator.trim()) return setError(t('validationOperator'))
    if (!sources.length) return setError(t('validationSource'))
    if (!selectedDests.length) return setError(t('validationDest'))

    // FX3 rename: scan source for "Untitled" folders and ask user to confirm
    let fx3RenameConfirmed = false
    const taskLogs: string[] = []
    taskLogs.push(`[${new Date().toISOString()}] 开始备份任务`)
    taskLogs.push(`[${new Date().toISOString()}] 源路径: ${sources.join(', ')}`)
    taskLogs.push(`[${new Date().toISOString()}] FX3 开关状态: ${fx3Rename}`)

    if (fx3Rename) {
      try {
        taskLogs.push(`[${new Date().toISOString()}] FX3: 开始扫描源目录…`)
        const scanResults = await window.api.fx3Scan(sources)
        taskLogs.push(`[${new Date().toISOString()}] FX3: 扫描完成, 找到 ${scanResults.length} 个结果`)
        if (scanResults.length > 0) {
          for (const r of scanResults) {
            taskLogs.push(`[${new Date().toISOString()}] FX3: 发现 Untitled → ${r.untitledPath}, 视频: ${r.videoFile}, 建议名: ${r.suggestedName}`)
          }
          const r = scanResults[0]
          const msg = `检测到 Sony FX3 文件夹:\n\n源路径: ${r.untitledPath}\n视频文件: ${r.videoFile}\n建议改名: ${r.suggestedName}\n\n确认在备份完成后将目标端的 "Untitled" 文件夹改名为 "${r.suggestedName}" 吗？`
          const userConfirmed = window.confirm(msg)
          taskLogs.push(`[${new Date().toISOString()}] FX3: 用户确认: ${userConfirmed}`)
          if (userConfirmed) {
            fx3RenameConfirmed = true
          }
        } else {
          taskLogs.push(`[${new Date().toISOString()}] FX3: 未找到符合 Sony FX3 格式的视频文件，跳过改名`)
          window.alert('⚠️ 未检测到 Sony FX3 素材\n\n源目录中未找到符合 FX3 视频格式（如 B165C001_260203YY.mp4）的文件。\n\nFX3 改名流程已取消，将按正常模式备份。')
        }
      } catch (err) {
        taskLogs.push(`[${new Date().toISOString()}] FX3: 扫描失败: ${err}`)
        console.error('[FX3] Scan failed:', err)
      }
    } else {
      taskLogs.push(`[${new Date().toISOString()}] FX3: 开关未开启，跳过`)
    }

    taskLogs.push(`[${new Date().toISOString()}] 最终 fx3Rename: ${fx3RenameConfirmed}`)

    const config: TaskConfig = {
      id: `task-${Date.now()}`,
      name: projectName.trim(),
      projectName: projectName.trim(),
      dateRangeStart,
      dateRangeEnd,
      operator: operator.trim(),
      sourcePaths: sources,
      destinations: selectedDests,
      verify,
      generateReport,
      reportFormat: 'txt',
      fx3Rename: fx3RenameConfirmed,
      fx3Logs: taskLogs,
      destinationOverrides: Object.keys(destOverrides).length > 0 ? destOverrides : undefined,
    }

    await startBackupWithConfig(config)
  }

  const inputCls = 'no-drag w-full bg-bg-card border border-border text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent-blue'
  const dateCls = 'no-drag flex-1 bg-bg-card border border-border text-gray-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent-blue'
  const labelCls = 'text-xs text-gray-400 uppercase tracking-wider mb-1 block'

  return (
    <div className="h-full flex flex-col p-4 gap-3 overflow-hidden">

      {/* Row 1: project name / date range / operator */}
      <div className="flex flex-wrap gap-3 items-end shrink-0">
        <div className="flex-1 min-w-[180px]">
          <label className={labelCls}>{t('fieldProjectName')}</label>
          <input className={inputCls} placeholder={t('fieldProjectNamePlaceholder')}
            value={projectName} onChange={e => setProjectName(e.target.value)} />
        </div>
        <div className="shrink-0">
          <label className={labelCls}>{t('fieldDateRange')}</label>
          <div className="flex items-center gap-1">
            <input type="date" className={dateCls} value={dateRangeStart} onChange={e => setDateRangeStart(e.target.value)} />
            <span className="text-xs text-gray-500 shrink-0 px-0.5">{t('fieldDateRangeTo')}</span>
            <input type="date" className={dateCls} value={dateRangeEnd} onChange={e => setDateRangeEnd(e.target.value)} />
            <button
              onClick={setToday}
              className="no-drag ml-1 shrink-0 text-xs px-2 py-1.5 rounded-lg bg-bg-card border border-border text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
            >
              今日
            </button>
          </div>
        </div>
        <div className="w-36 shrink-0">
          <label className={labelCls}>{t('fieldOperator')}</label>
          <input className={inputCls} placeholder={t('fieldOperatorPlaceholder')}
            value={operator} onChange={e => setOperator(e.target.value)} />
        </div>
      </div>

      {/* Row 2: sources (left) | destinations + options + button (right) */}
      <div className="flex gap-3 flex-1 min-h-0">

        <SourceCard
          sources={sources}
          volumes={volumes}
          fx3Rename={fx3Rename}
          onPickSource={pickSource}
          onRemoveSource={removeSource}
          onToggleSource={toggleSource}
          onEjectVolume={ejectVolume}
          onRefreshVolumes={() => window.api.listVolumes().then(setVolumes)}
          onFx3RenameChange={setFx3Rename}
          t={t}
        />

        {/* Right column: destinations + options + error + button */}
        <div className="flex flex-col w-80 shrink-0 gap-2">

          <DestinationsCard
            destinations={settings.destinations}
            selectedDests={selectedDests}
            destOverrides={destOverrides}
            onToggleDest={toggleDest}
            onOpenSubdirModal={openSubdirModal}
            onResetOverride={resetDestOverride}
            onCreateFolderStructure={createFolderStructure}
            subdirModal={subdirModal}
            onApplySubdirOverride={applySubdirOverride}
            onCancelSubdirModal={() => setSubdirModal(null)}
            mkdirStatus={mkdirStatus}
            t={t}
          />

          <OptionsCard
            verify={verify}
            generateReport={generateReport}
            onVerifyChange={setVerify}
            onReportChange={setGenerateReport}
            showWebhookWarning={showWebhookWarning}
            t={t}
          />

          {error && <p className="text-xs text-accent-red shrink-0">{error}</p>}

          <button
            onClick={startBackup}
            disabled={isRunning}
            className="no-drag shrink-0 w-full flex items-center justify-center gap-2 bg-accent-blue hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            {isRunning
              ? <><Loader2 size={14} className="animate-spin" /> {t('backupRunning')}</>
              : <><Play size={14} /> {t('startBackup')}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
