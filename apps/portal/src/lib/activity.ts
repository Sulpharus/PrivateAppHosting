// Readable lines for the admin activity feed (platform.audit_log).

export interface AuditRow {
  id: number;
  at: string;
  action: string;
  app_slug: string | null;
  actor_id: string | null;
  detail: Record<string, unknown> | null;
}

const ROLE: Record<string, string> = { admin: 'Admin', trusted: 'Trusted', user: 'User' };

/** One line per entry, with the names of the people involved (user id → display name). */
export function describeActivity(row: AuditRow, names: Map<string, string>): string {
  const detail = row.detail ?? {};
  const name = (id: unknown) => (typeof id === 'string' && names.get(id)) || 'gelöschter Nutzer';
  switch (row.action) {
    case 'user.created':
      return `${name(row.actor_id)} ist beigetreten (${ROLE[String(detail.role)] ?? 'User'})`;
    case 'user.role_changed':
      return `${name(detail.user_id)} ist jetzt ${ROLE[String(detail.role)] ?? String(detail.role)}`;
    case 'user.recovery_link':
      return `Passwort-Link für ${name(detail.user_id)} erstellt`;
    case 'user.deleted':
      return typeof detail.display_name === 'string'
        ? `${detail.display_name} gelöscht`
        : 'Nutzer gelöscht';
    case 'app.state_changed':
      // Unset arguments of admin_set_app_state arrive as null.
      if (detail.disabled === true) return 'App deaktiviert';
      if (detail.is_default === true) return 'App für neue Nutzer freigegeben';
      if (detail.is_default === false) return 'App nicht mehr für neue Nutzer freigegeben';
      return detail.disabled === false ? 'App aktiviert' : 'App geändert';
    case 'remote.install':
      return 'Programm auf der NucBox installiert';
    case 'app.whitelist_set':
      return detail.whitelist === true ? 'App nur für die Whitelist' : 'App wieder freigegeben';
    case 'app.category_set':
      return detail.category ? 'Kategorie der App festgelegt' : 'Kategorie der App automatisch';
    case 'app.link_saved':
      return 'Link-Kachel gespeichert';
    case 'app.link_deleted':
      return 'Link-Kachel entfernt';
    case 'app_set.saved':
      return 'Paket gespeichert';
    case 'app_set.deleted':
      return 'Paket gelöscht';
    case 'app_category.insert':
      return 'Kategorie angelegt';
    case 'app_category.update':
      return 'Kategorie geändert';
    case 'app_category.delete':
      return 'Kategorie gelöscht';
    default:
      return row.action;
  }
}
