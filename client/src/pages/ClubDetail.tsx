let expiresAt: string | undefined = undefined;
if (announcementForm.expiresAt) {
  const date = new Date(announcementForm.expiresAt);
  if (!isNaN(date.getTime())) { expiresAt = date.toISOString(); }
}
createAnnouncement.mutate({
  clubId,
  title: announcementForm.title,
  content: announcementForm.content,
  isPinned: announcementForm.isPinned,
  expiresAt,
});