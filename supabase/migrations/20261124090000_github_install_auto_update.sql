-- Apps from a GitHub link and automatic app updates (ADR 0029). Additive: new nullable or
-- defaulted columns only, no row changes.

-- An upload can come from a GitHub repository instead of a ZIP: the integrate workflow clones
-- `owner/repo` (storage_path then reads 'github:<owner>/<repo>' and points at no stored file).
alter table platform.submissions
  add column repository text
    check (repository is null or repository ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  add column auto_update boolean not null default false;
comment on column platform.submissions.repository is
  'owner/repo on GitHub when the app was installed from a link; null for a ZIP upload';
comment on column platform.submissions.auto_update is
  'the admin asked for automatic updates of the installed app (written into its mininode.json)';

-- Whether the app brings in new versions of its repository by itself (auto-update-apps.yml).
-- Set from the manifest's `autoUpdate` on the first registration; afterwards the admin decides in
-- Verwaltung → Updates.
alter table platform.apps add column auto_update boolean not null default false;
comment on column platform.apps.auto_update is
  'new versions of the app''s repository are merged automatically when its manifest stays the same (ADR 0029)';
