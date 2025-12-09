# Postrail

[![CI](https://github.com/vibebuildlab/postrail/actions/workflows/ci.yml/badge.svg)](https://github.com/vibebuildlab/postrail/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/node-20%2B-brightgreen)](https://nodejs.org)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org)

AI-powered social media automation for newsletter creators. Automatically generate and schedule social media posts to promote your newsletters across LinkedIn, Threads, Facebook, and Twitter.

---

> **Maintainer & Ownership**
> This project is maintained by **Vibe Build Lab LLC**, a studio focused on AI-assisted product development, micro-SaaS, and "vibe coding" workflows for solo founders and small teams.
> Learn more at **https://www.vibebuildlab.com**.

---

## Features

- **AI Post Generation** - Automatically create optimized posts for each platform using Claude AI
- **Smart Scheduling** - Pre-CTA (before newsletter) and Post-CTA (after newsletter) posting strategy with QStash
- **Multi-Platform Posting** - Full support for Twitter/X, LinkedIn, and Facebook
  - OAuth 1-click connect or BYOK (Bring Your Own Keys)
  - Automated posting via Upstash QStash
- **Newsletter Scraping** - Import from beehiiv, Substack, or custom URLs
- **Character Limit Enforcement** - Never exceed platform limits
- **Enterprise Security** - Rate limiting, SSRF protection, comprehensive monitoring
- **Production-Ready** - Structured logging, metrics collection, health checks, CI/CD
- **Idempotent Operations** - Prevent duplicate posts and ensure data consistency

## Target Users

- **Newsletter creators** who want to grow their audience on social media
- **Content marketers** managing newsletter promotion campaigns
- **Solopreneurs** who need to automate repetitive posting tasks
- **Agencies** managing multiple newsletter clients

## Pricing & Licensing

| Tier         | Price             | Features                                           |
| ------------ | ----------------- | -------------------------------------------------- |
| **Standard** | $29/mo or $290/yr | Core features, 4 platforms                         |
| **Growth**   | $59/mo or $590/yr | Unlimited newsletters, analytics, priority support |

**Trial**: 14-day free trial (no credit card required)

> **Note**: Postrail is a standalone product and is **not** included in Vibe Lab Pro. VLP members receive a **25% discount** on all tiers.

- 3 generations per day
- 10 generations total during trial

**Lifetime Deal**: $199 (limited to first 100 users)

### License

Commercial License - see [LICENSE](LICENSE) for details.

## Tech Stack

| Layer         | Technology                                    |
| ------------- | --------------------------------------------- |
| **Framework** | Next.js 15 (App Router)                       |
| **Language**  | TypeScript                                    |
| **Database**  | Supabase (PostgreSQL)                         |
| **Auth**      | Supabase Auth                                 |
| **AI**        | Anthropic Claude API                          |
| **Queue**     | Upstash Redis + QStash                        |
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
- `ANTHROPIC_API_KEY` - Claude API key

**Optional:**

- `LINKEDIN_CLIENT_ID/SECRET` - LinkedIn OAuth
- `META_APP_ID/SECRET` - Facebook/Threads OAuth
- `UPSTASH_REDIS_*` - Queue system

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

## Roadmap

### Phase 1: Foundation ✅

- [x] Project setup
- [x] Basic authentication
- [x] Database schema

### Phase 2: AI Generation (Current)

- [x] Newsletter input module
- [x] Claude AI integration
- [x] Post generation for 4 platforms

### Phase 3: Platform Integration

- [x] Twitter/X OAuth + posting (BYOK)
- [ ] LinkedIn OAuth + posting
- [ ] Threads OAuth + posting
- [ ] Facebook OAuth + posting

### Phase 4: Scheduling

- [ ] Queue system setup
- [ ] Automated scheduling
- [ ] Background job processing

### Phase 5: Analytics & Polish

- [ ] Analytics dashboard
- [ ] Performance tracking
- [ ] PWA setup

## Documentation

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) – System architecture and key patterns
- [docs/TESTING.md](./docs/TESTING.md) – Testing strategy and guidelines
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) – Deployment guide

## Contributing

This is currently a personal project. If you're interested in contributing, please open an issue first to discuss proposed changes.

## License

Commercial License - see [LICENSE](LICENSE) for details.

## Legal

- [Privacy Policy](https://vibebuildlab.com/privacy-policy)
- [Terms of Service](https://vibebuildlab.com/terms)

---

> **Vibe Build Lab LLC** · [vibebuildlab.com](https://vibebuildlab.com)
