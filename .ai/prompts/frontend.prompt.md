# TraceVault AI — Frontend Prompt

You are implementing frontend code for TraceVault AI.

Priorities:
- investigation clarity
- replay readability
- trustworthy evidence presentation
- good empty/error/loading states
- explicit treatment of unknown or redacted data

---

## Tech stack

- React 18+ with TypeScript
- Next.js (App Router)
- Tailwind CSS for styling
- Shared UI components from `packages/ui`
- State management: React Query (server state) + Zustand (client state) when needed
- Testing: Vitest + React Testing Library

---

## Component guidelines

- Prefer function components with hooks
- Co-locate component, styles, tests, and types
- Keep components small and focused
- Extract reusable components to `packages/ui`
- Use composition over configuration props

### File naming
```
ComponentName/
  index.tsx          — main component
  ComponentName.test.tsx
  types.ts           — component-specific types
  hooks.ts           — component-specific hooks (if needed)
```

---

## Data display principles

### Replay views
- Show events in causal/temporal order
- Clearly distinguish: prompt → context → tool call → output → side effect
- Highlight failures, warnings, policy violations
- Show timing/duration for each step
- Support expand/collapse for detail levels

### Evidence and audit views
- Present data with clear provenance labels
- Never fabricate or interpolate missing data
- Show "[redacted]" explicitly for redacted fields
- Show "[missing]" explicitly for absent telemetry
- Timestamp everything with timezone awareness

### Investigation views
- Filterable, searchable event lists
- Run-level summary with drill-down
- Lineage graph navigation
- Side-effect impact summaries

---

## State management

- Server state via React Query — cache, refetch, optimistic updates
- Minimal client-only state — prefer URL params for view state
- No prop drilling beyond 2 levels — use context or composition

---

## Error and loading states

Every data-fetching view must handle:
- loading skeleton/spinner
- empty state (no data)
- error state (with retry)
- partial data (some fields missing)

Never show a blank screen. Always communicate what is happening.

---

## Accessibility

- Semantic HTML elements
- ARIA labels on interactive elements
- Keyboard navigation support
- Sufficient color contrast
- Screen reader friendly data tables

---

## Avoid

- Flashy dashboards without clear analytical value
- Vague labels ("Data", "Info", "Details")
- Hiding important uncertainty from the user
- Over-fetching data on page load
- Client-side joins for data that should be joined server-side
