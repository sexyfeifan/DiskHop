import { useBackupStore } from '../store/backupStore'

const pageTitleKeys = {
  dashboard: 'navNewBackup',
  progress: 'navProgress',
  history: 'navHistory',
  settings: 'navSettings',
} as const

/** Top header bar showing the current page title. */
export function Header() {
  const { activePage, t } = useBackupStore()
  const key = pageTitleKeys[activePage as keyof typeof pageTitleKeys]

  return (
    <div className="drag-region flex items-center h-11 px-4 border-b border-border-subtle flex-shrink-0">
      <span className="text-sm font-medium text-gray-300 select-none">
        {key ? t(key) : ''}
      </span>
    </div>
  )
}
