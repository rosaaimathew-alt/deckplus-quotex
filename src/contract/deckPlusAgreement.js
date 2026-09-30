// ── Deck Plus Contractor Agreement — VERBATIM CONTENT ────────────────────────
//
// Source: 2026_CONTRACTOR_AGREEMENT_7.4.26 (12 pages), reviewed by Deck Plus's
// attorney. THE WORDING BELOW MUST NOT BE CHANGED. No edits, no typo fixes, no
// additions, no omissions. scripts/verify-contract-text.mjs compares every word
// of this file against the source PDF's text; run it after any change here.
//
// Inline markup (the only non-source characters in these strings):
//   <b>…</b>  bold      <i>…</i>  italic     <u>…</u>  underline
//   <sup>…</sup> superscript (1st / 3rd)
//   {{name}}  a blank the office fills in for the job (drawn as a blank line
//             when empty). Blanks in the source are runs of underscores.
//   {{check:id}}  a checkbox the office ticks;  {{init:id}} client initials box
//
// Pages 1–7 and 12 print on every contract. Pages 8–11 are trade forms that
// print only when the job needs them (see PACKET_FORMS.when).

export const CONTRACT_SOURCE = {
  title: 'DECK PLUS CONTRACTOR AGREEMENT',
  version: '2026_CONTRACTOR_AGREEMENT_7.4.26',
  pages: 12,
}

