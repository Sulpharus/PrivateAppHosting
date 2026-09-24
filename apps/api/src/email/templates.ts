// Transactional emails. Kept deliberately plain: one heading, one sentence, one button, a
// text fallback. Links always point at a portal page with a "Continue" button so that mail
// scanners opening the link cannot consume one-time tokens.

export interface Email {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function layout(
  heading: string,
  body: string,
  action: { label: string; url: string },
  footer: string,
): Email['html'] {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:32px 16px;background:#f3f1ec;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#17160f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #dfdad0;border-radius:16px" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-weight:700;font-size:18px;letter-spacing:-0.02em">mininode</p>
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.2">${escapeHtml(heading)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#3d3a33">${body}</p>
<a href="${escapeHtml(action.url)}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#b8431a;color:#ffffff;font-weight:600;font-size:16px;text-decoration:none">${escapeHtml(action.label)}</a>
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#5f5a50">${escapeHtml(footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function inviteEmail(input: { inviterName: string; url: string; expiresAt: Date }): Email {
  const until = input.expiresAt.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
  const heading = 'Du bist eingeladen';
  const body = `${escapeHtml(input.inviterName)} hat dir Zugang zu MiniNode eingerichtet. Lege mit einem Klick deinen Account an – am einfachsten mit Fingerabdruck oder Gesichtserkennung.`;
  return {
    subject: `${input.inviterName} lädt dich zu MiniNode ein`,
    html: layout(
      heading,
      body,
      { label: 'Einladung annehmen', url: input.url },
      `Der Link ist bis ${until} gültig. Wenn du nichts damit anfangen kannst, ignoriere diese Mail.`,
    ),
    text: `${heading}\n\n${input.inviterName} hat dir Zugang zu MiniNode eingerichtet.\n\nEinladung annehmen: ${input.url}\n\nDer Link ist bis ${until} gültig.`,
  };
}

export type AuthEmailAction =
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change'
  | 'email'
  | 'reauthentication';

const AUTH_COPY: Record<
  AuthEmailAction,
  { subject: string; heading: string; body: string; label: string }
> = {
  signup: {
    subject: 'E-Mail bestätigen',
    heading: 'E-Mail bestätigen',
    body: 'Bestätige deine E-Mail-Adresse, um deinen MiniNode-Account zu aktivieren.',
    label: 'E-Mail bestätigen',
  },
  invite: {
    subject: 'Deine Einladung zu MiniNode',
    heading: 'Du bist eingeladen',
    body: 'Lege deinen MiniNode-Account an.',
    label: 'Einladung annehmen',
  },
  magiclink: {
    subject: 'Dein Anmeldelink',
    heading: 'Anmelden',
    body: 'Melde dich mit einem Klick bei MiniNode an.',
    label: 'Anmelden',
  },
  recovery: {
    subject: 'Passwort zurücksetzen',
    heading: 'Neues Passwort',
    body: 'Du hast angefordert, dein Passwort zurückzusetzen.',
    label: 'Passwort festlegen',
  },
  email_change: {
    subject: 'Neue E-Mail-Adresse bestätigen',
    heading: 'E-Mail-Adresse ändern',
    body: 'Bestätige die neue E-Mail-Adresse für deinen MiniNode-Account.',
    label: 'Bestätigen',
  },
  email: {
    subject: 'Anmeldecode',
    heading: 'Anmeldecode',
    body: 'Melde dich bei MiniNode an.',
    label: 'Anmelden',
  },
  reauthentication: {
    subject: 'Bestätigungscode',
    heading: 'Bestätigungscode',
    body: 'Nutze diesen Code, um die Aktion zu bestätigen.',
    label: 'Zu MiniNode',
  },
};

export function authEmail(action: AuthEmailAction, input: { url: string; code?: string }): Email {
  const copy = AUTH_COPY[action];
  const codeLine = input.code
    ? ` Dein Code: <strong style="font-family:monospace;font-size:18px">${escapeHtml(input.code)}</strong>`
    : '';
  return {
    subject: copy.subject,
    html: layout(
      copy.heading,
      `${escapeHtml(copy.body)}${codeLine}`,
      { label: copy.label, url: input.url },
      'Wenn du das nicht angefordert hast, kannst du diese Mail ignorieren.',
    ),
    text: `${copy.heading}\n\n${copy.body}${input.code ? `\nCode: ${input.code}` : ''}\n\n${copy.label}: ${input.url}`,
  };
}
