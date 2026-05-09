export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, CLIENT_ID } from "@/lib/supabase";

export async function GET() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .schema("north_star")
    .from("pending_items")
    .select("*")
    .eq("client_id", CLIENT_ID)
    .eq("status", "pending")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const supabase = createServerClient();
  const body = await request.json();
  const { id, status } = body as { id: string; status: "acknowledged" | "dismissed" };

  if (!id || !["acknowledged", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "id and valid status required" }, { status: 400 });
  }

  const { error } = await supabase
    .schema("north_star")
    .from("pending_items")
    .update({
      status,
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("client_id", CLIENT_ID);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
