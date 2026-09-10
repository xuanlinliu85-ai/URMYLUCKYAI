# Supabase setup

1. Create a dedicated Supabase project in Singapore when that region is offered.
2. Open **SQL Editor → New query**.
3. In SQL Editor, paste and run every file in `supabase/migrations/` in numeric order (`0001`, then `0002`).
4. A successful run ends with `Success. No rows returned`.
5. Put the Project URL and publishable key in the two `NEXT_PUBLIC_` variables.
6. Put the secret key and database connection string in server-only variables.

Never put `SUPABASE_SECRET_KEY`, `DATABASE_URL`, or the database password in Git.
The browser has no table policies: it uses Realtime Broadcast/Presence only, while
all durable reads and writes pass through server route handlers.
