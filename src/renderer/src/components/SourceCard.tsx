import { Plus, X, Lock, HardDrive, LogOut, FolderOpen } from 'lucide-react'

export type Volume = { name: string; path: string; totalBytes: number; freeBytes: number; format: string }

function fmt(b: number) {
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
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

// ─── Source Card ─────────────────────────────────────────────────────────────
export function SourceCard({
  sources,
  volumes,
  fx3Rename,
  onPickSource,
  onRemoveSource,
  onToggleSource,
  onEjectVolume,
  onRefreshVolumes,
  onFx3RenameChange,
  t,
}: {
  sources: string[]
  volumes: Volume[]
  fx3Rename: boolean
  onPickSource: () => void
  onRemoveSource: (path: string) => void
  onToggleSource: (path: string) => void
  onEjectVolume: (e: React.MouseEvent, vol: Volume) => void
  onRefreshVolumes: () => void
  onFx3RenameChange: (val: boolean) => void
  t: (k: string) => string
}) {
  return (
    <div className="flex flex-col flex-1 min-w-0 gap-1.5">
      <div className="flex items-center justify-between shrink-0">
        <label className="text-xs text-gray-400 uppercase tracking-wider">
          <Lock size={10} className="inline mr-1 opacity-60" />
          {t('fieldSourceFolders')}
        </label>
        <button onClick={onPickSource}
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
            onClick={() => onFx3RenameChange(!fx3Rename)}
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
            <div onClick={onPickSource}
              className="no-drag h-full border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-gray-500 text-sm cursor-pointer hover:border-gray-500 hover:text-gray-400 transition-colors gap-1.5">
              <HardDrive size={22} className="opacity-40" />
              <span className="text-xs text-center px-4">未检测到外接磁盘或储存卡，请插入后刷新</span>
              <button
                onClick={e => { e.stopPropagation(); onRefreshVolumes() }}
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
                  onToggle={() => onToggleSource(vol.path)}
                  onEject={e => onEjectVolume(e, vol)}
                  ejectLabel={t('ejectDisk')}
                />
              ))}
              <button
                onClick={onPickSource}
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
              <button onClick={() => onRemoveSource(src)} className="no-drag text-gray-500 hover:text-gray-300">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
