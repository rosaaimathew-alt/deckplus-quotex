// The welcome email a customer gets once their contract is fully signed
// (Settings › Contracts). The office can edit the wording; these are the
// defaults. The server fills the {placeholders} when it sends.
export const WELCOME_EMAIL_DEFAULT = {
  enabled: false,
  subject: 'Welcome to {companyName}, {firstName}!',
  body: [
    'Hi {firstName},',
    '',
    'Thank you for choosing {companyName}! Your contract #{contractNum} is fully signed and we are excited to get started on your project.',
    '',
    'Our team will be in touch shortly to go over the next steps and scheduling.',
    '',
    'You can view or download your signed contract any time here:',
    '{signedCopyLink}',
    '',
    'If you have any questions, just reply to this email.',
    '',
    'Welcome aboard!',
    'The {companyName} Team',
  ].join('\n'),
}
export const WELCOME_PLACEHOLDERS = ['{firstName}', '{clientName}', '{companyName}', '{contractNum}', '{signedCopyLink}']
