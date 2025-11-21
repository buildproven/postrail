# LetterFlow

AI-powered social media automation for newsletter creators.

## What is LetterFlow?

LetterFlow automatically generates and schedules social media posts to promote your newsletters across LinkedIn, Threads, and Facebook. Using AI, it creates platform-specific content that drives engagement and grows your subscriber base.

## Features

- **AI Post Generation**: Automatically create optimized posts for each platform
- **Smart Scheduling**: Pre-CTA (before newsletter) and Post-CTA (after newsletter) posting strategy
- **Multi-Platform**: LinkedIn, Threads, and Facebook integration
- **Character Limit Enforcement**: Never exceed platform limits
- **Analytics**: Track performance across all platforms
- **URL Scraping**: Import newsletters directly from beehiiv, Substack, or custom URLs

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
- **Hosting**: Render (free tier) or Railway

## Project Structure

```
letterflow/
├── app/                  # Next.js app directory
│   ├── (auth)/          # Authentication pages
│   ├── (dashboard)/     # Protected dashboard pages
│   ├── api/             # API routes
│   └── layout.tsx       # Root layout
├── components/          # React components
│   ├── ui/             # shadcn/ui components
│   └── ...             # Custom components
├── lib/                # Utility functions
│   ├── supabase/       # Supabase client
│   ├── ai/             # AI post generation
│   └── platforms/      # Platform API integrations
├── docs/               # Project documentation
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

- [Getting Started](./docs/GETTING_STARTED.md)
- [Supabase Setup](./docs/SETUP_SUPABASE.md)
- [Testing Guide](./docs/TESTING.md)
- [Week 2 Progress](./docs/WEEK_2_COMPLETE.md)

## License

MIT License - see LICENSE file for details

## Contributing

This is currently a personal project. If you're interested in contributing, please open an issue first to discuss proposed changes.

## Support

For questions or issues, please open a GitHub issue.

---

**Built with ❤️ for newsletter creators**
