/*
 * Round-robin booking embed. Paste on your website where the calendar should go:
 *
 *   <div id="rr-booking"></div>
 *   <script src="https://YOUR-QUOTEX-DOMAIN/embed.js" async></script>
 *
 * Optional brand overrides on the div (otherwise the defaults in book.html apply):
 *   data-accent="#b0894f" data-accent-text="#fff" data-text="#1d1d1f" data-muted="#6b6b70"
 *   data-surface="#f7f7f5" data-border="#dcdcd7" data-bg="transparent"
 *   data-font="Montserrat" data-heading-font="Playfair Display" data-heading-weight="700"
 *   data-font-size="16" data-radius="0" data-btn-radius="0" data-btn-transform="uppercase"
 *   data-btn-tracking="1" data-title="none" (hide the heading)
 * The iframe grows to fit its content; a 'rr-booked' message is re-dispatched
 * on window as a CustomEvent so you can fire analytics/conversion pixels.
 */
(function () {
  var script = document.currentScript
  var origin = new URL(script.src).origin
  var host = document.getElementById('rr-booking')
  if (!host) { host = document.createElement('div'); script.parentNode.insertBefore(host, script) }

  // data-foo-bar → ?fooBar=… (book.html validates every value)
  var query = Object.keys(host.dataset).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(host.dataset[k])
  }).join('&')
  var src = origin + '/book.html' + (query ? '?' + query : '')

  var frame = document.createElement('iframe')
  frame.src = src
  frame.title = 'Book a consultation'
  frame.style.cssText = 'width:100%;border:0;min-height:420px;display:block;background:transparent;color-scheme:normal;'
  frame.setAttribute('allowtransparency', 'true')
  frame.setAttribute('loading', 'lazy')
  host.appendChild(frame)

  window.addEventListener('message', function (e) {
    if (e.origin !== origin || e.source !== frame.contentWindow || !e.data) return
    if (e.data.type === 'rr-height') frame.style.height = e.data.height + 'px'
    if (e.data.type === 'rr-booked') window.dispatchEvent(new CustomEvent('rr-booked', { detail: e.data }))
  })
})()
