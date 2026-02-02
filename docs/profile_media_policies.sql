-- Allow authenticated users to upload files to the profile-media bucket
-- Run this in Supabase SQL Editor
create policy "profile media upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-media'
);

-- Allow authenticated users to update profile media objects
create policy "profile media update"
on storage.objects
for update
to authenticated
using (bucket_id = 'profile-media')
with check (bucket_id = 'profile-media');

-- Allow authenticated users to delete profile media objects
create policy "profile media delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'profile-media');
