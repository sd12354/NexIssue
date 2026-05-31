"use client";

import {
  createSignedPhotoUrl,
  getCurrentOrg,
  listComics,
  listPhotos,
  type Comic,
  type Photo,
} from "@app/api";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getSupabase } from "../lib/supabase";
import { useAuth } from "./AuthProvider";

export type CatalogEntry = {
  comic: Comic;
  coverUrl: string | null;
  photos: Photo[];
};

type CatalogContextValue = {
  orgId: string | null;
  entries: CatalogEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getEntry: (comicId: string) => CatalogEntry | undefined;
};

const CatalogContext = createContext<CatalogContextValue | undefined>(undefined);

const SIGNED_URL_TTL = 60 * 60;

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const orgResult = await getCurrentOrg(supabase, user.id);
      if (!orgResult) {
        setOrgId(null);
        setEntries([]);
        return;
      }
      const currentOrg = orgResult.organization.id;
      setOrgId(currentOrg);

      const comics = await listComics(supabase, { orgId: currentOrg });
      const next: CatalogEntry[] = await Promise.all(
        comics.map(async (comic) => {
          let coverUrl: string | null = null;
          let photos: Photo[] = [];
          try {
            photos = await listPhotos(supabase, currentOrg, comic.id);
            const front =
              photos.find((p) => p.position === "front") ?? photos[0];
            if (front) {
              coverUrl = await createSignedPhotoUrl(
                supabase,
                front.storage_path,
                SIGNED_URL_TTL,
              );
            }
          } catch {
            // skip cover for this comic
          }
          return { comic, coverUrl, photos };
        }),
      );
      setEntries(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void refresh();
    } else {
      setEntries([]);
      setOrgId(null);
    }
  }, [user, refresh]);

  const getEntry = useCallback(
    (comicId: string) => entries.find((e) => e.comic.id === comicId),
    [entries],
  );

  const value = useMemo(
    () => ({ orgId, entries, loading, error, refresh, getEntry }),
    [orgId, entries, loading, error, refresh, getEntry],
  );

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}
