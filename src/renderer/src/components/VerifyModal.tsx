// ─── Confirm Dialog ──────────────────────────────────────────────────────────
export function VerifyModal({
  message,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel: string
  cancelLabel: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-2xl shadow-2xl w-72 overflow-hidden">
        <div className="px-5 py-4">
          <p className="text-sm text-gray-200 leading-relaxed">{message}</p>
        </div>
        <div className="flex border-t border-border">
          <button
            onClick={onCancel}
            className="no-drag flex-1 py-2.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
          >
            {cancelLabel}
          </button>
          <div className="w-px bg-border" />
          <button
            onClick={onConfirm}
            className="no-drag flex-1 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors font-medium"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
