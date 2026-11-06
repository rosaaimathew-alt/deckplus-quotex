// ── Sub app ──────────────────────────────────────────────────────────────────
// What a subcontractor sees when they sign in (team role 'sub'), on their
// phone. Only their own tasks — the database gives a sub login nothing else
// (supabase/sub_role.sql): no proposals, prices, contracts or other subs.
//
//   Tasks — what they're working on, what's next, what's done
//   Task  — where the job is, the PM's notes, today's job photos, and ONE
//           big button that moves it along: I started → Almost done →
//           Completed. Photos are mandatory: every day a task is in
//           progress, and before every status change (lib/taskPhotos).
//   Invoices — invoice the office for a job: the same questions as the
//           office's Google Form, plus the invoice photo / PDF; up to what's
//           left of the agreed amount, once per job per week (SubInvoices,
//           lib/subDraws).
//   Crew  — an outside company's PM (e.g. the electricians) invites their
//           own people and puts one on each job; that person sees only the
//           jobs they're on, never the money (SubCrew).
//
// Near completion and Completed land on the PM's Today screen right away
// ("Schedule inspection"), and in the job's Subs tab in the office.
import { useEffect, useMemo, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Navigation, ChevronRight, CheckCircle2, CalendarDays, LogOut, Settings2, Check, HardHat, Camera, Lock } from 'lucide-react'
import { useStore } from '../store'
import { applyBrandStyles, applyTheme, brandOptions, DEFAULT_BRAND_COLOR } from '../brand'
import { logout } from '../components/AuthGuard'
import { DEMO, resetDemo } from '../demo'
import { SUB_STATUSES, STATUS_PILL, statusKey, statusLabel, statusIndex } from '../lib/subTasks'
import { Card, dayLabel, mapsUrl, todayStr, addDays, useUndo, BackButton } from '../field/shared'
import { photosOn, hasPhotosToday, missingTodaysPhotos } from '../lib/taskPhotos'
import { PhotoDays, AddPhotosButton } from '../components/TaskPhotos'
import { WeekInvoiceCard, InvoicesScreen, NewInvoiceScreen, TaskMoneyLine } from './SubInvoices'
import { CrewLink, CrewPicker, CrewScreen } from './SubCrew'

// The one next step for each status, and what it moves the task to.
const NEXT = {
  booked:  { to: 'started', label: 'I started' },
  started: { to: 'near',    label: 'Almost done' },
  near:    { to: 'done',    label: 'Completed' },
}

// The database only ever sends a sub login the tasks booked for them.
function useMyTasks() {
  const tasks = useStore(s => s.subTasks)
  return useMemo(() => (tasks || []).filter(Boolean), [tasks])
}

const dateRange = (t) => {
  if (!t.startDate && !t.endDate) return ''
  if (!t.endDate) return `Starts ${dayLabel(t.startDate)}`
  if (!t.startDate) return `Finish by ${dayLabel(t.endDate)}`
  return `${dayLabel(t.startDate)} – ${dayLabel(t.endDate)}`
}

// ── Task list ───────────────────────────────────────────────────────────────
function TaskList() {
  const tasks = useMyTasks()
  const me = useStore(s => s.me)
  const [showDone, setShowDone] = useState(false)
  const recent = addDays(-14)
  const byStart = (a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999')
  const working = tasks.filter(t => ['started', 'near'].includes(statusKey(t))).sort(byStart)
  const next = tasks.filter(t => statusKey(t) === 'booked').sort(byStart)
  const done = tasks.filter(t => statusKey(t) === 'done' && (t.statusDates?.done?.at || '').slice(0, 10) >= recent)
    .sort((a, b) => (b.statusDates?.done?.at || '').localeCompare(a.statusDates?.done?.at || ''))

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (me?.displayName || '').split(' ')[0]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="text-sm text-gray-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      <WeekInvoiceCard />
      <CrewLink />

      <Section title="Working on" tasks={working} empty="Nothing in progress." />
      <Section title="Up next" tasks={next} empty="Nothing booked yet. Your PM will add tasks here." />

      {done.length > 0 && (
        <div className="space-y-2.5">
          <button onClick={() => setShowDone(v => !v)} className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Done lately ({done.length}) · {showDone ? 'Hide' : 'Show'}
          </button>
          {showDone && done.map(t => <TaskRow key={t.id} t={t} />)}
        </div>
      )}
    </div>
  )
}

