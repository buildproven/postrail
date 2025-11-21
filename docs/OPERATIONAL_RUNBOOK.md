# LetterFlow Operational Runbook

## Overview

This runbook provides procedures for operating LetterFlow securely in production, including key management, incident response, and troubleshooting common issues.

## 🔑 Key Management & Rotation

### Environment Variables Overview

| Key                             | Type                   | Rotation Schedule | Impact                     |
| ------------------------------- | ---------------------- | ----------------- | -------------------------- |
| `ENCRYPTION_KEY`                | AES-256 (64 hex chars) | Quarterly         | User credential decryption |
| `ANTHROPIC_API_KEY`             | API Key                | As needed         | AI content generation      |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL                    | Rarely            | Database connection        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | JWT                    | Rarely            | Database authentication    |

### ENCRYPTION_KEY Rotation

**When to Rotate:**

- Quarterly (recommended)
- After security incident
- After team member departure with access
- If key compromise suspected

**Procedure:**

1. **Generate new key:**

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Test key format:**

   ```bash
   # Key must be exactly 64 hexadecimal characters
   echo "NEW_KEY_HERE" | grep -E '^[0-9a-fA-F]{64}$' || echo "Invalid format"
   ```

3. **Deploy with gradual rollout:**

   ```bash
   # 1. Deploy new key to staging
   # 2. Test all encrypted operations
   # 3. Deploy to production during maintenance window
   # 4. Monitor for decryption errors
   ```

4. **Validation checklist:**
   - [ ] Twitter connections still work
   - [ ] Platform credential decryption successful
   - [ ] No error spikes in monitoring
   - [ ] Test new platform connections

**⚠️ Critical:** Old encrypted data becomes unreadable after key rotation. Plan for re-authentication of platform connections.

### ANTHROPIC_API_KEY Rotation

**When to Rotate:**

- Monthly (recommended)
- After rate limit issues
- If usage anomalies detected

**Procedure:**

1. Generate new API key in Anthropic Console
2. Test new key in staging:
   ```bash
   curl -H "x-api-key: NEW_KEY_HERE" \
        -H "anthropic-version: 2023-06-01" \
        https://api.anthropic.com/v1/messages
   ```
3. Update environment variables
4. Monitor AI generation success rate

## 🚨 Incident Response Procedures

### Security Incident Response

#### 1. Rate Limit Abuse Detection

**Symptoms:**

- High rate limit events in monitoring
- `/api/rate-limit-status` shows multiple users at limits
- Unusual API usage patterns

**Immediate Response:**

```bash
# Check rate limiting status
curl http://localhost:3000/api/monitoring?section=security

# Review recent security events
curl http://localhost:3000/api/monitoring?section=logs&level=warn&since=3600000
```

**Mitigation:**

1. Identify abusive users in monitoring logs
2. Lower rate limits temporarily if needed (edit `lib/rate-limiter.ts`)
3. Consider IP-based blocking for severe abuse
4. Review and strengthen rate limiting if necessary

#### 2. SSRF Attack Attempts

**Symptoms:**

- Multiple SSRF blocked events in logs
- Suspicious URL patterns in scraping requests
- Attempts to access internal services

**Investigation:**

```bash
# Check SSRF protection status
curl http://localhost:3000/api/ssrf-status

# Review blocked requests
curl http://localhost:3000/api/monitoring?section=security
```

**Response:**

1. Review blocked URLs and attack patterns
2. Update domain blocklist if new patterns detected
3. Consider additional IP range blocking
4. Document attack patterns for future prevention

#### 3. API Key Compromise

**Symptoms:**

- Unexpected API usage charges
- Rate limit exhaustion
- Unusual geographic access patterns

**Immediate Actions:**

1. **Rotate compromised keys immediately**
2. **Review all recent API calls and generated content**
3. **Check for unauthorized newsletter/post creation**
4. **Audit user accounts for suspicious activity**

### System Failure Response

#### 4. AI Generation Failures

**Symptoms:**

- High `ai_generation_failure` rate in metrics
- Users reporting generation timeouts
- Anthropic API errors

**Diagnosis:**

```bash
# Check AI generation metrics
curl http://localhost:3000/api/monitoring?section=metrics

# Review error patterns
curl http://localhost:3000/api/monitoring?section=logs&event=ai_generation_failure
```

**Resolution Steps:**

1. Check Anthropic API status and rate limits
2. Verify `ANTHROPIC_API_KEY` is valid
3. Review generation timeouts (currently 30s)
4. Consider temporary rate limit reduction
5. Check for malformed content causing API errors

#### 5. Database Connection Issues

**Symptoms:**

- Supabase connection errors
- Authentication failures
- Data persistence failures

**Immediate Actions:**

1. Check Supabase dashboard for service status
2. Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Test database connectivity:
   ```bash
   # Test basic API connectivity
   curl http://localhost:3000/api/rate-limit-status
   ```
4. Check for database migration issues

## 🔧 Handling Failed Operations

### Failed Post Publishing

**Common Scenarios:**

#### Twitter API Errors

**Error: Rate Limit Exceeded**

```json
{
  "error": "Rate limit exceeded",
  "details": "You have exceeded Twitter API rate limits. Please wait 15 minutes and try again."
}
```

**Resolution:**

