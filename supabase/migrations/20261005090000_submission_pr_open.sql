-- Uploads (ADR 0013): "integrated" used to be set when the integration opened its pull request,
-- so the admin saw "Eingebaut" while CI was still red or the PR was unmerged. The new status
-- `pr_open` means "the pull request exists and is not merged"; `integrated` follows when it is.
-- Additive: no row changes, no code that reads the old statuses breaks.

alter table platform.submissions drop constraint submissions_status_check;
alter table platform.submissions
  add constraint submissions_status_check check (
    status in ('queued', 'integrating', 'integrated', 'pr_open', 'installing', 'installed',
               'needs_review', 'failed', 'dismissed')
  );

comment on column platform.submissions.status is
  'queued → integrating → pr_open → integrated | needs_review | failed (web apps; integrated = PR merged); queued → installing → installed | needs_review | failed (programs)';