// ── Pages 1–3: the agreement ────────────────────────────────────────────────
export const AGREEMENT = {
  heading: '<b><u>DECK PLUS CONTRACTOR AGREEMENT</u></b>',
  clauses: [
    { n: 1, title: 'PARTIES', paras: [
      '<b>1. PARTIES</b>. This agreement, effective {{effectiveDate}}, by and between, Deck Plus LLC hereinafter called the “Contractor” and {{clientName}}, hereinafter called the “Client/Homeowner”.',
      'WITNESSETH, that the Contractor and the Client for the consideration named herein agree as follows:',
    ] },
    { n: 2, title: 'SERVICES', paras: [
      '<b>2. SERVICES</b>. The Contractor shall purchase and furnish all the materials, and perform all the work shown on the <b><u>Scope of Work</u></b>, hereinafter called “Services”, as annexed hereto as it pertains to work to be performed on property located at:',
      '{{propertyAddress}}',
    ] },
    { n: 3, title: 'PAYMENT', paras: [
      '<b>3. PAYMENT</b>. Client agrees to fully pay Contractor for the services to be performed under the Contract the sum of US$ {{contractTotal}} ({{contractTotalWords}}) subject to additions and deductions pursuant to authorized change orders.',
      'Payments of the Contract price shall be paid in the following manner:',
    ], payments: [
      'US$ {{pay1}} upon contract signature',
      'US$ {{pay2}} the day job starts',
      'US$ {{pay3}} ({{pay3Label}})',
      'US$ {{pay4}} after 1<sup>st</sup> punch list is completed',
    ], subclauses: [
      '<b>3.1. Requests for repairs, adjustments, replacements, touch-ups of area and structure shall not impact final payment if requested after final punch list.</b>',
      '<b>3.2. All card payments will incur a 3% processing fee at the time of payment.</b>',
      '<b>3.3. Final payment must be paid no longer than 14 days after 1<sup>st</sup> punch list completion. All late payments will incur a 5% weekly interest based on amount due.</b>',
    ] },
    { n: 4, title: 'DUE DATE', paras: [
      '<b>4. DUE DATE. </b>The Services provided by the Contractor shall be one (1) time event and not due on a specific date but to be completed with a reasonable timeframe in accordance with industry standards.',
    ] },
    { n: 5, title: 'EXCLUDED EXPENSES', paras: [
      '<b>5. EXCLUDED EXPENSES. </b>The Contractor shall not be responsible for providing any appliances nor responsible for any expenses related to appliances acquisition and installation, required by authorities or manufacturer, including but not limited to gas line installation and connection, outdoor kitchen appliances, vent hoods, gas fireplaces, assembly and warranty.',
      'The Contractor shall not be responsible for moving, replacing cleaning or rearranging, furniture, equipment or personal property in construction area.',
    ] },
    { n: 6, title: 'INDEPENDENT CONTRACTOR STATUS', paras: [
      '<b>6. INDEPENDENT CONTRACTOR STATUS. </b>The Contractor, under the code of the IRS, is an independent contractor and neither the Contractor’s employees or contract personnel are, or shall be deemed, the Client’s employees.',
      'In its capacity as in independent contractor, Contractor agrees and ensures the following:',
      'Work shall be completed in a workmanship-like manner and in compliance with all building codes and other applicable laws;',
      'Contractor has the right to perform Services for others during the terms of this Agreement;',
      'Contractor has the sole right to control and direct the means, manner, and method by which the Services required by this Agreement will be performed. Contractor shall select starting and end times, days of work, and order in which work is performed;',
      'Contractor has the right to at its discretion hire subcontractors to perform work hereunder, provided Contractor shall fully pay said subcontractor and in all instances remain responsible for the proper completion of this Contract;',
      'Client will not hire, supervise, or pay assistants to help the Contractor;',
      'Neither Contractor nor Contractor’s employees or personnel shall receive any training from the Client in the professional skills necessary to perform the services required by this Agreement; and',
      'Neither Contractor nor Contractor’s employees or personnel shall be required by the Client to devote full-time to the performance of the Services required by this Agreement.',
    ] },
    { n: 7, title: 'WORKERS’ COMPENSATION', paras: [
      '<b>7. WORKERS’ COMPENSATION. </b>The Contractor shall be responsible to ensure all workers carry Workers’ compensation insurance before working on a jobsite.',
    ] },
    { n: 8, title: 'LIABILITY INSURANCE', paras: [
      '<b>8. LIABILITY INSURANCE. </b>The Contractor agrees to bear responsibility for the actions related to themselves and their employees or personnel under this Agreement. In addition, the Contractor agrees to obtain comprehensive liability insurance coverage in case of bodily injury, personal injury, property damage, contractual liability, and cross-liability.',
      'There shall be a maximum amount of combined single liability of US$1,000,000.00.',
    ] },
    { n: 9, title: 'INDEMNIFICATION', paras: [
      '<b>9. INDEMNIFICATION. </b>The Contractor shall indemnify and hold the Client harmless from any loss or liability from performing the Services under this Agreement.',
    ] },
    { n: 10, title: 'TERMINATION AGREEMENT', paras: [
      '<b>10. TERMINATION AGREEMENT. </b>This Agreement shall terminate upon completion of the Services by the Contractor.',
      'In addition, the Client or Contractor may terminate this Agreement, including any obligations stated hereunder, with reasonable cause by providing written notice, within 3 days of agreement signing.',
    ] },
    { n: 11, title: 'OPTION TO TERMINATE', paras: [
      '<b>11. OPTION TO TERMINATE. </b>This Client shall not have the option to terminate this Agreement unless there is reasonable cause as defined in Section 10.',
      'After 3<sup>rd</sup> day, cancellations will be assessed on a case-by-case basis, however initial deposit is not refundable, unless Contractor is unable to secure permit and HOA approval.',
    ] },
    { n: 12, title: 'EXCLUSIVE AGREEMENT', paras: [
      '<b>12. EXCLUSIVE AGREEMENT. </b>This entire agreement is between the Client and Contractor.',
    ] },
    { n: 13, title: 'RESOLVING DISPUTES', paras: [
      '<b>13. RESOLVING DISPUTES. </b>Any dispute under this agreement, shall be resolved by the binding arbitration in accordance with the rules of the American Arbitration Association.',
    ] },
    { n: 14, title: 'PROPIETARY INFORMATION', paras: [
      '<b>14. PROPIETARY INFORMATION. </b>Client hereby assigns to the Contractor all rights, title and interest on any and all photographic images and videos related to the project described under this agreement, included, but not limited to, any royalties, proceeds, or other benefits derived from such photographs or recordings; and',
      'The Contractor will be entitled to use Client’s project developed by contractor in advertising and other materials.',
    ] },
    { n: 15, title: 'NO PARTNERSHIP', paras: [
      '<b>15. NO PARTNERSHIP. </b>This Agreement does not create a partnership relationship between the Client and the Contractor. Unless otherwise directed, the Contractor shall have no authority to enter contracts on Client’s behalf or represent Client in any manner.',
    ] },
    { n: 16, title: 'ASSIGMENT AND DELEGATION', paras: [
      '<b>16. ASSIGMENT AND DELEGATION. </b>The Contractor may assign rights and may delegate duties under this Agreement to other individuals or entities acting as a subcontractor “Subcontractor ”. The Contractor recognizes that they shall be liable for all the work performed by the Subcontractor and shall hold the Client harmless of any liability in connection with their performed work.',
    ] },
    { n: 17, title: 'ADDITIONAL TERMS AND CONDITIONS', paras: [
      '<b>17. ADDITIONAL TERMS AND CONDITIONS. </b>Deck Plus LLC cannot be held responsible or liable for any delay due circumstances beyond its control including, but not limited, to strikes, HOA delay, weather, general unavailability of material, casualty, natural disasters, permit delay, inspections. <b>Contractor is not responsible and does not provide dirt removal from the jobsite, unless specified.</b>',
    ] },
    { n: 18, title: 'PROPERTY SURVEY', paras: [
      '<b>18. PROPERTY SURVEY. </b>Your county may require a property survey before and/or after work is complete. Client/Homeowner is solely responsible for providing a property survey if required for permitting and Certificate of Occupancy issuance. Deck Plus does not offer surveying services, and none is included in this agreement.',
    ] },
    { n: 19, title: 'SEVERABILITY', paras: [
      '<b>19. SEVERABILITY. </b>This Agreement shall remain in effect in the event a section or provision is unenforceable or invalid. All remaining sections and provisions shall be deemed legally binding unless a court rules that any such provisions or section is invalid or unenforceable, thus limiting the effect of another provision or section. In such case, the affected provision or section shall be enforced as so limited.',
    ] },
    { n: 20, title: 'ADDENDUM', paras: [
      '<b>20. ADDENDUM. </b>All change orders shall be agreed upon in writing and paid before additional work begins.',
    ] },
    { n: 21, title: 'ENTIRE AGREMEMNET', paras: [
      '<b>21. ENTIRE AGREMEMNET. </b>This Agreement, along with any attachments or addendums, represents the entire agreement between the parties. Therefore, this Agreement supersedes any prior agreements, promises, conditions, or understandings between the Client and Contractor.',
    ] },
    { n: 22, title: 'LIMITED WARRANTY', paras: [
      '<b>22. LIMITED WARRANTY. </b>Contractor warrants provided labor and materials for 12 months following the 1<sup>st</sup> punch completion, 5 years on structure and 1 year on hardscape. (Whichever applicable, except for those excluded in the clauses below)',
    ] },
    { n: 23, title: 'CONCRETE/PATIO DISCLAIMER', paras: [
      '<b>23. CONCRETE/PATIO DISCLAIMER. </b>Concrete pads and patios do not carry any structural warranty.',
    ] },
    { n: 24, title: 'STAIN DISCLAIMER', paras: [
      '<b>24. STAIN DISCLAIMER. </b>Contractor does not recommend the use of semi-transparent or transparent stain for weather exposed structures as decks and outer structures. The use of such will <b><u>void</u> </b>the 1-year labor/materials warranty.',
    ] },
    { n: 25, title: 'REMODEL DISCLAIMER', paras: [
      '<b>25. REMODEL DISCLAIMER. </b>Remodels, extensions, alterations. Adjustments, partial replacement of existing structures do not carry structural warranty',
    ] },
  ],
  // Page 3 foot: Client: ____ Date: ____   Contractor: ____ Date: ____
  // Page 3 foot, printed exactly as one line.
  signatureLine: 'Client: {{sig:client-agreement}} Date: {{sigdate:client-agreement}} Contractor: {{sig:contractor-agreement}} Date: {{sigdate:contractor-agreement}}',
}