function Section({ title, tasks, empty }) {
  return (
    <div className="space-y-2.5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">{title}</h2>
      {tasks.length === 0 ? <p className="text-sm text-gray-500 px-1">{empty}</p> : tasks.map(t => <TaskRow key={t.id} t={t} />)}
    </div>
  )
}

function TaskRow({ t }) {
  const navigate = useNavigate()
  const st = statusKey(t)
  const late = st !== 'done' && t.endDate && t.endDate < todayStr()
  const noPhotos = missingTodaysPhotos(t)
  return (
    <button onClick={() => navigate(`/task/${t.id}`)}
      className={`w-full text-left bg-white rounded-2xl border border-gray-200 border-l-4 ${noPhotos ? 'border-l-red-500' : late ? 'border-l-amber-400' : 'border-l-transparent'} shadow-sm px-4 py-3.5 flex items-center gap-3 active:bg-gray-50`}>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-gray-900 truncate">{t.title}</p>
        <p className="text-sm text-gray-600 truncate">{t.client || t.address || 'Job'}{t.crewName ? ` · ${t.crewName}` : ''}</p>
        <p className={`text-sm truncate ${late ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>{late ? `Was due ${dayLabel(t.endDate)}` : dateRange(t)}</p>
        {noPhotos && <p className="text-sm font-semibold text-red-600 flex items-center gap-1"><Camera size={14} /> Photos needed today</p>}
      </div>
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_PILL[st]}`}>{statusLabel(t)}</span>
      <ChevronRight size={20} className="text-gray-300 shrink-0" />
    </button>
  )
}

