# Commerce decisions

## 2026-10-06 — preserve single-business architecture and independent issuer

- Original plan: extend existing Next/Supabase POS and enquiries. The additional master prompt suggests an invoice provider for the first release and possible tenants/branches/roles.
- Selected approach: retain the owner's explicit independent-invoice choice; preserve actual CEO/admin/worker/customer roles and single-business ownership. Add internal fiscal snapshots/numbering with signing/allocation adapters and launch gates. Do not migrate auth, create fictitious tenants or require invoice SaaS.
- Reason: matches actual business/repository and avoids an unrelated rewrite. External signature/Tax Authority readiness remains mandatory when applicable; internal code does not certify legal documents.
- Requirements preserved: all C01–C18; master extras recurring/MASAV/payment links/PWA/product channel/security audit.
- Validation: baseline lint/typecheck/build118, units78, migrations41/SQL13 passed; new feature evidence follows in IMPLEMENTATION_STATUS.

## 2026-10-06 — initial PayPlus hosted adapter with independent capabilities

- Original plan: PayPlus for the initial sandbox-ready hosted card/bit flow.
- Research: Tranzila official APIs document broader recurring/MASAV/EMV modules; Cardcom/Hyp are viable candidates with onboarding/version details to verify. No merchant account is selected commercially.
- Selected approach: implement PayPlus hosted entry first; keep bank-debit, recurring, wallets/terminals and other gateway extension contracts separate and disabled unless actually supported/configured. No raw-card request path.
- Reason: well-documented hosted boundary for first integration, easy offline contract testing, no forced provider-wide dependency. Broader API marketing does not prove merchant authorization.
- Requirements preserved: real card/bit code path, query/signature/refunds, prepared recurring/MASAV/no-obligo boundaries, internal documents without provider invoice duplication.
- Evidence: primary source links in PROVIDERS_AND_ISRAEL; actual sandbox verification blocked on account, not inferred from fixtures.