// ── Page 4 ──────────────────────────────────────────────────────────────────
export const SCOPE_CLARIFICATION = {
  heading: '<b><u>SCOPE OF WORK AND FINAL PAYMENT CLARIFICATION</u></b>',
  intro: 'Deck Plus, LLC prioritizes customer service. We are committed to delivering all items outlined in the scope of work, specifications, and drawings.',
  bullets: [
    'If a dispute arises, both parties will refer <b><u>only</u> </b>to the scope of work, specifications, or drawings or changes agreed upon in writing.',
    'Additional work will be incorporated through an addendum, subject to mutual agreement on the associated extra cost, otherwise we follow written scope of work and drawing specifications.',
  ],
  // Indented under the second bullet in the source, not a bullet itself.
  finalPaymentNote: 'Per your contract, your final payment is due after 1<sup>st</sup> punch list is completed.',
  bullets2: [
    'Your feedback during construction is appreciated. If you notice any issues, please inform us right away so we can resolve them in a timely manner, while crews are still on site.',
    'At the project\'s end, we will conduct a final walk-through to confirm all scope, specifications, and drawings are met. Outstanding issues from this review will be compiled into a single punch list for completion. Any further adjustments or repairs after this list will be handled as warranty claims, following final payment and your warranty terms.',
    'The duration of construction projects can vary due to factors such as weather, inspections, change orders, and material availability. Job duration does not affect the project cost. Efforts will be made to complete work within a reasonable timeframe based on complexity and trades involved with each scope of work .',
    '<b>GRASS </b>– Deck Plus will not be held responsible for any damage on grass/yard.',
    '<b>EFFLORESCENCE </b>– A natural, whitish powder may form on concrete pavers within weeks or months of installation. It does not harm the pavers\' structure and typically fades within the first year.',
    '<b>CONCRETE </b>– Should it be necessary to cut the existing concrete slab to excavate for footings, the client acknowledges and agrees that the newly poured concrete <b><u>will differ</u></b> from the existing in terms of color, texture and style. New pads may present high and low variations, which do not affect the structural integrity of porch/patios.',
  ],
  signatureLine: 'Client: {{sig:client-scope}} Date:{{sigdate:client-scope}}',
}

