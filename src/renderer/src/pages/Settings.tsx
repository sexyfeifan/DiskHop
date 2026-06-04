import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, FolderOpen, Save, ShieldCheck, Info } from 'lucide-react'
import { useBackupStore } from '../store/backupStore'
import type { Settings, Destination } from '../../../../main/types'
import type { Lang } from '../i18n'

export function SettingsPage() {
  const { settings, setSettings, t, setLang } = useBackupStore()
  const [local, setLocal] = useState<Settings>(settings)
  const [saved, setSaved] = useState(false)
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [appVersion, setAppVersion] = useState('…')
  const destCounterRef = useRef(0)

  useEffect(() => { setLocal(settings) }, [settings])
  useEffect(() => { window.api.getVersion().then(v => setAppVersion(`v${v}`)) }, [])

  async function addDestination() {
    const path = await window.api.pickFolder()
    if (!path) return
    const name = path.split('/').pop() ?? path
    const newDest: Destination = { id: `dest-${++destCounterRef.current}-${Date.now()}`, name, path }
    setLocal(prev => ({ ...prev, destinations: [...prev.destinations, newDest] }))
  }

  function removeDest(id: string) {
    setLocal(prev => ({ ...prev, destinations: prev.destinations.filter(d => d.id !== id) }))
  }

  function updateDestName(id: string, name: string) {
    setLocal(prev => ({
      ...prev,
      destinations: prev.destinations.map(d => d.id === id ? { ...d, name } : d)
    }))
  }

  function changeLang(lang: Lang) {
    setLocal(prev => ({ ...prev, lang }))
    setLang(lang)
  }

  async function testWebhook() {
    const url = local.webhookUrl?.trim()
    if (!url) return
    setWebhookStatus('idle')
    try {
      const result = await window.api.testWebhook(url)
      setWebhookStatus(result.ok ? 'ok' : 'fail')
    } catch {
      setWebhookStatus('fail')
    }
    setTimeout(() => setWebhookStatus('idle'), 3000)
  }

  async function save() {
    await window.api.saveSettings(local)
    setSettings(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const labelCls = 'text-xs text-gray-400 uppercase tracking-wider'

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      {/* Language */}
      <div className="space-y-2">
        <label className={labelCls}>{t('settingsLanguage')}</label>
        <div className="no-drag flex gap-2">
          {(['zh', 'en'] as const).map(lang => (
            <button
              key={lang}
              onClick={() => changeLang(lang)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${local.lang === lang ? 'bg-accent-blue text-white' : 'bg-bg-card border border-border text-gray-400 hover:text-gray-200'}`}
            >
              {lang === 'zh' ? '中文' : 'English'}
            </button>
          ))}
        </div>
      </div>

      {/* Destinations */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={labelCls}>{t('settingsDestinations')}</label>
          <button
            onClick={addDestination}
            className="no-drag flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Plus size={13} /> {t('settingsAdd')}
          </button>
        </div>
        {local.destinations.length === 0 && (
          <div
            onClick={addDestination}
            className="no-drag border border-dashed border-border rounded-lg p-6 text-center text-gray-500 text-sm cursor-pointer hover:border-gray-500 hover:text-gray-400 transition-colors"
          >
            <FolderOpen size={24} className="mx-auto mb-2 opacity-50" />
            {t('settingsClickToAddDest')}
          </div>
        )}
        {local.destinations.map(dest => (
          <div key={dest.id} className="bg-bg-card border border-border rounded-lg px-3 py-2 space-y-1">
            <input
              className="no-drag w-full bg-transparent text-sm text-gray-200 focus:outline-none"
              value={dest.name}
              onChange={e => updateDestName(dest.id, e.target.value)}
            />
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs text-gray-500 truncate font-mono">{dest.path}</span>
              <button onClick={() => removeDest(dest.id)} className="no-drag text-gray-600 hover:text-red-400 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Defaults */}
      <div className="space-y-2">
        <label className={labelCls}>{t('settingsDefaults')}</label>
        <div className="bg-bg-card border border-border rounded-lg divide-y divide-border-subtle">
          {([
            { labelKey: 'settingsVerifyDefault' as const, key: 'defaultVerify' as const },
            { labelKey: 'settingsReportDefault' as const, key: 'defaultReport' as const },
          ]).map(({ labelKey, key }) => (
            <label key={key} className="no-drag flex items-center justify-between px-3 py-2 cursor-pointer">
              <span className="text-sm text-gray-300">{t(labelKey)}</span>
              <input
                type="checkbox"
                checked={local[key] as boolean}
                onChange={e => setLocal(prev => ({ ...prev, [key]: e.target.checked }))}
                className="accent-accent-blue"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Webhook */}
      <div className="space-y-2">
        <label className={labelCls}>{t('settingsWebhook')}</label>
        <div className="flex gap-2">
          <input
            className="no-drag flex-1 bg-bg-card border border-border text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-blue placeholder:text-gray-600"
            placeholder={t('settingsWebhookPlaceholder')}
            value={local.webhookUrl ?? ''}
            onChange={e => setLocal(prev => ({ ...prev, webhookUrl: e.target.value }))}
          />
          <button
            onClick={testWebhook}
            disabled={!local.webhookUrl?.trim()}
            className={`no-drag px-3 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              webhookStatus === 'ok' ? 'bg-green-600 text-white' :
              webhookStatus === 'fail' ? 'bg-red-600 text-white' :
              'bg-bg-card border border-border text-gray-400 hover:text-gray-200 disabled:opacity-40'
            }`}
          >
            {webhookStatus === 'ok' ? t('settingsWebhookTestOk') :
             webhookStatus === 'fail' ? t('settingsWebhookTestFail') :
             t('settingsWebhookTest')}
          </button>
        </div>
      </div>

      {/* Full Disk Access */}
      <div className="space-y-2">
        <label className={labelCls}>{t('settingsDiskAccess')}</label>
        <div className="bg-bg-card border border-border rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400 leading-relaxed">{t('settingsDiskAccessDesc')}</p>
          </div>
          <button
            onClick={() => window.api.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')}
            className="no-drag flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {t('settingsDiskAccessBtn')}
          </button>
        </div>
      </div>

      <button
        onClick={save}
        className="no-drag w-full flex items-center justify-center gap-2 bg-accent-blue hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
      >
        <Save size={14} />
        {saved ? t('settingsSaved') : t('settingsSave')}
      </button>

      {/* About */}
      <div className="space-y-2">
        <label className={labelCls}><Info size={11} className="inline mr-1" />{t('settingsAbout')}</label>
        <div className="bg-bg-card border border-border rounded-lg divide-y divide-border-subtle text-sm">
          {([
            { label: t('settingsAboutVersion'), value: appVersion },
            { label: t('settingsAboutEngine'), value: 'Electron + React' },
            { label: t('settingsAboutVerify'), value: 'rsync + byte count' },
            { label: t('settingsAboutAuthor'), value: '@我是性感的非凡' },
            { label: t('settingsAboutContact'), value: 'zhoufeifan@gmail.com' },
          ] as { label: string; value: string }[]).map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-3 py-2">
              <span className="text-gray-400 text-xs">{label}</span>
              <span className="text-gray-300 text-xs font-mono">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
