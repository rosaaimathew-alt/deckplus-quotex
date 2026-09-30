# Deck Plus Contract Packet

The contract the app prints and sends for signature is the attorney-reviewed
**2026 Contractor Agreement (7.4.26)**. Its wording is locked: no edits, no
typo fixes, no additions, no omissions.

## Where things live

| File | What it is |
| --- | --- |
| `src/contract/deckPlusAgreement.js` | The packet's text, verbatim, page by page. **Do not edit the wording.** |
| `scripts/verify-contract-text.mjs` | Proves the module matches the source PDF word for word. Run after any change to the module. |
| `src/contract/contractFields.js` | What goes in the blanks: auto-fill from the proposal, payment-line mapping, which spec sheets a job gets, which signature fields each party owes. |
| `src/contract/DeckPlusContract.jsx` | Renders the packet. Layout only; contains no contract wording. Used by the office editor, the signing page and the signed copy. |
| `public/contract/` | Every image from the source: the Deck Plus logo, the Electrical Specifications header artwork, the Processing Form title and the house sketch. |
| `src/pages/ContractView.jsx` | Office/sales page: fills blanks, picks spec sheets, drafts the Scope of Work, sends for signature. |
| `src/pages/SignPage.jsx` | Client / Deck Plus signing page (`/sign/<token>`). |
| `src/pages/ContractViewFull.jsx` | Signed copy with signatures placed (`/view/<recordId>`). |

## Verifying the wording

```
node scripts/verify-contract-text.mjs path/to/2026_CONTRACTOR_AGREEMENT_7.4.26.docx.pdf
```

Pages 1–8 are compared as an ordered word sequence. Pages 9–12 are grid forms
whose PDF text layer reads column-wise, so they are compared as per-page word
counts plus a checkbox count (text-glyph boxes + image-drawn boxes). The script
exits 0 and prints `OK — module text matches the source word for word.` when
everything matches. Anything else is a defect.

Not compared, by design: the DocuSign envelope footer on each source page (not
contract text) and the three header labels on page 8 that are artwork in the
source (`ELECTRICAL SPECIFICATIONS`, `CLIENT NAME:`, `CONTRACT #:`), which the
app prints from the extracted images.

## Print order

1. Pages 1–3 — Deck Plus Contractor Agreement (every contract)
2. Page 4 — Scope of Work and Final Payment Clarification
3. Pages 5–6 — initialed items, HOA / footings yes-no, client + contractor signatures
4. Page 7 — Unforeseen Site Conditions Policy
5. **Scope of Work** — ours, drafted from the proposal (see below). Clause 2 of the agreement refers to the Scope of Work "annexed hereto".
6. Spec sheets, only when the job needs them: Electrical Specifications (source p. 8), Porch Detail Form (p. 9), Deck Detail Form (p. 10), Patio Detail Form (p. 11)
7. Page 12 — Processing Form (every contract)

Spec sheets default from the job (`defaultPacket`): electrical when a scope
line mentions electrical work; porch for porch / sunroom / 3-season / screen /
Eze-Breeze types; deck for deck types; patio for hardscape / patio / paver /
fire pit / kitchen / fireplace / wall types. The rep can add or remove any sheet
per contract.

## Auto-populated blanks

When the contract is generated, `autoContractValues` fills these from the
proposal, and the rep can change any of them (in the fill-ins panel or right
on the document):

- **Dates** — agreement effective date (today), date sold (when the proposal was won, else today)
- **Customer** — client name, phone, email, property address
- **Project** — contract #, job name (client name), project name (client – project types), project type, design consultant (the rep who launched it, else the signed-in user)
- **Payment (clause 3)** — total, total in words, and the four payment lines from the milestone schedule:
  first milestone → *upon contract signature*, second → *the day job starts*,
  last → *after 1st punch list is completed*, anything in between → the labeled third line

Everything else (notes, providers, beds/baths, spec-sheet details, all
checkboxes) is filled directly on the document. Yellow fields are editable;
the contract wording is not.

## Scope of Work pages

Drafted from the proposal's accepted line items, exactly as before: one line per
item, editable as a block (`--` starts a bullet, `**bold**` / `__underline__`),
plus Load/Save template, Merge missing bullets, Fill from Past Contracts and AI
Suggest. Prints with the project summary, the item/price table and the payment
schedule.

## Signing

Two parties: **Client** and **Deck Plus** (builder). Required fields per party
come from `requiredSignFields`:

- Client — agreement (p. 3), scope clarification (p. 4), initials on all 18
  items and the CLIENT(S) signature (pp. 5–6), site conditions (p. 7), each
  included spec sheet, processing form (p. 12)
- Deck Plus — agreement, CONTRACTOR signature (p. 6), site conditions, each
  included spec sheet

Initials boxes get the signer's signature shrunk to fit. Dates print as the day
the party signed. The snapshot sent for signature carries
`contractData.dp = { version, values, checks, packet }` so the signing page and
the signed copy print exactly what the office saw.

## Changing the packet

A new attorney-approved revision means: update `CONTRACT_SOURCE.version` and the
text in `deckPlusAgreement.js`, re-run the verifier against the new PDF until it
prints OK, re-extract any changed artwork into `public/contract/`, and bump
`PACKET_VERSION` in `contractFields.js`.
