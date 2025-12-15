# PostRail Testing Guide

## Overview

Tests cover unit, integration, contract, security, and E2E flows across API routes, platform integrations, scheduling, and billing.

## Test Stack

| Tool                | Purpose                  |
| ------------------- | ------------------------ |
| **Vitest**          | Unit & integration tests |
| **Playwright**      | E2E browser tests        |
| **MSW**             | API mocking              |
| **Testing Library** | React component testing  |

## Commands

```bash
npm test                        # Vitest (all)
npm run test:fast|medium|slow   # Tiered Vitest subsets
npm run test:smoke              # Smoke subset
npm run test:contracts          # Contract tests (ENABLE_CONTRACT_TESTS=true)
npm run test:coverage           # Coverage
npm run test:e2e                # Playwright
npm run test:e2e:ui|:headed     # E2E debug modes
npm run test:smart              # Chooses subset based on git diff
npm run lint && npm run type-check && npm run type-check:tests
npm run validate:pre-push       # Lint + stylelint + format check + tests + smoke
```

## Test Layout

```
tests/
├── api/          # API routes: generate-posts, scrape, twitter/linkedin/facebook OAuth+post, RBAC, bulk
├── components/   # UI tests (e.g., NewsletterEditor)
├── contracts/    # Contract tests (gated by ENABLE_CONTRACT_TESTS)
├── lib/          # Supabase clients, rate limiters, SSRF protection, middleware, service auth
├── security/     # Race conditions, idempotency
├── smoke/        # Deployment smoke checks
├── mocks/        # Shared mocks (supabase, twitter, etc.)
└── setup.ts
e2e/
├── critical-path.spec.ts
└── api-integration.spec.ts
```

## Categories & Patterns

- **Unit/Integration (Vitest)**: Default `*.test.ts` with MSW/mocks; avoid real network. Use `vi.stubEnv` for envs.
- **Real/External (`*.real.test.ts`)**: Intentional external calls; require valid OAuth/Upstash credentials. Skip or guard in CI unless configured.
- **Contracts**: Enable with `ENABLE_CONTRACT_TESTS=true` when validating integration contracts.
- **E2E (Playwright)**: Requires built app and seeded auth session. Run `npm run test:e2e[:ui|:headed]`.
- **Coverage Targets**: >80% statements/functions/lines; >75% branches. `npm run test:coverage`.

## Environment Notes

- Rate limiter tests can use memory mode; set `RATE_LIMIT_MODE=memory` locally if Redis is unavailable.
- Platform real tests require platform credentials and Supabase service role keys.
- QStash publish/schedule flows require `QSTASH_*` vars; Stripe webhook tests require `STRIPE_WEBHOOK_SECRET`.

## Troubleshooting

- **Timeouts**: Increase timeouts in Vitest/Playwright config or narrow test selection.
- **Mocks not applied**: Ensure `vi.mock` is defined before imports; clear mocks between tests.
- **Flaky network**: Skip `.real.test.ts` when credentials are absent; favor mocks for CI.
