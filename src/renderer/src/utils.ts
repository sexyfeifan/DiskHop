/**
 * Shared utility functions for DiskHop renderer.
 */

/** Format a byte count into a human-readable string (B, KB, MB, GB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/** Format a bytes-per-second rate into a human-readable speed string. */
export function formatSpeed(bps: number): string {
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(0)} KB/s`
  if (bps < 1024 ** 3) return `${(bps / 1024 ** 2).toFixed(1)} MB/s`
  return `${(bps / 1024 ** 3).toFixed(2)} GB/s`
}

/** Format seconds into a human-readable ETA string. */
export function formatEta(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

/** Compute a human-readable duration string from two ISO timestamps. */
export function formatDuration(startedAt: string, finishedAt: string): string {
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  return `${m}m ${rs}s`
}

/** Format an ISO timestamp into a locale-aware time string (HH:MM:SS). */
export function formatTime(iso: string, lang: string): string {
  const d = new Date(iso)
  const locale = lang === 'zh' ? 'zh-CN' : 'en-US'
  return d.toLocaleTimeString(locale, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Format an ISO timestamp into a compact `YYYYMMDDHHmmss` string for filenames. */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
}
