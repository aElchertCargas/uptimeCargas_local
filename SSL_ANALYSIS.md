# SSL Certificate Monitoring Analysis

## Issue Report
**Date**: February 28, 2026  
**Monitor**: Quality Oil  
**Problem**: Site went down due to expired SSL certificate

## Current SSL Check Implementation

### How It Works
1. **Route**: `/api/cron/ssl-check` (src/app/api/cron/ssl-check/route.ts)
2. **Library**: Custom TLS checker (src/lib/ssl-checker.ts)
3. **Trigger**: Manual POST request with Bearer token authentication

### SSL Check Logic
- Checks all active HTTPS monitors
- Skips monitors checked within last 24 hours
- Updates database with:
  - `sslExpiresAt`: Certificate expiration date
  - `sslIssuer`: Certificate issuer
  - `sslLastCheckedAt`: Last check timestamp
- Sends alerts when certificate expires in ≤ configured days (default: 1 day)

### Alert Conditions
```typescript
if (result.daysRemaining <= alertDays) {
  // Send notification if:
  // 1. This is a new certificate OR
  // 2. Haven't notified about this cert in last 24h
}
```

## ⚠️ CRITICAL PROBLEM IDENTIFIED

### The SSL Check Cron is **NOT** Running Automatically

**Evidence:**
1. The scheduler (src/lib/scheduler.ts) only runs:
   - Monitor checks (`/api/cron/check`) - every 60 seconds ✅
   - Cleanup (`/api/cron/cleanup`) - every 24 hours ✅
   - **SSL checks are NOT included** ❌

2. README states: "Set up a Railway cron job" but only for `/api/cron/check`

3. No automated trigger for `/api/cron/ssl-check`

### Why Quality Oil Failed
1. SSL certificate expired
2. No daily SSL check was running to detect it
3. No advance warning notification was sent
4. Regular uptime checks failed when cert expired
5. Incident was created, but too late

## Solution Required

### Option 1: Add SSL Check to Internal Scheduler (RECOMMENDED)
Add SSL checks to the existing scheduler that runs every 24 hours.

**Pros:**
- No external cron setup needed
- Consistent with other automated tasks
- Works in any environment

**Cons:**
- Slightly increases server load

### Option 2: External Railway Cron Job
Set up a separate Railway cron job to POST to `/api/cron/ssl-check` daily.

**Pros:**
- Separates concerns
- Can run at specific time

**Cons:**
- Requires manual Railway configuration
- Another service to maintain
- Can be forgotten

### Option 3: Add to Existing Check Cycle (NOT RECOMMENDED)
Add SSL check to the 60-second monitor check cycle.

**Pros:**
- Simple to implement

**Cons:**
- Unnecessary load (SSL certs don't change every minute)
- 24-hour deduplication already built-in makes this wasteful

## Recommended Implementation

**Add SSL check to scheduler.ts:**

```typescript
// In scheduler.ts
const SSL_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function runSslCheck() {
  try {
    await fetch(`${getBaseUrl()}/api/cron/ssl-check`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
    });
  } catch {
    // Retry next day
  }
}

// In startScheduler():
sslCheckIntervalId = setInterval(runSslCheck, SSL_CHECK_INTERVAL_MS);
// Run first check after 10 seconds
setTimeout(runSslCheck, 10_000);
```

## Alert Configuration
Current default: 1 day warning before expiration  
**Recommendation**: Increase to 7-14 days for better advance notice

Can be configured in Settings page under "SSL Alert Threshold".

## Additional Recommendations

1. **Proactive Monitoring**:
   - Set SSL alert days to 14 (two weeks notice)
   - Consider adding 7-day and 3-day reminder alerts

2. **Dashboard Visibility**:
   - Add SSL expiration widget to main dashboard
   - Show upcoming expirations prominently

3. **Incident Prevention**:
   - Regular uptime checks will catch expired cert (already working)
   - But SSL alerts should prevent reaching that point

4. **Testing**:
   - Add test button in Settings to manually trigger SSL check
   - Verify alerts are sent properly
