-- =============================================================
-- Laundry Order Tracking & Verification System — Supabase Schema
-- =============================================================
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- 1. CUSTOMERS
-- -------------------------------------------------------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  name text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_customers_phone on customers(phone_number);

-- -------------------------------------------------------------
-- 1B. CUSTOMER PAYMENTS (Ledger Settlements)
-- -------------------------------------------------------------
create table if not exists customer_payments (
  id text primary key,
  customer_phone text not null,
  amount numeric(10,2) not null default 0,
  payment_mode text default 'cash',
  note text,
  created_by text default 'staff',
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_phone on customer_payments(customer_phone);

-- -------------------------------------------------------------
-- 2. ORDERS
-- -------------------------------------------------------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  customer_id uuid not null references customers(id) on delete restrict,
  status text not null default 'intake',
  order_type text not null default 'normal',
  sla_tier text not null default 'standard_48_72h',
  target_timestamp timestamptz,
  payment_status text not null default 'unpaid',
  tags_count int not null default 1,
  delivery_date date,
  delivery_time_slot text,
  total_item_count int not null default 0,
  total_bill_amount numeric(10,2) not null default 0,
  intake_photo_urls text[] not null default '{}',
  basket_label text,
  moved_services text[] not null default '{}',
  completed_services text[] not null default '{}',
  created_by text default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  delivered_at timestamptz
);

create index if not exists idx_orders_code on orders(order_code);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_customer on orders(customer_id);

-- -------------------------------------------------------------
-- 3. ITEM TYPES (Services list)
-- -------------------------------------------------------------
create table if not exists item_types (
  id serial primary key,
  name text not null unique,
  unit_type text not null default 'piece',
  default_price numeric(10,2) not null default 0,
  sort_order int not null default 0
);

insert into item_types (name, unit_type, default_price, sort_order) values
  ('Shirt', 'piece', 40, 1),
  ('Pant', 'piece', 50, 2),
  ('Kurta', 'piece', 60, 3),
  ('Bed Sheet', 'piece', 100, 4),
  ('Towel', 'piece', 30, 5),
  ('Blanket (Kg)', 'kg', 120, 6),
  ('Socks (Pair)', 'pair', 40, 7),
  ('Family Bundle', 'bundle', 800, 8),
  ('Suit', 'piece', 300, 9),
  ('Saree', 'piece', 150, 10)
on conflict (name) do nothing;

-- -------------------------------------------------------------
-- 4. ORDER ITEMS
-- -------------------------------------------------------------
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_type_id int not null references item_types(id),
  service_type text not null default 'wash_press',
  unit_type text not null default 'piece',
  quantity int not null default 1,
  weight_kg numeric(8,2) default 0,
  pair_count int default 0,
  unit_price numeric(10,2) not null default 0
);

create index if not exists idx_order_items_order on order_items(order_id);

-- -------------------------------------------------------------
-- 5. ORDER EVENTS (Audit log)
-- -------------------------------------------------------------
create table if not exists order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  event_type text not null,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_events_order on order_events(order_id);

-- -------------------------------------------------------------
-- 6. ORDER CODE GENERATOR
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
-- 7. KEEP UPDATED_AT FRESH
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
-- 8. ROW LEVEL SECURITY (Allow anon app access)
-- -------------------------------------------------------------
alter table customers enable row level security;
alter table customer_payments enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_events enable row level security;
alter table item_types enable row level security;

-- Public / Anon access policies for app
drop policy if exists "allow all access to customers" on customers;
create policy "allow all access to customers" on customers for all using (true) with check (true);

drop policy if exists "allow all access to customer_payments" on customer_payments;
create policy "allow all access to customer_payments" on customer_payments for all using (true) with check (true);

drop policy if exists "allow all access to orders" on orders;
create policy "allow all access to orders" on orders for all using (true) with check (true);

drop policy if exists "allow all access to order_items" on order_items;
create policy "allow all access to order_items" on order_items for all using (true) with check (true);

drop policy if exists "allow all access to order_events" on order_events;
create policy "allow all access to order_events" on order_events for all using (true) with check (true);

drop policy if exists "allow all access to item_types" on item_types;
create policy "allow all access to item_types" on item_types for all using (true) with check (true);
