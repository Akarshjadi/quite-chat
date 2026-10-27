-- Seed data for development only.
-- Do not run on production.

insert into public.conversations (created_by, retention_days)
values (null, null)
on conflict do nothing;

insert into public.invitations (token_hash, invited_email, created_by, expires_at)
values (
  'dev-token-hash-placeholder',
  null,
  null,
  now() + interval '7 days'
) on conflict do nothing;