-- Enable extensions
create extension if not exists pgcrypto;

-- Profiles table
create table public.profiles (
  id uuid references auth.users not null primary key,
  display_name text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using ( auth.uid() = id );

create policy "Users can update their own profile"
  on public.profiles for update
  using ( auth.uid() = id );

-- Conversations table
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  created_by uuid references auth.users,
  retention_days integer
);

alter table public.conversations enable row level security;

-- Conversation members table
create table public.conversation_members (
  conversation_id uuid references public.conversations on delete cascade,
  user_id uuid references auth.users on delete cascade,
  joined_at timestamptz default now() not null,
  status text default 'active',
  primary key (conversation_id, user_id)
);

alter table public.conversation_members enable row level security;

create policy "Members can view membership"
  on public.conversation_members for select
  using ( auth.uid() = user_id );

create policy "Privileged insert"
  on public.conversation_members for insert
  with check ( true );

-- Messages table
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations on delete cascade,
  sender_id uuid references auth.users not null,
  body text not null check (char_length(body) > 0 and char_length(body) <= 5000),
  client_message_id uuid,
  created_at timestamptz default now() not null
);

alter table public.messages enable row level security;

create policy "Members can view messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = messages.conversation_id
        and user_id = auth.uid()
    )
  );

create policy "Members can insert messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversation_members
      where conversation_id = messages.conversation_id
        and user_id = auth.uid()
    )
  );

create unique index idx_messages_sender_client_id
  on public.messages (sender_id, client_message_id);

create index idx_messages_conversation_created
  on public.messages (conversation_id, created_at, id);

-- Invitations table
create table public.invitations (
  id uuid default gen_random_uuid() primary key,
  token_hash text unique not null,
  invited_email text,
  created_by uuid references auth.users not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now() not null
);

alter table public.invitations enable row level security;

create policy "No public access to invitations"
  on public.invitations for select
  using ( false );