begin;

set local app.tenant_id = '00000000-0000-4000-8000-000000000001';

insert into tenants (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Li-Erikes Apparat')
on conflict (id) do nothing;

insert into workshops (id, tenant_id, name)
values (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'Li-Erikes Verkstad'
)
on conflict (id) do nothing;

commit;
