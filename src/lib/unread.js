// Unread inbox count, shared by the sidebar badge and Home's "needs attention".
// Kept outside the main store on purpose: it's per-device, never synced.
import { create } from 'zustand'

export const useUnread = create(set => ({
  unread: 0,
  setUnread: (n) => set({ unread: n }),
}))
