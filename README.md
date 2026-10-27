# Between the Lines

A private, mobile-friendly chat for two participants. Next.js (App Router) +
TypeScript + Tailwind + Supabase (Auth, Postgres, Realtime).

## Status
Working project. See the MVP spec for the agreed scope: two participants,
invitation-link access, persistent messages, reactions/replies, room-scoped
realtime, revocation, and security boundaries.

## Local development

1. `npm install`
2. Create a Supabase project and run `supabase/migrations/001_initial.sql`
   and `supabase/migrations/002_mvp_alignment.sql` against it.
3. `cp .env.example .env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; never put this in the browser)
   - `APP_BASE_URL`
4. `npm run dev`

## Scripts
- `npm run dev` — dev server
- `npm run build` — production build
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint (Next.js core + web vitals)
- `npm test` — Vitest unit tests

## Architecture notes
- The browser talks to the app's API routes and to Supabase with the **anon**
  key only. `SUPABASE_SERVICE_ROLE_KEY` is used exclusively in server
  components / route handlers and is never shipped to the client.
- Row Level Security on Postgres is the authorization boundary. The
  `conversation_members` table is the membership source of truth.
- `supabase/migrations/002_mvp_alignment.sql` removes the open `with check
  (true)` insert policy, enforces a two-member cap via a trigger, adds
  reactions, reply/soft-delete columns on messages, a transactional
  `accept_invitation()` function, and a realtime publication.
- Sender identity is always derived from the verified session on the server;
  a client-supplied `sender_id` is ignored.

## Security model (limits, by design)
- TLS protects data in transit; DB RLS and service-role separation protect
  stored data. This is **not** end-to-end encryption: the server and the
  database provider can read message contents.
- A stolen or forwarded invitation link / session cookie can be used until
  it is revoked or expires. Recovery requires issuing a new credential.