// ── Pages 5–6: initialed items ──────────────────────────────────────────────
export const INITIALS = {
  header: 'This document is attached to and made part of contract # {{contractNum}} (Client)',
  instruction: '<b><i>Review and initial each of the following:</i></b>',
  initialLabel: '(Initial)',            // printed under every initials box
  // Page 5, first table
  items1: [
    { id: 'hardware',  text: '<b>Hardware & Fasteners: </b>Unless otherwise specified, all hardware and fasteners shall be code compliant.' },
    { id: 'doors',     text: '<b>Doors: </b>Unless noted otherwise, CONTRACTOR will install aluminum doors. If CLIENT requests wood doors, only non-pressure treated wood will be used. Painting and maintenance of wooden doors are not included in the CONTRACT. (Wooden doors are not covered by our warranty.)' },
    { id: 'matching',  text: '<b>Matching Existing Materials: </b>When applicable (including siding, shingles, trim, gutters and more), the CONTRACTOR will make every reasonable effort to match existing finishes and materials. However, an exact match cannot be guaranteed due to factors such as aging-related discoloration, availability, discontinuity, variations in dye lots, and the inherent challenges of duplicating certain finishes, colors, and surfaces. Unless otherwise specified, all materials shall be sourced from readily available local suppliers. <b>If you have specialty siding on your home, such as Amazing Siding, your contract price does not reflect the cost of labor or materials for this specialty siding. Your siding company will have to install your new siding in order to maintain and comply with your existing siding warranty</b>' },
    { id: 'painting',  text: '<b>Painting Responsibility: </b>{{check:paintDeckPlus}} DECK PLUS, LLC {{check:paintClient}} CLIENT',
      lines: [
        '<b>Painters are responsible for caulking, preparing surfaces, applying putty, and sanding for <u>PAINT</u> only.</b>',
        '<b>The deck and stair undersides will remain unpainted or unstained unless specified in the scope of work.</b>',
      ] },
    { id: 'gutters',   text: '<b>Gutters: </b>CONTRACTOR shall subcontract the installation of regular gutters. The CLIENT shall inform CONTRACTOR of their choice of gutter color. <b>If you have specialty gutters on your home, such as LeafGuard, GutterGuard, special color, painted gutters, etc, your contract price does not reflect the cost of labor or materials for this specialty gutter. CONTRACTOR does not paint gutters.</b>' },
  ],
  // Page 5, second table (repeats the instruction line)
  items2: [
    { id: 'excess',    text: '<b>Excess materials: </b>CONTRACTOR shall have excess materials delivered to the PREMISES at no additional cost to the CLIENT to provide carpenters with adequate selection to complete the WORK. All such materials delivered to the site by CONTRACTOR remain the property of CONTRACTOR, and shall be removed by CONTRACTOR after completion of the WORK.' },
    { id: 'trash',     text: '<b>Trash: </b>CONTRACTOR shall subcontract the removal of debris generated by the WORK. CONTRACTOR shall make a best effort to arrange for debris removal within one week after completion of the WORK. There will be a charge for additional trash pickups requested by CLIENT.', lines: ['<b>Other:</b> {{trashOther}}'] },
    { id: 'addendums', text: '<b>Addendums: </b>Any change resulting in additional charges must be paid at the time of the change. Client understands and accepts that changes during the project will cause delays.' },
    { id: 'uloco',     text: '<b>ULOCO: </b><i>An underground utility locating service </i>that will mark underground utility lines such as telephone, cable, electric, gas, electrical approximately one week prior to construction. You will need to mark and possibly relocate unforeseen items including, but not limited to: sprinkler heads, barbeque gas lines, low voltage lighting, landscaping, French drains, etc.' },
    { id: 'plotplans', text: '<b>Plot Plans, Surveys & Permits: </b>The CLIENT shall provide CONTRACTOR with copy of Plot Plan/Survey with house location noted on property footprint. Some municipalities may request an <b><u>updated</u> </b>survey after work is complete. CLIENT is solely responsible for all surveying costs.' },
  ],
  // Page 6
  items3: [
    { id: 'existing',  text: '<b>Existing Structure: </b>The CLIENT understands that the CONTRACTOR is not responsible for any structural warranty when altering, remodeling, extending existing structures.' },
    { id: 'septic',    text: '<b>If home has septic tank</b>, CONTRACTOR will need to apply for a septic tank permit from your local Health Department before we can apply for your building permit. CLIENT will need to write a separate check to Deck Plus for $150.00 to cover this additional expense. CONTRACTOR will also need CLIENT to look through their documents for any septic tank paperwork. This paperwork will speed up the process which can take several weeks.' },
    { id: 'termite',   text: '<b>If home has termite coverage, </b>CLIENT is responsible for notifying their company to ensure continued compliance with the terms and conditions identified in termite protection agreement.' },
    { id: 'pets',      text: '<b>If home has pets or small kids</b>, please make the proper arrangements to secure and protect them during construction, as they must not be allowed in the construction area. Client bears full responsibility over their actions.' },
    { id: 'backyard',  text: '<b>Access to backyard: </b>Please make arrangements to have any locked gates open during the construction process and to provide access from public road to project area.' },
    { id: 'power',     text: '<b>Access to power: </b>Please make arrangements for crews to have access to power and discuss plan for panel access with project manager, <b>in case of crew trips the circuit.</b>' },
    { id: 'ptwood',    text: '<b>Pressure Treated Wood: </b>Pressure treated wood, due natural expansion and contraction, will develop surface cracks or checks (checking), which rarely compromise structural integrity. CLIENT understands they are to be expected and can occur at any time.', lines: ['Photo example can be provided upon request.'] },
    { id: 'electrical',text: '<b>Electrical wiring and switches: </b>Conduit piping will be visible in certain areas. All switches to be installed on porch structure, unless detailed otherwise in Scope of Work.' },
  ],
  yesNoInstruction: '<b><i>Mark Yes or No for each of the following:</i></b>',
  yesNo: [
    { id: 'hoa',      text: '{{check:hoaYes}} <b>Yes / </b>{{check:hoaNo}} <b>No Do you need plans for HOA approval? </b>If so, a packet will be provided to you.' },
    { id: 'footings', text: '{{check:footingsYes}} <b>Yes / </b>{{check:footingsNo}} <b>No Will we be digging footings for concrete or trenching? </b>Contractually, we do not remove dirt from job sites.' },
  ],
  // Two columns: headings row, signature row, name row.
  signatureColumns: [
    { id: 'client-initials',     role: 'client',  heading: '<b>CLIENT(S)</b>',   label: 'Client' },
    { id: 'contractor-initials', role: 'builder', heading: '<b>CONTRACTOR</b>', label: 'Deck Plus' },
  ],
}

// ── Page 7 ──────────────────────────────────────────────────────────────────
export const UNFORESEEN = {
  heading: '<b><u>UNFORESEEN SITE CONDITIONS POLICY</u></b>',
  projectName: '<b>Project Name:</b> {{projectName}}',
  intro: 'The contractor shall not be responsible for any additional work required due to unforeseen site conditions, which include <b><u>but are not limited</u> </b>to the following.',
  bullets: [
    'Soil that will not pass building inspector standard requirements',
    'Footings that don’t reach hard ground up to 24”',
    'Concealed plumbing, electrical lines, gas lines and mechanical lines',
    'Engineer required by building inspector',
    'Rotten wood',
    'Insect infested wood',
    'Mold',
    'Irrigation line',
    'Tree roots',
    'Subsequent interior damage, exterior brick or siding damage due to construction vibrations or demolition.',
    'New cracks may develop as material are dropped in your driveway. This is an inherent risk on behalf of the client and Deck Plus is <b><u>not responsible</u> </b>for the repair of your driveway.',
    'Should we need to cut drywall repair and subsequent paint touchup will be an additional charge to the contract.',
  ],
  closing: 'If any unforeseen items are discovered during the course of your work, we will immediately bring them to your attention with a recommended course of action. The labor and material required to correct, adjust, or work around these items will result in additional charges and work will only proceed when authorized by you.',
  acknowledgment: '<b>I have read the above Unforeseen Site Conditions Policy and agree to its terms and conditions.</b>',
  // Two columns: signature row ("____ Date____   ____"), then name row.
  signatureColumns: [
    { id: 'client-unforeseen',     role: 'client',  dateLabel: 'Date', label: 'Client' },
    { id: 'contractor-unforeseen', role: 'builder', label: 'Deck Plus' },
  ],
}

