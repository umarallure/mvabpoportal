-- Corrects column name mismatches in all three notification trigger functions.
-- leads:      name→customer_full_name, publisher_id→user_id, closer_id→assigned_attorney_id, stage→status
--             pipeline_id does not exist — pipeline_changed branch removed entirely
-- lead_notes: author_id→created_by, note_text→note

-- ============================================================
-- TRIGGER 1: New Lead → notify assigned attorney
-- ============================================================
create or replace function public.trg_notify_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.assigned_attorney_id is not null then
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      NEW.assigned_attorney_id,
      NEW.user_id,
      'new_lead',
      'New lead assigned to you',
      'A new lead "' || NEW.customer_full_name || '" has been submitted by the Publisher.',
      '/leads/' || NEW.id
    );
  end if;
  return NEW;
end;
$$;

-- ============================================================
-- TRIGGER 2: Lead Updated → notify on attorney/status change
-- ============================================================
create or replace function public.trg_notify_lead_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.assigned_attorney_id is null and NEW.assigned_attorney_id is not null then
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      NEW.assigned_attorney_id,
      NEW.user_id,
      'lead_assigned',
      'You have been assigned a lead',
      'You were assigned the lead "' || NEW.customer_full_name || '".',
      '/leads/' || NEW.id
    );
  end if;

  if OLD.status is distinct from NEW.status and NEW.user_id is not null then
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      NEW.user_id,
      NEW.assigned_attorney_id,
      'stage_updated',
      'Lead status updated',
      'Lead "' || NEW.customer_full_name || '" moved from "' || coalesce(OLD.status, 'none') || '" to "' || coalesce(NEW.status, 'none') || '".',
      '/leads/' || NEW.id
    );
  end if;

  return NEW;
end;
$$;

-- ============================================================
-- TRIGGER 3: Note Added → notify the other party
-- ============================================================
create or replace function public.trg_notify_note_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_name   text;
  v_publisher   uuid;
  v_closer      uuid;
  v_recipient   uuid;
begin
  select customer_full_name, user_id, assigned_attorney_id
    into v_lead_name, v_publisher, v_closer
    from public.leads
   where id = NEW.lead_id;

  if NEW.created_by = v_publisher then
    v_recipient := v_closer;
  elsif NEW.created_by = v_closer then
    v_recipient := v_publisher;
  end if;

  if v_recipient is not null then
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      v_recipient,
      NEW.created_by,
      'note_added',
      'New note on a lead',
      'A note was added to lead "' || v_lead_name || '".',
      '/leads/' || NEW.lead_id
    );
  end if;

  return NEW;
end;
$$;
