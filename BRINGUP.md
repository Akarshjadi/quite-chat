# Between the Lines — Bring-Up & Verification Checklist

Run these against a **throwaway test Supabase project** first. Do not use
production credentials, and do not put her real personal data in test runs.

## 0. Prereqs
- A Supabase project (free tier is fine for testing).
- Node 20, `npm install`.
- Copy `.env.example` → `.env.local`.

## 1. Provision test database
```bash
# Apply migrations in order against the test project:
#   supabase/migrations/001_initial.sql
#   supabase/migrations/002_mvp_alignment.sql
# Via Supabase SQL editor, or:
psql "$DATABASE_URL" -f supabase/migrations/001_initial.sql
psql "$DATABASE_URL" -f supabase/migrations/002_mvp_alignment.sql
```
Confirm:
- `conversation_members` no longer has the `Privileged insert` policy.
- `message_reactions`, `messages.reply_to_id`, `messages.deleted_at` exist.
- `publication supabase_realtime` includes `messages` and `message_reactions`.

## 2. Owner bootstrap (run ONCE)
```bash
export NEXT_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export OWNER_BOOTSTRAP_SECRET="$(openssl rand -hex 32)"
npx tsx scripts/owner-bootstrap.ts
```
Expected output: owner user id, conversation id, and the owner credentials.
**Immediately** store the owner password securely and rotate
`OWNER_BOOTSTRAP_SECRET`.

## 3. Sign in + create invitation
1. Sign in at `/login` as the owner.
2. Go to `/settings/invitations`, click **Create invitation link**.
3. Copy the fragment URL (`.../invite/accept#token=...`).
4. Share it manually with the second participant.

## 4. Accept invitation (second participant)
1. The invitee signs in (`/login`) with their own account.
2. Opens the invitation link; `/invite/accept` POSTs the fragment token to
   `/api/invite/accept` (token stays out of the server request/referrer).
3. On success they are redirected to `/chat`.

Verify:
- Both participants see the same message history.
- A **third** account attempting to join is blocked by the two-member cap
  (expect `room_full` / membership trigger exception).

## 5. Messaging checks
- Send a message; it persists and appears for both in realtime (no refresh).
- Reply to a message (reply preview shows).
- Add a reaction; both clients see it.
- Soft-delete your own message; it disappears from both clients.
- Retry: trigger a failed send (e.g. drop the DB connection mid-request) and
  confirm the **same** `client_message_id` does not create a duplicate.
- Refresh and reconnect; confirm missed messages are refetched (no gap).

## 6. Security scenario tests (spec §9)
For each, use a **separate browser profile** or incognito window and verify the
**server** response, not just the UI:

| Test | Expected |
|---|---|
| Unauthenticated GET `/api/messages` | `401 not_authenticated` |
| Third participant opens `/chat` / calls `/api/messages` for the room | `403 not_a_member` |
| Expired invitation token accepted | `410 invitation_expired` |
| Revoked invitation token accepted | `410 invitation_revoked` |
| Already-used invitation re-accepted | `409 invitation_used` |
| Forged `sender_id` in a POST | ignored; sender derived from session |
| Reply target from another conversation | `400 invalid_reply_target` |
| Owner revokes invitee's session (`/api/admin/revoke-session`) | invitee's next `/api/*` call returns `403` |
| Duplicate send on retry | no second row; `deduplicated: true` |
| Mobile layout at ~360px | composer + bubbles usable, no overflow |

## 7. Logs & secrets hygiene
- Grep server logs and the client bundle for the raw invitation token and any
  session credential. Both must be **absent** (only hashes stored).
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is **not** in any `NEXT_PUBLIC_*` var
  and not in the client bundle.

## 8. Deployment (production)
1. Create a **second** Supabase project for production; run both migrations.
2. Set Vercel env (server-only, NOT `NEXT_PUBLIC_*`):
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_BASE_URL` (your production domain)
   And public:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Run the owner bootstrap against production (rotate `OWNER_BOOTSTRAP_SECRET`
   after).
4. `npm run build` (CI already gates on typecheck/lint/test/build).
5. Smoke test the §5 + §6 scenarios on the live URL.
6. Confirm backup retention: restore a recent backup into a test project and
   verify revocations/deletions reapply where required. Document that soft
   deletes remain in backups until they expire.

## 9. Rollback / incident
- If a migration fails: stop the rollout; the last healthy build stays up.
- If a credential leaks: rotate it, revoke affected sessions, re-verify RLS.
