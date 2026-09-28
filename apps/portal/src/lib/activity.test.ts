import { describe, expect, it } from 'vitest';
import { type AuditRow, describeActivity } from './activity.ts';

const names = new Map([
  ['u1', 'Lena'],
  ['u2', 'Wolfram'],
]);
const row = (action: string, detail: Record<string, unknown>, actor: string | null = 'u2') =>
  ({ id: 1, at: '', action, app_slug: null, actor_id: actor, detail }) satisfies AuditRow;

describe('describeActivity', () => {
  it('names the people involved', () => {
    expect(describeActivity(row('user.created', { role: 'trusted' }, 'u1'), names)).toBe(
      'Lena ist beigetreten (Trusted)',
    );
    expect(describeActivity(row('user.role_changed', { user_id: 'u1', role: 'user' }), names)).toBe(
      'Lena ist jetzt User',
    );
    expect(describeActivity(row('user.recovery_link', { user_id: 'u1' }), names)).toBe(
      'Passwort-Link für Lena erstellt',
    );
    expect(describeActivity(row('user.deleted', { display_name: 'Max' }), names)).toBe(
      'Max gelöscht',
    );
  });
  it('falls back for removed users and unknown actions', () => {
    expect(describeActivity(row('user.recovery_link', { user_id: 'gone' }), names)).toBe(
      'Passwort-Link für gelöschter Nutzer erstellt',
    );
    expect(describeActivity(row('something.new', {}), names)).toBe('something.new');
  });
  it('tells app changes apart', () => {
    expect(describeActivity(row('app.state_changed', { disabled: true }), names)).toBe(
      'App deaktiviert',
    );
    expect(
      describeActivity(row('app.state_changed', { disabled: false, is_default: null }), names),
    ).toBe('App aktiviert');
    expect(
      describeActivity(row('app.state_changed', { disabled: null, is_default: true }), names),
    ).toBe('App für neue Nutzer freigegeben');
  });
});
