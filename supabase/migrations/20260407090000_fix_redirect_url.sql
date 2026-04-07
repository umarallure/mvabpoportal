-- Fix redirect_url: /leads/ → /retainers/ to match the actual Vue router path

create or replace function public.trg_notify_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
begin
  for v_admin in
    select user_id from public.app_users
    where role in ('admin', 'super_admin') or is_super_admin = true
  loop
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      v_admin.user_id,
      NEW.user_id,
      'new_lead',
      'New lead submitted',
      'A new lead "' || NEW.customer_full_name || '" has been submitted.',
      '/retainers/' || NEW.id
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
  v_admin record;
begin
  if OLD.assigned_attorney_id is null and NEW.assigned_attorney_id is not null then
    for v_admin in
      select user_id from public.app_users
      where role in ('admin', 'super_admin') or is_super_admin = true
    loop
      insert into public.notifications
        (recipient_id, actor_id, category, title, description, redirect_url)
      values (
        v_admin.user_id,
        NEW.user_id,
        'lead_assigned',
        'Lead assigned to attorney',
        'Lead "' || NEW.customer_full_name || '" has been assigned to an attorney.',
        '/retainers/' || NEW.id
      );
    end loop;
  end if;

  if OLD.status is distinct from NEW.status then
    for v_admin in
      select user_id from public.app_users
      where role in ('admin', 'super_admin') or is_super_admin = true
    loop
      insert into public.notifications
        (recipient_id, actor_id, category, title, description, redirect_url)
      values (
        v_admin.user_id,
        NEW.user_id,
        'stage_updated',
        'Lead status updated',
        'Lead "' || NEW.customer_full_name || '" moved from "' || coalesce(OLD.status, 'none') || '" to "' || coalesce(NEW.status, 'none') || '".',
        '/retainers/' || NEW.id
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
  v_admin     record;
begin
  select customer_full_name into v_lead_name
    from public.leads
   where id = NEW.lead_id;

  for v_admin in
    select user_id from public.app_users
    where role in ('admin', 'super_admin') or is_super_admin = true
  loop
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      v_admin.user_id,
      NEW.created_by,
      'note_added',
      'New note on a lead',
      'A note was added to lead "' || coalesce(v_lead_name, 'Unknown') || '".',
      '/retainers/' || NEW.lead_id
    );
  end loop;

  return NEW;
end;
$$;
