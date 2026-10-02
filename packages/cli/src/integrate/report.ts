import type { IntegrateResult } from './types.ts';

const list = (items: string[]) => items.map((item) => `- ${item}`).join('\n');

/** The same report for the Actions log, the GitHub review issue and the Verwaltung page. */
export function reportMarkdown(result: IntegrateResult, origin: string): string {
  const lines = [
    `# Integration von ${origin}`,
    '',
    result.status === 'integrated'
      ? `**Fertig:** ${result.name} liegt unter \`hosted/${result.slug}\` und besteht \`mininode doctor\`.`
      : '**Braucht eine Prüfung:** das Skript hat die App nicht fertig integriert.',
    '',
    `Projektform: \`${result.framework}\``,
  ];
  if (result.reasons.length > 0)
    lines.push(
      '',
      '## Warum das Skript gestoppt hat',
      '',
      list(result.reasons.map((r) => `\`${r.code}\`${r.file ? ` (${r.file})` : ''}: ${r.message}`)),
    );
  if (result.actions.length > 0)
    lines.push('', '## Was das Skript geändert hat', '', list(result.actions));
  if (result.warnings.length > 0) lines.push('', '## Zu beachten', '', list(result.warnings));
  if (result.status === 'needs_review')
    lines.push(
      '',
      '## Nächster Schritt',
      '',
      'Ein Claude-Code-Lauf öffnet das ZIP mit dem Skill `integrate-app` und bearbeitet genau diese Punkte (`docs/ai/playbooks/`).',
    );
  return `${lines.join('\n')}\n`;
}
