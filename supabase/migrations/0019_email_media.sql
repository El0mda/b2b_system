-- Photos and videos in sequence emails.
--
-- SmartLead's save-sequence API takes an HTML email_body and nothing
-- else — there is no attachment field — so media can't ride along as a
-- MIME attachment. Instead each file is uploaded here and embedded in
-- the HTML: a photo as an inline <img>, a video as a thumbnail that
-- links to the file (no mainstream mail client plays video inline).
--
-- That's also the better outcome for cold email: real attachments are a
-- strong spam signal and a video would blow past most providers' size
-- limits, while a hosted image costs nothing in deliverability.

-- Public, because the reader is a prospect's mail client fetching an
-- <img src> with no Supabase session. Object names are random UUIDs
-- under the org's folder, so a URL can't be guessed from another.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-media',
  'email-media',
  true,
  52428800, -- 50 MB: Supabase's default per-file ceiling, and enough for a short video
  ARRAY[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Writes are scoped to the uploader's own org folder: <org_id>/<uuid>.<ext>.
-- Reads need no policy — a public bucket serves objects by URL.
DROP POLICY IF EXISTS "email_media_insert_own_org" ON storage.objects;
CREATE POLICY "email_media_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'email-media'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
  );

DROP POLICY IF EXISTS "email_media_delete_own_org" ON storage.objects;
CREATE POLICY "email_media_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'email-media'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- The media list for an email step, in display order:
-- [{ kind: 'image'|'video', url, poster_url?, name, path, size }]
-- Stored on the step like the rest of its content, so a campaign keeps
-- exactly what it launched with even if a template changes later.
ALTER TABLE public.sequences
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
