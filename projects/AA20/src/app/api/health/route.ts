export function GET() {
  return Response.json({
    ok: true,
    service: "friends-table",
    databaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY),
    timestamp: new Date().toISOString()
  });
}
