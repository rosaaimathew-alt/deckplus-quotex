/*
 * Round-robin booking embed. Paste on your website where the calendar should go:
 *
 *   <div id="rr-booking"></div>
 *   <script src="https://YOUR-QUOTEX-DOMAIN/embed.js" async></script>
 *
 * Optional attributes on the div: data-theme="light|dark".
 * The iframe grows to fit its content; a 'rr-booked' message is re-dispatched
 * on window as a CustomEvent so you can fire analytics/conversion pixels.
 */
(function () {
  var script = document.currentScript
  var origin = new URL(script.src).origin
  var host = document.getElementById('rr-booking')
  if (!host) { host = document.createElement('div'); script.parentNode.insertBefore(host, script) }

  var src = origin + '/book.html'
  if (host.dataset.theme) src += '?theme=' + encodeURIComponent(host.dataset.theme)

  var frame = document.createElement('iframe')
  frame.src = src
  frame.title = 'Book a consultation'
  frame.style.cssText = 'width:100%;border:0;min-height:420px;display:block;'
  frame.setAttribute('loading', 'lazy')
  host.appendChild(frame)

  window.addEventListener('message', function (e) {
    if (e.origin !== origin || e.source !== frame.contentWindow || !e.data) return
    if (e.data.type === 'rr-height') frame.style.height = e.data.height + 'px'
    if (e.data.type === 'rr-booked') window.dispatchEvent(new CustomEvent('rr-booked', { detail: e.data }))
  })
})()
