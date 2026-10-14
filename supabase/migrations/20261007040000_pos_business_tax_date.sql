-- Tax windows are Israeli business dates, independent of the caller's session
-- timezone. Function SET restores the prior timezone automatically on exit,
-- including exceptions; it never changes a persistent connection setting.
alter function public.commerce_create_intent(jsonb) set timezone='Asia/Jerusalem';
alter function public.record_pos_sale(jsonb,jsonb,jsonb,text) set timezone='Asia/Jerusalem';
