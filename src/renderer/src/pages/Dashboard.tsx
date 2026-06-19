import { useState, useEffect, useRef } from 'react'
import { FolderOpen, Plus, X, Play, Loader2, Lock, HardDrive, LogOut, FolderPlus, ChevronRight, ChevronLeft, Home, Eye } from 'lucide-react'
import { useBackupStore } from '../store/backupStore'
import type { TaskConfig } from '../../../../main/types'

type Volume = { name: string; path: string; totalBytes: number; freeBytes: number; format: string }
type SubDir = { name: string; path: string }

function fmt(b: number) {
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

// ─── Subdir Browser Modal ────────────────────────────────────────────────────
function SubdirBrowserModal({
  rootPath,
  destName,
  onSelect,
  onCancel,
  t,
}: {
  rootPath: string
  destName: string
  onSelect: (path: string) => void
  onCancel: () => void
  t: (k: string) => string
}) {
  const [currentPath, setCurrentPath] = useState(rootPath)
  const [entries, setEntries] = useState<SubDir[]>([])
  const [history, setHistory] = useState<string[]>([rootPath])

  useEffect(() => {
    window.api.listDir(currentPath).then(setEntries)
  }, [currentPath])

  function navigateInto(path: string) {
    setHistory(prev => [...prev, path])
    setCurrentPath(path)
  }

  function navigateBack() {
    if (history.length <= 1) return
    const prev = history[history.length - 2]
    setHistory(h => h.slice(0, -1))
    setCurrentPath(prev)
  }

  function navigateHome() {
    setHistory([rootPath])
    setCurrentPath(rootPath)
  }

  const displayPath = currentPath.replace(rootPath, destName)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-2xl shadow-2xl w-96 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
          <button
            onClick={navigateBack}
            disabled={history.length <= 1}
            className="no-drag text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button onClick={navigateHome} className="no-drag text-gray-400 hover:text-gray-200 transition-colors">
            <Home size={14} />
          </button>
          <span className="flex-1 text-xs text-gray-400 font-mono truncate ml-1">{displayPath}</span>
          <button onClick={onCancel} className="no-drag text-gray-500 hover:text-gray-300 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto max-h-72 divide-y divide-border-subtle">
          {entries.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-gray-500">无子目录</div>
          ) : (
            entries.map(e => (
              <div key={e.path} className="flex items-center px-4 py-2.5 hover:bg-white/5 group">
                <HardDrive size={13} className="text-gray-500 shrink-0 mr-2.5" />
                <span className="flex-1 text-xs text-gray-200 truncate">{e.name}</span>
                <button
                  onClick={() => navigateInto(e.path)}
                  className="no-drag opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 transition-all mr-2"
                  title="进入"
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  onClick={() => onSelect(e.path)}
                  className="no-drag opacity-0 group-hover:opacity-100 text-xs text-accent-blue hover:text-blue-400 transition-all"
                >
                  选择
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer: select current dir */}
        <div className="flex border-t border-border-subtle">
          <button
            onClick={onCancel}
            className="no-drag flex-1 py-2.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <div className="w-px bg-border" />
          <button
            onClick={() => onSelect(currentPath)}
            className="no-drag flex-1 py-2.5 text-sm text-accent-blue hover:text-blue-400 hover:bg-blue-950/30 transition-colors font-medium"
          >
            选择此目录
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Volume Card ─────────────────────────────────────────────────────────────
function VolumeCard({
  vol,
  isSelected,
  onToggle,
  onEject,
  ejectLabel,
}: {
  vol: Volume
  isSelected: boolean
  onToggle: () => void
  onEject: (e: React.MouseEvent) => void
  ejectLabel: string
}) {
  const usedBytes = vol.totalBytes - vol.freeBytes
  const usedPct = vol.totalBytes > 0 ? (usedBytes / vol.totalBytes) * 100 : 0
  const barColor = usedPct > 85 ? 'bg-red-500' : usedPct > 60 ? 'bg-amber-400' : 'bg-accent-blue'

  return (
    <div
      className={`no-drag relative flex flex-col gap-1.5 bg-bg-card border rounded-xl px-3 py-2.5 w-[calc(50%-4px)] transition-colors group text-left cursor-pointer
        ${isSelected ? 'border-accent-blue bg-blue-950/30' : 'border-border hover:border-accent-blue hover:bg-blue-950/20'}`}
      onClick={onToggle}
    >
      <button
        onClick={onEject}
        title={ejectLabel}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-amber-400 z-10"
      >
        <LogOut size={13} />
      </button>
      <div className="flex items-center gap-2 pr-5">
        <HardDrive size={18} className={`shrink-0 transition-colors ${isSelected ? 'text-accent-blue' : 'text-gray-400 group-hover:text-accent-blue'}`} />
        <span className="text-xs text-gray-200 truncate font-medium flex-1">{vol.name}</span>
        {isSelected && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-blue/20 text-accent-blue border border-accent-blue/30 shrink-0">已选</span>}
      </div>
      <div className="w-full h-1.5 rounded-full bg-gray-700/60 overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(usedPct, 100).toFixed(1)}%` }} />
      </div>
      <div className="flex items-center justify-between gap-1">
        <div className="flex flex-col">
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">已用</span>
          <span className="text-[11px] text-gray-300 font-mono font-medium">{fmt(usedBytes)}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-gray-600">{usedPct.toFixed(0)}%</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">剩余</span>
          <span className="text-[11px] text-gray-300 font-mono font-medium">{fmt(vol.freeBytes)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-600 font-mono">{vol.format || '—'}</span>
        <span className="text-[10px] text-gray-600 font-mono">共 {fmt(vol.totalBytes)}</span>
      </div>
    </div>
  )
}

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
  // 【Fix 6】dry-run 预览状态
  const [isDryRunning, setIsDryRunning] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<{ dest: string; output: string; transferred: number; totalSize: number }[] | null>(null)

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

        {/* Sources column */}
        <div className="flex flex-col flex-1 min-w-0 gap-1.5">
          <div className="flex items-center justify-between shrink-0">
            <label className="text-xs text-gray-400 uppercase tracking-wider">
              <Lock size={10} className="inline mr-1 opacity-60" />
              {t('fieldSourceFolders')}
            </label>
            <button onClick={pickSource}
              className="no-drag flex items-center gap-1 text-xs text-accent-blue hover:text-blue-400 transition-colors">
              <Plus size={13} /> {t('addFolder')}
            </button>
          </div>

          {/* FX3 rename toggle */}
          <div className="relative group shrink-0 w-fit">
            <label className="no-drag flex items-center gap-2.5 cursor-pointer">
              <button
                type="button"
                role="switch"
                aria-checked={fx3Rename}
                onClick={() => setFx3Rename(!fx3Rename)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fx3Rename ? 'bg-accent-blue' : 'bg-gray-600'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${fx3Rename ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
              </button>
              <span className="text-xs text-gray-400">FX3 备份重命名</span>
            </label>
            <div className="pointer-events-none absolute left-0 top-full mt-1.5 z-50 w-64 rounded-lg bg-gray-900 border border-border shadow-xl px-3 py-2 text-xs text-gray-300 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="font-medium text-gray-200 mb-1">FX3 备份重命名</p>
              <p>备份前自动扫描数据源目录，将 Sony FX3 默认生成的 <span className="font-mono text-gray-400">Untitled</span> 文件夹，根据其内视频文件名前四位字符（镜头代码）重命名，方便素材归档整理。</p>
            </div>
          </div>

          {sources.length === 0 ? (
            <div className="flex-1 overflow-y-auto">
              {volumes.length === 0 ? (
                <div onClick={pickSource}
                  className="no-drag h-full border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-gray-500 text-sm cursor-pointer hover:border-gray-500 hover:text-gray-400 transition-colors gap-1.5">
                  <HardDrive size={22} className="opacity-40" />
                  <span className="text-xs text-center px-4">未检测到外接磁盘或储存卡，请插入后刷新</span>
                  <button
                    onClick={e => { e.stopPropagation(); window.api.listVolumes().then(setVolumes) }}
                    className="no-drag mt-1 text-xs text-accent-blue hover:text-blue-400"
                  >刷新</button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 content-start">
                  {volumes.map(vol => (
                    <VolumeCard
                      key={vol.path}
                      vol={vol}
                      isSelected={sources.includes(vol.path)}
                      onToggle={() => setSources(prev =>
                        prev.includes(vol.path)
                          ? prev.filter(p => p !== vol.path)
                          : [...new Set([...prev, vol.path])]
                      )}
                      onEject={e => ejectVolume(e, vol)}
                      ejectLabel={t('ejectDisk')}
                    />
                  ))}
                  <button
                    onClick={pickSource}
                    className="no-drag flex flex-col items-center gap-1.5 border border-dashed border-border rounded-xl px-4 py-3 w-[calc(50%-4px)] text-gray-500 hover:border-gray-500 hover:text-gray-400 transition-colors"
                  >
                    <Plus size={20} className="opacity-50" />
                    <span className="text-xs">{t('addFolder')}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
              {sources.map(src => (
                <div key={src} className="flex items-center gap-2 bg-bg-card border border-border rounded-lg px-3 py-1.5">
                  <FolderOpen size={13} className="text-gray-400 shrink-0" />
                  <span className="flex-1 text-xs text-gray-300 truncate font-mono">{src}</span>
                  <button onClick={() => removeSource(src)} className="no-drag text-gray-500 hover:text-gray-300">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: destinations + options + error + button */}
        <div className="flex flex-col w-80 shrink-0 gap-2">

          {/* Destinations */}
          <div className="flex flex-col gap-1 flex-1 min-h-0">
            <label className="text-xs text-gray-400 uppercase tracking-wider shrink-0">{t('fieldDestinations')}</label>
            {settings.destinations.length === 0 ? (
              <p className="text-xs text-gray-500 py-1">{t('noDestinationsHint')}</p>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
                {settings.destinations.map(dest => {
                  const isChecked = selectedDests.includes(dest.id)
                  const override = destOverrides[dest.id]
                  return (
                    <div key={dest.id} className="flex flex-col">
                      <label
                        className="no-drag flex items-center gap-2.5 bg-bg-card border border-border rounded-lg px-3 py-1.5 cursor-pointer hover:border-gray-600 transition-colors"
                        onDoubleClick={() => openSubdirModal(dest.id)}
                      >
                        <input type="checkbox" checked={isChecked}
                          onChange={() => toggleDest(dest.id)} className="accent-accent-blue shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-200 truncate">{dest.name}</div>
                          <div
                            className="text-xs text-gray-500 truncate font-mono"
                            title={override ? override : dest.path}
                          >
                            {override ? override : dest.path}
                          </div>
                          {override && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[9px] text-accent-blue">自定义路径</span>
                              <button
                                onClick={e => { e.preventDefault(); setDestOverrides(prev => { const n = { ...prev }; delete n[dest.id]; return n }) }}
                                className="no-drag text-[9px] text-gray-500 hover:text-red-400 transition-colors"
                              >✕ 重置</button>
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Create folder structure button */}
          {selectedDests.length > 0 && (
            <div className="shrink-0">
              <button
                onClick={createFolderStructure}
                className="no-drag w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 border border-border hover:border-gray-500 rounded-lg py-1.5 transition-colors"
              >
                <FolderPlus size={12} /> 新增文件结构
              </button>
              {mkdirStatus && (
                <p className="text-[10px] text-green-400 mt-1 text-center">{mkdirStatus}</p>
              )}
            </div>
          )}

          {/* Options */}
          <div className="shrink-0">
            <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">{t('fieldOptions')}</label>
            <div className="bg-bg-card border border-border rounded-lg divide-y divide-border-subtle">
              <label className="no-drag flex items-center justify-between px-3 py-2 cursor-pointer">
                <span className="text-xs text-gray-300">{t('optionVerify')}</span>
                <input type="checkbox" checked={verify} onChange={e => setVerify(e.target.checked)} className="accent-accent-blue" />
              </label>
              <label className="no-drag flex items-center justify-between px-3 py-2 cursor-pointer">
                <span className="text-xs text-gray-300">{t('optionReport')}</span>
                <input type="checkbox" checked={generateReport} onChange={e => setGenerateReport(e.target.checked)} className="accent-accent-blue" />
              </label>
            </div>
          </div>

          {showWebhookWarning && (
            <p className="text-xs text-amber-500/80 shrink-0 leading-relaxed">{t('webhookMissingWarning')}</p>
          )}

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

      {/* Subdir browser modal */}
      {subdirModal && (
        <SubdirBrowserModal
          rootPath={subdirModal.rootPath}
          destName={subdirModal.destName}
          onSelect={applySubdirOverride}
          onCancel={() => setSubdirModal(null)}
          t={t}
        />
      )}
    </div>
  )
}
