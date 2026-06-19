// ─── Options Card ────────────────────────────────────────────────────────────
export function OptionsCard({
  verify,
  generateReport,
  onVerifyChange,
  onReportChange,
  showWebhookWarning,
  t,
}: {
  verify: boolean
  generateReport: boolean
  onVerifyChange: (val: boolean) => void
  onReportChange: (val: boolean) => void
  showWebhookWarning: boolean
  t: (k: string) => string
}) {
  return (
    <>
      {/* Options */}
      <div className="shrink-0">
        <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">{t('fieldOptions')}</label>
        <div className="bg-bg-card border border-border rounded-lg divide-y divide-border-subtle">
          <label className="no-drag flex items-center justify-between px-3 py-2 cursor-pointer">
            <span className="text-xs text-gray-300">{t('optionVerify')}</span>
            <input type="checkbox" checked={verify} onChange={e => onVerifyChange(e.target.checked)} className="accent-accent-blue" />
          </label>
          <label className="no-drag flex items-center justify-between px-3 py-2 cursor-pointer">
            <span className="text-xs text-gray-300">{t('optionReport')}</span>
            <input type="checkbox" checked={generateReport} onChange={e => onReportChange(e.target.checked)} className="accent-accent-blue" />
          </label>
        </div>
      </div>

      {showWebhookWarning && (
        <p className="text-xs text-amber-500/80 shrink-0 leading-relaxed">{t('webhookMissingWarning')}</p>
      )}
    </>
  )
}
