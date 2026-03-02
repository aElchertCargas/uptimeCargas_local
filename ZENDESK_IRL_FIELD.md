# Zendesk IRL Custom Field Configuration

## Overview
All Zendesk tickets created by the uptime monitoring system are automatically set to **IRL 4: Urgent Level Risk**.

## Custom Field Details

**Field Information:**
- **Field ID**: 38842256723213
- **Field Name**: IRL (Issue Risk Level)
- **Field Type**: Dropdown (tagger)
- **Required**: Yes

**Selected Value:**
- **Option ID**: 38842244031885
- **Option Value**: `irl_4`
- **Option Label**: "IRL 4: Urgent Level Risk"

## Available IRL Options

The IRL field has 4 risk levels (in order of severity):

1. **IRL 4: Urgent Level Risk** ✅ **(Currently Set)**
   - Option ID: 38842244031885
   - Value: `irl_4`

2. **IRL 3: High Level Risk**
   - Option ID: 38842244032013
   - Value: `irl_3`

3. **IRL 2: Moderate Level Risk**
   - Option ID: 38842244032141
   - Value: `irl_2`

4. **IRL 1: Low Level Risk**
   - Option ID: 38842244032269
   - Value: `irl_1`

## Implementation

The custom field is set in `src/lib/zendesk.ts` when creating tickets:

```typescript
custom_fields: [
  {
    id: 38842256723213,  // IRL field ID
    value: "irl_4",      // IRL 4: Urgent Level Risk
  },
]
```

## Rationale

Website downtime is treated as **urgent** because:
- Sites being down affects business operations
- Customers may be unable to access services
- Revenue and reputation are at stake
- Requires immediate attention and resolution

## Changing the IRL Level

To change the IRL level for uptime monitoring tickets:

1. Edit `src/lib/zendesk.ts`
2. Find the `custom_fields` array in `createZendeskTicket()`
3. Change the `value` to one of:
   - `"irl_4"` - Urgent (current)
   - `"irl_3"` - High
   - `"irl_2"` - Moderate
   - `"irl_1"` - Low

Example to change to IRL 3:
```typescript
custom_fields: [
  {
    id: 38842256723213,
    value: "irl_3",  // Changed to High Level Risk
  },
]
```

## Testing

To verify the custom field is being set:
1. Enable Zendesk integration in Settings
2. Let a monitor go down (or manually disable one)
3. Wait for the ticket delay threshold (default: 30 minutes)
4. Check the created Zendesk ticket
5. Verify the "Issue Risk Level" field shows "IRL 4: Urgent Level Risk"

## Notes

- This field is **required** in Zendesk, so it must be set on all tickets
- The field ID (38842256723213) is specific to your Zendesk instance
- If the field ID changes, update it in the code
- Custom fields are set at ticket creation and cannot be changed retroactively for existing tickets
