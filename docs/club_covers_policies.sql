-- Allow authenticated users to upload files to the club-covers bucket
-- Run this in Supabase SQL Editor
create policy "club covers upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'club-covers'
);

-- Allow authenticated users to update club cover objects if needed
create policy "club covers update"
on storage.objects
for update
to authenticated
using (bucket_id = 'club-covers')
with check (bucket_id = 'club-covers');

-- Allow authenticated users to delete club covers if needed
create policy "club covers delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'club-covers');
