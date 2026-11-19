// ── To-do lists ─────────────────────────────────────────────────────────────
// Two lists in one table:
//   • Mine    a person's own list. The database only hands a to-do to its owner
//             (supabase/todos_shared.sql), so nobody else ever receives it.
//   • Shared  a task one person gave another (assignedTo). The owner and the
//             assignee both receive it; the assignee is told when it is given
//             (lib/notify → 'todo_assigned').
// Subs and painters have no to-do list and can't be given a task.

export const ASSIGNABLE_ROLES = ['admin', 'office', 'pm', 'rep']

const mineOrLegacy = (t, me) => !t.ownerId || !me?.id || t.ownerId === me.id

// My own list (a to-do saved before owners were recorded is its owner's too)
export const personalTodos = (todos, me) => (todos || []).filter(t => t && !t.assignedTo && mineOrLegacy(t, me))
// Tasks someone gave me
export const todosForMe = (todos, me) => (todos || []).filter(t => t && t.assignedTo && !!me?.id && t.assignedTo === me.id)
// Tasks I gave someone else
export const todosIAssigned = (todos, me) => (todos || []).filter(t => t && t.assignedTo && t.assignedTo !== me?.id && mineOrLegacy(t, me))

// Only the person who wrote a task removes it; the assignee ticks it off.
export const canDeleteTodo = (t, me) => !t?.assignedTo || t.assignedTo !== me?.id || t.ownerId === me?.id

// What the badge counts: what is waiting on me.
export const openTodoCount = (todos, me) =>
  personalTodos(todos, me).filter(t => !t.done).length + todosForMe(todos, me).filter(t => !t.done).length

// Who a task can be given to: the office team, never me, never a sub or painter.
export const assignableMembers = (members, me) => (members || [])
  .filter(m => m && m.id && m.id !== me?.id && ASSIGNABLE_ROLES.includes(m.role))
  .sort((a, b) => String(a.displayName || a.email || '').localeCompare(String(b.displayName || b.email || '')))

export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || ''
