# Repository Guidelines

## Project Structure & Modules
- `app/`: Next.js App Router pages, layouts, server actions; API routes live in `app/api`.
- `components/`: Reusable UI (shadcn/ui) and shared widgets; co-locate styles.
- `lib/`: Cross-cutting helpers (`lib/ai`, `lib/platforms`, `lib/supabase`).
- `tests/`: Vitest suites (`components`, `integration`, `contracts`, `smoke`, `execution`); mocks in `tests/mocks`.
- `e2e/` + `playwright.config.ts`: Playwright specs/fixtures.
- `docs/`: Setup/ops notes; keep in sync with new features.
- `scripts/`: Maintenance and validation utilities.

## Build, Test, Run
- `npm run dev` — start Next.js (Turbopack).
- `npm run build` / `npm run start` — production build + serve.
- `npm run lint` or `npm run lint:fix` — ESLint (security rules) plus stylelint for CSS.
- `npm run format` / `format:check` — Prettier write/check.
- `npm test` — Vitest; `test:coverage` for V8 coverage; `test:smoke` for quick sanity; `test:e2e` (or `:headed`, `:ui`) for Playwright.
- `npm run validate:pre-push` — lint + stylelint + prettier check + unit + smoke; run before PRs.

## Coding Style & Naming
- TypeScript + React 19; prefer functional components and server actions where possible.
- Formatting: Prettier defaults, 2-space indent, trailing commas.
- Naming: PascalCase components; camelCase vars/functions; kebab-case route folders; tests end in `.test.ts[x]`/`.spec.ts[x]`.
- Styling: Tailwind with `clsx`/`cva`; centralize variants in `components/ui`.

## Testing Guidelines
- Unit/integration live in `tests/<area>`; favor MSW for HTTP stubs.
- Contracts: `ENABLE_CONTRACT_TESTS=true npm run test:contracts` when touching external APIs.
- E2E: specs in `e2e/`; prefer `data-testid` selectors; capture traces when adjusting flows.
- Coverage: keep new work at or above existing lines coverage; verify with `npm run test:coverage`.

## Commit & PR Guidelines
- Commits: short, imperative summaries (see `git log`); group logical changes.
- PRs: state problem, approach, and tests; link issues; attach screenshots for UI; call out schema/env changes.
- Before opening: run `npm run validate:pre-push`; for critical surface areas consider `npm run test:all`.

## Security & Config Tips
- Never commit secrets; copy `.env.local.example` to `.env.local` and keep keys (Anthropic, Supabase, Upstash) rotated.
- `npm run security:audit` for dependency checks; `npm run security:secrets` to catch accidental tokens.
- Avoid `eval`/dynamic require patterns; use vetted imports as enforced by ESLint security rules.
