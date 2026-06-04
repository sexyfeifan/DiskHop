import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Dashboard } from './pages/Dashboard'
import { Progress } from './pages/Progress'
import { History } from './pages/History'
import { SettingsPage } from './pages/Settings'
import { useBackupStore } from './store/backupStore'

export default function App() {
  const { activePage, setSettings, setHistory } = useBackupStore()

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.getHistory().then(setHistory)
  }, [])

  return (
    <div className="flex h-full w-full bg-bg-primary overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <ErrorBoundary>
          <div className="flex-1 overflow-hidden">
            {activePage === 'dashboard' && <Dashboard />}
            {activePage === 'progress' && <Progress />}
            {activePage === 'history' && <History />}
            {activePage === 'settings' && <SettingsPage />}
          </div>
        </ErrorBoundary>
      </div>
    </div>
  )
}
