// ── English / Español for the sub app ───────────────────────────────────────
// The crews' screens (a sub's manager, their technicians, painters) can be
// read in Spanish. The office and the PMs' screens stay in English: nothing
// is translated unless the sub app has switched Spanish on.
//
// English wording is the key: tr('Take photos') gives 'Tomar fotos' in
// Spanish and 'Take photos' otherwise, so a phrase with no Spanish yet just
// shows in English. The choice is remembered on the phone; a phone set to
// Spanish starts in Spanish.
import { useSyncExternalStore } from 'react'

const KEY = 'qx_lang'
const listeners = new Set()
let active = false          // only the sub app turns translation on
let lang = 'en'

function saved() {
  try { const v = localStorage.getItem(KEY); if (v === 'es' || v === 'en') return v } catch { /* private window */ }
  try { return /^es\b/i.test(navigator.language || '') ? 'es' : 'en' } catch { return 'en' }
}

// Called once by the sub app's shell.
export function startLang() { if (active) return; active = true; lang = saved() }
export const getLang = () => (active ? lang : 'en')
export function setLang(next) {
  lang = next === 'es' ? 'es' : 'en'
  try { localStorage.setItem(KEY, lang) } catch { /* stays for this visit */ }
  listeners.forEach(fn => fn())
}
export function useLang() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, getLang, () => 'en')
}