// ── Page 8: Electrical Specifications (only when the job has electrical) ────
export const ELECTRICAL_FORM = {
  key: 'electrical',
  heading: 'ELECTRICAL SPECIFICATIONS',           // rendered as artwork in the source header
  headerFields: [
    ['<b>CLIENT NAME:</b> {{clientName}}', '<b>CONTRACT #:</b> {{contractNum}}'],   // artwork in the source header
    ['<b>PHONE NUMBER:</b> {{clientPhone}}', '<b>EMAIL:</b> {{clientEmail}}'],
  ],
  tableIntro: '<b>THE FOLLOWING ELECTRICAL ITEMS ARE INCLUDED IN YOUR ABOVE REFERENCED CONTRACT:</b>',
  columns: ['<b>ELECTRICAL ITEMS</b>', '<b>QTY</b>'],
  items: [
    { id: 'fan',        label: 'Prewire for client supplied fan (w/ switch)' },
    { id: 'outlets',    label: 'Outlets – 120 Volt / 15 Amp' },
    { id: 'recessed',   label: 'Recessed 6” LED can lights' },
    { id: 'flood',      label: 'Flood light' },
    { id: 'cable',      label: 'Cable jack and outlet combo' },
    { id: 'sconces',    label: 'Prewire for client supplied sconces' },
    { id: 'lowvolt',    label: 'Low voltage lights' },
    { id: 'dimmer',     label: 'Dimmer switch' },
    { id: 'heatermount',label: 'Electric Heater – Black (w/ mount)' },
    { id: 'heaterbuilt',label: 'Electric Heater – Black (built-in)' },
    { id: 'homerun',    label: 'Home Run Appliance Outlet – 120 Volt / 30 Amp' },
    { id: 'venthood',   label: 'Vent Hood Electrical connection only' },
    { id: 'transformer',label: 'Low voltage transformer (w/ outlet)' },
    { id: 'other',      label: '{{elecOther}}' },   // blank last row in the source
  ],
  notes: [
    'If you would like any additional electrical performed, you can add it at the time we are building your project through an addendum to your contract. The Design Consultant or Project Manager can process this for you.',
    '<b>(Mounting and installation of your TV and/or speakers is not included)</b>',
  ],
  bullets: [
    'Cable TV connections in some cases may need to be connected through your cable provider.',
    'Additional outlets may be required by your building inspector if we are enclosing your existing rear outlet, building a 3-season or sunroom. (<b><u>If it is required, there will be an extra charge per outlet)</u></b>',
    'All switches/outlets to be installed on porch structure, unless detailed otherwise in Scope of Work.',
  ],
  footer: '<b><u>The electrical wiring provided will require exposed conduit piping. We will minimize this when possible.</u></b>',
  signatureLine: 'Client{{sig:client-electrical}} Deck Plus{{sig:contractor-electrical}}',
}

// ── Pages 9–11: detail forms ────────────────────────────────────────────────
// Each form is a grid of rows; each row is a list of cells. A cell has an
// optional bold heading (`h`) and a list of lines. Line syntax uses the same
// inline markup: {{check:id}} checkbox, {{id}} text blank. Row cells share the
// width equally unless `w` (fraction) is given.
const C = (id, label) => `{{check:${id}}} ${label}`

