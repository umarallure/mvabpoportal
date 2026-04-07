-- Ensure notifications fan out to:
-- 1) all admin/super_admin users
-- 2) all users whose center lead_vendor matches the lead's lead_vendor
--
-- This fixes publisher-portal users not receiving closer-side lead activity
-- notifications for their own vendor.

create or replace function public.notification_recipient_ids_for_vendor(p_lead_vendor text)
returns table (recipient_id uuid)
language sql
security definer
set search_path = public
as $$
  with normalized_vendor as (
    select nullif(lower(btrim(p_lead_vendor)), '') as lead_vendor
  )
  select distinct au.user_id as recipient_id
  from public.app_users au
  where au.user_id is not null
    and (
      au.role in ('admin', 'super_admin')
      or au.is_super_admin = true
      or exists (
        select 1
        from normalized_vendor nv
        join public.centers c
          on nv.lead_vendor is not null
         and lower(btrim(c.lead_vendor)) = nv.lead_vendor
        where c.id = au.center_id
      )
    );
$$;

create or replace function public.trg_notify_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
begin
  for v_recipient in
    select recipient_id from public.notification_recipient_ids_for_vendor(NEW.lead_vendor)
  loop
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      v_recipient.recipient_id,
      NEW.user_id,
      'new_lead',
      'New lead submitted',
      'A new lead "' || NEW.customer_full_name || '" has been submitted.',
      '/leads/' || NEW.id
    );
  end loop;

  return NEW;
end;
$$;

create or replace function public.trg_notify_lead_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
begin
  if OLD.assigned_attorney_id is null and NEW.assigned_attorney_id is not null then
    for v_recipient in
      select recipient_id from public.notification_recipient_ids_for_vendor(NEW.lead_vendor)
    loop
      insert into public.notifications
        (recipient_id, actor_id, category, title, description, redirect_url)
      values (
        v_recipient.recipient_id,
        NEW.user_id,
        'lead_assigned',
        'Lead assigned to attorney',
        'Lead "' || NEW.customer_full_name || '" has been assigned to an attorney.',
        '/leads/' || NEW.id
      );
    end loop;
  end if;

  if OLD.status is distinct from NEW.status then
    for v_recipient in
      select recipient_id from public.notification_recipient_ids_for_vendor(NEW.lead_vendor)
    loop
      insert into public.notifications
        (recipient_id, actor_id, category, title, description, redirect_url)
      values (
        v_recipient.recipient_id,
        NEW.user_id,
        'stage_updated',
        'Lead status updated',
        'Lead "' || NEW.customer_full_name || '" moved from "' || coalesce(OLD.status, 'none') || '" to "' || coalesce(NEW.status, 'none') || '".',
        '/leads/' || NEW.id
      );
    end loop;
  end if;

  return NEW;
end;
$$;

create or replace function public.trg_notify_note_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_name text;
  v_lead_vendor text;
  v_recipient record;
begin
  select customer_full_name, lead_vendor
    into v_lead_name, v_lead_vendor
    from public.leads
   where id = NEW.lead_id;

  for v_recipient in
    select recipient_id from public.notification_recipient_ids_for_vendor(v_lead_vendor)
  loop
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      v_recipient.recipient_id,
      NEW.created_by,
      'note_added',
      'New note on a lead',
      'A note was added to lead "' || coalesce(v_lead_name, 'Unknown') || '".',
      '/leads/' || NEW.lead_id
    );
  end loop;

  return NEW;
end;
$$;
