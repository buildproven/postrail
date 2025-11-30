# Deployment Guide

## Overview

This guide covers deploying Postrail to production.

## Prerequisites

- Node.js 20+
- Supabase account
- Anthropic API key
- Vercel account (recommended)

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJ...` |
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-...` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `LINKEDIN_CLIENT_ID/SECRET` | LinkedIn OAuth | - |
| `META_APP_ID/SECRET` | Facebook/Threads OAuth | - |
| `UPSTASH_REDIS_*` | Queue system | - |

## Deployment Options

### Option 1: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add ANTHROPIC_API_KEY
```

### Option 2: Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Database Setup (Supabase)

1. Create a Supabase project
2. Run migrations from `supabase/migrations/`
3. Configure Row Level Security policies
4. Set up authentication providers

## Verification

After deployment, verify:

1. **Health Check**: Visit the home page
2. **Authentication**: Test login/signup flow
3. **AI Generation**: Create a test post
4. **Platform Posting**: Test Twitter integration

## Security Checklist

- [ ] Environment variables set (not in code)
- [ ] HTTPS enabled
- [ ] Rate limiting configured
- [ ] SSRF protection active
- [ ] Error messages don't expose internals

---

> Last Updated: 2025-11-29

