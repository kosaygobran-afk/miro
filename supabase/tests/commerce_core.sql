-- Commerce core rejects browser-controlled guest authority and payment results.
begin;
set local role authenticated;
do $$ begin
  begin perform public.commerce_create_guest_intent('{"channel":"website","idempotency_key":"test-guest-801","items":[]}'::jsonb); raise exception 'Authenticated caller created a guest intent';
  exception when insufficient_privilege then null; end;
  begin perform public.commerce_provider_result(gen_random_uuid(),'browser-event','{"verified":true,"verification_source":"server_query","provider":"payplus","environment":"production","merchant_ref":"x","amount_agorot":100,"currency":"ILS","state":"captured","transaction_uid":"fake","transaction_kind":"charge"}'::jsonb); raise exception 'Browser finalized a payment';
  exception when insufficient_privilege then null; end;
  begin perform public.commerce_refund_result(gen_random_uuid(),'browser-refund','{"verified":true,"verification_source":"server_response","state":"succeeded"}'::jsonb); raise exception 'Browser applied a refund';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
