/**
 * One-time owner bootstrap.
 *
 * Run this EXACTLY ONCE from a machine that has a Supabase project with the
 * migrations applied. It creates the owner's Supabase account (service role,
 * so it bypasses public-signup restrictions), their conversation, and
 * membership row.
 *
 * Usage:
 *   npx tsx scripts/owner-bootstrap.ts
 *
 * Required env (see .env.example):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OWNER_BOOTSTRAP_SECRET   (a long random string; used to seed the owner password)
 */
import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bootstrapSecret = process.env.OWNER_BOOTSTRAP_SECRET

  if (!url || !serviceKey || !bootstrapSecret) {
    console.error("Missing required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_BOOTSTRAP_SECRET")
    process.exit(1)
  }

  const admin = createClient(url, serviceKey)

  // 1. Check whether the owner already exists (idempotent re-runs are safe).
  const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
  const ownerEmail = `owner@${randomUUID().slice(0, 8)}.local`
  const ownerPassword = `${bootstrapSecret}-${randomUUID()}`

  let ownerUserId: string
  let createdConversationId: string

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  })
  if (createErr) {
    // If the account already exists, find it.
    const { data: users, error: listErr } = await admin.auth.admin.listUsers({ perPage: 100 })
    if (listErr || !users || users.length === 0) {
      console.error("Could not create or find owner user:", createErr, listErr)
      process.exit(1)
    }
    ownerUserId = users[0].id
    console.log(`Owner user already present: ${ownerUserId}`)
  } else {
    ownerUserId = created.user.id
    console.log(`Created owner user: ${ownerUserId} (${ownerEmail})`)
  }

  // 2. Create the single conversation owned by the owner.
  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .insert({ created_by: ownerUserId, retention_days: null })
    .select()
    .single()
  if (convErr || !conv) {
    console.error("Could not create conversation:", convErr)
    process.exit(1)
  }
  createdConversationId = conv.id
  console.log(`Created conversation: ${createdConversationId}`)

  // 3. Add the owner as the first member.
  const { error: memberErr } = await admin.rpc("add_conversation_member", {
    p_conversation: createdConversationId,
    p_user: ownerUserId,
  })
  if (memberErr) {
    console.error("Could not add owner membership:", memberErr)
    process.exit(1)
  }
  console.log("Added owner membership.")

  // 4. Ensure the owner has a profile row.
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert({ id: ownerUserId, display_name: "Owner" })
  if (profileErr) console.error("Profile upsert note:", profileErr)

  console.log("\n=== Bootstrap complete ===")
  console.log(`Conversation ID: ${createdConversationId}`)
  console.log(`Owner user ID:   ${ownerUserId}`)
  console.log(`Owner email:     ${ownerEmail}`)
  console.log(`Owner password:  ${ownerPassword}  (store this securely; rotate after first sign-in)`)
  console.log("\nNow sign in at /login as the owner, then create an invitation from /settings/invitations.")
  console.log("Remember to rotate OWNER_BOOTSTRAP_SECRET after this run.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
