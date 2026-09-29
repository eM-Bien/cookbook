"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Re-renders the current page when the other person changes something in
 * `table`, so both screens stay in step without reloading.
 */
export function LiveRefresh({ table, filter }: { table: string; filter?: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const channel = supabase
      .channel(`live-${table}-${filter ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter }, () => {
        // Several rows often change at once; one refresh covers them all.
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 250);
      })
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, table, filter]);

  return null;
}
