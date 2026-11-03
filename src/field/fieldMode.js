// ── Field mode switch ────────────────────────────────────────────────────────
// Field mode is the phone-sized spin-off of the app for project / paint
// managers: today's work, the job list, and one big "mark it done" button per
// job. It reads and writes the exact same store as the full app, so nothing
// done in the field ever gets out of step with the desktop tools.
//
// Who sees what:
//   • Desktop / tablet (≥ 768px): always the full app on '/'. Field mode is
//     still reachable at /field if someone wants it.
//   • Phone: a PM lands in field mode by default; everyone else lands in the
//     full app. Either can flip with one button, and the choice is remembered
//     on that phone.
import { useEffect, useState } from 'react'
import { useStore } from '../store'

const KEY = 'qx.view' // 'field' | 'full'
const PHONE_QUERY = '(max-width: 767px)'

export function readViewPref() {
  try { return localStorage.getItem(KEY) } catch { return null }
}

export function setViewPref(v) {
  try { localStorage.setItem(KEY, v) } catch { /* private mode — fine, just not remembered */ }
}

export function useIsPhone() {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches
  const [phone, setPhone] = useState(get)
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY)
    if (!mq) return
    const on = () => setPhone(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return phone
}

// Roles that get field mode by default on a phone.
const FIELD_ROLES = new Set(['pm'])
// Roles that can switch to it at all (managers like to see what PMs see).
export const canUseField = (role) => role === 'pm' || role === 'manager'

// Should '/' open field mode on this device?
export function useFieldHome() {
  const role = useStore(s => s.role || 'manager')
  const phone = useIsPhone()
  if (!phone || !canUseField(role)) return false
  const pref = readViewPref()
  if (pref === 'full') return false
  if (pref === 'field') return true
  return FIELD_ROLES.has(role)
}