const ES = {
  // shell, job list
  'Good morning': 'Buenos días', 'Good afternoon': 'Buenas tardes', 'Good evening': 'Buenas noches',
  'Sub': 'Sub', 'Options': 'Opciones', 'Log out': 'Cerrar sesión', 'Reset demo': 'Reiniciar demo', 'Back': 'Atrás',
  'Working on': 'En progreso', 'Up next': 'Próximos', 'Nothing in progress.': 'Nada en progreso.',
  'Nothing booked yet. Your PM will add tasks here.': 'Nada programado todavía. Su PM agregará los trabajos aquí.',
  'Done lately': 'Terminados recientemente', 'Hide': 'Ocultar', 'Show': 'Mostrar',
  'New': 'Nuevo', 'Updated': 'Actualizado', 'Job': 'Trabajo',
  'Needs a technician': 'Necesita un técnico', 'Photos needed today': 'Faltan las fotos de hoy',
  'new message': 'mensaje nuevo', 'new messages': 'mensajes nuevos',
  'Starts': 'Empieza', 'Finish by': 'Terminar antes del', 'Was due': 'Era para el',
  'Today': 'Hoy', 'Tomorrow': 'Mañana', 'Yesterday': 'Ayer',
  // statuses and the next step
  'Booked': 'Programado', 'Started': 'Empezado', 'Near completion': 'Casi terminado', 'Completed': 'Terminado',
  'I started': 'Ya empecé', 'Almost done': 'Casi termino', 'Skip to completed': 'Pasar a terminado',
  'your PM has been told': 'se le avisó a su PM',
  'Completed. Your PM will line up the inspection.': 'Terminado. Su PM programará la inspección.',
  'sends the daily photos and moves this job along.': 'envía las fotos diarias y avanza este trabajo.',
  'Put one of your technicians on this job. They send the daily photos and move it along.': 'Ponga a uno de sus técnicos en este trabajo. Ellos envían las fotos diarias y lo avanzan.',
  // one job
  "That task isn't here anymore.": 'Ese trabajo ya no está aquí.', 'Directions': 'Cómo llegar',
  'Messages': 'Mensajes', 'with': 'con', 'your PM': 'su PM', 'Message': 'Mensaje para', 'Write a message…': 'Escriba un mensaje…', 'Send': 'Enviar',
  "Today's photos": 'Fotos de hoy', 'Required': 'Obligatorio', 'sent': 'enviadas',
  "Send photos of the work every day. The buttons below unlock once today's are in.": 'Envíe fotos del trabajo todos los días. Los botones de abajo se activan cuando envíe las de hoy.',
  'Add more photos': 'Agregar más fotos', 'Take photos': 'Tomar fotos', 'Sending': 'Enviando',
  'photo sent': 'foto enviada', 'photos sent': 'fotos enviadas', 'Photos sent': 'Fotos enviadas',
  'Inspection': 'Inspección', 'From your PM': 'De su PM', 'Progress': 'Avance',
  // what changed (lib/subTasks changeStamp)
  'service': 'el servicio', 'dates': 'las fechas', 'notes': 'las notas', 'electrical items': 'los artículos eléctricos', 'inspection date': 'la fecha de inspección',
  // job sheet
  'Paint': 'Pintura', 'Paint date': 'Fecha de pintura', 'Color not set': 'Color sin definir', 'Notes for the painter': 'Notas para el pintor', 'Touch-ups': 'Retoques',
  'Inspection results': 'Resultados de inspección', 'Passed': 'Aprobada', 'Did not pass': 'No aprobada', 'Recorded': 'Registrada',
  'Electrical items': 'Artículos eléctricos', 'Job checklist': 'Lista del trabajo',
  // inspection names (lib/subInspections)
  'Electrical rough': 'Eléctrica preliminar', 'Electrical final': 'Eléctrica final', 'Electrical slab': 'Eléctrica de losa',
  'Mechanical rough': 'Mecánica preliminar', 'Mechanical final': 'Mecánica final',
  'Footing': 'Cimientos', 'Slab': 'Losa', 'Floor framing': 'Estructura del piso', 'Framing': 'Estructura', 'Framing + electrical': 'Estructura + eléctrica', 'Building final': 'Final de construcción',
  // crew
  "Who's on it": 'Quién va', 'Nobody yet': 'Nadie todavía', 'Your crew': 'Su equipo', 'on the app': 'en la app', 'On the app': 'En la app', 'Invited': 'Invitado',
  'Nobody yet.': 'Nadie todavía.', 'Add someone': 'Agregar a alguien', 'Their name': 'Su nombre', 'Their email': 'Su correo', 'Invite': 'Invitar', 'Inviting…': 'Invitando…',
  "This login doesn't run a crew.": 'Esta cuenta no maneja un equipo.',
  // invoices card on the job list and the job
  'Invoices': 'Facturas', 'All invoices': 'Todas las facturas', 'Send an invoice': 'Enviar una factura',
  'Nothing left to invoice on your jobs this week.': 'No queda nada por facturar en sus trabajos esta semana.',
  'Agreed': 'Acordado', 'left to invoice': 'por facturar',
  // the job checklist (stage names from the office's checklists)
  'HOA Approval': 'Aprobación del HOA', 'Zoning Permit': 'Permiso de zonificación', 'Building Permit': 'Permiso de construcción',
  'Pre-Con Scheduled': 'Reunión previa programada', 'Start Date Given': 'Fecha de inicio dada', 'Demo': 'Demolición', 'Demo and Footings': 'Demolición y cimientos',
  'Footing Inspection Completed': 'Inspección de cimientos terminada', 'Material Ordered': 'Material pedido', 'Materials Ordered': 'Materiales pedidos',
  'Framing Complete': 'Estructura terminada', 'Framing/Restructuring Complete': 'Estructura / reestructuración terminada',
  'Floor Framing Inspection': 'Inspección de estructura del piso', 'Install Decking': 'Instalar el piso del deck', 'Decking and Railings Installed': 'Piso y barandas instalados',
  'Roof Framing Complete': 'Estructura del techo terminada', 'Roof Complete': 'Techo terminado', 'Roof Installed': 'Techo instalado',
  'Rough Electrical Complete': 'Eléctrica preliminar terminada', 'Rough Building Inspection': 'Inspección preliminar de construcción', 'Rough Electrical Inspection': 'Inspección eléctrica preliminar',
  'Carpentry Finish': 'Acabados de carpintería', 'Measurements Received': 'Medidas recibidas', 'Paint Completed': 'Pintura terminada', 'Paint Applied': 'Pintura aplicada',
  'Electrical Finish': 'Acabados eléctricos', 'Windows Delivered': 'Ventanas entregadas', 'Windows Installed': 'Ventanas instaladas', 'Window Delivery': 'Entrega de ventanas',
  'Windows, Doors and Glass Installed': 'Ventanas, puertas y vidrios instalados', 'Final Inspection': 'Inspección final', 'Punch List': 'Lista de pendientes', 'Job Closed': 'Trabajo cerrado',
  'Structure Complete': 'Estructura terminada', 'Stain / Seal': 'Tinte / sellado', 'Stain / Seal / Finish': 'Tinte / sellado / acabado', 'Posts & Footings': 'Postes y cimientos',
  'Beam & Rafter Install': 'Instalación de vigas y cabios', 'Foundation / Footings': 'Fundación / cimientos', 'Demo / Site Prep': 'Demolición / preparación del sitio',
  'English': 'English', 'Español': 'Español',
}

// The Spanish for an English phrase when Spanish is on; the English otherwise.
export const tr = (s) => (getLang() === 'es' && Object.prototype.hasOwnProperty.call(ES, s) ? ES[s] : s)

// "dates, notes" → "las fechas, las notas"
export const trList = (s) => String(s || '').split(',').map(x => tr(x.trim())).filter(Boolean).join(', ')

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const shifted = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }
// "Today" / "Tue, Nov 17" in English, "Hoy" / "mar, 17 nov" in Spanish.
export function dayText(s) {
  if (!s) return ''
  if (s === shifted(0)) return tr('Today')
  if (s === shifted(1)) return tr('Tomorrow')
  if (s === shifted(-1)) return tr('Yesterday')
  return new Date(`${s}T00:00:00`).toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
