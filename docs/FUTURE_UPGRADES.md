# Future upgrades

## Restore frequent commerce background jobs

Status: deferred by the owner on 2026-10-21 to keep the preview within Vercel's free cron limit. Required before live commerce.

Current configuration: `vercel.json` schedules `/api/commerce/jobs` once daily at `0 2 * * *` (02:00 UTC; Hobby execution can fall within that hour). The previous `*/5 * * * *` schedule prevented deployment under Hobby's daily-only cron limit.

Tradeoff: expiry cleanup waits for the daily run. Payment/refund reconciliation and document jobs share an outbox whose worker currently claims only one job per invocation, so a backlog can take multiple days to drain. This schedule does not meet live-commerce operational needs.

- [ ] **Owner:** select hosting eligible for commercial use before the MIRO business launch. Vercel Hobby is restricted to personal, noncommercial use; changing cron frequency does not change those terms.
- [ ] **Owner/developer:** choose Vercel with a plan supporting frequent cron, or an authenticated external scheduler, and restore a five-minute cadence. Review current pricing/terms when making this choice.
- [ ] **Developer:** configure server-only `CRON_SECRET` (Vercel) or `COMMERCE_JOB_AUTH_SECRET` (external scheduler), at least 32 characters, through private platform settings. Preserve timing-safe checks and 401 denial; never commit or expose secrets.
- [ ] **Developer:** if using an external scheduler, remove the daily Vercel declaration after the replacement is verified so there is one intended scheduler. Check any deployment-protection requirements without weakening worker authentication.
- [ ] **Developer/QA:** verify actual production invocation, successful authorized processing and rejected unauthenticated requests. Use disposable fixtures or staging for payment/refund/document tests; never create real financial effects for QA.
- [ ] **Developer:** review one-job-per-run throughput and the 500-intent expiry batch against expected load; verify idempotency, lease behavior and safe recovery before increasing capacity. Reconcile unknown financial outcomes before retries.
- [ ] **Operations owner:** add failed-run/backlog/oldest-job alerts, identify an alert recipient and document recovery for missed runs.
- [ ] **Release owner:** deploy the reviewed source, verify the production commit/alias and scheduler, then update this checklist, `AGENTS.md`, `docs/OPERATIONS.md` and `docs/PROJECT_STATUS.md` with dated evidence.

References: [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Hobby eligibility](https://vercel.com/docs/plans/hobby). Existing merchant/provider/accountant, privacy/media-retention and manual bilingual accessibility approvals remain separate launch requirements with their documented owners.
