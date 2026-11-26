// An e-mail with attachments as RFC 822 text, base64url-encoded for Gmail's messages/send.

const toBase64 = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const utf8 = (text) => new TextEncoder().encode(text);

/** A header value with non-ASCII characters as an RFC 2047 encoded word. */
export function encodeHeader(text) {
  const clean = String(text ?? '').replace(/[\r\n]+/g, ' ');
  // Plain ASCII without quotes or backslashes stays as it is (it also goes inside "…").
  if (/^[\x20-\x7e]*$/.test(clean) && !/["\\]/.test(clean)) return clean;
  return `=?UTF-8?B?${toBase64(utf8(clean))}?=`;
}

/** A plain address check: one address, no header injection. */
export function validEmail(value) {
  return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(String(value ?? '').trim());
}

const wrap76 = (text) => text.replace(/.{76}/g, '$&\r\n');

/**
 * Builds the message: `to`, `subject`, `text` (plain), `attachments` [{ name, type, bytes }].
 * Returns the raw message base64url-encoded, as `messages/send` expects it.
 */
export function buildMessage({ to, subject, text, attachments = [], boundary = 'mn-rechnungen' }) {
  if (!validEmail(to)) throw new Error('invalid address');
  const head = [
    `To: ${to.trim()}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
  ];
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(toBase64(utf8(text ?? ''))),
  ];
  for (const file of attachments) {
    const name = encodeHeader(file.name);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${file.type}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(toBase64(file.bytes)),
    );
  }
  parts.push(`--${boundary}--`, '');
  const raw = [...head, ...parts].join('\r\n');
  return toBase64(utf8(raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
