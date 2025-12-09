# Repository Guidelines

## Project Structure & Modules

- `app/` Next.js App Router pages, layouts, and server actions; keep route-level components colocated with page-specific styles.
- `components/` shared React components; prefer feature folders to avoid a single mega-index.
- `lib/` domain helpers (Supabase, AI, schedulers), `data/` static seeds/config, `scripts/` automation, `middleware.ts` edge guards, `next.config.ts` build settings.
- `tests/` unit/integration (Vitest), `e2e/` Playwright specs; `docs/` architecture/testing/deploy notes; design tokens live in `components.json`.

## Build, Test, and Development Commands

- `npm run dev` start Next.js with Turbopack.
- `npm run build` production build; `npm start` serves the build.
- `npm run lint` ESLint; `npm run type-check` TS without emit.
- `npm test` Vitest suite; `npm run test:fast|medium|slow` tiered subsets; `npm run test:coverage` generates coverage.
- `npm run test:e2e` Playwright; add `:ui` or `:headed` to debug.
- `npm run security:audit` dependency audit; `npm run security:secrets` quick secret scan.
- Pre-push: `npm run validate:pre-push` (lint + stylelint + format check + tests + smoke).

## Coding Style & Naming Conventions

- TypeScript-first; React components in `.tsx`. Use Prettier + ESLint; run `npm run lint:fix` before pushing.
- Components/contexts/providers: `PascalCase`; hooks: `useCamelCase`; utilities/constants: `camelCase`/`SCREAMING_SNAKE_CASE`.
- Keep server/client boundaries explicit with `\"use client\"` where needed; avoid mixing in shared modules.
- Tailwind for styling; favor composition (`class-variance-authority`, `tailwind-merge`) over ad-hoc inline styles.

## Testing Guidelines

- Vitest for units/integration (`*.test.tsx?/ts`); prefer colocating near source or under `tests/`.
- Use Playwright for user flows in `e2e/`; align fixtures with `playwright.config.ts`.
- Aim for coverage on new code; add contract tests under `tests/contracts` when touching integrations.
- Run `npm run test:smart` on PRs to pick the right subset when iterating.

## Commit & Pull Request Guidelines

- Commit messages are short and action-oriented (e.g., `fix:`, `chore:`, `feat:`) as seen in history; batch related changes.
- PRs should describe scope, risks, and validation; link issues/cards; include screenshots for UI and logs for backend changes.
- Ensure `npm run validate:pre-push` is green; mention any skipped checks and why.

## Security & Configuration

- Copy `.env.local.example` to `.env.local`; never commit secrets. Keep API keys out of logs.
- Sentry configs (`sentry.*.config.ts`) and middleware enforce observability/edge rules—preserve them when refactoring.
- Use `npm run security:audit` before releases and when bumping dependencies; prefer minimal surface changes in `next.config.ts`.
