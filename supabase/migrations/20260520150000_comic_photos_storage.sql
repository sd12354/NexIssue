-- Storage bucket + policies for org-scoped comic cover photos.
-- Path convention: <org_id>/<comic_id>/<position>-<uuid>.png

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comic-photos',
  'comic-photos',
  false,
  25 * 1024 * 1024,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Helper to extract the org_id (first path segment) from an object path.
CREATE OR REPLACE FUNCTION public.comic_photo_org(path text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN split_part(path, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN split_part(path, '/', 1)::uuid
      ELSE NULL
    END;
$$;

CREATE POLICY "comic_photos_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'comic-photos'
    AND public.is_org_member(public.comic_photo_org(name))
  );

CREATE POLICY "comic_photos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comic-photos'
    AND public.is_org_member(public.comic_photo_org(name))
  );

CREATE POLICY "comic_photos_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'comic-photos'
    AND public.is_org_member(public.comic_photo_org(name))
  )
  WITH CHECK (
    bucket_id = 'comic-photos'
    AND public.is_org_member(public.comic_photo_org(name))
  );

CREATE POLICY "comic_photos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'comic-photos'
    AND public.is_org_member(public.comic_photo_org(name))
  );
