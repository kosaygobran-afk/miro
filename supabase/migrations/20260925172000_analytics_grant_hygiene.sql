-- Analytics events: anon only needs INSERT (writes events); SELECT is restricted
-- by RLS to admin/ceo evaluated on authenticated. Remove the noisy anon select grant.
revoke select on public.analytics_events from anon;
