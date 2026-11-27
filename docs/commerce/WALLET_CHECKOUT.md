# Apple Pay and Google Pay checkout

**Current state, 2026-11-25.** MIRO uses the PayPlus hosted payment page for online wallet checkout. On an eligible checkout, the payment screen places configured wallets before card and bit. PayPlus opens and authorizes the wallet on its own page. MIRO waits for its server to verify the transaction before showing payment as complete. The local workspace has no PayPlus configuration. Merchant activation and physical-device sandbox transactions are pending.

## 1. Open or configure a PayPlus account

1. Use the existing PayPlus merchant account or open one. Ask PayPlus for a **separate staging account or terminal and ILS hosted payment page**, with Apple Pay and Google Pay enabled. Have PayPlus confirm the acquirer, supported cards, staging wallet test procedure, and whether the PayPlus-hosted domain already satisfies Apple Pay registration for that page. Request card or bit on the same page only if those methods are part of the merchant agreement. [PayPlus signup](https://www.payplus.co.il/signup) · [Apple Pay at PayPlus](https://www.payplus.co.il/apple-pay) · [Hosted payment pages](https://docs.payplus.co.il/reference/payment-pages)
2. For Google Pay, the PayPlus instructions point to **Settings → Alternative Payment Methods**, Google's terms, and PayPlus Support for activation. Ask PayPlus to confirm Apple Pay and Google Pay are enabled on the actual test page UID and its linked terminal. Ask the provider for any required domain registration steps if using a custom payment domain. [PayPlus wallet setup](https://docs.payplus.co.il/reference/payment-methods) · [Apple merchant registration](https://developer.apple.com/documentation/applepaywebmerchantregistrationapi)
3. Retrieve the staging API key and secret from **Profile → Settings → API integration** in PayPlus. Retrieve the staging payment page UID from **Payments → Payment Pages**. Configure the browser returns to use GET and ask PayPlus to confirm signed JSON POST callbacks for the staging page. MIRO handles the callback at `/api/commerce/webhooks/payplus` and PayPlus returns the shopper to `/{locale}/pay/{intent_id}`. The `generateLink` request supplies these URLs. Ask PayPlus to confirm that the test page will suppress automatic provider invoices and notifications for these requests. [PayPlus credentials guide](https://www.payplus.co.il/faq/%D7%9E%D7%93%D7%A8%D7%99%D7%9A-%D7%9C%D7%9E%D7%A4%D7%AA%D7%97-%D7%95%D7%97%D7%99%D7%91%D7%95%D7%A8-API/%D7%99%D7%A6%D7%99%D7%A8%D7%AA-%D7%91%D7%A7%D7%A9%D7%AA-API/%D7%9E%D7%A9%D7%99%D7%9B%D7%AA-%D7%A4%D7%A8%D7%9E%D7%98%D7%A8%D7%99%D7%9D-API-KeySecret-KeyPayment-Page-UIDCashier-UIDTerminal-UID) · [PayPlus redirects and callbacks](https://docs.payplus.co.il/reference/website-or-app) · [Signature validation](https://docs.payplus.co.il/reference/validate-requests-received-from-payplus)

## 2. Set up the isolated MIRO sandbox

Use a dedicated HTTPS staging origin and staging Supabase database. A verified sandbox payment can finalize an order and consume inventory in that database. Use disposable catalog items with approved test prices, inventory and an online sales channel. The website's online checkout path currently starts from eligible delivery carts.

Copy the relevant keys from [the empty server environment template](integration.env.example) to the staging secret store. Use the ignored `.env.local` for local configuration and keep API keys and secrets in server-only storage. For browser and callback tests, `COMMERCE_APP_ORIGIN` must match the HTTPS origin as opened by the shopper and be reachable by PayPlus.

```dotenv
COMMERCE_APP_ORIGIN=https://checkout-staging.example.com
COMMERCE_PUBLIC_CHECKOUT_ENABLED=true
COMMERCE_GATEWAY_ENABLED=true
COMMERCE_PRODUCTION_APPROVED=false
PAYPLUS_ENVIRONMENT=sandbox
PAYPLUS_SANDBOX_API_KEY=
PAYPLUS_SANDBOX_SECRET_KEY=
PAYPLUS_SANDBOX_PAGE_UID=
PAYPLUS_SANDBOX_ENABLED_METHODS=apple_pay,google_pay
PAYPLUS_SANDBOX_ENABLED_FEATURES=
PAYPLUS_SANDBOX_HOSTED_PAYMENT_HOSTS=
PAYPLUS_SANDBOX_RETURN_HOSTS=
```

- Fill the three blank credential fields with values from the PayPlus staging environment. The app uses the staging REST base automatically. [PayPlus environment URLs](https://docs.payplus.co.il/reference/payplus-rest-api-urls)
- Append `credit_card` or `bit` to `PAYPLUS_SANDBOX_ENABLED_METHODS` for whichever fallback methods PayPlus confirms. For example, all four use `apple_pay,google_pay,credit_card,bit`. A wallet-only staging deployment is appropriate for isolating wallet tests. Add `installments` or `partialRefund` to `PAYPLUS_SANDBOX_ENABLED_FEATURES` only for confirmed and tested modules. Wallet payments use a single installment.
- Use the default PayPlus hosted-domain allowlist for the standard PayPlus page or set `PAYPLUS_SANDBOX_HOSTED_PAYMENT_HOSTS` to a comma-separated list of confirmed hosted page hostnames. An entry is a hostname without a scheme or path. Keep `PAYPLUS_SANDBOX_RETURN_HOSTS` empty unless a separately approved return host is needed. The configured `COMMERCE_APP_ORIGIN` supplies the normal return and callback URLs.
- Redeploy or restart the isolated instance after changing the environment. Open **Settings → Business & integrations** (`/{locale}/admin/integrations`) to check redacted PayPlus configuration and sandbox mode. `GET /api/health` also reports configuration status. These checks validate the app runtime configuration. Use the provider and device checks below to establish that each wallet works.
- From a trusted server-side client, send the authenticated read-only `GET /PaymentPages/ChargeMethods?payment_page_uid=<staging page UID>` on the PayPlus staging REST base. Confirm the page returns the enabled wallet methods. Supply the keys from the staging secret store and record only the method names. `generateLink` uses PayPlus method names `apple-pay` and `google-pay` for the selected wallet, with an explicit allowlist and default selection. [PayPlus charge methods](https://docs.payplus.co.il/reference/get_paymentpages-chargemethods) · [PayPlus GenerateLink](https://docs.payplus.co.il/reference/post_paymentpages-generatelink)

## 3. Prove the sandbox flows

| Scenario | Evidence to capture |
| --- | --- |
| Approved Apple Pay on iPhone Safari | Open the eligible MIRO cart, proceed to secure payment, select Apple Pay and complete the PayPlus-approved staging flow on the test device. Record the hosted order total, ILS currency, wallet opening, app status and PayPlus sandbox result. |
| Approved Google Pay on Android Chrome | Repeat with Google Pay and PayPlus-approved staging credentials. Confirm the wallet offers the expected test funding method and PayPlus reports a verifiable transaction. |
| Cancel, decline and unsupported browser | Cancel the wallet before authorizing and exercise the provider's decline test. On a device without the wallet, verify the provider's behavior and that the shopper can return to MIRO and use an enabled fallback after the prior attempt resolves. If card is enabled, PayPlus publishes sandbox cards for baseline successful and rejected card checks. [PayPlus sandbox cards](https://docs.payplus.co.il/reference/sandbox-credit-card-numbers) |
| Signed return, repeat delivery and recovery | Verify the PayPlus webhook receives the expected signed POST and stages a server lookup. Return before the callback, refresh status, repeat callback delivery in staging, and simulate an interrupted redirect. A browser return or webhook alone must leave the order unpaid until the authenticated PayPlus lookup confirms capture. A verified capture must finalize one order and consume stock once. [PayPlus IPN lookup](https://docs.payplus.co.il/reference/post_paymentpages-ipn) |
| Refund and settlement | With the provider-approved sandbox refund contract, verify a full refund and partial refund if enabled. Confirm captured, refunded and settled amounts against the provider report when sandbox settlement evidence is available. Record any refund or settlement behavior that needs an owner-approved live pilot. |
| Checkout and guest coverage | Repeat collection with guest and authenticated customer, in Hebrew and English. Verify keyboard focus and readable status on narrow screens. Check an ineligible or pickup cart follows the checkout request path, and that disabling a method removes the option and blocks direct requests to start it. |

Use PayPlus' supported test devices and accounts. Apple provides a sandbox tester and test-card procedure. Google's published gateway-specific test card list omits PayPlus and its generic mock suite only exercises the Google Pay sheet. Ask PayPlus which test cards or tokens will return a usable result for its staging gateway. A wallet sheet opening by itself is a UI check. [Apple Pay sandbox testing](https://developer.apple.com/apple-pay/sandbox-testing/) · [Google Pay test-card coverage](https://developers.google.com/pay/api/web/guides/resources/test-card-suite)

Record the test date, staging build, device and browser, payment method, outcome, redacted provider reference and the confirmed order and stock effect. Keep card details, wallet tokens, signatures, customer details and secrets out of screenshots and shared logs. For asynchronous sandbox checks, run the authorized worker on the isolated deployment and confirm the outbox clears. The worker currently claims one job per call and the production Hobby schedule runs once daily. See the [scheduler upgrade](../FUTURE_UPGRADES.md).

## Provider options

| Provider | Published online wallet support | MIRO status |
| --- | --- | --- |
| PayPlus | Hosted Apple Pay and Google Pay, plus card and bit on enabled pages. [PayPlus hosted pages](https://docs.payplus.co.il/reference/payment-pages) · [PayPlus bit](https://www.payplus.co.il/bit) | Implemented provider. Merchant onboarding and signed staging evidence are pending. |
| Cardcom | Apple Pay and Google Pay on online and hosted payment pages. [Cardcom digital wallets](https://www.cardcom.solutions/apple-google-pay) | Alternative if the owner chooses Cardcom. Requires its own credentials, adapter and acceptance tests. |
| Grow | Dedicated Apple Pay and Google Pay payment pages. Grow specifies Android Chrome for its documented Google Pay page and domain approval for Apple Pay if embedded. [Grow payment pages](https://developers.grow.business/reference/payment-page) | Alternative if the owner chooses Grow. Requires its own credentials, adapter and acceptance tests. |

When comparing offers, ask the provider for written setup and transaction fees, refund fees, settlement timing, supported Israeli and foreign cards, wallet availability in the selected checkout mode, and a test page. Compare the costs for the same merchant and transaction mix.

## Production handoff

- **Business owner and PayPlus** approve the agreement, terminal, wallet activation and supported devices. Provide credentials through the deployment secret store. Record any payment-page limits and the provider's ownership of wallet registration.
- **Engineering and operations** verify the staging acceptance cases, confirm hosted migrations and callback delivery, restore monitored worker execution at least every five minutes, and agree who owns reconciliation and refund exceptions. Rehearse disabling new collection with `COMMERCE_PUBLIC_CHECKOUT_ENABLED=false` while continuing to reconcile outstanding attempts.
- **Accountant and business owner** approve and verify the fiscal document process before production sales. MIRO currently rejects production payment mode even when `COMMERCE_PRODUCTION_APPROVED=true`, because its independent issuer remains draft-only. Production readiness requires a verified document process in the app and separate production credentials. [Israeli commerce and fiscal readiness](PROVIDERS_AND_ISRAEL.md)
- **Privacy and accessibility owners** confirm the provider checkout and data handling disclosures, and perform device and screen-reader checks covering both languages, PayPlus return and recovery. After the launch gates pass, the owner can authorize a small live payment and refund for each wallet with provider and document reconciliation.