export const PORCH_FORM = {
  key: 'porch',
  heading: '<b>PORCH DETAIL FORM</b>',
  rows: [
    [ { h: '<b>JOB NAME</b>', lines: ['{{jobName}}'] }, { h: '<b>CONTRACT NUMBER</b>', lines: ['{{contractNum}}'] } ],
    [ { h: '<b>JOB TYPE</b>', w: 0.24 }, { lines: [[C('jt_screen', 'SCREEN PORCH'), C('jt_3season', '3-SEASON'), C('jt_open', 'OPEN PORCH'), C('jt_other', 'OTHER')]] } ],
    [ { h: '<b>HEADER</b>', lines: [C('hdr_pt', 'PT WOOD ONLY'), C('hdr_lvl', 'L.V.L'), '', 'OPEN PORCH WRAP:', C('wrap_miratec', 'MIRATEC (FOR SOLID PAINT ONLY)'), C('wrap_pine', 'CLEAR YELLOW PINE')] },
      { h: '<b>GABLE ENDS</b>', lines: [C('gable_open', 'OPEN GABLE'), C('gable_closed', 'CLOSED GABLE'), C('gable_screen', 'SCREEN'), C('gable_glass', 'TEMPERED GLASS')] },
      { h: '<b>SIDING</b>', lines: ['WILL SIDING BE NEEDED?', [C('siding_yes', 'YES'), C('siding_no', 'NO')], 'IF YES, WHERE? {{sidingWhere}}'] } ],
    [ { h: '<b>ROOF TYPE</b>', w: 0.3, lines: ['{{roofType}}'] }, { h: '<b>ROOF CONNECTION</b>', lines: [[C('conn_roof', 'ROOF TIE IN'), C('conn_wall', 'WALL TIE IN'), C('conn_both', 'ROOF & WALL TIE IN')]] } ],
    [ { h: '<b>SHINGLES</b>', lines: [C('sh_3tab', '3 TAB'), C('sh_arch', 'ARCHITECTURAL'), '', 'BRAND/COLOR: {{shingleBrand}}'] },
      { h: '<b>KNEEWALL / WALL</b>', lines: ['HEIGHT: {{kneeHeight}}', 'INSIDE FINISH: {{kneeInside}}', 'OUTSIDE FINISH: {{kneeOutside}}'] },
      { h: '<b>RAILINGS</b>', lines: [[C('rail_yes', 'YES'), C('rail_no', 'NO')], 'CAP: {{railCap}}', 'BALUSTER: {{railBaluster}}', C('rail_composite', 'COMPOSITE TYPE: {{railCompositeType}}'), 'COLOR: {{railCompositeColor}}', C('rail_alum', 'ALUMINUM'), 'COLOR: {{railAlumColor}}'] } ],
    [ { h: '<b>DOOR</b>', lines: [C('door_larson', 'LARSON'), 'COLOR: {{doorColor}}', 'TYPE: {{doorType}}'] },
      { h: '<b>SCREEN SYSTEM</b>', lines: [C('ss_screeneze', 'SCREEN EZE'), 'FRAME COLOR: {{screenFrameColor}}', C('ss_ezebreeze', 'EZE-BREEZE')] },
      { h: '<b>POST SIZE</b>', lines: [[C('post_6pt', '6x6 PT'), C('post_6lam', '6x6 LAM')], [C('post_8pt', '8x8 PT'), C('post_8lam', '8x8 LAM')], C('post_other', 'OTHER: {{postOther}}')] } ],
    [ { h: '<b>GUTTERS</b>', lines: ['COLOR: {{gutterColor}}', C('gut_regular', 'REGULAR SIZE'), C('gut_jumbo', 'JUMBO SIZE')] },
      { h: '<b>CEILING</b>', lines: [C('ceil_plybead', 'PLY-BEAD'), C('ceil_tg', '1x6” T&G')] },
      { h: '<b>BOXING</b>', lines: [C('box_wood', 'WOOD'), C('box_vinyl', 'VINYL'), C('box_xl', 'EXTRA LARGE BOXING')] },
      { h: '<b>PAINTING</b>', lines: [C('paint_client', 'CLIENT’S RESPONSIBILITY'), C('paint_deckplus', 'DECK PLUS’ RESPONSIBILITY')] } ],
    [ { h: '<b>Vinyl Glass Windows</b>', w: 0.24 }, { h: '<b>3-Season Windows are water resistant, not waterproof</b>' } ],
    [ { lines: ['Size: {{winSize}}', 'Grille {{winGrille}}', 'Color {{winColor}}', 'Style: {{winStyle}}'] },
      { h: '<b>VINYL COLOR</b>', lines: [C('vc_clear', 'CLEAR'), C('vc_smoke', 'SMOKE GREY'), C('vc_dark', 'DARK GREY'), C('vc_bronze', 'BRONZE')] },
      { h: '<b>FRAME COLOR</b>', lines: [C('fc_white', 'WHITE'), C('fc_bronze', 'BRONZE'), C('fc_beige', 'BEIGE'), C('fc_khaki', 'PEBBLE KHAKI'), C('fc_black', 'BLACK')] },
      { h: '<b>MOVABLE WINDOW UNITS</b>', lines: [C('mw_vertical', '<u>VERTICAL FOUR TRACK</u>'), C('mw_horizontal', 'HORIZONTAL TRACK')] } ],
    [ { lines: ['3-SEASON WINDOWS RETRO FIT – If your existing openings are not plump, level, and square you may require extra trim. If so, an additional charge may be incurred. You will be notified prior to any work being done.'] } ],
  ],
  signatureLine: '<b>Client{{sig:client-porch}} Deck Plus{{sig:contractor-porch}}</b>',
}

