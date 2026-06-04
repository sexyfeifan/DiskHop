import { HardDrive, History, Settings, LayoutDashboard, Activity } from 'lucide-react'
import { useBackupStore, type Page } from '../store/backupStore'

export function Sidebar() {
  const { activePage, setActivePage, activeTask, progress, t } = useBackupStore()

  const isBackupActive =
    !!activeTask &&
    !!progress &&
    progress.phase !== 'done' &&
    progress.phase !== 'cancelled' &&
    progress.phase !== 'error'

  function navigate(id: Page) {
    setActivePage(id)
  }

  const navItems: { id: Page; icon: React.FC<{ size?: number; strokeWidth?: number }>; labelKey: 'navNewBackup' | 'navHistory' | 'navSettings' }[] = [
    { id: 'dashboard', icon: LayoutDashboard, labelKey: 'navNewBackup' },
    { id: 'history', icon: History, labelKey: 'navHistory' },
    { id: 'settings', icon: Settings, labelKey: 'navSettings' },
  ]

  return (
    <div className="flex flex-col items-center w-[68px] h-full bg-black/30 border-r border-border-subtle pb-4 gap-1 flex-shrink-0">
      <div className="drag-region flex flex-col items-center justify-end w-full pb-2 pt-14 mb-2">
        <HardDrive size={20} className="text-accent-blue" strokeWidth={1.5} />
        <span className="text-[9px] text-accent-blue font-semibold tracking-widest mt-1 select-none">DiskHop</span>
      </div>

      {navItems.map(({ id, icon: Icon, labelKey }) => (
        <button
          key={id}
          onClick={() => navigate(id)}
          title={t(labelKey)}
          className={`no-drag flex flex-col items-center justify-center w-12 h-12 rounded-xl gap-1 transition-colors
            ${activePage === id
              ? 'bg-accent-blue/20 text-accent-blue'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
        >
          <Icon size={20} strokeWidth={1.5} />
        </button>
      ))}

      {/* Progress button: always visible when there's an active or recent task */}
      {activeTask && (
        <button
          onClick={() => navigate('progress')}
          title={t('navProgress')}
          className={`no-drag flex flex-col items-center justify-center w-12 h-12 rounded-xl gap-1 transition-colors
            ${activePage === 'progress'
              ? 'bg-accent-blue/20 text-accent-blue'
              : isBackupActive
                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 animate-pulse'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
        >
          <Activity size={20} strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
}