1. Check `app/api/twitter-status` for stuck posts
2. Wait for Twitter rate limit reset (15 minutes)
3. Retry failed posts manually
4. Consider implementing exponential backoff

**Error: Authentication Failed**

```json
{
  "error": "Authentication failed",
  "details": "Your Twitter connection has expired. Please reconnect your account."
}
```

**Resolution:**

1. User must reconnect Twitter account
2. Check encrypted credential storage
3. Verify `ENCRYPTION_KEY` hasn't changed recently
4. Test new connection before retrying posts

### Stuck Posts in "Publishing" Status

**Diagnosis:**

```bash
# Check for stuck posts
curl http://localhost:3000/api/twitter-status | jq '.posts.stuckPosts'
```

**Resolution:**

1. Identify posts stuck >5 minutes in "publishing" status
2. Manually update status to "failed" in Supabase
3. Allow users to retry
4. Investigate root cause (timeouts, API failures)

### Rate Limit Recovery

**When Users Hit Limits:**

```bash
# Check specific user status
curl http://localhost:3000/api/rate-limit-status | jq '.user'
```

**Options:**

1. Wait for automatic reset (1 hour)
2. Temporary limit increase for VIP users (manual)
3. Review if limits are too restrictive

## 📊 Monitoring & Alerting

### Health Check Endpoints

| Endpoint                         | Purpose                | Expected Response             |
| -------------------------------- | ---------------------- | ----------------------------- |
| `/api/monitoring?section=health` | Overall system health  | `{"status": "healthy"}`       |
| `/api/rate-limit-status`         | Rate limiting status   | User limits and system stats  |
| `/api/ssrf-status`               | SSRF protection status | Protection features and stats |
| `/api/twitter-status`            | Twitter posting status | Connection and post status    |

### Key Metrics to Monitor

**Error Rates:**

- AI generation failure rate: <10%
- SSRF blocks: Expected if under attack
- Rate limit hits: Normal in moderation

**Performance:**

- Average response time: <3000ms
- AI generation time: <30s
- Database response time: <1000ms

**Security Events:**

- Rate limit violations per hour
- SSRF attack attempts
- Failed authentication attempts

### Alert Thresholds

**Critical Alerts:**

- Error rate >20%
- Average response time >10s
- System health status: "unhealthy"
- Multiple stuck posts (>10)

**Warning Alerts:**

- Error rate >10%
- High rate limit usage (>80% of users at limits)
- Memory usage >90%
- SSRF attacks >50/hour

## 🛠️ Troubleshooting Guide

### Common Issues

#### Issue: "Environment validation failed"

**Cause:** Missing or invalid environment variables
**Solution:**

1. Check `.env.local.example` for required variables
2. Validate format with `lib/env-validator.ts`
3. Ensure `ENCRYPTION_KEY` is exactly 64 hex characters

#### Issue: "Rate limit exceeded" errors

**Cause:** User hitting rate limits too quickly
**Investigation:**

```bash
curl http://localhost:3000/api/rate-limit-status
```

**Solution:** Adjust limits in `lib/rate-limiter.ts` if needed

#### Issue: "SSRF protection blocked URL"

**Cause:** URL fails security validation
**Common reasons:**

- Non-standard ports (not 80/443)
- Private IP addresses
- Blocked domains

**Solution:** Review URL against SSRF rules in `lib/ssrf-protection.ts`

#### Issue: Twitter posts failing consistently

**Investigation:**

```bash
curl http://localhost:3000/api/twitter-status
```

**Common causes:**

- Expired OAuth tokens
- Twitter API changes
- Content policy violations

### Performance Optimization

**Slow AI Generation:**

1. Check Anthropic API latency
2. Consider reducing post count
3. Implement caching for similar content
4. Review timeout settings (30s)

**Database Slowness:**

1. Check Supabase dashboard
2. Review query performance
3. Consider connection pooling
4. Optimize database queries

## 📋 Maintenance Procedures

### Weekly Tasks

- [ ] Review monitoring dashboard for trends
- [ ] Check for stuck posts and resolve
- [ ] Review error logs for patterns
- [ ] Validate all health check endpoints

### Monthly Tasks

- [ ] Rotate `ANTHROPIC_API_KEY`
- [ ] Review and update rate limits if needed
- [ ] Audit user account activity
- [ ] Update dependencies and security patches

### Quarterly Tasks

- [ ] Rotate `ENCRYPTION_KEY` (requires user re-authentication)
- [ ] Review and update SSRF protection rules
- [ ] Audit security configurations
- [ ] Performance testing and optimization

## 🆘 Emergency Contacts & Resources

### External Services

- **Anthropic Status:** https://status.anthropic.com/
- **Supabase Status:** https://status.supabase.com/
- **Twitter API Status:** https://api.twitterstat.us/
- **Vercel Status:** https://www.vercel-status.com/

### Internal Resources

- **Monitoring Dashboard:** `/api/monitoring`
- **System Health:** `/api/monitoring?section=health`
- **Security Events:** `/api/monitoring?section=security`

### Emergency Procedures

1. **Service Down:** Check external service status pages
2. **Security Incident:** Rotate keys, review logs, document findings
3. **Data Loss:** Check Supabase backups, review recent changes
4. **Performance Issues:** Scale infrastructure, optimize bottlenecks
