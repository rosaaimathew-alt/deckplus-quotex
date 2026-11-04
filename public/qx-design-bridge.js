// ── Design editor ↔ QuoteX (Supabase) ────────────────────────────────────────
// The design editor (public/design-editor.html) is a plain page on the same
// site, so it shares the rep's QuoteX sign-in (Supabase keeps the session in
// this site's localStorage). This loads and saves a proposal's layout in the
// proposal_designs table (supabase/designs.sql); the database decides who may
// see or save it, exactly as for the proposal itself.
// Needs /qx-config.js (the Supabase URL + public key, written at build time)
// and supabase-js loaded first.
(function () {
  const cfg = window.QX_CONFIG || {}
  const lib = window.supabase
  if (!cfg.supabaseUrl || !cfg.supabaseKey || !lib || !lib.createClient) return
  // The app tab keeps the session fresh; this page only reads it.
  const sb = lib.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  })
  async function session() {
    const { data } = await sb.auth.getSession()
    if (!data.session) throw new Error('Sign in to QuoteX in this browser to save')
    return data.session
  }
  window.qxDesignStore = {
    async load(pid) {
      await session()
      const { data, error } = await sb.from('proposal_designs').select('data, updated_at').eq('proposal_id', String(pid)).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? data.data : null
    },
    async save(pid, layout) {
      const s = await session()
      const { error } = await sb.from('proposal_designs')
        .upsert({ proposal_id: String(pid), data: layout, updated_by: s.user.id }, { onConflict: 'org_id,proposal_id' })
      if (error) throw new Error(/row-level security/i.test(error.message) ? 'You can only save designs on proposals you can open' : error.message)
    },
  }
})()
