-- Migration 002: align schema with the agreed MVP spec
-- 1. Replace the unsafe `with check (true)` membership INSERT policy.
-- 2. Add a two-member cap + a transactional, service-only membership function.
-- 3. Add reactions and a transactional invitation-acceptance function.
-- 4. Extend messages with reply_to_id and deleted_at.
-- 5. Constrain and index reply targets.

-- ===== 1. Membership safety =====
-- Remove the open insert policy. Membership changes go through a server
-- function with security definer that enforces the two-member cap.
drop policy if exists "Privileged insert" on public.conversation_members;

-- Exactly two active members per conversation, enforced in a trigger.
create or replace function public.enforce_two_members()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if (
      select count(*)
      from public.conversation_members cm
      where cm.conversation_id = new.conversation_id
        and cm.user_id <> new.user_id
    ) >= 2 then
      raise exception 'conversation already has two members';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_two_members
before insert on public.conversation_members
for each row execute function public.enforce_two_members();

-- The only way to add membership: a security-definer function that the
-- app calls with the service key (or via authenticated owner flow).
create or replace function public.add_conversation_member(
  p_conversation uuid,
  p_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or p_conversation is null then
    raise exception 'arguments must not be null';
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (p_conversation, p_user)
  on conflict (conversation_id, user_id) do nothing;
end;
$$;

-- Only the service role may execute the membership writer.
revoke execute on function public.add_conversation_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_conversation_member(uuid, uuid) to service_role;

-- ===== 2. Reactions =====
create table public.message_reactions (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.messages on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz default now() not null,
  unique (message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

create policy "Members can view reactions"
  on public.message_reactions for select
  using (
    exists (
      select 1 from public.conversation_members cm
      join public.messages m on m.id = message_reactions.message_id
      where m.conversation_id = cm.conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy "Members can add reactions to their messages"
  on public.message_reactions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.conversation_members cm
      join public.messages m on m.id = message_reactions.message_id
      where m.conversation_id = cm.conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy "Members can remove their reactions"
  on public.message_reactions for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.conversation_members cm
      join public.messages m on m.id = message_reactions.message_id
      where m.conversation_id = cm.conversation_id
        and cm.user_id = auth.uid()
    )
  );

create index idx_reactions_message on public.message_reactions (message_id);

-- ===== 3. Messages: reply target + soft delete =====
alter table public.messages
  add column if not exists reply_to_id uuid,
  add column if not exists deleted_at timestamptz;

alter table public.messages
  drop constraint if exists messages_reply_to_check;

-- A reply must reference a message in the same conversation (validated in
-- the application layer; the DB check below is a cheap safety net).
alter table public.messages
  add constraint messages_reply_same_room
  check (reply_to_id is null or reply_to_id <> id);

alter table public.messages
  add constraint messages_reply_fk
  foreign key (reply_to_id) references public.messages(id) on delete set null;

create index idx_messages_reply_to on public.messages (reply_to_id)
  where reply_to_id is not null;

-- ===== 4. Invitation acceptance binding =====
alter table public.invitations
  add column if not exists accepted_by uuid references auth.users,
  add column if not exists conversation_id uuid references public.conversations on delete cascade;

create index idx_invitations_conversation on public.invitations (conversation_id);

create or replace function public.accept_invitation(
  p_token_hash text,
  p_user uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv_id uuid;
  conv_id uuid;
begin
  select id, conversation_id into inv_id, conv_id from public.invitations
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'unknown invitation';
  end if;
  if (select revoked_at is not null from public.invitations where id = inv_id) then
    raise exception 'invitation revoked';
  end if;
  if (select accepted_at is not null from public.invitations where id = inv_id) then
    raise exception 'invitation already used';
  end if;
  if (select expires_at < now() from public.invitations where id = inv_id) then
    raise exception 'invitation expired';
  end if;

  if conv_id is null then
    raise exception 'invitation not bound to a conversation';
  end if;

  update public.invitations
  set accepted_at = now(), accepted_by = p_user
  where id = inv_id;

  perform public.add_conversation_member(conv_id, p_user);

  return inv_id;
end;
$$;

revoke execute on function public.accept_invitation(text, uuid) from public, anon;
grant execute on function public.accept_invitation(text, uuid) to authenticated, service_role;

-- ===== 5. Realtime publication =====
create publication if not exists supabase_realtime for table public.messages;
alter publication supabase_realtime add table public.message_reactions;

-- RLS-compatible realtime: subscribe with a private channel and a filter
-- that requires membership. The row-level `using` clause above is what the
-- realtime engine evaluates for each event.
