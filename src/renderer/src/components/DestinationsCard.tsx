import { useState, useEffect } from 'react'
import { FolderPlus, ChevronRight, ChevronLeft, Home, HardDrive, X } from 'lucide-react'
import type { Destination } from '../../../../main/types'

type SubDir = { name: string; path: string }

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
            <div className="px-4 py-6 text-center text-xs text-gray-500">{t('destNoSubdirs')}</div>
          ) : (
            entries.map(e => (
              <div key={e.path} className="flex items-center px-4 py-2.5 hover:bg-white/5 group">
                <HardDrive size={13} className="text-gray-500 shrink-0 mr-2.5" />
                <span className="flex-1 text-xs text-gray-200 truncate">{e.name}</span>
                <button
                  onClick={() => navigateInto(e.path)}
                  className="no-drag opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 transition-all mr-2"
                  title={t('destNavigate')}
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  onClick={() => onSelect(e.path)}
                  className="no-drag opacity-0 group-hover:opacity-100 text-xs text-accent-blue hover:text-blue-400 transition-all"
                >
                  {t('destSelect')}
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
            {t('destCancel')}
          </button>
          <div className="w-px bg-border" />
          <button
            onClick={() => onSelect(currentPath)}
            className="no-drag flex-1 py-2.5 text-sm text-accent-blue hover:text-blue-400 hover:bg-blue-950/30 transition-colors font-medium"
          >
            {t('destSelectThisDir')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Destinations Card ───────────────────────────────────────────────────────
export function DestinationsCard({
  destinations,
  selectedDests,
  destOverrides,
  onToggleDest,
  onOpenSubdirModal,
  onResetOverride,
  onCreateFolderStructure,
  subdirModal,
  onApplySubdirOverride,
  onCancelSubdirModal,
  mkdirStatus,
  t,
}: {
  destinations: Destination[]
  selectedDests: string[]
  destOverrides: Record<string, string>
  onToggleDest: (id: string) => void
  onOpenSubdirModal: (id: string) => void
  onResetOverride: (id: string) => void
  onCreateFolderStructure: () => void
  subdirModal: { destId: string; rootPath: string; destName: string } | null
  onApplySubdirOverride: (path: string) => void
  onCancelSubdirModal: () => void
  mkdirStatus: string
  t: (k: string) => string
}) {
  return (
    <>
      {/* Destinations */}
      <div className="flex flex-col gap-1 flex-1 min-h-0">
        <label className="text-xs text-gray-400 uppercase tracking-wider shrink-0">{t('fieldDestinations')}</label>
        {destinations.length === 0 ? (
          <p className="text-xs text-gray-500 py-1">{t('noDestinationsHint')}</p>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
            {destinations.map(dest => {
              const isChecked = selectedDests.includes(dest.id)
              const override = destOverrides[dest.id]
              return (
                <div key={dest.id} className="flex flex-col">
                  <label
                    className="no-drag flex items-center gap-2.5 bg-bg-card border border-border rounded-lg px-3 py-1.5 cursor-pointer hover:border-gray-600 transition-colors"
                    onDoubleClick={() => onOpenSubdirModal(dest.id)}
                  >
                    <input type="checkbox" checked={isChecked}
                      onChange={() => onToggleDest(dest.id)} className="accent-accent-blue shrink-0" />
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
                          <span className="text-[9px] text-accent-blue">{t('destCustomPath')}</span>
                          <button
                            onClick={e => { e.preventDefault(); onResetOverride(dest.id) }}
                            className="no-drag text-[9px] text-gray-500 hover:text-red-400 transition-colors"
                          >{t('destReset')}</button>
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
            onClick={onCreateFolderStructure}
            className="no-drag w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 border border-border hover:border-gray-500 rounded-lg py-1.5 transition-colors"
          >
            <FolderPlus size={12} /> {t('destCreateFolders')}
          </button>
          {mkdirStatus && (
            <p className="text-[10px] text-green-400 mt-1 text-center">{mkdirStatus}</p>
          )}
        </div>
      )}

      {/* Subdir browser modal */}
      {subdirModal && (
        <SubdirBrowserModal
          rootPath={subdirModal.rootPath}
          destName={subdirModal.destName}
          onSelect={onApplySubdirOverride}
          onCancel={onCancelSubdirModal}
          t={t}
        />
      )}
    </>
  )
}
