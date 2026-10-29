// What differs between installations and is known at build time: the GitHub repository from
// mininode.config.json (see vite.config.ts). Empty when the installation has no repository.

declare const __GITHUB_REPOSITORY__: string | undefined;

export const GITHUB_REPOSITORY: string =
  typeof __GITHUB_REPOSITORY__ === 'string' ? __GITHUB_REPOSITORY__ : '';

/** `https://github.com/<owner>/<repo>`, or '' without a repository. */
export function repoUrl(repository: string = GITHUB_REPOSITORY): string {
  return repository ? `https://github.com/${repository}` : '';
}

/** A Markdown link to a file of the repository; plain text when there is no repository. */
export function repoLink(text: string, path: string, base: string = repoUrl()): string {
  return base ? `[${text}](${base}/${path})` : text;
}
