import { useState, useRef } from 'react'
import type { BackupRecord } from '../../../../main/types'
import { formatBytes } from '../utils'

// ─── Heatmap ─────────────────────────────────────────────────────────────────
export function HeatMap({ history, t }: { history: BackupRecord[]; t: (k: string) => string }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; header: string; rows: { name: string; bytes: number; status: string }[] } | null>(null)
  const [pageOffset, setPageOffset] = useState(0) // in weeks; 0 = current, positive = further back
  const containerRef = useRef<HTMLDivElement>(null)

  // Build a map: dateKey (YYYY-MM-DD) → aggregated data + per-record list
  const countMap = new Map<string, { count: number; bytes: number; success: number; records: { name: string; bytes: number; status: string }[] }>()
  for (const r of history) {
    const d = new Date(r.startedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const prev = countMap.get(key) ?? { count: 0, bytes: 0, success: 0, records: [] }
    countMap.set(key, {
      count: prev.count + 1,
      bytes: prev.bytes + (r.bytesTotal || 0),
      success: prev.success + (r.status === 'success' ? 1 : 0),
      records: [...prev.records, { name: r.taskName, bytes: r.bytesTotal || 0, status: r.status }],
    })
  }

  // Build 91 days (13 weeks) grid anchored by pageOffset weeks back from today
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const windowEnd = new Date(today)
  windowEnd.setDate(today.getDate() - pageOffset * 7)
  const days: { key: string; date: Date }[] = []
  for (let i = 90; i >= 0; i--) {
    const d = new Date(windowEnd)
    d.setDate(windowEnd.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({ key, date: d })
  }

  const isCurrentPage = pageOffset === 0

  const maxCount = Math.max(1, ...Array.from(countMap.values()).map(v => v.count))

  function cellColor(key: string) {
    const data = countMap.get(key)
    if (!data || data.count === 0) return 'bg-gray-800/60'
    const intensity = data.count / maxCount
    if (intensity < 0.25) return 'bg-blue-700/50'
    if (intensity < 0.5) return 'bg-blue-600/70'
    if (intensity < 0.75) return 'bg-blue-500/85'
    return 'bg-blue-400'
  }

  function handleMouseEnter(e: React.MouseEvent, key: string) {
    const data = countMap.get(key)
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const [year, month, day] = key.split('-')
    const dateStr = `${year}/${month}/${day}`

    if (!data || data.count === 0) {
      setTooltip({ x, y, header: t('heatNoBackup').replace('{date}', dateStr), rows: [] })
    } else {
      const successRate = Math.round((data.success / data.count) * 100)
      setTooltip({
        x,
        y,
        header: t('heatBackupInfo').replace('{date}', dateStr).replace('{count}', String(data.count)).replace('{rate}', String(successRate)).replace('{size}', formatBytes(data.bytes)),
        rows: data.records,
      })
    }
  }

  // Build weeks: columns of 7 days
  const weeks: { key: string; date: Date }[][] = []
  let week: { key: string; date: Date }[] = []
  // Pad start so week aligns to Sunday
  const firstDow = days[0].date.getDay() // 0=Sun
  for (let i = 0; i < firstDow; i++) {
    week.push({ key: '', date: new Date(0) })
  }
  for (const d of days) {
    week.push(d)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push({ key: '', date: new Date(0) })
    weeks.push(week)
  }

  // Month labels
  const monthLabels: { label: string; col: number }[] = []
  let lastMonth = -1
  weeks.forEach((wk, wi) => {
    const firstReal = wk.find(d => d.key !== '')
    if (firstReal) {
      const m = firstReal.date.getMonth()
      if (m !== lastMonth) {
        monthLabels.push({ label: t('heatMonth').replace('{n}', String(firstReal.date.getMonth() + 1)), col: wi })
        lastMonth = m
      }
    }
  })

  return (
    <div
      ref={containerRef}
      className="relative px-6 pt-3 pb-2 border-b border-border-subtle select-none"
      onMouseLeave={() => setTooltip(null)}
    >
      {/* Month labels + nav buttons */}
      <div className="flex items-center mb-1" style={{ gap: '3px' }}>
        <button
          onClick={() => { setPageOffset(o => o + 13); setTooltip(null) }}
          className="no-drag shrink-0 mr-1 text-gray-600 hover:text-gray-300 transition-colors text-[10px] leading-none px-1"
          title={t('heatPageBack')}
        >‹</button>
        {weeks.map((_, wi) => {
          const label = monthLabels.find(m => m.col === wi)
          return (
            <div key={wi} className="flex flex-col flex-1">
              <span className="text-[9px] text-gray-600 leading-none">{label?.label ?? ''}</span>
            </div>
          )
        })}
        <button
          onClick={() => { setPageOffset(o => Math.max(0, o - 13)); setTooltip(null) }}
          className={`no-drag shrink-0 ml-1 transition-colors text-[10px] leading-none px-1 ${isCurrentPage ? 'text-gray-800 cursor-default' : 'text-gray-600 hover:text-gray-300'}`}
          disabled={isCurrentPage}
          title={t('heatPageForward')}
        >›</button>
      </div>

      {/* Grid: weeks as columns, days as rows */}
      <div className="flex" style={{ gap: '3px' }}>
        {weeks.map((wk, wi) => (
          <div key={wi} className="flex flex-col flex-1" style={{ gap: '3px' }}>
            {wk.map((day, di) => (
              <div
                key={di}
                className={`rounded-sm cursor-default transition-opacity ${day.key ? cellColor(day.key) : 'opacity-0'}`}
                style={{ height: 12 }}
                onMouseEnter={day.key ? e => handleMouseEnter(e, day.key) : undefined}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 bg-gray-900 border border-border rounded-lg px-2.5 py-2 whitespace-nowrap shadow-lg"
          style={{
            left: Math.min(tooltip.x + 10, (containerRef.current?.clientWidth ?? 600) - 300),
            top: tooltip.y - (tooltip.rows.length > 0 ? tooltip.rows.length * 18 + 44 : 36),
          }}
        >
          <div className="text-[11px] text-gray-200">{tooltip.header}</div>
          {tooltip.rows.length > 0 && (
            <div className="mt-1 space-y-0.5 border-t border-gray-700/60 pt-1">
              {tooltip.rows.map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`text-[10px] shrink-0 ${row.status === 'success' ? 'text-green-400' : row.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>
                    {row.status === 'success' ? '✓' : row.status === 'failed' ? '✗' : '○'}
                  </span>
                  <span className="text-[10px] text-gray-300 flex-1">{row.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{formatBytes(row.bytes)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
