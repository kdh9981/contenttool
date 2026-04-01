import { createAdminClient } from "@/lib/supabase/admin";

export type TokenPayload = {
  id: string;
  token: string;
  client_name: string;
  client_email: string | null;
  job_id: string;
  expires_at: string | null;
};

export async function validateToken(
  token: string
): Promise<{ ok: true; data: TokenPayload } | { ok: false; error: string; status: number }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("client_tokens")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !data) {
    return { ok: false, error: "Invalid review link", status: 404 };
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { ok: false, error: "This review link has expired", status: 410 };
  }

  return { ok: true, data: data as TokenPayload };
}