export const DECK_FORM = {
  key: 'deck',
  heading: '<b>DECK DETAIL FORM</b>',
  rows: [
    [ { h: '<b>JOB NAME</b>', lines: ['{{jobName}}'] }, { h: '<b>CONTRACT NUMBER</b>', lines: ['{{contractNum}}'] } ],
    [ { h: '<b>DECK TYPE</b>', w: 0.24 }, { lines: [[C('dt_pt', 'PT WOOD DECK'), C('dt_trex', 'TREX'), C('dt_tt', 'TIMBERTECH'), C('dt_other', 'OTHER')]] } ],
    [ { h: '<b>TREX</b>', lines: ['LINE: {{trexLine}}', 'COLOR: {{trexColor}}'] },
      { h: '<b>TIMBERTECH</b>', lines: ['LINE: {{ttLine}}', 'COLOR: {{ttColor}}'] },
      { h: '<b>TIMBERTECH PVC</b>', lines: ['LINE: {{ttpvcLine}}', 'COLOR: {{ttpvcColor}}'] } ],
    [ { h: '<b>CANTILEVERED?</b>', w: 0.3, lines: [[C('cant_yes', 'YES'), C('cant_no', 'NO')]] },
      { h: '<b>DECK CONNECTION</b>', lines: [[C('dc_brick', 'BRICK WALL'), C('dc_siding', 'SIDING WALL'), C('dc_free', 'FREESTANDING'), C('dc_other', 'OTHER: {{deckConnOther}}')]] } ],
    [ { h: '<b>SKIRTING</b>', lines: [C('sk_none', 'NONE'), C('sk_pt', 'PT WOOD HORIZONTAL'), C('sk_comp', 'COMPOSITE HORIZONTAL'), C('sk_pvc', 'PVC HORIZONTAL'), C('sk_lattice', 'PT ENGLISH LATTICE'), '', 'OTHER: {{skirtOther}}'] },
      { h: '<b>FEATURES</b>', lines: [C('ft_spa', 'REINFORCED FOR SPA'), C('ft_screen', 'SCREEN BELOW DECKING'), C('ft_border1', '1-BOARD BORDER (SCREWED DOWN)'), 'COLOR: {{border1Color}}', C('ft_border2', '2-BOARD BORDER (SCREWED DOWN)'), 'COLOR: {{border2Color}}'] },
      { h: '<b>RAILINGS</b>', lines: [C('rl_hybrid', 'HYBRID WOOD / RND ALUM BALUSTERS'), 'CAP: {{railHybridCap}}', C('rl_comp', 'COMPOSITE / RND BALUSTERS'), 'LINE: {{railCompLine}}', 'COLOR: {{railCompColor}}', C('rl_alum', 'ALUMINUM / SQUARE BALUSTERS'), 'COLOR: {{railAlumColor}}', C('rl_other', 'OTHER: {{railOther}}')] } ],
    [ { h: '<b>LOW VOLTAGE LIGHTS</b>', lines: [C('lv_postcap', 'POST CAP LIGHT'), 'QTY: {{lvPostCapQty}}', C('lv_halfmoon', 'HALF MOON POST LIGHT'), 'QTY: {{lvHalfMoonQty}}', C('lv_riser', 'RISER LIGHT'), 'QTY: {{lvRiserQty}}', C('lv_transformer', 'TRANSFORMER'), 'QTY: {{lvTransformerQty}}'] },
      { h: '<b>BOX STEPS</b>', lines: [C('bs_yes', 'YES'), C('bs_no', 'NO'), 'COLOR: {{boxStepColor}}', '', '<b><u>BOX STEPS PREVENT VISIBLE SCALOPPED/UNFINSHED ENDS ON STEPS FOR COMPOSITE/PVC MATERIALS</u></b>'] },
      { h: 'DECK TRIM:', lines: [C('tr_pt', 'PT DECKING BOARD'), C('tr_comp', 'COMPOSITE/PVC DECKING'), C('tr_wood', '1x4” WOOD TRIM'), '<b><u>OPTIONS BELOW REQUIRE BORDER WITH LIP:</u></b>', C('tr_compfascia', 'COMPOSITE FASCIA'), C('tr_ttpvcfascia', 'TIMBERTECH PVC FASCIA'), C('tr_whitepvc', 'WHITE PVC')] } ],
    [ { h: '<b>PAINTING BY DECK PLUS?</b>', center: true } ],
    [ { lines: [C('pd_yes', 'YES'), C('pd_no', 'NO, CLIENT’S RESPONSIBILITY'), '', 'PAINTING <b><u>DOES NOT</u> </b>INCLUDE UNDERSIDE OF ANY STRUCTURE/MATERIALS'] } ],
    [ { lines: ['EXTENSIONS, ALTERATIONS, ADJUSTMENTS, PARTIAL REPLACEMENT OF EXISTING STRUTURE <b><u>DO NOT</u> </b>CARRY STRUCTURAL WARRANTY. ONLY FULLY NEW BUILDS ARE ELEGIBLE.'] } ],
  ],
  signatureLine: '<b>Client{{sig:client-deck}} Deck Plus{{sig:contractor-deck}}</b>',
}

export const PATIO_FORM = {
  key: 'hardscape',
  heading: '<b>PATIO DETAIL FORM</b>',
  rows: [
    [ { h: '<b>JOB NAME</b>', lines: ['{{jobName}}'] }, { h: '<b>ADDRESS</b>', lines: ['{{propertyAddress}}'] } ],
    [ { h: '<b>TYPE</b>', w: 0.12 }, { lines: [[C('pt_patio', 'PATIO'), C('pt_firepit', 'FIREPIT'), C('pt_wall', 'SITTING WALL'), C('pt_kitchen', 'OUTDOOR KITCHEN'), C('pt_fireplace', 'FIREPLACE'), C('pt_other', 'OTHER: {{patioTypeOther}}')]] } ],
    [ { h: '<b>TECHO-BLOC</b>', lines: ['LINE: {{techoLine}}', 'COLOR: {{techoColor}}'] },
      { h: '<b>KEYSTONE</b>', lines: ['LINE: {{keystoneLine}}', 'COLOR: {{keystoneColor}}'] },
      { h: '<b>OTHER</b>', lines: ['LINE: {{otherLine}}', 'COLOR: {{otherColor}}'] } ],
    [ { w: 0.33, lines: ['PATIO BORDER:', [C('pb_yes', 'YES'), C('pb_no', 'NO')]] }, { lines: ['STYLE: {{borderStyle}} COLOR: {{borderColor}}'] } ],
    [ { h: '<b>FIREPIT / SITTING WALL</b>', lines: ['VENEER COLOR: {{fpVeneer}}', 'CAP COLOR: {{fpCap}}'] },
      { h: '<b>OUTDOOR KITCHEN</b>', lines: ['VENEER COLOR: {{okVeneer}}', 'COUTERTOP SELECTION:', C('ok_travertine', 'TRAVERTINE PIECES'), C('ok_granite', 'GRANITE(1<sup>ST</sup> SEAL INCLUDED):'), 'COLOR: {{okCounterColor}}'] },
      { h: '<b>FIREPLACE</b>', lines: ['VENEER COLOR: {{fplVeneer}}', 'HEARTH CAP COLOR: {{fplHearth}}', 'MANTLE:', C('fpl_cedar', 'CEDAR WOOD'), C('fpl_other', 'OTHER: {{fplMantleOther}}')] } ],
    [ { h: '<b>LOW VOLTAGE LIGHTS</b>', lines: [C('lv_ledge', 'LEDGE LIGHTS'), 'QTY: {{lvLedgeQty}}', C('lv_other', 'OTHER: {{lvOther}}'), 'QTY: {{lvOtherQty}}', C('lv_transformer', 'TRANSFORMER/OUTLET (1)')] },
      { h: '<b>MASONRY FOUNDATION</b>', lines: [C('mf_veneer', 'VENEER: {{mfVeneer}}'), C('mf_color', 'COLOR: {{mfColor}}')] },
      { h: 'POLYMERIC SAND COLOR', lines: [C('ps_similar', 'SIMILAR TO PAVER COLOR'), C('ps_other', 'OTHER: {{psOther}}')] } ],
    [ { h: '<b>RETAINING WALL?</b>', center: true } ],
    [ { lines: [C('rw_yes', 'YES'), C('rw_no', 'NO'), '', 'IF YES, WE WILL USE KEYSTONE OR SIMILAR RETAINING WALL STANDARD BLOCKS. COLORS TO BE SIMILAR TO PATIO COLOR WHEN POSSIBLE, UNLESS SPECIFIED OTHERWISE IN SCOPE OF WORK.'] } ],
    [ { lines: ['HARDSCAPE WILL NOT MATCH EXISTING, INCLUDING BUT NOT LIMITED TO HOUSE BRICK, VENEER STONE, ETC'] } ],
    [ { lines: ['WE DO NOT PROVIDE SEALANT FOR PATIO SURFACES, NOR RECOMMEND IT UPON INSTALLATION'] } ],
  ],
  signatureLine: '<b>Client{{sig:client-hardscape}} Deck Plus{{sig:contractor-hardscape}}</b>',
}

