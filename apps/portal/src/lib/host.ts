/** The platform's domain: the portal lives at its apex, apps at `<slug>.<domain>`. */
export const platformDomain = (): string => location.hostname;

export const appHost = (slug: string): string => `${slug}.${platformDomain()}`;

/** Texts from the wiki name the domain as `{{domain}}`; each installation shows its own. */
export const withDomain = (text: string): string => text.replaceAll('{{domain}}', platformDomain());
