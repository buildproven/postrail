#!/usr/bin/env bash
set -euo pipefail
npm_config_cache=.npm-cache npm run lint
npm_config_cache=.npm-cache npm test
npm_config_cache=.npm-cache npx vitest run tests/api/scrape.real.test.ts
npm_config_cache=.npm-cache npx vitest run tests/api/generate-posts.real.test.ts
npm_config_cache=.npm-cache npx vitest run tests/security/twitter-idempotency.test.ts