// ── Page 12: Processing form (every contract) ───────────────────────────────
export const PROCESSING_FORM = {
  key: 'processing',
  heading: '<b>PROCESSING FORM</b>',
  top: ['<b>Date Sold: </b>{{dateSold}}', 'PROJECT TYPE: {{projectType}}'],
  blocks: [
    { cells: [
      ['<b>Name:</b> {{clientName}}', '<b>Telephone:</b> {{clientPhone}}', '<b>Email:</b> {{clientEmail}}'],
      ['Design Consultant: {{designConsultant}}'],
      ['NOTES: {{notes}}'],
    ] },
    { cells: [
      ['<b>Full Address:</b> {{propertyAddress}}'],
      ['County: {{county}}', 'Septic:', [C('septicYes', 'YES'), C('septicNo', 'NO')]],
      ['PM CHECKLIST:', C('pmPermit', 'PERMIT'), C('pmHoa', 'HOA APPROVAL'), C('pmUloco', 'ULOCO'), C('pmPrecon', 'PRECON'), C('pmStart', 'START DATE: {{startDate}}')],
    ] },
    { cells: [
      ['<b>Subdivision:</b> {{subdivision}}', 'Beds: {{beds}}', 'Baths: {{baths}}'],
      ['Water provider: {{waterProvider}}', 'Energy provider: {{energyProvider}}', 'Gas provider: {{gasProvider}}'],
      [],
    ] },
    { cells: [['<b>Special Instructions:</b> {{specialInstructions}}']] },
    { cells: [['<b>Directions to Job Site:</b> {{directions}}']] },
    { cells: [
      ['<b>Materials will be delivered on driveway, please mark which side below:</b>', [C('driveLeft', 'LEFT'), C('driveRight', 'RIGHT')], '', '<b>Power? {{check:powerYes}} Yes / {{check:powerNo}} No</b>', '<b>Mark location with “P</b>'],
      ['{{houseSketch}}'],   // the source shows a house drawing here for the "P" mark
    ] },
  ],
  signatureLine: '<b>Client Signature: </b>{{sig:client-processing}} Date: {{sigdate:client-processing}}',
}

// ── Packet assembly ─────────────────────────────────────────────────────────
// Print order is the source order. `when` says which jobs a trade form belongs
// to; the office can still add or remove any form per contract.
export const PACKET_FORMS = [
  { key: 'electrical', label: 'Electrical Specifications', page: 8,  when: (job) => job.hasElectrical },
  { key: 'porch',      label: 'Porch Detail Form',         page: 9,  when: (job) => /porch|sunroom|3.?season|screen|eze/i.test(job.types) },
  { key: 'deck',       label: 'Deck Detail Form',          page: 10, when: (job) => /deck/i.test(job.types) },
  { key: 'hardscape',  label: 'Patio Detail Form',         page: 11, when: (job) => /hardscape|patio|paver|firepit|fire pit|kitchen|fireplace|wall/i.test(job.types) },
]

// Which trade forms a job gets by default, from its project types and quote.
export function defaultPacketForms(job) {
  return PACKET_FORMS.filter(f => { try { return !!f.when(job) } catch { return false } }).map(f => f.key)
}

// Every fill-in blank the packet uses, so the editor can offer them and the
// signing page can render them read-only.
export const BLANK_FIELDS = [
  'effectiveDate', 'clientName', 'propertyAddress', 'contractTotal', 'contractTotalWords',
  'pay1', 'pay2', 'pay3', 'pay3Label', 'pay4', 'contractNum', 'projectName',
  'clientPhone', 'clientEmail', 'jobName', 'dateSold', 'projectType', 'designConsultant',
  'notes', 'county', 'startDate', 'subdivision', 'beds', 'baths', 'waterProvider',
  'energyProvider', 'gasProvider', 'specialInstructions', 'directions', 'trashOther', 'elecOther',
]
