// Legal content for the app. The consumer-facing ESIGN disclosure and the Data
// Processing Agreement below are the real, finalized documents. The remaining
// platform policies (terms, privacy, AUP, billing) are still marked as drafts
// pending final language; each such doc carries `draft: true` so the UI shows a
// pending-review banner only where it applies.
// companyName is threaded in so these read correctly per brand.

export const PLACEHOLDER_NOTE =
  'DRAFT — placeholder text, pending attorney review. Not yet final. Replace with final language before relying on it.'

const P = (companyName) => companyName || 'the Company'

export const LEGAL_DOCS = {
  terms: {
    title: 'Terms of Service',
    subtitle: 'Master Subscription Agreement',
    draft: true,
    build: (c) => [
      { h: '1. Agreement', p: [`These Terms govern use of the ${P(c)} software platform ("the Service") by the business that subscribes ("Customer"). By using the Service, Customer agrees to these Terms.`] },
      { h: '2. The Service', p: ['The Service provides estimating, proposal, contract, e-signature, and job-management tools. Features may change over time.'] },
      { h: '3. Accounts & access', p: ['Customer is responsible for its users, credentials, and the accuracy of data it enters. Customer must keep login credentials secure.'] },
      { h: '4. Customer data', p: ['Customer owns the data it enters. The Service processes that data on Customer’s behalf as described in the Data Processing Agreement.'] },
      { h: '5. Acceptable use', p: ['Use is subject to the Acceptable Use Policy. Prohibited use may result in suspension.'] },
      { h: '6. Fees', p: ['Fees, billing, and refunds (if any) are described in the Subscription & Billing Terms.'] },
      { h: '7. Disclaimers & liability', p: ['[PLACEHOLDER] Warranty disclaimers and limitation-of-liability language to be provided by counsel.'] },
      { h: '8. Term & termination', p: ['[PLACEHOLDER] Term, termination, and data-return/deletion terms to be provided by counsel.'] },
      { h: '9. Contact', p: [`Questions about these Terms: contact ${P(c)}.`] },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    subtitle: 'How we collect, use, and store information',
    draft: true,
    build: (c) => [
      { h: '1. Scope', p: [`This policy explains how ${P(c)} handles personal information collected through the Service, including a business’s own users and its end customers (e.g., homeowners).`] },
      { h: '2. What we collect', p: ['Contact details (name, email, phone, address), proposal and contract content, e-signatures and their audit trail (timestamp, IP, device), and usage/engagement data such as when a proposal link is opened.'] },
      { h: '3. Cookies, tracking & local storage', p: ['The Service uses browser local storage to keep the app working, and records when shared proposal links are opened (open-tracking). These are used to operate the Service and report engagement to the business that sent the proposal.'] },
      { h: '4. How we use information', p: ['To provide the Service: build and send proposals, execute contracts, track engagement, and support the business’s operations.'] },
      { h: '5. Sharing', p: ['[PLACEHOLDER] We do not sell personal information. Sub-processor and sharing details to be finalized with counsel.'] },
      { h: '6. Your rights', p: ['[PLACEHOLDER] Access, correction, deletion, and opt-out rights (including state-specific rights such as California) to be finalized with counsel.'] },
      { h: '7. Retention & security', p: ['[PLACEHOLDER] Retention periods and security measures to be finalized with counsel.'] },
      { h: '8. Contact', p: [`Privacy questions: contact ${P(c)}.`] },
    ],
  },
  dpa: {
    title: 'Data Processing Agreement',
    subtitle: 'Processing of personal data on behalf of the subscribing business',
    build: () => [
      { h: 'About this agreement', p: [
        'This Data Processing Agreement ("DPA") is between QuoteX ("QuoteX") and the Customer identified in the Master Subscription Agreement (the "Agreement"). Capitalized terms not defined here have the meanings in the Agreement. If this DPA conflicts with the Agreement regarding Personal Data, this DPA controls.',
        'This DPA is automatically part of every QuoteX account; no separate signature is required. A countersigned copy is available on request.',
      ] },
      { h: '1. Definitions', p: [
        '"Data Protection Laws" means all U.S. federal and state laws applicable to the processing of Personal Data under the Agreement, including the California Consumer Privacy Act as amended by the California Privacy Rights Act ("CCPA"), other state comprehensive privacy laws, and state data-breach and data-security laws (including N.C. Gen. Stat. § 75-60 et seq.), in each case as amended.',
        '"Personal Data" means any information relating to an identified or identifiable individual that QuoteX processes on Customer’s behalf under the Agreement, including End Client Data and personal information of Customer’s Authorized Users contained in Customer Data. It includes "personal information" and "personal data" as defined in Data Protection Laws.',
        '"Processing" means any operation performed on Personal Data, such as collection, storage, use, disclosure, or deletion.',
        '"Security Incident" means a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to Personal Data in QuoteX’s or its Subprocessors’ possession or control.',
        '"Subprocessor" means any third party QuoteX engages to process Personal Data.',
        '"Data Subject Request" means a request from an individual to exercise rights under Data Protection Laws.',
      ] },
      { h: '2. Roles and scope', p: [
        'Roles. Customer is the controller / business for Personal Data, and QuoteX is its processor / service provider. Customer is responsible for determining the purposes of processing and for its own compliance with Data Protection Laws, including providing notices to and obtaining any required consents from End Clients.',
        'Details of processing. The subject matter, nature, purpose, duration, categories of data, and categories of individuals are described in Annex 1.',
        'Customer instructions. QuoteX will process Personal Data only on Customer’s documented instructions. The Agreement, this DPA, Customer’s configuration of the Services, and Customer’s use of Service features (for example, sending a proposal, requesting a signature, or enabling an integration) are Customer’s complete instructions. QuoteX will inform Customer if, in its opinion, an instruction violates Data Protection Laws, and may suspend processing under that instruction.',
      ] },
      { h: '3. QuoteX obligations', p: [
        'Service-provider restrictions. QuoteX will not: sell or share (as those terms are defined in the CCPA) Personal Data; retain, use, or disclose Personal Data for any purpose other than the business purposes specified in the Agreement, including for any commercial purpose other than providing the Services, or outside the direct business relationship between QuoteX and Customer; combine Personal Data received from Customer with personal information received from other sources or collected from QuoteX’s own interactions with individuals, except as permitted by Data Protection Laws (for example, to detect security incidents or fraud); or use End Client Data to market to End Clients. QuoteX certifies that it understands and will comply with these restrictions. QuoteX will notify Customer if it determines it can no longer meet its obligations under Data Protection Laws, and Customer may then take reasonable steps to stop and remediate unauthorized processing.',
        'Permitted internal uses. Notwithstanding the restrictions above, QuoteX may use Personal Data to (a) build or improve the quality of the Services, provided that it does not use Personal Data to build profiles of individuals for use in providing services to another business; (b) detect security incidents and protect against fraud or illegal activity; (c) comply with law; and (d) create de-identified or aggregated data, which QuoteX will maintain in de-identified form, publicly commit not to re-identify, and contractually require any recipients to not re-identify.',
        'Confidentiality of personnel. QuoteX will ensure that personnel authorized to process Personal Data are bound by confidentiality obligations and receive appropriate privacy and security training.',
        'Security. QuoteX will implement and maintain the technical and organizational measures in Annex 2. QuoteX may update those measures if the update does not materially decrease the overall protection of Personal Data.',
        'Security incidents. QuoteX will notify Customer without undue delay, and in any event within seventy-two (72) hours, after becoming aware of a Security Incident. The notice will describe, to the extent known, the nature of the incident, categories and approximate number of individuals and records affected, likely consequences, and measures taken or proposed. QuoteX will provide updates as information becomes available, take reasonable steps to contain and remediate the incident, and reasonably cooperate with Customer’s efforts to meet its notification obligations. Unless required by law, QuoteX will not notify End Clients or regulators of a Security Incident involving Customer’s Personal Data without first consulting Customer, and QuoteX’s notification is not an admission of fault.',
        'Assistance. Taking into account the nature of the processing, QuoteX will provide reasonable assistance to Customer, including through Service features, with (a) responding to Data Subject Requests, (b) data protection assessments, and (c) consultations with regulators. If QuoteX receives a Data Subject Request directly, it will promptly forward it to Customer and will not respond except to direct the individual to Customer, unless required by law.',
        'Legal requests. If QuoteX receives a subpoena, court order, or government request for Personal Data, it will, where legally permitted, promptly notify Customer and give Customer a reasonable opportunity to seek a protective order, and will disclose only what is legally required.',
      ] },
      { h: '4. Subprocessors', p: [
        'Authorization. Customer gives general authorization for QuoteX to engage Subprocessors. The current Subprocessors are listed in Annex 3.',
        'Obligations. QuoteX will enter into a written agreement with each Subprocessor imposing data-protection obligations no less protective than this DPA, and remains responsible for each Subprocessor’s performance.',
        'Changes and objection. QuoteX will give at least thirty (30) days’ notice (by email or in-app notice, and by updating the list) before a new Subprocessor processes Personal Data. Customer may object on reasonable data-protection grounds within that period. The parties will discuss the objection in good faith; if they cannot resolve it, Customer may terminate the affected Services and receive a refund of prepaid fees for the remaining term. In an emergency (for example, replacing a failed provider), QuoteX may engage a Subprocessor with shorter notice and Customer retains the same objection right.',
      ] },
      { h: '5. Customer obligations', p: [
        'Customer will (a) provide End Clients with any notices required by Data Protection Laws describing Customer’s use of QuoteX as a service provider; (b) have a lawful basis to provide Personal Data to QuoteX; (c) not instruct QuoteX to process Personal Data in violation of law; (d) not upload sensitive data (such as Social Security numbers, financial account numbers, government ID numbers, or health information) unless a Service feature is specifically designed for it; and (e) use the consumer e-signature disclosure step described in the Agreement.',
      ] },
      { h: '6. Audits and records', p: [
        'On written request no more than once per twelve months (or after a Security Incident), QuoteX will provide Customer with information reasonably necessary to demonstrate compliance with this DPA, which may consist of a completed security questionnaire, summaries of QuoteX’s security policies, and third-party audit reports (such as a SOC 2 Type II, when available). If that information is insufficient to meet a requirement of Data Protection Laws, Customer may, at its own expense and on thirty (30) days’ notice, conduct (or have a qualified independent auditor under confidentiality obligations conduct) an audit during business hours in a manner that does not unreasonably disrupt QuoteX’s operations or compromise other customers’ data.',
      ] },
      { h: '7. Return and deletion', p: [
        'Upon termination of the Agreement, QuoteX will make Personal Data available for export for thirty (30) days and then delete it within sixty (60) days thereafter, except that QuoteX may retain (a) Personal Data in backups until overwritten in the ordinary course, (b) signed Customer Contracts and signature audit trails as described in the Agreement, and (c) Personal Data it is required by law to retain. Retained Personal Data remains subject to this DPA. On request, QuoteX will confirm deletion in writing.',
      ] },
      { h: '8. Liability', p: [
        'Each party’s liability arising out of or related to this DPA is subject to the limitations and exclusions in the Agreement.',
      ] },
      { h: '9. Term', p: [
        'This DPA remains in effect for as long as QuoteX processes Personal Data on Customer’s behalf.',
      ] },
      { h: 'Annex 1 — Details of processing', p: [
        'Subject matter: Provision of the QuoteX Services to Customer.',
        'Nature of processing: Collection, storage, organization, retrieval, analysis (including AI-assisted pricing), transmission (email/SMS delivery), electronic signature capture, display, and deletion.',
        'Purpose: Estimating and pricing, proposal generation and delivery, proposal engagement tracking, electronic contract execution, project and contract management, customer support, security.',
        'Duration: For the Subscription Term plus the retention periods in Section 7.',
        'Categories of individuals: Customer’s End Clients (homeowners, property owners, property managers, HOA contacts); Customer’s Authorized Users; Customer’s subcontractors and suppliers named in Customer Data.',
        'Categories of Personal Data: Names; email addresses; phone numbers; property addresses; project details and property photos; pricing and contract terms; electronic signatures and signature audit data (IP address, device/browser data, timestamps, document hash); proposal engagement data (open/view events, time on page); payment status (card data handled by payment processor only); communications through the Services.',
        'Sensitive data: None intended. Customer will not upload sensitive data except as permitted in Section 5.',
      ] },
      { h: 'Annex 2 — Technical and organizational security measures', p: [
        'Encryption: TLS 1.2+ for data in transit; AES-256 (or provider-equivalent) encryption at rest for databases, file storage, and backups.',
        'Access control: role-based access in the application; organization-level data isolation so one Customer cannot access another Customer’s data; least-privilege production access limited to named personnel; multi-factor authentication required for all QuoteX administrative and infrastructure accounts.',
        'Authentication for users: password hashing with a modern algorithm or delegated auth provider; session expiry.',
        'Signing security: unique, unguessable, expiring signing links; audit trail capturing consent, timestamps, IP, and user agent; tamper-evident hash of the final signed document; signed PDFs locked against further edits.',
        'Secrets management: API keys and credentials stored in a secrets manager or encrypted environment variables, never in source code; rotation on personnel change or suspected exposure.',
        'Logging and monitoring: application and infrastructure logging; alerts on anomalous access.',
        'Vulnerability management: dependency scanning; prompt patching of critical vulnerabilities.',
        'Backups and resilience: automated daily backups; documented restore procedure.',
        'Secure development: code review before production deployment; separate development, staging, and production environments; no production Personal Data in development.',
        'Personnel: confidentiality agreements; security training at onboarding and annually; prompt revocation of access on departure.',
        'Incident response: written incident response plan with defined roles and the notification timelines in Section 3.',
        'Vendor management: Subprocessors assessed for security before engagement and bound by written terms.',
        'AI providers: Personal Data sent to AI model providers is limited to what is needed for the request; provider terms prohibit training on inputs.',
      ] },
      { h: 'Annex 3 — Subprocessors', p: [
        'Vercel Inc. — Application hosting and delivery — United States.',
        'Supabase Inc. / database provider — Database, authentication, file storage — United States.',
        'Anthropic, PBC — AI model provider for pricing and proposal text — United States.',
        'Transactional email provider (e.g., Resend / SendGrid / Postmark) — Proposals, signing links, notifications — United States.',
        'Twilio Inc. — SMS notifications (if enabled) — United States.',
        'Stripe, Inc. — Subscription billing; End Client payments (if enabled) — United States.',
        'Google LLC — Workspace integrations / sign-in (if enabled) — United States.',
      ] },
    ],
  },
  aup: {
    title: 'Acceptable Use Policy',
    subtitle: 'What is and isn’t allowed on the platform',
    draft: true,
    build: (c) => [
      { h: '1. Purpose', p: [`This policy sets the rules for acceptable use of the ${P(c)} Service.`] },
      { h: '2. Prohibited use', p: ['No unlawful use; no uploading of others’ confidential data without authority; no attempts to breach security, access other accounts, or disrupt the Service; no sending of unlawful or unconsented communications.'] },
      { h: '3. Communications & consent', p: ['Customers must obtain any legally required consent (e.g., TCPA for texts/calls) before contacting their end customers through or as a result of the Service.'] },
      { h: '4. Enforcement', p: ['[PLACEHOLDER] Suspension and enforcement terms to be finalized with counsel.'] },
    ],
  },
  refund: {
    title: 'Subscription & Billing Terms',
    subtitle: 'Fees, billing, and refunds',
    draft: true,
    build: () => [
      { h: '1. Fees', p: ['[PLACEHOLDER] Subscription tiers and pricing to be defined once billing is enabled.'] },
      { h: '2. Billing', p: ['[PLACEHOLDER] Billing cycle, payment method, and renewal terms to be defined.'] },
      { h: '3. Refunds', p: ['[PLACEHOLDER] Refund and cancellation policy to be defined.'] },
      { h: '4. Changes', p: ['[PLACEHOLDER] How and when pricing may change, with notice, to be defined.'] },
    ],
  },
}

// Binding-agreement acknowledgment shown at signing, reaffirmed above Sign & Submit.
export const AGREEMENT_ACK =
  'I have read this document and agree that signing it forms a legally binding agreement, and that my electronic signature is the legal equivalent of my handwritten signature.'

// Real consumer ESIGN/UETA disclosure, shown as its own step on the signing page
// BEFORE the document. The consent checkbox must be checked to continue.
// `build(companyName)` threads the contractor's name through the consumer text.
export const ESIGN_DISCLOSURE = {
  title: 'Consumer Disclosure and Consent to Do Business Electronically',
  consentLabel:
    'I have read and agree to the Consumer Disclosure and Consent to Do Business Electronically above, and I confirm I was able to open and view this document on my device.',
  build: (companyName) => {
    return {
      intro: `The Contractor ("we") will send you proposals, contracts, and related documents and collect your signature electronically. Please read this disclosure carefully. You must agree to it before you can review and sign documents electronically.`,
      sections: [
        { h: '1. What you are agreeing to', p: [
          'If you agree, Contractor may provide you, electronically, with all documents and notices relating to your project that Contractor would otherwise provide on paper (the "Electronic Records"), including: proposals, estimates, and contracts; change orders; notices required by law, including any notice of your right to cancel the contract; warranty documents; invoices, receipts, and lien waivers; and project updates and completion documents.',
          'You also agree that your electronic signature (typing your name, drawing your signature, or clicking a button labeled to indicate your agreement) is the legal equivalent of your handwritten signature.',
          'This consent applies to your project and any change orders, notices, and documents relating to that project, unless you withdraw it.',
        ] },
        { h: '2. You can get paper copies', p: [
          `You have the right to receive any Electronic Record on paper. To request a paper copy, contact the Contractor. There is no charge for paper copies. Requesting a paper copy does not by itself withdraw your consent.`,
        ] },
        { h: '3. You can choose not to sign electronically', p: [
          `You are not required to receive documents or sign electronically. If you prefer paper, do not check the box below; instead contact the Contractor to arrange to receive and sign paper documents. Choosing paper will not affect the price or terms offered to you.`,
        ] },
        { h: '4. You can withdraw your consent', p: [
          `You may withdraw your consent to receive Electronic Records at any time by contacting the Contractor. If you withdraw consent: documents you already signed electronically remain valid and binding; Contractor will provide future documents and notices on paper to your mailing address; and there are no fees or other consequences. Withdrawal takes effect after Contractor has had a reasonable time to process it.`,
        ] },
        { h: '5. Keep your contact information current', p: [
          `If your email address, phone number, or mailing address changes, tell the Contractor so you continue to receive notices.`,
        ] },
        { h: '6. What you need to access and keep Electronic Records', p: [
          'To access and keep Electronic Records you need: a computer, tablet, or smartphone with an internet connection; a current version of Chrome, Safari, Edge, or Firefox, with JavaScript and cookies enabled; software that can open PDF files (built into most devices and browsers); an active email account that you can access; and the ability to download and save or print PDF files.',
          'If these requirements change in a way that creates a material risk you will not be able to access or keep Electronic Records, Contractor will notify you and give you the chance to withdraw consent without fees or consequences.',
        ] },
        { h: '7. Your copies', p: [
          'After you sign, a complete copy of the signed document will be emailed to you and will be available to download at your document link for at least 7 years. We recommend you download and save or print a copy for your records.',
        ] },
        { h: '8. Your consent', p: [
          'By checking the box below, you confirm that: you have read this disclosure and were able to open and view it on your device; you can access and save PDF documents, which shows you can access the Electronic Records described above; the email address the document was sent to belongs to you; and you consent to receive Electronic Records and to sign electronically as described above.',
        ] },
      ],
    }
  },
}

export const LEGAL_ORDER = ['terms', 'privacy', 'dpa', 'aup', 'refund']
