# Deployment Guide

This guide covers deploying PostRail to your own infrastructure. PostRail is open source and designed for self-hosting - you control your data and API keys.

> **Built by [Vibe Build Lab](https://vibebuildlab.com)** - AI-assisted product development for solo founders and small teams.

## Deployment Options Overview

| Option | Best For | Estimated Monthly Cost | Complexity |
|--------|----------|----------------------|------------|
| **Vercel** (Recommended) | Production deployments | $0-20 (free tier) | Easy |
| **Railway** | Full-stack simplicity | $5-20 | Easy |
| **Docker** | Custom infrastructure | Varies | Medium |
| **Local** | Development/testing | $0 (+ API costs) | Easy |

**Note:** All options require external services (Supabase, Anthropic API). See [External Services](#external-services-setup) below.

---

## Quick Start (5 Minutes)

### 1. Clone and Install

```bash
git clone https://github.com/vibebuildlab/postrail.git
cd postrail
npm install
```

### 2. Set Up Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials (see [Required Environment Variables](#required-environment-variables)).

### 3. Generate Encryption Key

```bash
npx tsx scripts/generate-encryption-key.ts
# Or: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the generated key to `.env.local` as `ENCRYPTION_KEY`.

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## External Services Setup

PostRail requires external cloud services. Here's how to set up each one:

### Supabase (Database + Auth) - Required

**Cost:** Free tier available (sufficient for most use cases)

1. Create account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to **Project Settings > API** and copy:
   - `NEXT_PUBLIC_SUPABASE_URL` - Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` - service_role key (keep secret!)
4. Apply database migrations:
   ```bash
   # Install Supabase CLI
   npm install -g supabase

   # Link to your project
   supabase link --project-ref YOUR_PROJECT_ID

   # Apply migrations
   supabase db push
   ```

### Anthropic Claude API (AI Generation) - Required

**Cost:** Pay-as-you-go (~$0.01-0.05 per newsletter processed)

1. Create account at [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys** and create a new key
3. Add to `.env.local` as `ANTHROPIC_API_KEY`

### Social Platform OAuth - Optional but Recommended

For 1-click social posting, set up OAuth credentials:

#### Twitter/X
1. Go to [developer.twitter.com](https://developer.twitter.com)
2. Create a project and app
3. Enable OAuth 2.0 with Read and Write permissions
4. Add callback URL: `{YOUR_URL}/api/platforms/twitter/callback`
5. Copy Client ID and Secret to `.env.local`

#### LinkedIn
1. Go to [linkedin.com/developers](https://www.linkedin.com/developers/apps)
2. Create an app and verify with a Company Page
3. Add products: "Share on LinkedIn" + "Sign In with LinkedIn"
4. Add callback URL: `{YOUR_URL}/api/platforms/linkedin/callback`
5. Copy Client ID and Secret to `.env.local`

#### Facebook
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create a Business app
3. Add "Facebook Login for Business" product
4. Add callback URL: `{YOUR_URL}/api/platforms/facebook/callback`
5. Copy App ID and Secret to `.env.local`

### Upstash (Rate Limiting + Scheduling) - Optional

**Cost:** Free tier available

For production deployments with multiple instances:

1. Create account at [upstash.com](https://upstash.com)
2. Create a Redis database for rate limiting
3. Create a QStash instance for post scheduling
4. Add credentials to `.env.local`

---

## Required Environment Variables

| Variable | Description | How to Get |
|----------|-------------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key | Supabase Dashboard > Settings > API |
| `ANTHROPIC_API_KEY` | Claude API key | console.anthropic.com > API Keys |
| `ENCRYPTION_KEY` | 64 hex chars for token encryption | `npx tsx scripts/generate-encryption-key.ts` |
| `COOKIE_SECRET` | Random secret (32+ chars) | Any password generator |
| `NEXT_PUBLIC_APP_URL` | Your app URL | Your domain (no trailing slash) |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BILLING_ENABLED` | Enable Stripe billing | `false` (all features unlocked) |
| `RATE_LIMIT_MODE` | Rate limiting strategy | `auto` |
| `UPSTASH_REDIS_REST_URL` | Redis URL for rate limiting | None (uses memory) |
| `QSTASH_TOKEN` | QStash token for scheduling | None (scheduling disabled) |

See `.env.local.example` for the complete list with detailed documentation.

---

## Deployment Platforms

### Vercel (Recommended)

Best for: Most users, automatic deployments, global CDN

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add ENCRYPTION_KEY
vercel env add COOKIE_SECRET
vercel env add NEXT_PUBLIC_APP_URL  # Set to your Vercel URL
```

Or connect your GitHub repo at [vercel.com/new](https://vercel.com/new) for automatic deployments.

**Important:** Set `NEXT_TRUST_PROXY=true` when deploying to Vercel.

### Railway

Best for: Simple full-stack deployment

1. Go to [railway.app](https://railway.app)
2. Click "New Project" > "Deploy from GitHub repo"
3. Select your forked PostRail repository
4. Add environment variables in the Railway dashboard
5. Railway auto-detects Next.js and deploys

**Important:** Set `NEXT_TRUST_PROXY=true` for Railway.

### Docker

Best for: Custom infrastructure, Kubernetes, self-managed servers

A production `Dockerfile` is included in the repo using multi-stage builds with standalone output for minimal image size.

Build and run:

```bash
# Build image
docker build -t postrail .

# Run with environment file
docker run -p 3000:3000 --env-file .env.production postrail

# Or with Docker Compose
docker-compose up -d
```

Example `docker-compose.yml`:

```yaml
version: '3.8'
services:
  postrail:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env.production
    restart: unless-stopped
```

### Fly.io

Best for: Global edge deployment

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Launch
fly launch

# Set secrets
fly secrets set NEXT_PUBLIC_SUPABASE_URL=...
fly secrets set ANTHROPIC_API_KEY=...
# ... add other required variables

# Deploy
fly deploy
```

---

## Billing Configuration

By default, **billing is disabled** (`BILLING_ENABLED=false`). All users get unlimited "Growth" tier access with all features.

### To Enable Billing (Optional)

If you want to monetize your deployment:

1. Create a [Stripe](https://stripe.com) account
2. Create products and prices for your tiers
3. Add to `.env.local`:
   ```
   BILLING_ENABLED=true
   STRIPE_SECRET_KEY=sk_...
   STRIPE_PRICE_STANDARD=price_...
   STRIPE_PRICE_GROWTH=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
4. Set up Stripe webhook pointing to `/api/webhooks/stripe`

---

## Database Migrations

Apply migrations to set up the database schema:

```bash
# Using Supabase CLI (recommended)
supabase link --project-ref YOUR_PROJECT_ID
supabase db push

# Or manually via Supabase Dashboard
# Go to SQL Editor and run each file in supabase/migrations/ in order
```

The migrations create:
- User profiles and settings
- Newsletter and post storage
- Platform connections (encrypted OAuth tokens)
- Usage tracking and analytics

---

## Verification Checklist

After deploying, verify these work:

- [ ] **Auth:** Can sign up/login with email
- [ ] **AI Generation:** Can generate posts from a newsletter URL
- [ ] **Platform Connect:** OAuth flows work for Twitter/LinkedIn/Facebook
- [ ] **Scheduling:** Posts can be scheduled (if QStash configured)
- [ ] **Health Check:** `/api/health` returns `200 OK`

---

## Cost Estimates

### Minimal Setup (Free Tier)
- Supabase: Free (up to 500MB database)
- Vercel: Free (hobby tier)
- Anthropic: ~$5-10/month (light usage)
- **Total: ~$5-10/month**

### Production Setup
- Supabase Pro: $25/month
- Vercel Pro: $20/month
- Anthropic: ~$20-50/month (moderate usage)
- Upstash: Free tier
- **Total: ~$65-95/month**

### High Volume
- Supabase Team: $599/month
- Vercel Enterprise: Custom
- Anthropic: Pay-as-you-go
- Upstash Pro: $10-50/month
- **Total: Varies based on usage**

---

## Troubleshooting

### "ENCRYPTION_KEY must be 64 hex characters"
```bash
npx tsx scripts/generate-encryption-key.ts
```

### "ANTHROPIC_API_KEY is invalid"
Ensure the key starts with `sk-ant-` and is from [console.anthropic.com](https://console.anthropic.com).

### "OAuth callback failed"
Check that your callback URLs match exactly:
- Twitter: `{NEXT_PUBLIC_APP_URL}/api/platforms/twitter/callback`
- LinkedIn: `{NEXT_PUBLIC_APP_URL}/api/platforms/linkedin/callback`
- Facebook: `{NEXT_PUBLIC_APP_URL}/api/platforms/facebook/callback`

### Rate limiting not working
For production with multiple instances, configure Upstash Redis:
```
RATE_LIMIT_MODE=redis
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

---

## Support

- **Issues:** [github.com/vibebuildlab/postrail/issues](https://github.com/vibebuildlab/postrail/issues)
- **Discussions:** [github.com/vibebuildlab/postrail/discussions](https://github.com/vibebuildlab/postrail/discussions)

---

> **[Vibe Build Lab](https://vibebuildlab.com)** - Building production-ready SaaS with AI-assisted development.
