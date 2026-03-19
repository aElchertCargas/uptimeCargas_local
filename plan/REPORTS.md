# Ticketing Reports Page

## Overview
A reporting dashboard that displays incident and downtime ticket statistics with visual charts.

## Key Features
- Total, open, and resolved incident counts
- Average resolution time tracking
- Incidents by monitor (top 10)
- Recent incidents list with status

## Z-Index Fix
The chart component (`ticket-chart.tsx`) implements proper layering to prevent text from being hidden by graph elements:

### Solution
```tsx
// Text label container - HIGH z-index (z-20)
<div className="relative z-20 mb-2">
  <span>{label}</span>
  <span>count: {count}</span>
</div>

// Bar container - LOWER z-index (z-10)
<div className="relative h-8">
  <div style={{ zIndex: 10 }}>
    {/* Animated bar */}
  </div>
</div>
```

### Why This Works
1. **Text layer (z-20)**: Always stays on top, preventing overlap
2. **Bar layer (z-10)**: Rendered below text, can't hide labels
3. **Relative positioning**: Creates proper stacking context
4. **Margin separation**: `mb-2` adds visual space between text and bars

### Hover Behavior
- Hover effects apply to the entire group
- Text remains visible during all hover states
- Smooth transitions without layout shifts

## Routes
- **Page**: `/reports`
- **API**: `/api/reports/tickets`

## Components
- `src/app/(authenticated)/reports/page.tsx` - Main page
- `src/components/reports/ticket-chart.tsx` - Bar chart with fixed z-index
- `src/components/reports/ticket-stats-card.tsx` - Statistics cards
- `src/app/api/reports/tickets/route.ts` - API endpoint
