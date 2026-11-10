// A fully signed link opens to this and nothing else.
export default function SignedClosed({ justSigned, name, message }) {
  return (
    <div className="qx-ink min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full text-center bg-white rounded-2xl border border-green-200 p-8 shadow-sm">
        <div className="text-4xl text-green-700 mb-3">✓</div>
        <h1 className="qx-title text-xl font-bold text-green-800 mb-2">{justSigned ? 'Signed successfully' : 'Already signed'}</h1>
        {justSigned && <p className="text-sm text-gray-600 mb-2">Thank you{name ? ` ${name}` : ''}. Your signature has been recorded.</p>}
        <p className="text-sm text-gray-700">{message || 'Please reach out to Deck Plus for a signed copy of your agreement.'}</p>
      </div>
    </div>
  )
}
