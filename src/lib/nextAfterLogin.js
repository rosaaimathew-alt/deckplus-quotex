// Where to go after signing in: the page a link was going to (AuthGuard puts
// it in ?next=), if it is one of ours; otherwise the home screen.
export function nextAfterLogin(search = typeof window !== 'undefined' ? window.location.search : '') {
  const next = new URLSearchParams(search).get('next') || ''
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/'
}
