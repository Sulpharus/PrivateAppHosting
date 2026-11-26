-- Rechnungen: customers, products and services (Bausteine), invoices with their payments and a
-- short history per invoice. Everything is private (each person sees only their own rows; RLS via
-- platform.secure_table). Money is integer cents, a day a `date`, rates are basis points
-- (2000 = 20 %). Related rows point at their parent together with owner_id, so a row can never
-- hang on someone else's invoice even if its id were known.
--
-- Issued invoices are never deleted or changed: they are cancelled with a cancellation invoice
-- (kind 'cancellation'). Drafts, customers and items are deleted softly (deleted_at) and purged
-- by the app after 30 days.

select platform.create_app_schema('rechnungen');

create table app_rechnungen.customers (
  id uuid primary key,
  owner_id uuid,
  name text not null check (char_length(name) between 1 and 200),
  contact text check (char_length(contact) <= 200),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 60),
  street text check (char_length(street) <= 200),
  zip text check (char_length(zip) <= 20),
  city text check (char_length(city) <= 120),
  country text not null default 'DE' check (country ~ '^[A-Z]{2}$'),
  vat_id text check (char_length(vat_id) <= 20),
  number text check (char_length(number) <= 40),
  payment_days smallint check (payment_days between 0 and 365),
  notes text check (char_length(notes) <= 20000),
  is_sample boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id)
);
create trigger customers_touch before update on app_rechnungen.customers
  for each row execute function platform.touch_updated_at();
select platform.secure_table('rechnungen', 'customers', 'private');
create index on app_rechnungen.customers (owner_id, name);

create table app_rechnungen.items (
  id uuid primary key,
  owner_id uuid,
  kind text not null default 'service' check (kind in ('service', 'product')),
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 2000),
  unit text check (char_length(unit) <= 20),
  price_cents bigint not null check (price_cents between -100000000000 and 100000000000),
  tax_bp integer not null check (tax_bp between 0 and 10000),
  number text check (char_length(number) <= 40),
  is_sample boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger items_touch before update on app_rechnungen.items
  for each row execute function platform.touch_updated_at();
select platform.secure_table('rechnungen', 'items', 'private');
create index on app_rechnungen.items (owner_id, title);

create table app_rechnungen.invoices (
  id uuid primary key,
  owner_id uuid,
  kind text not null default 'invoice' check (kind in ('invoice', 'cancellation')),
  status text not null default 'draft' check (status in ('draft', 'issued', 'cancelled')),
  -- Given when the invoice is issued; unique per person.
  number text check (char_length(number) between 1 and 40),
  customer_id uuid,
  -- Snapshots at the time of issue (address, tax ids, bank details), so the document never changes.
  customer jsonb not null default '{}' check (jsonb_typeof(customer) = 'object'),
  seller jsonb not null default '{}' check (jsonb_typeof(seller) = 'object'),
  -- [{ id, item_id, title, description, unit, qty_milli, price_cents, tax_bp, discount_bp }]
  lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 200),
  tax_mode text not null default 'standard' check (tax_mode in ('standard', 'small', 'reverse', 'intra', 'export')),
  lang text not null default 'de' check (lang in ('de', 'en')),
  layout text not null default 'din' check (layout in ('din', 'modern', 'compact')),
  issue_date date,
  service_date date,
  service_end date,
  due_date date,
  net_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  gross_cents bigint not null default 0,
  reference text check (char_length(reference) <= 120),
  intro text check (char_length(intro) <= 4000),
  closing text check (char_length(closing) <= 4000),
  cancels_id uuid,
  -- The issued PDF in the private file storage (mn.files).
  pdf_path text check (pdf_path like 'rechnungen/%' and pdf_path not like '%..%' and char_length(pdf_path) <= 200),
  -- [{ path, thumb, name, type, size }] in mn.files under anhaenge/<invoice id>/
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 20),
  sent_at timestamptz,
  -- The day the person was told that the invoice is overdue (so it is said once).
  reminded_on date,
  is_sample boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  check (status = 'draft' or (number is not null and issue_date is not null)),
  check (due_date is null or issue_date is null or due_date >= issue_date),
  check (service_end is null or service_date is null or service_end >= service_date),
  -- A purged customer leaves the invoice with its snapshot.
  foreign key (owner_id, customer_id) references app_rechnungen.customers (owner_id, id)
    on delete set null (customer_id),
  foreign key (owner_id, cancels_id) references app_rechnungen.invoices (owner_id, id)
);
create trigger invoices_touch before update on app_rechnungen.invoices
  for each row execute function platform.touch_updated_at();
select platform.secure_table('rechnungen', 'invoices', 'private');
create unique index invoices_number_idx on app_rechnungen.invoices (owner_id, number)
  where number is not null;
create index on app_rechnungen.invoices (owner_id, issue_date);
create index on app_rechnungen.invoices (owner_id, due_date) where status = 'issued';
create index on app_rechnungen.invoices (owner_id, customer_id);

create table app_rechnungen.payments (
  id uuid primary key,
  owner_id uuid,
  invoice_id uuid not null,
  paid_on date not null,
  amount_cents bigint not null check (amount_cents <> 0 and amount_cents between -100000000000 and 100000000000),
  note text check (char_length(note) <= 300),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_id, invoice_id) references app_rechnungen.invoices (owner_id, id) on delete cascade
);
create trigger payments_touch before update on app_rechnungen.payments
  for each row execute function platform.touch_updated_at();
select platform.secure_table('rechnungen', 'payments', 'private');
create index on app_rechnungen.payments (owner_id, invoice_id);
create index on app_rechnungen.payments (owner_id, paid_on);

-- What happened to an invoice (created, edited, issued, sent, paid, cancelled); the app keeps the
-- last 20 per invoice.
create table app_rechnungen.history (
  id uuid primary key,
  owner_id uuid,
  item_id uuid not null,
  at timestamptz not null default now(),
  changes jsonb not null default '{}' check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_id, item_id) references app_rechnungen.invoices (owner_id, id) on delete cascade
);
create trigger history_touch before update on app_rechnungen.history
  for each row execute function platform.touch_updated_at();
select platform.secure_table('rechnungen', 'history', 'private');
create index on app_rechnungen.history (owner_id, item_id, at);
