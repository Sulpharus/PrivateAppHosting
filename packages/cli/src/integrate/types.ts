// Result of `mininode integrate`: either the app is in hosted/<slug> and passes `mininode doctor`,
// or it is marked for review (an AI session or the admin) with the reasons that stopped the script.

export interface Reason {
  /** Stable code, e.g. `own_backend`; the portal and the review queue group by it. */
  code: string;
  /** German, shown to the admin. */
  message: string;
  file?: string;
}

export type IntegrateStatus = 'integrated' | 'needs_review';

export type Framework =
  | 'mininode'
  | 'vite'
  | 'static'
  | 'next'
  | 'python'
  | 'docker'
  | 'node-server'
  | 'installer'
  | 'unknown';

export interface IntegrateResult {
  status: IntegrateStatus;
  framework: Framework;
  slug: string | null;
  name: string | null;
  /** Why the script stopped (empty when integrated). */
  reasons: Reason[];
  /** Integrated, but worth knowing (features that work differently here). */
  warnings: string[];
  /** What the script changed, in order. */
  actions: string[];
  /** Folder of the integrated app (absent when it needs review). */
  outDir: string | null;
  /** The app's own lint findings exempt it from the linter (the publish step applies this). */
  lintExempt?: boolean;
}
