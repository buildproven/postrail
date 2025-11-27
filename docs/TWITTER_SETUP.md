# Twitter (X) Integration Guide

## Overview

Postrail uses a **BYOK (Bring Your Own Keys)** approach for Twitter integration. This means:

- Each user provides their own Twitter API credentials
- Each user gets their own **500 posts/month** quota (Twitter Free Tier)
- No shared limits across all SaaS users
- Credentials are encrypted and stored securely

## Prerequisites

1. **Twitter/X Account** - A regular Twitter account
2. **Twitter Developer Account** - Free tier (no credit card required)
3. **10-15 minutes** - To complete the setup

## Step 1: Create Twitter Developer Account

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Sign in with your Twitter account
3. Click "Sign up for Free Account"
4. Fill out the application:
   - **Use case**: Automation & bots
   - **Description**: "Automated social media posting for my newsletters using Postrail"
   - Accept the terms and conditions
5. Verify your email address
6. Wait for approval (usually instant, sometimes takes 1-2 days)

## Step 2: Create a Twitter App

1. Once approved, go to the [Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Click **"+ Create Project"**
3. Fill in project details:
   - **Name**: "Postrail Bot" (or any name you prefer)
   - **Use case**: Choose the most relevant option (e.g., "Making a bot")
   - **Project description**: "Automated newsletter social media posting"

4. Create an **App** within the project:
   - **App name**: "postrail-bot-{your-username}" (must be unique)
   - **Environment**: Production

## Step 3: Configure App Permissions

1. Go to your app's **Settings** tab
2. Scroll to **User authentication settings**
3. Click **"Set up"**
4. Configure OAuth 1.0a:
   - **App permissions**: Select **"Read and Write"** (REQUIRED for posting)
   - **Type of App**: Web App
   - **Callback URL**: `http://localhost:3000` (not used for BYOK, but required)
   - **Website URL**: Your Postrail instance URL (or `http://localhost:3000`)
5. Click **Save**

## Step 4: Get Your API Keys

1. Go to the **"Keys and tokens"** tab
2. You'll need to copy **4 credentials**:

### API Key & Secret (Consumer Keys)

- Click **"Regenerate"** next to "API Key and Secret"
- Copy and save:
  - `API Key` (also called Consumer Key)
  - `API Secret` (also called Consumer Secret)

### Access Token & Secret

- Scroll to "Authentication Tokens"
- Click **"Generate"** under "Access Token and Secret"
- **IMPORTANT**: Make sure permissions show "Created with Read and Write permissions"
  - If it says "Read only", delete the tokens and regenerate after setting permissions to "Read and Write"
- Copy and save:
  - `Access Token`
  - `Access Token Secret`

⚠️ **IMPORTANT**: Save these credentials securely! Twitter only shows the secrets once.

## Step 5: Connect in Postrail

1. Log into Postrail
2. Go to **Dashboard → Platforms**
3. Click **"Connect Twitter"**
4. Paste your 4 credentials:
   - API Key
   - API Secret
   - Access Token
   - Access Token Secret
5. Click **"Connect Twitter"**

Postrail will:

- Validate your credentials
- Test posting permissions
- Encrypt and store the credentials securely
- Show your connected Twitter username

## Step 6: Start Posting!

Once connected:

1. Create a newsletter in Postrail
2. Generate social media posts (Twitter will be included)
3. Schedule or post immediately
4. Posts will be published to your Twitter account

## Quota & Rate Limits

**Twitter Free Tier Limits (per user, per month):**

- **500 posts/month** (read + write combined)
- **1,500 API requests/month**
- Sufficient for ~2 posts per day

**Best practices:**

- Postrail generates 2 posts per newsletter (pre-CTA + post-CTA)
- With 2 newsletters/week, you'll use ~16 posts/month
- Plenty of headroom for the free tier!

## Troubleshooting

### "Unauthorized" or "401 Error"

- Check that you copied all 4 credentials correctly
- Make sure there are no extra spaces
- Regenerate tokens if needed

### "Forbidden" or "403 Error"

- Your app doesn't have "Read and Write" permissions
- Go to app settings → User authentication → Change to "Read and Write"
- **Regenerate** access tokens after changing permissions
- Old tokens retain old permissions!

### "Rate limit exceeded"

- You've hit the 500 posts/month limit
- Wait until next month, or upgrade to Twitter Basic ($100/month for 10,000 posts)

### "Duplicate content"

- Twitter prevents posting identical content within a short time
- Edit your post slightly or wait a few hours

## Security Notes

- Your credentials are **encrypted** before storage using AES-256-GCM
- Postrail never shares your credentials
- You can disconnect anytime from Dashboard → Platforms
- Disconnecting removes credentials from the database
- To fully revoke access, also revoke the app in [Twitter Settings](https://twitter.com/settings/connected_apps)

## Cost

**FREE** for typical usage:

- Twitter Developer Account: Free
- Twitter Free Tier: 500 posts/month (plenty for newsletters)
- Postrail: Uses your own quota, no additional cost

## BYOK vs Traditional OAuth

| Approach              | User Setup   | Quota              | Scalability |
| --------------------- | ------------ | ------------------ | ----------- |
| **BYOK (Postrail)** | 10-min setup | 500/month per user | Infinite    |
| **Traditional OAuth** | 1-click      | 500/month shared   | Limited     |

**Why BYOK?**

- Each user gets their own 500 posts/month
- SaaS can scale to 1000+ users
- No shared quota issues
- Free tier remains viable long-term

---

## Next Steps

1. ✅ Complete Twitter setup (above)
2. ✅ Connect Twitter in Postrail
3. 📝 Create your first newsletter
4. 🚀 Generate and post to Twitter!

Need help? Check the [main documentation](../README.md) or [file an issue](https://github.com/yourusername/postrail/issues).
