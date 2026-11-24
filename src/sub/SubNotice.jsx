// ── A notice from the office to every sub ───────────────────────────────────
// ("Invoices are due a day early this week"), on the sub and painter home
// screens and the Invoices screen until it expires (supabase/sub_notices.sql).
import { Megaphone } from 'lucide-react'
import { useSubNotices } from './useSubNotices'
import { useLang } from '../lib/lang'

export default function SubNotice() {
  const lang = useLang()
  const show = useSubNotices()
  if (!show.length) return null
  return (
    <div className="space-y-2">
      {show.map(n => {
        const es = lang === 'es' && n.body_es
        return (
          <div key={n.id} className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-900 flex gap-3">
            <Megaphone size={22} className="shrink-0 mt-0.5 text-red-600" />
            <div className="min-w-0">
              <p className="font-bold text-base">{es ? (n.title_es || n.title) : n.title}</p>
              <p className="text-base">{es ? n.body_es : n.body}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
