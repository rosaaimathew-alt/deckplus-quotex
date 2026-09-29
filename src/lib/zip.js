// Minimal, dependency-free ZIP writer (STORE method — no compression, but a
// fully valid .zip that opens in every OS/archive tool). Used for the
// subcontractor "Audit Pack" export so we don't pull in a heavy zip library.

function makeCrcTable() {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
}
const CRC_TABLE = makeCrcTable()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Decode a data: URL (base64 or url-encoded) into raw bytes.
export function dataUrlToBytes(dataUrl) {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return new Uint8Array(0)
  const meta = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  if (meta.includes(';base64')) {
    const bin = atob(payload)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }
  return new TextEncoder().encode(decodeURIComponent(payload))
}

// files: [{ name, bytes }] -> Uint8Array of a .zip
export function buildZip(files) {
  const enc = new TextEncoder()
  const chunks = []
  const central = []
  let offset = 0
  const dosTime = 0
  const dosDate = 0x21 // 1980-01-01

  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const data = f.bytes
    const crc = crc32(data)
    const size = data.length

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0, true)
    local.setUint16(8, 0, true) // method 0 = stored
    local.setUint16(10, dosTime, true)
    local.setUint16(12, dosDate, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, size, true)
    local.setUint32(22, size, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true)
    const localBytes = new Uint8Array(local.buffer)
    chunks.push(localBytes, nameBytes, data)

    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true)
    cd.setUint16(6, 20, true)
    cd.setUint16(8, 0, true)
    cd.setUint16(10, 0, true)
    cd.setUint16(12, dosTime, true)
    cd.setUint16(14, dosDate, true)
    cd.setUint32(16, crc, true)
    cd.setUint32(20, size, true)
    cd.setUint32(24, size, true)
    cd.setUint16(28, nameBytes.length, true)
    cd.setUint16(30, 0, true)
    cd.setUint16(32, 0, true)
    cd.setUint16(34, 0, true)
    cd.setUint16(36, 0, true)
    cd.setUint32(38, 0, true)
    cd.setUint32(42, offset, true)
    central.push(new Uint8Array(cd.buffer), nameBytes)

    offset += localBytes.length + nameBytes.length + size
  }

  const cdStart = offset
  let cdSize = 0
  for (const c of central) cdSize += c.length

  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(4, 0, true)
  eocd.setUint16(6, 0, true)
  eocd.setUint16(8, files.length, true)
  eocd.setUint16(10, files.length, true)
  eocd.setUint32(12, cdSize, true)
  eocd.setUint32(16, cdStart, true)
  eocd.setUint16(20, 0, true)

  const all = [...chunks, ...central, new Uint8Array(eocd.buffer)]
  let total = 0
  for (const c of all) total += c.length
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of all) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}

// Build the zip and trigger a browser download.
export function downloadZip(filename, files) {
  const bytes = buildZip(files)
  const blob = new Blob([bytes], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
