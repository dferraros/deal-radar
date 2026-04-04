---
phase: 04-dashboard-frontend
plan: "03"
subsystem: frontend
tags: [react, tremor, watchlist, company-profile, optimistic-ui]
dependency_graph:
  requires: [04-01]
  provides: [CompanyProfile view, Watchlist view, WatchlistToggle component, InlineNoteEditor component]
  affects: [frontend routing at /company/:id and /watchlist]
tech_stack:
  added: []
  patterns: [optimistic-update, inline-edit, client-side-filter, inline-confirm]
key_files:
  created:
    - frontend/src/components/WatchlistToggle.tsx
    - frontend/src/components/InlineNoteEditor.tsx
  modified:
    - frontend/src/views/CompanyProfile.tsx
    - frontend/src/views/Watchlist.tsx
decisions:
  - WatchlistToggle DELETE path fetches GET /api/watchlist to resolve item id since company profile only knows company_id, not watchlist item id
  - InlineNoteEditor uses a savingRef guard to prevent double-save on concurrent Enter+blur events
  - Watchlist table uses colSpan=9 for inline remove confirmation row spanning all columns
  - Watchlist row click navigates to /company/:id; Notes and Remove cells use e.stopPropagation()
metrics:
  duration: ~15 minutes
  completed: "2026-04-04"
  tasks_completed: 2
  files_count: 4
---

# Phase 04 Plan 03: Company Profile + Watchlist Views Summary

**One-liner:** React Company Profile and Watchlist views with optimistic WatchlistToggle star button and click-to-edit InlineNoteEditor backed by /api/watchlist PUT.

## What Was Built

### WatchlistToggle (`frontend/src/components/WatchlistToggle.tsx`)
Tremor Button wrapping a star icon (outline / filled amber). Flips state optimistically on click, calls POST (add) or DELETE (remove via GET /api/watchlist lookup), reverts on API error. Inline "Saving..." text while loading.

### InlineNoteEditor (`frontend/src/components/InlineNoteEditor.tsx`)
Click-to-edit pattern: viewing mode shows note text or "+ Add note" placeholder. Editing mode shows Tremor TextInput with autoFocus. Enter/blur triggers PUT /api/watchlist/:id/notes. Escape cancels. Error reverts note and shows inline red error text for 3 seconds. savingRef guard prevents double-save on Enter+blur race.

### CompanyProfile (`frontend/src/views/CompanyProfile.tsx`)
Full replacement of stub. Fetches `/api/companies/:id` on mount. Header Tremor Card with company name, sector badges (blue), geo, website (amber external link), description with "Show more/less" toggle at 200 chars. WatchlistToggle positioned absolute top-right. Deal history as Tremor List with date, DealTypeBadge, amount (tabular-nums, "Undisclosed" italic when null), source name, ai_summary (2-line clamp). Known Investors section as gray badges. All 4 states: loading spinner, error banner, 404 not found, populated.

### Watchlist (`frontend/src/views/Watchlist.tsx`)
Full replacement of stub. Fetches `/api/watchlist` on mount. Client-side filtering using FilterBar (showDateRange=false). 9-column table: Date, Company, Round, Amount, Sector, Geo, Investors, Notes, Remove. Notes column renders InlineNoteEditor. Remove column shows X icon button; clicking sets confirmRemove state which replaces that row with an inline confirm message (colSpan=9). Row click navigates to /company/:id; Notes and Remove cells stop propagation. Empty state with correct copy from UI-SPEC.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run typecheck`: PASSED (exit 0, no errors)
- `npm run build`: PASSED (dist/ generated, chunk size warning is pre-existing Tremor library issue unrelated to this plan)
- Commit: `3a1dc67`

## Self-Check: PASSED

Files verified present:
- `frontend/src/components/WatchlistToggle.tsx` — FOUND
- `frontend/src/components/InlineNoteEditor.tsx` — FOUND
- `frontend/src/views/CompanyProfile.tsx` — FOUND
- `frontend/src/views/Watchlist.tsx` — FOUND

Commit `3a1dc67` — FOUND in git log.
