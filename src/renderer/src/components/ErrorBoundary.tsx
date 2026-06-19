import { Component, type ReactNode } from 'react'
import { useBackupStore } from '../store/backupStore'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const { t } = useBackupStore()
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="text-red-400 text-lg font-medium mb-2">{t('errorTitle')}</div>
      <div className="text-gray-500 text-sm mb-4 max-w-md">
        {error?.message || t('errorUnexpected')}
      </div>
      <button
        onClick={onRetry}
        className="no-drag px-4 py-2 bg-accent-blue hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
      >
        {t('errorRetry')}
      </button>
    </div>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return <ErrorFallback error={this.state.error} onRetry={() => this.setState({ hasError: false, error: null })} />
    }
    return this.props.children
  }
}
