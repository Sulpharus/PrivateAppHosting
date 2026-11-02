import { z } from 'zod';

/** `owner/repo` of a GitHub repository. A segment made only of dots (`..`) is not a name. */
export const GITHUB_REPO = /^(?!\.+\/)[\w.-]+\/(?!\.+$)[\w.-]+$/;

export const githubRepoSchema = z.string().regex(GITHUB_REPO, 'owner/repo');
