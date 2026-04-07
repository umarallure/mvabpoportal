-- ============================================================
-- TABLE
-- ============================================================
create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  recipient_id   uuid not null references auth.users(id) on delete cascade,
  actor_id       uuid references auth.users(id) on delete set null,
  category       varchar not null,
  title          varchar not null,
  description    text,
  redirect_url   varchar,
  is_read        boolean not null default false,
  created_at     timestamptz not null default now(),

  constraint notifications_category_check check (
    category in ('new_lead', 'lead_assigned', 'stage_updated', 'pipeline_changed', 'note_added')
  )
);

-- ============================================================
-- RLS
-- ============================================================
alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_update_read on public.notifications;

create policy notifications_select
  on public.notifications
  for select
  to authenticated
  using (recipient_id = auth.uid());

create policy notifications_update_read
  on public.notifications
  for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid() and is_read = true);

-- ============================================================
-- TRIGGER 1: New Lead → notify closer
-- ============================================================
create or replace function public.trg_notify_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.closer_id is not null then
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      NEW.closer_id,
      NEW.publisher_id,
      'new_lead',
      'New lead assigned to you',
      'A new lead "' || NEW.name || '" has been submitted by the Publisher.',
      '/leads/' || NEW.id
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists notify_new_lead on public.leads;
create trigger notify_new_lead
  after insert on public.leads
  for each row execute function public.trg_notify_new_lead();

-- ============================================================
-- TRIGGER 2: Lead Updated → notify on closer/stage/pipeline change
-- ============================================================
create or replace function public.trg_notify_lead_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.closer_id is null and NEW.closer_id is not null then
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      NEW.closer_id,
      NEW.publisher_id,
      'lead_assigned',
      'You have been assigned a lead',
      'You were assigned the lead "' || NEW.name || '".',
      '/leads/' || NEW.id
    );
  end if;

  if OLD.stage is distinct from NEW.stage then
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      NEW.publisher_id,
      NEW.closer_id,
      'stage_updated',
      'Lead stage updated',
      'Lead "' || NEW.name || '" moved from "' || OLD.stage || '" to "' || NEW.stage || '".',
      '/leads/' || NEW.id
    );
  end if;

  if OLD.pipeline_id is distinct from NEW.pipeline_id then
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      NEW.publisher_id,
      NEW.closer_id,
      'pipeline_changed',
      'Lead moved to a new pipeline',
      'Lead "' || NEW.name || '" has been moved to a different pipeline.',
      '/leads/' || NEW.id
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists notify_lead_updated on public.leads;
create trigger notify_lead_updated
  after update on public.leads
  for each row execute function public.trg_notify_lead_updated();

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
  select name, publisher_id, closer_id
    into v_lead_name, v_publisher, v_closer
    from public.leads
   where id = NEW.lead_id;

  if NEW.author_id = v_publisher then
    v_recipient := v_closer;
  elsif NEW.author_id = v_closer then
    v_recipient := v_publisher;
  end if;

  if v_recipient is not null then
    insert into public.notifications
      (recipient_id, actor_id, category, title, description, redirect_url)
    values (
      v_recipient,
      NEW.author_id,
      'note_added',
      'New note on a lead',
      'A note was added to lead "' || v_lead_name || '".',
      '/leads/' || NEW.lead_id
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists notify_note_added on public.lead_notes;
create trigger notify_note_added
  after insert on public.lead_notes
  for each row execute function public.trg_notify_note_added();
