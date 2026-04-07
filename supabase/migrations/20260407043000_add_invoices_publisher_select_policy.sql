alter table public.invoices enable row level security;

drop policy if exists invoices_publisher_select on public.invoices;
drop policy if exists invoices_publisher_update_status on public.invoices;

create policy invoices_publisher_select
on public.invoices
for select
to authenticated
using (
  invoice_type = 'publisher'
  and lead_vendor_id is not null
  and exists (
    select 1
    from public.app_users au
    where au.user_id = auth.uid()
      and au.center_id = invoices.lead_vendor_id
  )
);

create policy invoices_publisher_update_status
on public.invoices
for update
to authenticated
using (
  invoice_type = 'publisher'
  and lead_vendor_id is not null
  and exists (
    select 1
    from public.app_users au
    where au.user_id = auth.uid()
      and au.center_id = invoices.lead_vendor_id
  )
)
with check (
  invoice_type = 'publisher'
  and lead_vendor_id is not null
  and exists (
    select 1
    from public.app_users au
    where au.user_id = auth.uid()
      and au.center_id = invoices.lead_vendor_id
  )
);
