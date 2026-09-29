export function getPeriodRange(period, refDate) {
  const d = new Date(refDate)
  if (period === 'year') {
    return {
      start: new Date(d.getFullYear(), 0, 1),
      end:   new Date(d.getFullYear(), 11, 31, 23, 59, 59),
      label: String(d.getFullYear()),
    }
  }
  if (period === 'quarter') {
    const q = Math.floor(d.getMonth() / 3)
    return {
      start: new Date(d.getFullYear(), q * 3, 1),
      end:   new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59),
      label: `Q${q + 1} ${d.getFullYear()}`,
    }
  }
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1),
    end:   new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
    label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  }
}

export function shiftPeriod(period, refDate, dir) {
  const d = new Date(refDate)
  if (period === 'year')         d.setFullYear(d.getFullYear() + dir)
  else if (period === 'quarter') d.setMonth(d.getMonth() + dir * 3)
  else                           d.setMonth(d.getMonth() + dir)
  return d
}

export function getPeriodSegments(period, refDate) {
  const d = new Date(refDate)
  if (period === 'year') {
    return Array.from({ length: 12 }, (_, i) => ({
      label:     new Date(d.getFullYear(), i).toLocaleDateString('en-US', { month: 'short' }),
      start:     new Date(d.getFullYear(), i, 1),
      end:       new Date(d.getFullYear(), i + 1, 0, 23, 59, 59),
      isCurrent: i === new Date().getMonth() && d.getFullYear() === new Date().getFullYear(),
    }))
  }
  if (period === 'quarter') {
    const q = Math.floor(d.getMonth() / 3)
    return Array.from({ length: 3 }, (_, i) => {
      const m = q * 3 + i
      return {
        label:     new Date(d.getFullYear(), m).toLocaleDateString('en-US', { month: 'short' }),
        start:     new Date(d.getFullYear(), m, 1),
        end:       new Date(d.getFullYear(), m + 1, 0, 23, 59, 59),
        isCurrent: m === new Date().getMonth() && d.getFullYear() === new Date().getFullYear(),
      }
    })
  }
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1)
  const monthEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return Array.from({ length: 4 }, (_, i) => {
    const ws = new Date(monthStart); ws.setDate(1 + i * 7)
    const we = new Date(ws);        we.setDate(we.getDate() + 6)
    if (we > monthEnd) we.setTime(monthEnd.getTime())
    return { label: `Wk${i + 1}`, start: ws, end: we, isCurrent: false }
  })
}

export function isCurrentPeriod(period, refDate) {
  const { start: cs } = getPeriodRange(period, new Date())
  const { start: rs } = getPeriodRange(period, refDate)
  return cs.getTime() === rs.getTime()
}
