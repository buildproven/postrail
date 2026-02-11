# Postrail

[![CI](https://github.com/buildproven/postrail/actions/workflows/ci.yml/badge.svg)](https://github.com/buildproven/postrail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built by BuildProven](https://img.shields.io/badge/Built%20by-BuildProven-blueviolet)](https://buildproven.ai)
[![Node.js 20+](https://img.shields.io/badge/node-20%2B-brightgreen)](https://nodejs.org)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org)

AI-powered social media automation for newsletter creators. Automatically generate and schedule social media posts to promote your newsletters across LinkedIn, Facebook, and Twitter/X.

**Open Source Showcase** - This is a production-ready SaaS application built in under a week using AI-assisted development. Feel free to fork, deploy to your own cloud account, or use as a reference for your own projects.

---

> **Built by [BuildProven](https://buildproven.ai)**
> AI-assisted product development for experienced professionals. Built by Brett Stark.

---

## Features

- **AI Post Generation** - Automatically create optimized posts for each platform using Claude AI
- **Smart Scheduling** - Pre-CTA (before newsletter) and Post-CTA (after newsletter) posting strategy with QStash delivery
- **Multi-Platform Posting** - Full support for Twitter/X, LinkedIn, and Facebook
  - OAuth 1-click connect or BYOK (Twitter)
  - Automated posting and queueing via Upstash QStash
- **Newsletter Scraping** - Import from beehiiv, Substack, or custom URLs
- **Character Limit Enforcement** - Never exceed platform limits
- **Billing Ready** - Stripe checkout, portal, and subscription status APIs
- **Enterprise Security** - Rate limiting, SSRF protection, comprehensive monitoring
- **Production-Ready** - Structured logging, metrics collection, health checks, CI/CD
- **Idempotent Operations** - Prevent duplicate posts and ensure data consistency

## Target Users

- **Newsletter creators** who want to grow their audience on social media
- **Content marketers** managing newsletter promotion campaigns
- **Solopreneurs** who need to automate repetitive posting tasks
- **Agencies** managing multiple newsletter clients

## Deploy to Your Own Cloud Account

This project is **open source** and can be deployed to your own cloud infrastructure. Required services:

- **Supabase** (free tier available) - Database + authentication
- **Anthropic API** (pay-as-you-go) - AI post generation
- **Upstash** (optional, free tier) - Post scheduling (QStash) + rate limiting (Redis)
- **Hosting platform** - Vercel, Railway, Render, or Fly.io

**Important:** This is not "self-hostable" in the traditional sense (running on your own hardware without external dependencies). It requires cloud service accounts for database, authentication, and AI generation. You control your own deployment and API keys, but the app depends on external cloud services.

**For independent deployments:** All billing/trial limits are disabled by default. Set `BILLING_ENABLED=false` (default) to give all users unlimited "growth" tier access (all features, no limits).

See the [Installation](#installation) section for setup instructions.

### License

MIT License - see [LICENSE](LICENSE) for details. Free to use, modify, and distribute.

## Tech Stack

| Layer         | Technology                                    |
| ------------- | --------------------------------------------- |
| **Framework** | Next.js 16 (App Router)                       |
| **Language**  | TypeScript                                    |
| **Database**  | Supabase (PostgreSQL)                         |
| **Auth**      | Supabase Auth                                 |
| **AI**        | Anthropic Claude API                          |
| **Queue**     | Upstash Redis + QStash (scheduling/publish)   |
| **Styling**   | Tailwind CSS + shadcn/ui                      |
| **Testing**   | Vitest + Playwright                           |
| **Security**  | Rate limiting, SSRF protection, observability |

## Getting Started

### Prerequisites

- **Node.js 20+** (enforced via `.npmrc`)
- Supabase account
- Anthropic API key
- Platform OAuth credentials (LinkedIn, Meta)

### Installation

```bash
# Verify Node version (must be 20+)
node --version

# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local

# Edit .env.local with your credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Environment Variables

**Required:**

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role (server-side tasks)
- `ANTHROPIC_API_KEY` - Claude API key
- `ENCRYPTION_KEY` - 64 hex chars for OAuth token encryption
- `COOKIE_SECRET` - Random secret for OAuth state signing

**Recommended for Production:**

- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` - Rate limiter backend
- `QSTASH_TOKEN` / `QSTASH_PROCESS_URL` / `QSTASH_CURRENT_SIGNING_KEY` - Scheduling

**Optional:**

- `BILLING_ENABLED` - Set to `true` to enable billing/trial limits (disabled by default)
- `STRIPE_SECRET_KEY` - Stripe secret (only if billing enabled)
- `STRIPE_PRICE_STANDARD` / `STRIPE_PRICE_GROWTH` - Stripe price IDs
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signature secret
- `LINKEDIN_CLIENT_ID/SECRET` - LinkedIn OAuth
- `META_APP_ID/SECRET` - Facebook OAuth
- `RATE_LIMIT_MODE` - `auto` (default) | `redis` | `memory` | `disabled`
- `SENTRY_DSN` - Error monitoring

## Usage Example

### Workflow

1. **Import Newsletter** - Paste your newsletter URL or enter content directly
2. **AI Generates Posts** - 8 posts created (4 platforms × 2 post types)
3. **Review & Edit** - Customize generated content as needed
4. **Schedule** - Set optimal posting times for each platform
5. **Publish** - Posts go out automatically at scheduled times

### AI Post Strategy

**Pre-CTA Posts** (24-8 hours before newsletter):

- Create FOMO, urgency, curiosity
- Tease 3-5 key insights
- Clear CTA: "Sign up so you don't miss it"

**Post-CTA Posts** (48-72 hours after newsletter):

- Reframe as valuable resource
- List 3-4 specific outcomes
- Engagement trigger: "Comment [WORD] to get access"

## Development Commands

| Command                  | Purpose                         |
| ------------------------ | ------------------------------- |
| `npm run dev`            | Start dev server with Turbopack |
| `npm run lint`           | Run ESLint                      |
| `npm test`               | Run Vitest unit tests           |
| `npm run test:e2e`       | Playwright E2E tests            |
| `npm run test:coverage`  | Generate coverage report        |
| `npm run security:audit` | Check npm dependencies          |
| `npm run ci:local`       | Run all CI checks locally       |

**Note:** If GitHub Actions CI fails due to billing issues, run `npm run ci:local` to verify all checks pass locally before merging.

## Roadmap

### Phase 1: Foundation ✅

- [x] Project setup
- [x] Basic authentication
- [x] Database schema

### Phase 2: AI Generation ✅

- [x] Newsletter input module
- [x] Claude AI integration
- [x] Post generation for 4 platforms

### Phase 3: Monetization ✅

- [x] Trial system (14-day, 3/day, 10 total)
- [x] Stripe billing infrastructure
- [x] Multi-tier subscriptions (Standard $29, Growth $59)

### Phase 4: Platform Integration (Current)

- [x] Twitter/X posting (BYOK + OAuth)
- [x] LinkedIn OAuth + posting
- [x] Facebook OAuth + posting
- [ ] Threads OAuth + posting (pending Meta API)

### Phase 5: Scheduling & Automation ✅

- [x] QStash queue integration
- [x] Pre-CTA/Post-CTA scheduling
- [x] Timezone-aware scheduling
- [x] Retry logic with exponential backoff

### Phase 6: Analytics & Growth ✅

- [x] Usage analytics dashboard
- [x] Post performance tracking
- [x] A/B testing for post variants
- [x] Custom AI tone/voice settings

## Documentation

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) – System architecture and key patterns
- [docs/TESTING.md](./docs/TESTING.md) – Testing strategy and guidelines
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) – Deployment guide

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- Open an issue to discuss proposed changes
- Fork the repo and submit a pull request
- Follow the existing code style and test requirements

## License

MIT License - see [LICENSE](LICENSE) for details.

---

> **[BuildProven](https://buildproven.ai)** · Built by Brett Stark
