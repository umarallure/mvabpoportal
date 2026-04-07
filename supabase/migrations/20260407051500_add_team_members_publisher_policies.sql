alter table public.team_members enable row level security;

drop policy if exists team_members_publisher_all on public.team_members;

create policy team_members_publisher_all
on public.team_members
for all
to authenticated
using (
  publisher_id = auth.uid()
)
with check (
  publisher_id = auth.uid()
);
