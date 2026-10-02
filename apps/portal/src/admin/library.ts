// The construction prompt library and the files an AI needs, bundled into the admin chunk at
// build time. Sources: docs/ai (specs, design system, prompt parts) and packages/ui/kit.

import design from '../../../../docs/ai/DESIGN-SYSTEM.md?raw';
import language from '../../../../docs/ai/LANGUAGE-PACKAGES.md?raw';
import spec from '../../../../docs/ai/NEW-APP-SPEC.md?raw';
import specShort from '../../../../docs/ai/NEW-APP-SPEC.short.md?raw';
import kitCss from '../../../../packages/ui/kit/ui.css?raw';
import kitJs from '../../../../packages/ui/kit/ui.js?raw';
import { type Library, parsePart, sortParts } from './prompts.ts';

const types = import.meta.glob('../../../../docs/ai/prompts/types/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const modules = import.meta.glob('../../../../docs/ai/prompts/modules/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const LIBRARY: Library = {
  spec,
  specShort,
  design,
  language,
  kitCss,
  types: sortParts(Object.values(types).map(parsePart)),
  modules: sortParts(Object.values(modules).map(parsePart)),
};

export interface BuildFile {
  name: string;
  title: string;
  description: string;
  content: string;
  type: string;
}

export const FILES: BuildFile[] = [
  {
    name: 'NEW-APP-SPEC.md',
    title: 'App-Spezifikation',
    description:
      'Technik, SDK, Datenablage, KI, Manifest und Regeln. Immer mitgeben (im Prompt-Ersteller schon enthalten).',
    content: spec,
    type: 'text/markdown',
  },
  {
    name: 'NEW-APP-SPEC.short.md',
    title: 'App-Spezifikation, kurz',
    description: 'Dasselbe in kurz, für Tools mit kleinem Prompt-Limit.',
    content: specShort,
    type: 'text/markdown',
  },
  {
    name: 'DESIGN-SYSTEM.md',
    title: 'Designsystem',
    description:
      'Farben (hell und dunkel), Schriften, App-Gerüst und alle Komponenten des App Kits mit HTML-Beispielen.',
    content: design,
    type: 'text/markdown',
  },
  {
    name: 'LANGUAGE-PACKAGES.md',
    title: 'Sprachpakete',
    description:
      'Deutsche und englische Texte jeder App: Dateien, Einbau, Stilregeln, Glossar und Prüfliste. Im Prompt-Ersteller schon enthalten.',
    content: language,
    type: 'text/markdown',
  },
  {
    name: 'ui.css',
    title: 'App Kit CSS',
    description:
      'Das Stylesheet des Designsystems. Nur nötig, wenn die App außerhalb von MiniNode entsteht (z. B. als Claude-Artifact).',
    content: kitCss,
    type: 'text/css',
  },
  {
    name: 'ui.js',
    title: 'App Kit Skript',
    description:
      'Dialoge, Toasts und Theme (window.mnui). Wie ui.css nur für Builds außerhalb von MiniNode.',
    content: kitJs,
    type: 'text/javascript',
  },
];
