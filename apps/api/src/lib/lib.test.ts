import { createDecipheriv, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildMessages, safeNext } from '../routes/hooks.ts';
import { clientIdentifier, encryptAuthPayload, lockDownParameters } from './guacamole.ts';
import { sign, verify } from './standard-webhooks.ts';

const SECRET = `v1,whsec_${Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')}`;

describe('standard webhooks', () => {
  const body = '{"hello":"world"}';
  const now = 1_790_000_000_000;
  const headersFor = async (payload: string, timestamp = String(now / 1000)) =>
    new Headers({
      'webhook-id': 'msg_1',
      'webhook-timestamp': timestamp,
      'webhook-signature': await sign(SECRET, 'msg_1', timestamp, payload),
    });

  it('accepts a correct signature', async () => {
    expect(await verify(SECRET, await headersFor(body), body, now)).toBe(true);
  });

  it('rejects a tampered body', async () => {
    expect(await verify(SECRET, await headersFor(body), '{"hello":"evil"}', now)).toBe(false);
  });

  it('rejects stale timestamps (replay)', async () => {
    const old = String(now / 1000 - 3600);
    expect(await verify(SECRET, await headersFor(body, old), body, now)).toBe(false);
  });

  it('rejects missing headers', async () => {
    expect(await verify(SECRET, new Headers(), body, now)).toBe(false);
  });
});

describe('guacamole json auth', () => {
  const key = '4c0b569e4c96df157eee1b65dd0e4d41';

  it('produces a blob guacamole-auth-json can decrypt and verify', async () => {
    const payload = {
      username: 'anna@example.com',
      expires: 1_790_000_060_000,
      connections: {
        Haushaltsbuch: { protocol: 'rdp' as const, parameters: { hostname: '10.0.0.5' } },
      },
    };
    const blob = await encryptAuthPayload(key, payload);

    const decipher = createDecipheriv('aes-128-cbc', Buffer.from(key, 'hex'), Buffer.alloc(16));
    const plain = Buffer.concat([decipher.update(Buffer.from(blob, 'base64')), decipher.final()]);
    const signature = plain.subarray(0, 32);
    const json = plain.subarray(32);
    expect(
      createHmac('sha256', Buffer.from(key, 'hex')).update(json).digest().equals(signature),
    ).toBe(true);
    expect(JSON.parse(json.toString('utf8'))).toEqual(payload);
  });

  it('rejects malformed keys', async () => {
    await expect(
      encryptAuthPayload('short', { username: 'x', expires: 0, connections: {} }),
    ).rejects.toThrow();
  });

  it('encodes client identifiers like guacamole does', () => {
    expect(atob(clientIdentifier('Haushaltsbuch'))).toBe('Haushaltsbuch\0c\0json');
  });

  it('removes data channels for restricted sessions', () => {
    const locked = lockDownParameters({ hostname: 'h', 'enable-drive': 'true' }, true);
    expect(locked).toMatchObject({
      'enable-drive': 'false',
      'disable-copy': 'true',
      'disable-paste': 'true',
    });
    expect(lockDownParameters({}, false)['disable-copy']).toBeUndefined();
  });
});

describe('auth email hook', () => {
  const portal = 'https://mininode.app';
  const base = {
    user: { email: 'anna@example.com' },
    email_data: {
      token: '123456',
      token_hash: 'hash',
      redirect_to: 'https://rezepte.mininode.app/',
      email_action_type: 'recovery' as const,
      token_new: '',
      token_hash_new: '',
    },
  };

  it('links recovery mails to the portal confirm page with a safe next url', () => {
    const [message] = buildMessages(base, portal);
    expect(message?.to).toBe('anna@example.com');
    expect(message?.text).toContain(
      'https://mininode.app/auth/confirm?token_hash=hash&type=recovery',
    );
    expect(message?.text).toContain('Code: 123456');
  });

  it('mails both addresses for a secure email change', () => {
    const messages = buildMessages(
      {
        user: { email: 'old@example.com', new_email: 'new@example.com' },
        email_data: {
          ...base.email_data,
          email_action_type: 'email_change',
          token_hash_new: 'hash-new',
        },
      },
      portal,
    );
    expect(messages.map((m) => m.to)).toEqual(['old@example.com', 'new@example.com']);
    expect(messages[0]?.text).toContain('hash-new');
  });

  it('never redirects off the platform domain', () => {
    expect(safeNext('https://evil.example/phish', portal)).toBe('/');
    expect(safeNext('https://mininode.app.evil.example/', portal)).toBe('/');
    expect(safeNext('https://budget.mininode.app/x', portal)).toBe('https://budget.mininode.app/x');
    expect(safeNext('/welcome', portal)).toBe('https://mininode.app/welcome');
  });
});
