-- Create assets bucket if not exists (idempotent)
insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do nothing;

-- Policy for authenticated users to upload to assets bucket
create policy "auth can upload assets"
on storage.objects for insert
to authenticated
with check (bucket_id = 'assets');

-- Policy for authenticated users to read from assets bucket
create policy "auth can read assets"
on storage.objects for select
to authenticated
using (bucket_id = 'assets');