import { createAuthenticatedClient, createServiceClient } from "@/lib/server/supabase"

export interface CurrentUser {
  id: string
}

export class AuthError extends Error {}
export class MembershipError extends Error {}
export class ForbiddenError extends Error {}

/**
 * Resolve the requesting user from their Supabase session cookie.
 * Fails closed: unauthenticated callers get a 401.
 */
export async function requireUser(): Promise<CurrentUser> {
  const supabase = createAuthenticatedClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    throw new AuthError("not_authenticated")
  }
  return { id: user.id }
}

/**
 * Verify the user is an active member of the conversation, using a
 * service-role read so the check is not bypassed by permissive RLS.
 */
export async function requireMembership(conversationId: string, userId: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error || !data) {
    throw new MembershipError("not_a_member")
  }
}
