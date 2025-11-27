# Postrail

AI-powered social media automation for newsletter creators.

## What is Postrail?

Postrail automatically generates and schedules social media posts to promote your newsletters across LinkedIn, Threads, and Facebook. Using AI, it creates platform-specific content that drives engagement and grows your subscriber base.

## Features

- **AI Post Generation**: Automatically create optimized posts for each platform
- **Smart Scheduling**: Pre-CTA (before newsletter) and Post-CTA (after newsletter) posting strategy
- **Multi-Platform**: LinkedIn, Threads, and Facebook integration
- **Character Limit Enforcement**: Never exceed platform limits
- **Analytics**: Track performance across all platforms
- **URL Scraping**: Import newsletters directly from beehiiv, Substack, or custom URLs
- **Enterprise Security**: Rate limiting, SSRF protection, comprehensive monitoring
- **Production-Ready Observability**: Structured logging, metrics collection, health checks
- **Idempotent Operations**: Prevent duplicate posts and ensure data consistency

## Getting Started

### Prerequisites

- **Node.js 20+** and npm (check with `node --version`)
- Supabase account (for database and auth)
- Anthropic API key (for Claude AI)
- Platform OAuth credentials (LinkedIn, Meta)

**Important**: This project requires Node 20+. If using nvm:

```bash
nvm use 20
```

### Installation

```bash
# Verify Node version (must be 20+)
node --version

# Install dependencies (will fail on Node < 20 due to .npmrc)
npm install

# Copy environment variables
cp .env.local.example .env.local

# Edit .env.local with your credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **AI**: Anthropic Claude API
- **Queue**: Upstash Redis + QStash
- **Security**: Multi-layer protection (Rate limiting, SSRF protection, Observability)
- **Hosting**: Render (free tier) or Railway

## Project Structure

```
postrail/
├── app/                  # Next.js app directory
│   ├── (auth)/          # Authentication pages
│   ├── (dashboard)/     # Protected dashboard pages
│   ├── api/             # API routes (with security middleware)
│   └── layout.tsx       # Root layout
├── components/          # React components
│   ├── ui/             # shadcn/ui components
│   └── ...             # Custom components
├── lib/                # Utility functions & security modules
│   ├── supabase/       # Supabase client
│   ├── rate-limiter.ts # Rate limiting with deduplication
│   ├── ssrf-protection.ts # Server-side request forgery protection
│   ├── observability.ts   # Structured logging & monitoring
│   ├── env-validator.ts   # Environment validation
│   ├── ai/             # AI post generation
│   └── platforms/      # Platform API integrations
├── docs/               # Comprehensive documentation
│   ├── ARCHITECTURE.md     # System architecture & data flow
│   ├── OPERATIONAL_RUNBOOK.md # Operations & incident response
│   ├── GETTING_STARTED.md
│   ├── SETUP_SUPABASE.md
│   ├── TESTING.md
│   └── WEEK_2_COMPLETE.md
└── public/            # Static assets
```

## Development Roadmap

### Phase 1: Foundation (Week 1) ✅

- [x] Project setup
- [x] Basic authentication
- [x] Database schema

### Phase 2: AI Generation (Week 2)

- [ ] Newsletter input module
- [ ] Claude AI integration
- [ ] Post generation for 3 platforms

### Phase 3: Platform Integration (Weeks 3-4)

- [ ] LinkedIn OAuth + posting
- [ ] Threads OAuth + posting
- [ ] Facebook OAuth + posting

### Phase 4: Scheduling (Week 5)

- [ ] Queue system setup
- [ ] Automated scheduling
- [ ] Background job processing

### Phase 5: Analytics & Polish (Week 6)

- [ ] Analytics dashboard
- [ ] Performance tracking
- [ ] PWA setup

## Documentation

### Architecture & Operations

- [System Architecture](./docs/ARCHITECTURE.md) - Data flow and security design
- [Operational Runbook](./docs/OPERATIONAL_RUNBOOK.md) - Key rotation and incident response

### Development Guides

- [Getting Started](./docs/GETTING_STARTED.md)
- [Supabase Setup](./docs/SETUP_SUPABASE.md)
- [Testing Guide](./docs/TESTING.md)
- [Week 2 Progress](./docs/WEEK_2_COMPLETE.md)

### Security Features

- **Rate Limiting**: 3 requests/minute, 10/hour per user with content deduplication
- **SSRF Protection**: DNS validation, private IP blocking, port filtering
- **Observability**: Request tracing, metrics collection, health monitoring
- **Idempotency**: Optimistic locking prevents duplicate operations

## License

MIT License - see LICENSE file for details

## Contributing

This is currently a personal project. If you're interested in contributing, please open an issue first to discuss proposed changes.

## Support

For questions or issues, please open a GitHub issue.

---

**Built with ❤️ for newsletter creators**
