-- Update notification titles/descriptions and add lead_id + lead_name columns for grouping.
-- Applies to both the publisher portal and closer portal (same DB, same triggers).

-- ─────────────────────────────────────────────────────────────────────────────
-- Schema: add grouping columns (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.notifications
  add column if not exists lead_id   uuid,
  add column if not exists lead_name text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. new_lead  →  "New Opportunity Captured"
-- ─────────────────────────────────────────────────────────────────────────────
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
      (recipient_id, actor_id, category, title, description, redirect_url, lead_id, lead_name)
    values (
      v_recipient.recipient_id,
      NEW.user_id,
      'new_lead',
      'New Opportunity Captured',
      'Review the injury opportunity for ' || NEW.customer_full_name
        || ' submitted by ' || coalesce(NEW.lead_vendor, 'Unknown')
        || ' on ' || to_char(NEW.created_at, 'Mon DD, YYYY') || '.',
      '/leads/' || NEW.id,
      NEW.id,
      NEW.customer_full_name
    );
  end loop;

  return NEW;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. lead_assigned  →  "Counsel Assigned"
-- 3. stage_updated  →  "Pipeline Stage Progressed"
-- (both live in trg_notify_lead_updated)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_notify_lead_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient  record;
  v_old_label  text;
  v_new_label  text;
begin
  if OLD.assigned_attorney_id is null and NEW.assigned_attorney_id is not null then
    for v_recipient in
      select recipient_id from public.notification_recipient_ids_for_vendor(NEW.lead_vendor)
    loop
      insert into public.notifications
        (recipient_id, actor_id, category, title, description, redirect_url, lead_id, lead_name)
      values (
        v_recipient.recipient_id,
        NEW.user_id,
        'lead_assigned',
        'Counsel Assigned',
        'The opportunity for ' || NEW.customer_full_name
          || ' has been successfully placed with a handling attorney.',
        '/leads/' || NEW.id,
        NEW.id,
        NEW.customer_full_name
      );
    end loop;
  end if;

  if OLD.status is distinct from NEW.status then
    -- Resolve human-readable labels; fall back to raw key if not found
    select coalesce(label, OLD.status) into v_old_label
      from public.portal_stages where key = OLD.status limit 1;
    if v_old_label is null then v_old_label := coalesce(OLD.status, 'None'); end if;

    select coalesce(label, NEW.status) into v_new_label
      from public.portal_stages where key = NEW.status limit 1;
    if v_new_label is null then v_new_label := coalesce(NEW.status, 'None'); end if;

    for v_recipient in
      select recipient_id from public.notification_recipient_ids_for_vendor(NEW.lead_vendor)
    loop
      insert into public.notifications
        (recipient_id, actor_id, category, title, description, redirect_url, lead_id, lead_name)
      values (
        v_recipient.recipient_id,
        NEW.user_id,
        'stage_updated',
        'Pipeline Stage Progressed',
        'The opportunity for ' || NEW.customer_full_name
          || ' transitioned from "' || v_old_label
          || '" to "' || v_new_label || '".',
        '/leads/' || NEW.id,
        NEW.id,
        NEW.customer_full_name
      );
    end loop;
  end if;

  return NEW;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. note_added  →  "Opportunity Note Appended"
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_notify_note_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_name   text;
  v_lead_vendor text;
  v_lead_id     uuid;
  v_recipient   record;
begin
  select id, customer_full_name, lead_vendor
    into v_lead_id, v_lead_name, v_lead_vendor
    from public.leads
   where id = NEW.lead_id;

  for v_recipient in
    select recipient_id from public.notification_recipient_ids_for_vendor(v_lead_vendor)
  loop
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url, lead_id, lead_name)
    values (
      v_recipient.recipient_id,
      NEW.created_by,
      'note_added',
      'Opportunity Note Appended',
      'A new internal comment was logged on the opportunity file for '
        || coalesce(v_lead_name, 'Unknown') || '.',
      '/leads/' || NEW.lead_id,
      v_lead_id,
      v_lead_name
    );
  end loop;

  return NEW;
end;
$$;
