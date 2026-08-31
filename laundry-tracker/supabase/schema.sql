-- =============================================================
-- Laundry Order Tracking & Verification System — Supabase Schema
-- =============================================================
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)
-- Requires the "pgcrypto" extension for gen_random_uuid() (enabled by default
-- on Supabase projects).

-- -------------------------------------------------------------
-- 1. CUSTOMERS
-- -------------------------------------------------------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  name text,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- 2. ORDERS
-- -------------------------------------------------------------
-- order_code is the short human-readable code encoded in the barcode
-- (e.g. "LN-240815-0007"). This is what gets scanned at sorting time.
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  customer_id uuid not null references customers(id) on delete restrict,
  status text not null default 'intake'
    check (status in ('intake', 'washing', 'sorting', 'ready_for_delivery', 'delivered', 'cancelled')),
  total_item_count int not null default 0,
  total_bill_amount numeric(10,2) not null default 0,
  intake_photo_urls text[] not null default '{}',   -- the 2 wide-angle photos
  basket_label text,                                 -- which physical basket it was assigned to
  created_by text,                                    -- staff name/id who created it
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  delivered_at timestamptz
);

create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_customer on orders(customer_id);

-- -------------------------------------------------------------
-- 3. ITEM TYPES (reference list for the tap-counter UI)
-- -------------------------------------------------------------
create table if not exists item_types (
  id serial primary key,
  name text not null unique,          -- e.g. "Shirt", "Pant", "Bed Sheet"
  default_price numeric(10,2) not null default 0,
  sort_order int not null default 0
);

insert into item_types (name, default_price, sort_order) values
  ('Shirt', 40, 1),
  ('Pant', 50, 2),
  ('Kurta', 60, 3),
  ('Bed Sheet', 100, 4),
  ('Towel', 30, 5),
  ('Blanket', 200, 6),
  ('Suit', 300, 7),
  ('Saree', 150, 8)
on conflict (name) do nothing;

-- -------------------------------------------------------------
-- 4. ORDER ITEMS (the tapped counts per order)
-- -------------------------------------------------------------
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_type_id int not null references item_types(id),
  quantity int not null check (quantity >= 0),
  unit_price numeric(10,2) not null default 0
);

create index if not exists idx_order_items_order on order_items(order_id);

-- -------------------------------------------------------------
-- 5. ORDER EVENTS (audit trail — every scan / status change)
-- -------------------------------------------------------------
create table if not exists order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  event_type text not null,   -- 'created' | 'receipt_sent' | 'basket_tagged' | 'scanned_at_sorting' | 'marked_ready' | 'delivered'
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_events_order on order_events(order_id);

-- -------------------------------------------------------------
-- 6. STORAGE BUCKET for intake photos
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('intake-photos', 'intake-photos', true)
on conflict (id) do nothing;

-- Public read (needed so the WhatsApp link / sorting screen can load images),
-- authenticated write.
create policy if not exists "Public can view intake photos"
  on storage.objects for select
  using (bucket_id = 'intake-photos');

create policy if not exists "Authenticated staff can upload intake photos"
  on storage.objects for insert
  with check (bucket_id = 'intake-photos' and auth.role() = 'authenticated');

-- -------------------------------------------------------------
-- 7. HELPER: auto-generate order_code (LN-YYMMDD-####)
-- -------------------------------------------------------------
create sequence if not exists order_code_seq;

create or replace function generate_order_code()
returns text as $$
declare
  today_part text := to_char(now(), 'YYMMDD');
  seq_part text := lpad(nextval('order_code_seq')::text, 4, '0');
begin
  return 'LN-' || today_part || '-' || seq_part;
end;
$$ language plpgsql;

-- -------------------------------------------------------------
-- 8. Keep updated_at fresh
-- -------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_touch on orders;
create trigger trg_orders_touch
  before update on orders
  for each row execute function touch_updated_at();

-- -------------------------------------------------------------
-- 9. Row Level Security
-- -------------------------------------------------------------
-- MVP note: all staff share one login (or use Supabase anonymous/staff auth).
-- These policies assume any authenticated staff user can read/write everything.
-- Tighten later with a `staff` role table if you need per-branch isolation.

alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_events enable row level security;
alter table item_types enable row level security;

create policy if not exists "staff full access customers" on customers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy if not exists "staff full access orders" on orders
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy if not exists "staff full access order_items" on order_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy if not exists "staff full access order_events" on order_events
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy if not exists "staff read item_types" on item_types
  for select using (true);
