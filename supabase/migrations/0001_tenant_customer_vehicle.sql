create extension if not exists pgcrypto;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table workshops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null,
  role text not null check (role in ('customer', 'staff', 'technician', 'workshop_admin', 'platform_admin')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, role)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, email),
  unique (tenant_id, id)
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  registration_number text not null,
  vin text,
  created_at timestamptz not null default now(),
  unique (tenant_id, registration_number),
  unique (tenant_id, vin),
  unique (tenant_id, id)
);

create table vehicle_ownerships (
  tenant_id uuid not null references tenants(id),
  vehicle_id uuid not null,
  customer_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, vehicle_id, customer_id),
  foreign key (tenant_id, vehicle_id) references vehicles (tenant_id, id),
  foreign key (tenant_id, customer_id) references customers (tenant_id, id)
);

alter table tenants enable row level security;
alter table tenants force row level security;
create policy tenants_tenant_isolation on tenants
  using (id = current_setting('app.tenant_id', true)::uuid)
  with check (id = current_setting('app.tenant_id', true)::uuid);

alter table workshops enable row level security;
alter table workshops force row level security;
create policy workshops_tenant_isolation on workshops
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table memberships enable row level security;
alter table memberships force row level security;
create policy memberships_tenant_isolation on memberships
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table customers enable row level security;
alter table customers force row level security;
create policy customers_tenant_isolation on customers
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table vehicles enable row level security;
alter table vehicles force row level security;
create policy vehicles_tenant_isolation on vehicles
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table vehicle_ownerships enable row level security;
alter table vehicle_ownerships force row level security;
create policy vehicle_ownerships_tenant_isolation on vehicle_ownerships
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
