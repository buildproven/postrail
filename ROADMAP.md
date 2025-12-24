# PostRail Roadmap

Strategic direction and future plans for PostRail - AI-powered newsletter-to-social automation.

## Vision

Become the go-to tool for newsletter creators to amplify their reach across social platforms with zero manual effort.

## Strategic Priorities

1. **Revenue First** - Complete billing activation, optimize conversion funnel
2. **Platform Coverage** - Full OAuth for all 4 platforms (Twitter, LinkedIn, Facebook, Threads)
3. **Automation** - True set-and-forget scheduling with QStash
4. **Retention** - Analytics dashboard showing ROI to justify subscription

---

## Phase 1: Foundation ✅

- [x] Next.js 15 App Router setup
- [x] Supabase authentication (email/GitHub/Google)
- [x] Database schema and RLS policies
- [x] Security infrastructure (rate limiting, SSRF protection)

## Phase 2: Core Product ✅

- [x] Newsletter import (URL scraping, beehiiv, Substack)
- [x] Claude AI post generation (4 platforms × 2 post types)
- [x] Character limit optimization per platform
- [x] Post preview and editing

## Phase 3: Monetization ✅

- [x] Trial system (14-day, 3/day, 10 total)
- [x] Stripe billing infrastructure
- [x] Multi-tier subscriptions (Standard $29, Growth $59)
- [x] Feature gating by subscription tier
- [x] Billing portal and webhook handling

## Phase 4: Platform Integration (Current)

- [x] Twitter/X posting (BYOK)
- [ ] Twitter OAuth 1-click connect
- [ ] LinkedIn OAuth + posting
- [ ] Facebook OAuth + posting
- [ ] Threads OAuth + posting

## Phase 5: Scheduling & Automation ✅

- [x] QStash queue integration
- [x] Pre-CTA scheduling (8-24h before newsletter)
- [x] Post-CTA scheduling (48-72h after newsletter)
- [x] Timezone-aware scheduling (auto-detect + manual override)
- [x] Retry logic for failed posts (exponential backoff: 1m → 5m → 30m)
- [x] Smart timing by platform (optimal posting hours)
- [x] Manual retry API for failed posts

## Phase 6: Analytics & Growth ✅

- [x] Post performance tracking (by status, platform)
- [x] Platform engagement metrics (placeholder for OAuth)
- [x] Usage analytics dashboard
- [x] Publishing velocity metrics
- [x] A/B testing for post variants

## Phase 7: Scale & Polish

- [ ] Team/agency accounts
- [ ] Bulk newsletter import
- [x] Custom AI tone/voice settings
- [ ] API for power users
- [ ] Mobile app (PWA)

---

## Non-Goals (Intentionally Out of Scope)

- Full social media management (we focus on newsletter promotion only)
- Content calendar across all content types
- Competitor analysis tools
- Influencer management

---

_Updated: 2025-12-24_
