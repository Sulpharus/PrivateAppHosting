import { existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { type InstanceConfig, parseInstanceConfig } from '@mininode/manifest';
import { instanceConfigPath } from './load.ts';

export interface InitAnswers {
  domain?: string;
  zone?: string;
  accountId?: string;
  supabaseRef?: string;
  publishableKey?: string;
  repository?: string;
  mailFrom?: string;
}

const QUESTIONS: { key: keyof InitAnswers; prompt: string; required: boolean }[] = [
  {
    key: 'domain',
    prompt: 'Domain of the platform, active in your Cloudflare account (e.g. apps.example.com)',
    required: true,
  },
  {
    key: 'zone',
    prompt: 'Cloudflare zone, only if the domain is a subdomain of it (e.g. example.com)',
    required: false,
  },
  {
    key: 'accountId',
    prompt: 'Cloudflare account ID (dashboard → any domain → right column)',
    required: true,
  },
  {
    key: 'supabaseRef',
    prompt: 'Supabase project reference (the 20 letters in the dashboard URL)',
    required: true,
  },
  {
    key: 'publishableKey',
    prompt: 'Supabase publishable key (Settings → API Keys, sb_publishable_…)',
    required: true,
  },
  {
    key: 'repository',
    prompt: 'GitHub repository of this installation (owner/repo)',
    required: false,
  },
  { key: 'mailFrom', prompt: 'Sender address for platform mail', required: false },
];

/** Builds and validates the config from the answers; throws with every problem at once. */
export function buildConfig(answers: InitAnswers): InstanceConfig {
  const candidate = {
    ...(answers.zone ? { zone: answers.zone } : {}),
    cloudflare: { accountId: answers.accountId },
    ...(answers.mailFrom ? { mailFrom: answers.mailFrom } : {}),
    ...(answers.repository ? { github: { repository: answers.repository } } : {}),
    environments: {
      production: {
        domain: answers.domain,
        supabase: { projectRef: answers.supabaseRef, publishableKey: answers.publishableKey },
      },
    },
  };
  const parsed = parseInstanceConfig(candidate);
  if (!parsed.ok) throw new Error(`invalid answers:\n  ${parsed.errors.join('\n  ')}`);
  return parsed.config;
}

async function ask(answers: InitAnswers): Promise<InitAnswers> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const out = { ...answers };
    for (const question of QUESTIONS) {
      if (out[question.key]) continue;
      const suffix = question.required ? '' : ' (optional, Enter to skip)';
      const value = (await rl.question(`${question.prompt}${suffix}: `)).trim();
      if (value) out[question.key] = value;
    }
    return out;
  } finally {
    rl.close();
  }
}

/** Writes `mininode.config.json`. Without all answers on the command line it asks for them. */
export async function initInstance(
  root: string,
  flags: InitAnswers,
  options: { overwrite: boolean },
): Promise<InstanceConfig> {
  const path = instanceConfigPath(root);
  if (existsSync(path) && !options.overwrite) {
    throw new Error('mininode.config.json exists; use --force to replace it');
  }
  const missing = QUESTIONS.filter((q) => q.required && !flags[q.key]);
  if (missing.length > 0 && !process.stdin.isTTY) {
    throw new Error(`missing: ${missing.map((q) => `--${q.key}`).join(', ')}`);
  }
  const answers = missing.length > 0 ? await ask(flags) : flags;
  const config = buildConfig(answers);
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}
