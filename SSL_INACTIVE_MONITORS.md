# SSL Monitoring - Inactive Monitor Handling

## ✅ Confirmation: Already Working Correctly

The SSL certificate monitoring **already respects the monitor's active status** and does NOT check or alert on inactive monitors.

## How It Works

### Monitor Active Status
Every monitor has an `active` boolean field (schema line 19):
```prisma
active Boolean @default(true)
```

### SSL Check Filtering
The SSL check endpoint filters monitors before checking (route.ts line 34-36):
```typescript
const monitors = await prisma.monitor.findMany({
  where: { active: true },  // ✅ Only checks active monitors
});
```

### What This Means
1. **Inactive monitors are skipped** - SSL checks never run on them
2. **No alerts sent** - Inactive monitors won't trigger SSL expiration notifications
3. **No database updates** - SSL fields aren't updated for inactive monitors
4. **No unnecessary API calls** - Saves resources by not checking disabled sites

## Verification

### Same Pattern Used Throughout
All automated monitoring respects the `active` flag:

1. **Regular uptime checks** (`/api/cron/check`):
   ```typescript
   const monitors = await prisma.monitor.findMany({
     where: { active: true }  // ✅
   });
   ```

2. **SSL certificate checks** (`/api/cron/ssl-check`):
   ```typescript
   const monitors = await prisma.monitor.findMany({
     where: { active: true }  // ✅
   });
   ```

3. **Dashboard stats** (`/api/stats`):
   ```typescript
   where: { active: true, lastStatus: false }  // ✅
   ```

## How to Exclude a Monitor

### In the UI
1. Go to the monitor's detail page
2. Toggle the "Active" switch to OFF
3. Monitor is now excluded from:
   - Regular uptime checks
   - SSL certificate monitoring
   - Dashboard "Down" count
   - All alerts and notifications

### What Happens When Inactive
- ✅ Monitor stays in the database (not deleted)
- ✅ Historical check data is preserved
- ✅ Can be re-activated anytime
- ✅ Shows as "Pending" status in the UI
- ✅ NOT checked by automation
- ✅ NO alerts sent

## Summary

**No changes needed** - The system already correctly:
- ✅ Skips inactive monitors for SSL checks
- ✅ Doesn't send alerts for inactive monitors
- ✅ Uses consistent `active: true` filtering across all automated tasks
- ✅ Preserves data while excluding from monitoring

The `active` boolean field is the standard way to exclude monitors from all monitoring activities, and it's already working as expected.
