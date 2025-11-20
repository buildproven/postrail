# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Development
npm run dev              # Start Next.js dev server with Turbopack
npm run build           # Production build
npm run start           # Start production server

# Code Quality
npm run lint            # Run ESLint
npm run lint:fix        # Auto-fix ESLint and Stylelint issues
npm run format          # Format with Prettier
npm run format:check    # Check Prettier formatting

# Testing
npm test                # Run Vitest unit tests once
npm run test:watch      # Vitest in watch mode
npm run test:ui         # Vitest UI interface
npm run test:coverage   # Generate coverage report

npm run test:e2e        # Playwright E2E tests
npm run test:e2e:ui     # Playwright with UI
npm run test:e2e:headed # Playwright visible browser

# Security & Quality Validation
npm run security:audit    # Check npm dependencies
npm run security:secrets  # Scan for hardcoded secrets
npm run security:config   # Run security configuration
npm run validate:all      # Run comprehensive validation

# Git Hooks
npm run prepare          # Install Husky git hooks
```

## Node Version Requirements

**CRITICAL**: This project requires **Node 20+**. The `.npmrc` enforces this via `engine-strict=true`.

```bash
# Check version
node --version  # Must be v20.x.x+

# If using nvm
nvm use
```

## Architecture & Key Patterns

### Authentication Flow (Supabase)

**Three-Layer Architecture**:

1. **Client-side** (`lib/supabase/client.ts`): Browser components use `createClient()`
2. **Server-side** (`lib/supabase/server.ts`): Server Components/API routes use async `createClient()`
3. **Middleware** (`lib/supabase/middleware.ts`): Session refresh via `updateSession()`

**Middleware Protection**:

- Routes starting with `/dashboard/*` require authentication → redirect to `/auth/login` if not authenticated
- Routes starting with `/auth/*` redirect authenticated users → redirect to `/dashboard`
- Middleware runs on ALL routes except static files (via `config.matcher`)

### API Route Patterns

**Authentication Check** (all API routes):

```typescript
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**SSRF Protection** (`/api/scrape`):

- DNS resolution to IP addresses before fetching
- Private IP range blocking (localhost, 192.168.x.x, AWS metadata, etc.)
- Zero redirects (`maxRedirects: 0`) to prevent 302-based bypasses
- No domain allowlist (users may have newsletters on ANY domain)

**AI Generation** (`/api/generate-posts`):

- Parallel post generation (3 platforms × 2 post types = 6 posts)
- Timeout protection (30s per post)
- Transaction-safe: rollback newsletter creation if posts fail to save
- Fail-fast validation: check `ANTHROPIC_API_KEY` at module load and runtime

### Database Schema

**Key Tables**:

- `newsletters`: User's imported newsletters (title, content, status)
- `social_posts`: Generated posts per platform (platform, post_type, content, scheduled_time, status)

**Relationships**:

- One newsletter → Many social_posts (6 posts per newsletter: 3 platforms × 2 types)

### Component Patterns

**shadcn/ui Components**:

- Located in `components/ui/` (button, input, card, badge, etc.)
- Use Radix UI primitives with Tailwind styling
- Configured via `components.json`

**Custom Components**:

- `newsletter-editor.tsx`: Tiptap rich text editor for newsletter content
- `post-preview-card.tsx`: Social post preview with character count badges

## Testing Strategy

**Current State**: Placeholder tests (72 tests, 28 real, 44 placeholders)

**Real Tests**:

- SSRF protection validation (12 tests in `tests/api/scrape.test.ts`)
- PostPreviewCard component (16 tests)

**Placeholder Tests** (validate business logic, NOT actual code):

- API routes: Test logic patterns without importing actual route handlers
- Components: Test calculations without rendering components
- Integration: Test business rules without Supabase/Anthropic mocking

**When Writing New Tests**:

- Unit tests: Import and test actual components/functions
- API tests: Mock `@/lib/supabase/server` and external services (axios, Anthropic)
- Integration tests: Use Playwright for end-to-end flows
- Always mock external dependencies (Supabase, Anthropic, axios)

## Environment Variables

**Required for Development** (see `.env.local.example`):

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `ANTHROPIC_API_KEY`: Claude API key for post generation

**Optional** (for future OAuth implementation):

- `LINKEDIN_CLIENT_ID/SECRET`: LinkedIn OAuth
- `META_APP_ID/SECRET`: Facebook/Threads OAuth
- `NEXTAUTH_SECRET/URL`: NextAuth configuration
- `UPSTASH_REDIS_*/QSTASH_*`: Queue system (future scheduling feature)

## Critical Implementation Details

### AI Post Generation Strategy

**Pre-CTA Posts** (24-8 hours before newsletter):

- Create FOMO, urgency, curiosity
- Tease 3-5 key insights without revealing everything
- Clear CTA: "Sign up so you don't miss it"

**Post-CTA Posts** (48-72 hours after newsletter):

- Reframe as valuable resource (guide/playbook/blueprint)
- List 3-4 specific outcomes/benefits
- Engagement trigger: "Comment [WORD] to get access"

**Platform Tones**:

- **LinkedIn**: Professional, ROI-focused, sparse emojis (1-2), 3-5 hashtags
- **Threads**: Conversational, casual, liberal emojis (2-3), question hooks
- **Facebook**: Story-driven, community-focused, moderate emojis (1-2)

**Character Limits**:

- LinkedIn: 3000 (target 70% = 2100)
- Threads: 500 (target 70% = 350)
- Facebook: 63206 (target 70% = 44244)

### URL Scraping with Mozilla Readability

Uses `@mozilla/readability` (same as Firefox Reader Mode) for intelligent content extraction:

- Automatically finds article content
- Removes ads, navigation, footers
- Preserves paragraph structure
- Cleans up whitespace while keeping readability

### Security Considerations

**SSRF Protection Implementation**:

1. Parse URL and validate protocol (HTTP/HTTPS only)
2. Resolve hostname to IP via DNS
3. Block private IP ranges (RFC 1918, link-local, localhost)
4. Fetch with `maxRedirects: 0` to prevent bypass
5. Limit response size to 5MB

**Authentication**:

- All `/api/*` routes check for authenticated user
- Middleware handles session refresh and route protection
- No API keys or secrets in client-side code

## Common Development Patterns

### Running a Single Test

```bash
# Run specific test file
npm test -- tests/api/scrape.test.ts

# Run tests matching pattern
npm test -- --grep "SSRF"
```

### Adding a New API Route

1. Create route handler in `app/api/[route]/route.ts`
2. Add authentication check at the top
3. Validate input with Zod schema (if using forms)
4. Use `createClient()` from `@/lib/supabase/server` for database access
5. Handle errors with appropriate HTTP status codes
6. Add corresponding tests in `tests/api/`

### Adding a New shadcn/ui Component

```bash
npx shadcn@latest add [component-name]
# This adds the component to components/ui/
```

### Working with Supabase

**Server Components/API Routes**:

```typescript
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient() // Note: async
```

**Client Components**:

```typescript
import { createClient } from '@/lib/supabase/client'
const supabase = createClient() // Note: synchronous
```

## Project Structure Logic

```
app/
├── (auth)/              # Authentication pages (route group, no layout)
│   ├── login/
│   ├── signup/
│   └── reset-password/
├── (dashboard)/         # Protected dashboard (route group with dashboard layout)
│   ├── layout.tsx       # Dashboard-specific layout
│   ├── page.tsx         # Dashboard home
│   ├── newsletters/     # Newsletter management
│   ├── platforms/       # Platform connections (stub)
│   └── settings/        # User settings (stub)
├── api/                 # API routes
│   ├── scrape/          # URL scraping with SSRF protection
│   └── generate-posts/  # AI post generation
└── layout.tsx           # Root layout

lib/
├── supabase/            # Supabase client configuration
│   ├── client.ts        # Browser client
│   ├── server.ts        # Server client
│   └── middleware.ts    # Session refresh & route protection
└── utils.ts             # Utility functions (cn, etc.)

components/
├── ui/                  # shadcn/ui components
└── *.tsx                # Custom components

tests/
├── setup.ts             # Vitest configuration
├── api/                 # API route tests
├── components/          # Component tests
└── integration/         # Integration tests
```

## Development Roadmap Context

**Current Phase**: Week 2 - AI Generation (partially complete)

- ✅ Newsletter input module
- ✅ Claude AI integration
- ✅ Post generation for 3 platforms
- ⏳ Platform OAuth + posting
- ⏳ Scheduling system
- ⏳ Analytics dashboard

**Future Phases**:

- Week 3-4: LinkedIn, Threads, Facebook OAuth + posting APIs
- Week 5: Upstash Redis queue + QStash scheduling
- Week 6: Analytics dashboard + PWA setup
