# Zendesk Integration - Forward-Only Ticket Creation

## Problem
When enabling the Zendesk integration, it would create tickets for ALL existing open incidents, including ones that started before Zendesk was enabled. This could flood Zendesk with tickets for old, pre-existing incidents.

## Solution
The system now tracks when Zendesk was enabled and only creates tickets for incidents that started **after** Zendesk was turned on.

## How It Works

### 1. Timestamp Tracking
When Zendesk is enabled in Settings, the system saves a timestamp (`zendeskEnabledAt`):

```typescript
// When toggling Zendesk from OFF to ON
if (zendeskBeingEnabled) {
  updates.push({ 
    key: "zendeskEnabledAt", 
    value: new Date().toISOString() 
  });
}
```

### 2. Filtered Ticket Creation
The check cycle only creates tickets for incidents after the enablement timestamp:

```typescript
const unticketedIncidents = await prisma.incident.findMany({
  where: {
    resolvedAt: null,
    zendeskTicketId: null,
    startedAt: { 
      lte: zendeskCutoff,        // Old enough (past delay threshold)
      gte: zendeskEnabledAt,     // ✅ Started AFTER Zendesk enabled
    },
  },
});
```

## Behavior

### When You Enable Zendesk

**Old Incidents (before enablement):**
- ❌ NO tickets created for existing open incidents
- ❌ NO tickets for incidents that started before enablement
- ✅ No flood of historical tickets

**New Incidents (after enablement):**
- ✅ Tickets created for new incidents after the configured delay
- ✅ Only incidents that occur going forward
- ✅ Normal Zendesk behavior as expected

### Example Timeline

```
Time: 00:00 - Incident A starts (site down)
Time: 00:30 - Incident B starts (another site down)
Time: 01:00 - Enable Zendesk integration ⚡️ (timestamp saved)
Time: 01:15 - Incident C starts (another site down)
Time: 01:45 - Check cycle runs

Results:
- Incident A: NO ticket (started before enablement)
- Incident B: NO ticket (started before enablement)  
- Incident C: YES ticket created ✅ (started after enablement, past delay)
```

## Re-enabling Zendesk

If you disable and then re-enable Zendesk:
- A new `zendeskEnabledAt` timestamp is saved
- Only incidents after the NEW enablement time will get tickets
- Prevents creating tickets for incidents during the disabled period

## Database Storage

The timestamp is stored in the `AppSetting` table:
- **Key**: `zendeskEnabledAt`
- **Value**: ISO timestamp string (e.g., `"2026-02-28T20:30:00.000Z"`)
- **Updated**: Every time Zendesk is toggled from OFF to ON

## Edge Cases Handled

### First-Time Setup
If `zendeskEnabledAt` doesn't exist (first time enabling):
- Falls back to `new Date(0)` (epoch time)
- Allows all current incidents to get tickets
- This is intentional for initial setup

### Disable/Re-enable
- New timestamp saved each time enabled
- Clean slate for each enablement period
- Previous disabled period incidents ignored

### Delay Threshold
Tickets still respect the delay threshold:
- Must be down for configured minutes (default: 30)
- AND must have started after Zendesk was enabled
- Both conditions must be met

## Files Modified

1. **`src/app/api/settings/route.ts`**
   - Detects when Zendesk is being enabled
   - Saves `zendeskEnabledAt` timestamp

2. **`src/app/api/cron/check/route.ts`**
   - Retrieves `zendeskEnabledAt` timestamp
   - Filters incidents by start time
   - Only creates tickets for post-enablement incidents

## Testing

To verify this works:

1. **Create some test incidents** (disable monitors or let sites go down)
2. **Enable Zendesk** in Settings
3. **Wait for next check cycle**
4. **Verify**: Only NEW incidents (after enabling) get tickets
5. **Old incidents**: Should remain without Zendesk tickets

## Benefits

✅ **No ticket flood** - Prevents overwhelming Zendesk with old incidents  
✅ **Clean enablement** - Fresh start when turning on integration  
✅ **Expected behavior** - Only alerts going forward  
✅ **Re-enable friendly** - Can disable/enable without issues  
✅ **Preserves history** - Old incidents remain in database, just no tickets
