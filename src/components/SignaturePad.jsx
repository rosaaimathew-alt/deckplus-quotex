import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react'

const CURSIVE_FONTS = [
  { label: 'Style 1', family: "'Dancing Script', cursive" },
  { label: 'Style 2', family: "'Great Vibes', cursive" },
  { label: 'Style 3', family: "'Pacifico', cursive" },
]

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Great+Vibes&family=Pacifico&display=swap'

function ensureFonts() {
  if (!document.querySelector(`link[href="${FONT_LINK}"]`)) {
    const link = document.createElement('link')
    link.rel  = 'stylesheet'
    link.href = FONT_LINK
    document.head.appendChild(link)
  }
}

const SignaturePad = forwardRef(function SignaturePad({ className, onChange }, ref) {
  const canvasRef  = useRef(null)
  const drawing    = useRef(false)
  const [mode, setMode]       = useState('draw')   // 'draw' | 'type'
  const [typedName, setTypedName] = useState('')
  const [fontIdx, setFontIdx] = useState(0)
  const [isEmpty, setIsEmpty] = useState(true)

  useEffect(() => { ensureFonts() }, [])

  const emit = () => {
    if (!onChange) return
    if (isEmpty) { onChange(null); return }
    onChange(canvasRef.current?.toDataURL('image/png'))
  }

  // Re-render typed signature whenever name or font changes
  useEffect(() => {
    if (mode !== 'type') return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!typedName.trim()) { setIsEmpty(true); onChange?.(null); return }
    const fontSize = Math.min(72, Math.floor(canvas.width / (typedName.length * 0.55 + 1)))
    ctx.font      = `${fontSize}px ${CURSIVE_FONTS[fontIdx].family}`
    ctx.fillStyle = '#1a1a1a'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(typedName, canvas.width / 2, canvas.height / 2)
    setIsEmpty(false)
    onChange?.(canvas.toDataURL('image/png'))
  }, [typedName, fontIdx, mode])

  useImperativeHandle(ref, () => ({
    toDataURL: () => canvasRef.current?.toDataURL('image/png'),
    isEmpty:   () => isEmpty,
    clear: () => {
      const canvas = canvasRef.current
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
      setTypedName('')
      setIsEmpty(true)
      onChange?.(null)
    },
  }))

  // Draw mode event listeners
  useEffect(() => {
    if (mode !== 'draw') return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'

    const pos = (e) => {
      const rect  = canvas.getBoundingClientRect()
      const touch = e.touches?.[0] || e
      return {
        x: (touch.clientX - rect.left) * (canvas.width  / rect.width),
        y: (touch.clientY - rect.top)  * (canvas.height / rect.height),
      }
    }
    const start = (e) => { e.preventDefault(); drawing.current = true; const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y) }
    const move  = (e) => { e.preventDefault(); if (!drawing.current) return; const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke(); setIsEmpty(false) }
    const end   = () => { drawing.current = false; emit() }

    canvas.addEventListener('mousedown',  start)
    canvas.addEventListener('mousemove',  move)
    canvas.addEventListener('mouseup',    end)
    canvas.addEventListener('mouseleave', end)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove',  move,  { passive: false })
    canvas.addEventListener('touchend',   end)
    return () => {
      canvas.removeEventListener('mousedown',  start)
      canvas.removeEventListener('mousemove',  move)
      canvas.removeEventListener('mouseup',    end)
      canvas.removeEventListener('mouseleave', end)
      canvas.removeEventListener('touchstart', start)
      canvas.removeEventListener('touchmove',  move)
      canvas.removeEventListener('touchend',   end)
    }
  }, [mode])

  const switchMode = (m) => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setTypedName('')
    setIsEmpty(true)
    setMode(m)
    onChange?.(null)
  }

  return (
    <div className={className}>
      {/* Mode tabs */}
      <div className="flex gap-1 mb-2">
        {['draw', 'type'].map(m => (
          <button key={m} onClick={() => switchMode(m)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${mode === m ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {m === 'draw' ? '✏️ Draw' : 'Aa Type'}
          </button>
        ))}
      </div>

      {mode === 'type' && (
        <div className="mb-2 space-y-2">
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="Type your name to generate signature"
            value={typedName}
            onChange={e => setTypedName(e.target.value)}
          />
          <div className="flex gap-2">
            {CURSIVE_FONTS.map((f, i) => (
              <button key={i} onClick={() => setFontIdx(i)}
                className={`px-3 py-1 text-xs rounded border transition-colors ${fontIdx === i ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}
                style={{ fontFamily: f.family }}>
                {typedName || 'Preview'}
              </button>
            ))}
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={700}
        height={180}
        className={`border-2 border-gray-300 rounded-lg w-full touch-none ${mode === 'draw' ? 'cursor-crosshair' : 'cursor-default'}`}
        style={{ background: '#fdfdf9' }}
      />
    </div>
  )
})

export default SignaturePad
