# Israeli integrations, sources and owner setup

Checked 2026-10-06. This is a technical proposal with sourced constraints, **not a registration/compliance certificate or a connected merchant account**. Recheck effective dates and provider contracts during implementation and before launch. The owner selected independent invoicing and has no provider account yet; entity kind has not been supplied.

## Payment provider decision

| Provider     | Verified primary evidence                                                                               | Recommended treatment                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| PayPlus      | Public hosted-payment API, sandbox/production URLs, callback validation, payment query and bit offering | Implement the first sandbox-ready adapter. Owner still selects commercial terms, account/modules and obtains credentials            |
| Grow         | Official developer entry describes online payment integration; official solutions include bit           | Keep the common gateway boundary compatible. Implement an additional adapter only if selected, after reading its actual current API |
| Cardcom      | Official LowProfile status service exists                                                               | Candidate requiring current onboarding/API version verification; do not build a guessed v11 contract                                |
| Israeli uPay | Official pages offer card processing and use “ללא אובליגו” with differing descriptions                  | Obtain written product definition and official API materials before promising the requirement or implementing a live adapter        |

Primary links: [PayPlus integration guide](https://docs.payplus.co.il/reference/website-or-app), [PayPlus bit](https://www.payplus.co.il/bit), [Grow developer entry](https://grow.business/api-developers/), [Grow solutions](https://grow.business/solutions/), [Cardcom official LowProfile indicator service](https://secure.cardcom.solutions/service.asmx?op=GetLowProfileIndicator).

These are candidates, not endorsements of pricing, merchant approval, settlement timing or no-obligo support. No credentials, lead forms or merchant applications were submitted. Do not use APIs for unrelated foreign/crypto companies named “UPay”; the Israeli brand's official technical contract has not been verified here.

## PayPlus implementation recipe

Use server-only code and environment-specific credentials. The official integration guide requires a payment page UID and `api-key`/`secret-key` headers; it also describes J2 checks, J4 charges, J5 holds and separately enabled recurring payments. These states must remain distinct. [Official guide](https://docs.payplus.co.il/reference/website-or-app).

Sandbox base: `https://restapidev.payplus.co.il/api/v1.0/`; production base: `https://restapi.payplus.co.il/api/v1.0/`. Select from a fixed server-owned allowlist; validate environment and credential set together. [Official REST URLs](https://docs.payplus.co.il/reference/payplus-rest-api-urls).

For a one-time hosted payment use `POST PaymentPages/generateLink`: set the configured page UID, explicit `charge_method: 1`, authoritative amount, `currency_code: "ILS"`, opaque attempt reference in `more_info`, trusted success/failure/cancel/callback URLs and `send_failure_callback: true`. Configure only enabled payment methods; `charge_default: "bit"` selects a tab when available. Explicitly set `initial_invoice: false` because MIRO uses its own issuer; verify merchant dashboard settings also prevent duplicate fiscal issuance. Explicitly configure notification and installment fields rather than relying on defaults. `create_hash` is documented as Base64 customer data, not webhook authentication. [GenerateLink reference](https://docs.payplus.co.il/reference/post_paymentpages-generatelink).

Treat that recipe as an adapter specification; confirm required flags, amount encoding, return method and response schema against the current API and sandbox. Convert agorot to exact two-decimal NIS at this boundary; do not let JS multiplication/rounding alter the canonical total. Persist returned request UID and validate the link's scheme/host. Do not send unnecessary identity details through URLs/metadata. Notifications from the provider and MIRO must have explicit delivery ownership to avoid duplicate/unapproved emails or SMS.

The validation guide documents `hash` and `user-agent: PayPlus`, with HMAC-SHA256/base64 using the secret and its JSON serialization example. Preserve the incoming body, bound it, follow the documented serialization precisely and use constant-time comparison. User-agent alone cannot authenticate. Confirm actual callback transport, signed bytes/serialization and header presence with provider sandbox fixtures; the guide's sample also concerns API responses, so do not assume every browser redirect is signed. `create_hash`/`hash_data` is a separate mechanism. Invalid or unverified input cannot alter financial state. [Official validation guide](https://docs.payplus.co.il/reference/validate-requests-received-from-payplus).

Status lookup is `POST PaymentPages/ipn` by payment request UID or transaction UID. Persist both identifiers and use the correct field; do not assume response `page_request_uid` and query `payment_request_uid` have identical names. Prefer stored identifiers over approval numbers, which the reference says may repeat. Use authenticated lookup for reconciliation and authoritative matching. [IPN reference](https://docs.payplus.co.il/reference/post_paymentpages-ipn).

Callbacks contain charged/refunded transaction information and a payment request UID for payment-page transactions. Confirm actual HTTP method/body with sandbox; the reference path containing YOURDOMAIN is a placeholder, not a PayPlus URL to call. Model duplicate/order-changing callbacks and charge/refund distinctions. [Callback reference](https://docs.payplus.co.il/reference/get_yourdomain-yourendpoint).

The refund-by-UID endpoint is `POST Transactions/RefundByTransactionUID`. Its reference currently contains charge/J5 wording and a CVV condition; verify the exact supported refund contract for the merchant rather than copying contradictory text. MIRO must not collect/store CVV to unlock refund. If the approved flow requires unsupported sensitive-card handling, keep automatic refund unavailable and provide an audited provider-console reconciliation path. Never report a requested refund as completed before verification. [Refund reference](https://docs.payplus.co.il/reference/post_transactions-refundbytransactionuid).

Implement tests for signature vectors, malformed headers/body, mutation after signing, serialization, wrong merchant/environment/amount/currency, request-vs-transaction IDs, duplicates, 2xx with business failure, timeout, late capture, partial refund and retry reconciliation. Documentation/examples alone do not prove live interoperability. Store sanitized real sandbox fixtures once an account is available; never commit card/customer/credential values.

Hosted card UI keeps card entry at the provider. Do not build custom PAN/CVV fields, log payment secrets, use localStorage for tokens or claim the browser can charge NFC/EMV hardware. Physical terminals require an approved provider/hardware integration. Review actual PCI scope with provider/owner; hosted entry reduces sensitive handling but is not a blanket PCI exemption.

## What “ללא אובליגו” means for this task

uPay's credit-card page describes transactions without consuming the customer's card framework, while another official article discusses avoiding merchant bank credit/security commitments. Those are different products/claims. This research cannot select the intended meaning from the phrase alone. [uPay card system](https://web.upayfinance.com/services/credit-card-system), [uPay online processing article](https://www.upay.co.il/articles/online-payment-processing-israel-2026).

**Owner + payment-provider action:** choose the intended meaning, obtain written support/eligibility/limits/settlement terms and confirm cancellation/refund/recurring obligations. Until then show capability unavailable, with an explanation, and do not publish a no-obligo commercial promise. An ordinary installment transaction, token, J5 hold or monthly schedule cannot be relabeled to prove this requirement. Implement separate approved capabilities for customer framework treatment and merchant financing conditions when the provider contract supports them. Recurring billing needs explicit customer consent, schedule, per-occurrence state/receipt policy, expiry/failure handling and audited cancellation; cancellation prevents future attempts without erasing previous charges.

## Independent invoicing in Israel

Building an internal engine is technically feasible. Changing business name/details in settings is also feasible; it does not itself make issued PDFs valid tax documents. Store complete business identity versions and ensure an issued document cannot change retrospectively. Determine exempt/registered/company status, VAT treatment, document types and issue timing with the owner's accountant before official issuance.

The Tax Authority's software-registration service describes registration for computerized bookkeeping software supplied to others, including free use; it calls for uniform-format export and simulator validation and states that registration does not certify all software behavior. It recommends accounting/system expertise. The owner-only, self-built use case needs a written applicability decision; neither universal registration nor automatic exemption is established here. Selling this engine to other businesses changes that analysis. [Official software-registration service](https://www.gov.il/he/service/registration-software-designed-managing-computerized-accounting-system).

The official uniform-format specification includes `INI.TXT` and `BKMVDATA.TXT`. Where applicable, implement the current record/encoding specification and official simulator verification, not a CSV file renamed to those names. Track revision and test evidence. [Tax Authority uniform-format specification](https://www.gov.il/BlobFolder/service/registration-software-designed-managing-computerized-accounting-system/he/Service_Pages_Income_tax_horaot-131.pdf).

Circular 24/2004 addresses computerized documents and secure or certified electronic signatures. A PDF with a logo or scanned signature is not enough. Have the accountant/legal reviewer confirm applicable delivery/consent/marking, signature and retention rules and the proposed signer. Do not assume every case requires the same qualified certificate or that a content hash replaces an electronic signature. Build a signer interface with server-side protected key handling, certificate verification and failure states. [Official computerized-documents circular](https://www.gov.il/blobfolder/generalpage/-software-houses-digital-documents/he/incometax_incometaxsoftwarehousesinfo_hoz24-2004.pdf).

As of the research date, the official 2025 tax guide published in 2026 specifies Israel Invoices allocation thresholds above NIS 10,000 excluding VAT from 2026-01-01 and above NIS 5,000 excluding VAT from 2026-06-01. This concerns qualifying tax invoices for registered-dealer customers/input VAT deduction, not every B2C receipt. Implement effective-dated eligibility, with strict greater-than boundaries and accountant-reviewed exceptions. Confirm current rules at launch. [Official guide](https://www.gov.il/BlobFolder/generalpage/income-tax-guide-knowyourright/he/Guides_IncomeTax_da-2025.pdf).

The authority provides allocation-number requests even for businesses without connected software. Build an allocation adapter and a controlled manual-number workflow if legally approved; record who entered the number and its verification/provenance. Never generate a fake allocation number. Direct API OAuth/scopes/endpoint contracts require official developer onboarding and current specifications, which are **not** verified in this packet. Block affected official issue operations until the chosen valid path is ready; allocation rejection/timeout is not a reason to bypass it. [Official allocation-request service](https://www.gov.il/he/service/request-assignment-number-for-tax-invoice).

**Accountant/owner actions before official mode:** entity/registration verification; invoice/receipt/credit-note semantics and timing; numbering/series/failed reservations; VAT/rounding fixtures; allocation eligibility and contingency; signature/consent/delivery; software registration/export applicability; statutory retention, backup/restore and correction policy. Do not invent a retention period or enable legal mode simply because automated tests pass.

## Privacy, security and accessibility

New expenses/invoices introduce billing identities and private attachments. Minimize fields, isolate customers/staff, avoid secret-readable settings, use short-lived private downloads, record only necessary gateway evidence and adopt a reviewed retention/deletion policy. Deleting a login cannot cascade-delete required fiscal records. Privacy Amendment 13 applicability, notices and any officer/registration/security duties need business-specific review; do not assume every SME has identical duties. [Privacy Authority regulations guidance](https://govextra.gov.il/privacy-protection-regulations/privacy-protection-regulations/), [Privacy Authority Amendment 13 guidance](https://www.gov.il/he/pages/amendment-13-26-07-26).

The official accessibility guide addresses online services and digital documents, including personal documents in account areas. Review the applicable Israeli standard and exemptions with the accessibility owner. Engineering should target WCAG 2.2 AA interaction quality and include accessible generated documents; this target is not an assertion that every provision is mandated identically for this business. Automated axe scans do not replace Hebrew/English screen-reader and physical-device review. [Official accessibility guide](https://www.gov.il/en/pages/website_accessibility?chapterIndex=5), [Israel Standards public standards index](https://www.sii.org.il/he/puublic-standards/).

At milestones report newly relevant issues with owner/action, without repeating a generic checklist. Main launch owners: business/accountant for fiscal correctness and identity; payment integrator for sandbox/live credentials and reconciliation; engineering for schema/security/retention/restore; accessibility reviewer for POS, payment and document flows. These dependencies do not prevent completing local code and mocks.

## Skills and orchestration research

Codex skills are loaded progressively from their instructions; use the actual available catalog, not a supposed Luna-only catalog. Subagents inherit configuration when not explicitly overridden, and explicit user direction can request delegation. The owner's choice is Codex with Luna; do not convert this task into OpenCode or change its model settings. [Official Codex subagent guide](https://learn.chatgpt.com/docs/agent-configuration/subagents), [Official skills guide](https://learn.chatgpt.com/docs/build-skills), [Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna).

Installed relevant skills at research time are mapped in the main prompt. Discovery used the Find Skills workflow and `npx --yes skills find supabase`, `playwright`, and `security`. Candidate publisher/repository identity was checked on official GitHub pages. Search results are not a security audit; read pinned contents before use. Supabase's repository showed about 2.7k GitHub stars and its Postgres skill about 432k marketplace installations at research time; counts are transient, not quality guarantees. [Supabase official agent skills](https://github.com/supabase/agent-skills), [Microsoft official Playwright CLI](https://github.com/microsoft/playwright-cli), [OpenAI official skills](https://github.com/openai/skills).

Optional commands, **not executed as installations by this research**:

```sh
npx skills add supabase/agent-skills --skill supabase-postgres-best-practices
npx skills add microsoft/playwright-cli --skill playwright-cli
npx skills add openai/skills --skill playwright
npx skills add openai/skills --skill security-best-practices
```

Review the install prompt, selected scope/version and resulting SKILL.md; install only missing useful tools. Project Playwright already exists, so a CLI skill is optional. No source evidence supports installing an arbitrary “Israel invoice” skill as a substitute for official legal/provider specs.

For the existing stack, follow [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control) and [Supabase Cron](https://supabase.com/docs/guides/cron). Use installed Next.js guides before coding. Native fullscreen availability/events/user activation are described by [MDN Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API); see the POS contract for the proposed portal-aware solution.

## Connection handover

1. Owner supplies legal business details and accountant decisions, without putting credentials in chat.
2. Owner selects payment provider/product, opens sandbox/merchant account and activates cards/bit and any approved installment/recurring/terminal modules.
3. Integrator stores sandbox keys and page UID in server environment, sets a trusted HTTPS app origin/callback and checks redacted readiness diagnostics. Use separate production keys; never copy a sandbox result into a live confirmation.
4. Integrator records real signed sandbox fixtures and verifies charge, cancel, failed/unknown/late transaction, duplicate callback, partial/full refund and settlement lookup where supported. Verify no duplicate provider invoice generation.
5. Accountant/engineer configure independent issuance, signing and allocation credentials/procedure; validate sample output/export and backup restoration. Keep official mode off until readiness is approved.
6. Prepare exact migration dry-run, feature activation, monitoring, exception owner and forward rollback. Perform production transaction/refund/document/settlement validation only with owner authorization. Preserve money/document history during rollback.

`integration.env.example` is a proposed empty template, not code that configures or connects these services today.
