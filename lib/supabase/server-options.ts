import type { SupabaseClientOptions } from "@supabase/supabase-js";

type Transport = NonNullable<NonNullable<SupabaseClientOptions<"public">["realtime"]>["transport"]>;

class NoServerWebSocket {
  constructor() {
    throw new Error("Realtime is only used in the browser.");
  }
}

// supabase-js refuses to start without a WebSocket implementation, which
// Node.js older than 22 does not have. Live updates only run in the browser,
// so on the server a placeholder is enough.
export const serverOptions: Pick<SupabaseClientOptions<"public">, "realtime"> =
  typeof globalThis.WebSocket === "undefined"
    ? { realtime: { transport: NoServerWebSocket as unknown as Transport } }
    : {};
