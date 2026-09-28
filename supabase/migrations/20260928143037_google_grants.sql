-- Google services for apps (ADR 0004). When a user signs in with Google or connects Google, the
-- portal hands the Google refresh token to the API once; the API stores it encrypted here and
-- later issues short-lived, app-specific access tokens (Gmail, Calendar) to hosted apps.
-- Only the API (service role) touches this table: the token is encrypted with a key that lives
-- in the API Worker, and not even the owner reads the row directly.

create table platform.google_grants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Google account the grant belongs to (`sub` of the linked Google identity).
  google_sub text not null,
  email text,
  -- Scopes Google actually granted (space-separated in OAuth, stored as an array).
  scopes text[] not null default '{}',
  -- AES-GCM ciphertext of the refresh token, base64 (12-byte IV first); AAD is user_id.
  refresh_token_enc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table platform.google_grants enable row level security;
revoke all on platform.google_grants from public, anon, authenticated;
grant select, insert, update, delete on platform.google_grants to service_role;

create trigger google_grants_touch before update on platform.google_grants
  for each row execute function platform.touch_updated_at();