// ── One task ────────────────────────────────────────────────────────────────
function TaskScreen() {
  const { id } = useParams()
  const t = useMyTasks().find(x => String(x.id) === String(id))
  const members = useStore(s => s.members)
  const setSubTaskStatus = useStore(s => s.setSubTaskStatus)
  const [toast, showToast] = useUndo()

  if (!t) {
    return (
      <div className="space-y-4">
        <BackButton />
        <p className="text-base text-gray-600">That task isn't here anymore.</p>
      </div>
    )
  }

  const st = statusKey(t)
  const step = NEXT[st]
  const today = photosOn(t)
  const ready = hasPhotosToday(t)   // photos first, then the status buttons
  const pm = (members || []).find(m => m.id === t.pmId)
  const move = (to) => {
    const was = st
    setSubTaskStatus(t.id, to)
    const label = SUB_STATUSES.find(s => s.key === to).label
    showToast(to === 'done' || to === 'near' ? `${label} — your PM has been told` : label, () => setSubTaskStatus(t.id, was))
  }

  return (
    <div className="space-y-4">
      <BackButton />

      <div>
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">{t.title}</h1>
        <p className="text-base text-gray-600 mt-0.5">{t.client}</p>
      </div>

      {t.address && (
        <a href={mapsUrl(t.address)} target="_blank" rel="noreferrer"
          className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3.5 active:bg-gray-50">
          <Navigation size={22} className="text-[var(--brand-700)] shrink-0" />
          <span className="flex-1 min-w-0 text-base text-gray-900">{t.address}</span>
          <span className="text-sm font-semibold text-[var(--brand-700)] shrink-0">Directions</span>
        </a>
      )}

      <CrewPicker task={t} />

      {/* Today's photos: required before the status buttons work */}
      {step && (
        <Card className={`p-4 space-y-3 ${ready ? '' : 'border-red-300'}`}>
          <div className="flex items-center gap-2">
            <Camera size={20} className={ready ? 'text-green-600' : 'text-red-600'} />
            <p className="flex-1 text-base font-semibold text-gray-900">Today's photos</p>
            <span className={`text-sm font-semibold ${ready ? 'text-green-700' : 'text-red-600'}`}>{today.length ? `${today.length} sent` : 'Required'}</span>
          </div>
          {!ready && <p className="text-sm text-gray-600">Send photos of the work every day. The buttons below unlock once today's are in.</p>}
          <AddPhotosButton task={t} label={ready ? 'Add more photos' : 'Take photos'} onAdded={(n) => showToast(`${n} photo${n > 1 ? 's' : ''} sent`)}
            className={`w-full ${ready ? 'h-12 border border-gray-200 bg-white text-gray-800' : 'h-14 bg-[var(--brand-600)] text-white'} rounded-xl text-base font-bold flex items-center justify-center gap-2 disabled:opacity-60`} />
        </Card>
      )}

      {/* Where it stands, and the one thing to do next */}
      <Card className="p-4 space-y-4">
        <ol className="grid grid-cols-4 gap-1.5" aria-label="Progress">
          {SUB_STATUSES.map((s, i) => {
            const reached = i <= statusIndex(t)
            return (
              <li key={s.key} className="space-y-1.5">
                <div className={`h-2 rounded-full ${reached ? 'bg-[var(--brand-600)]' : 'bg-gray-100'}`} />
                <p className={`text-[11px] leading-tight font-semibold ${reached ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</p>
              </li>
            )
          })}
        </ol>
        {step ? (
          <div className="space-y-2">
            <button onClick={() => move(step.to)} disabled={!ready}
              className="w-full h-16 rounded-xl bg-green-600 active:bg-green-700 text-white text-lg font-bold flex items-center justify-center gap-2 shadow-sm disabled:bg-gray-300">
              {ready ? <Check size={24} /> : <Lock size={22} />} {step.label}
            </button>
            {st === 'started' && (
              <button onClick={() => move('done')} disabled={!ready} className="w-full h-12 rounded-xl border border-gray-200 text-base font-semibold text-gray-700 disabled:text-gray-300">
                Skip to completed
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
            <CheckCircle2 size={26} className="text-green-600 shrink-0" />
            <p className="text-base font-semibold text-green-800">Completed. Your PM will line up the inspection.</p>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        {dateRange(t) && <p className="text-base text-gray-800 flex items-center gap-2"><CalendarDays size={18} className="text-gray-500 shrink-0" /> {dateRange(t)}</p>}
        <TaskMoneyLine task={t} />
        {pm && <p className="text-base text-gray-800 flex items-center gap-2"><HardHat size={18} className="text-gray-500 shrink-0" /> PM: {pm.displayName || pm.email}</p>}
        {t.inspectionDate && <p className="text-base text-gray-800 flex items-center gap-2"><CheckCircle2 size={18} className="text-gray-500 shrink-0" /> Inspection {dayLabel(t.inspectionDate)}</p>}
        {t.notes && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">From your PM</p>
            <p className="text-base text-gray-800 whitespace-pre-wrap">{t.notes}</p>
          </div>
        )}
      </Card>
      {(t.photos || []).length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="text-base font-semibold text-gray-900">Photos sent</p>
          <PhotoDays task={t} big />
        </Card>
      )}
      {toast}
    </div>
  )
}

// ── Shell ───────────────────────────────────────────────────────────────────
export default function SubApp() {
  const branding = useStore(s => s.branding)
  const theme = useStore(s => s.theme)
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    applyBrandStyles(branding?.primaryColor || DEFAULT_BRAND_COLOR, brandOptions(branding || {}))
  }, [branding])
  useEffect(() => { applyTheme(theme === 'dark') }, [theme])
  const companyName = branding?.companyName || 'QUOTEX'

  return (
    <div className="min-h-[100dvh] qx-ground bg-gray-50 overflow-x-hidden">
      <header className="sticky top-0 z-30 h-14 px-4 flex items-center gap-3 text-white pt-[env(safe-area-inset-top)] box-content"
        style={{ backgroundColor: 'var(--sidebar)' }}>
        {branding?.logo
          ? <img src={branding.logo} alt={companyName} className="h-8 object-contain" />
          : <span className="text-base font-black tracking-widest">{companyName}</span>}
        <span className="text-xs font-semibold uppercase tracking-wide bg-white/15 rounded-full px-2 py-0.5">Sub</span>
        <div className="ml-auto relative">
          <button onClick={() => setMenu(m => !m)} className="h-10 w-10 rounded-lg flex items-center justify-center text-white/80 active:bg-white/10" aria-label="Options">
            <Settings2 size={20} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-12 z-50 w-56 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden text-gray-900">
                <button onClick={DEMO ? resetDemo : logout} className="w-full px-4 h-14 flex items-center gap-3 text-base text-left active:bg-gray-50">
                  <LogOut size={18} className="text-gray-500" /> {DEMO ? 'Reset demo' : 'Log out'}
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-4 pb-16">
        <Routes>
          <Route path="/" element={<TaskList />} />
          <Route path="/task/:id" element={<TaskScreen />} />
          <Route path="/invoices" element={<InvoicesScreen />} />
          <Route path="/invoices/new" element={<NewInvoiceScreen />} />
          <Route path="/crew" element={<CrewScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
