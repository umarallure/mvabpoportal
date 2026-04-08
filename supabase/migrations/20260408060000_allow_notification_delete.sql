-- Allow authenticated users to delete their own notifications
create policy notifications_delete
  on public.notifications
  for delete
  to authenticated
  using (recipient_id = auth.uid());
