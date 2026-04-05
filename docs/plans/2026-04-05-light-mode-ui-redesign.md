# Light-Mode UI Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Flip all 11 views from dark zinc to a light slate/white palette matching CB Insights / Crunchbase / Harmonic aesthetic, consistently and systematically.

**Architecture:** Dark sidebar (intentional accent — Harmonic-style split) + white content area. All views share a single replacement pattern: zinc-9xx → white/slate-50, zinc-7/8xx borders → slate-200, zinc-1/2/3xx text → slate-8/7/6xx. DealFeed already done; 11 views remain.

**Tech Stack:** React + Tailwind CSS 3, Plus Jakarta Sans (body), IBM Plex Mono (data). Branch: `feat/light-mode-redesign`.

**Design Tokens (use these everywhere, no deviations):**

| Dark class | Light replacement |
|---|---|
| `bg-zinc-950`, `bg-zinc-900` | `bg-white` |
| `bg-zinc-900/80`, `bg-zinc-800` | `bg-slate-50` |
| `bg-zinc-800/60`, `bg-zinc-700` | `bg-slate-100` |
| `border-zinc-800`, `border-zinc-700` | `border-slate-200` |
| `text-zinc-100`, `text-zinc-200` | `text-slate-900`, `text-slate-800` |
| `text-zinc-300`, `text-zinc-400` | `text-slate-600`, `text-slate-500` |
| `text-zinc-500`, `text-zinc-600` | `text-slate-500`, `text-slate-400` |
| `text-zinc-700` | `text-slate-300` |
| `placeholder-zinc-600` | `placeholder-slate-400` |
| `hover:text-zinc-300` | `hover:text-slate-700` |
| `hover:bg-zinc-800`, `hover:bg-zinc-800/50` | `hover:bg-slate-50` |
| `focus:border-emerald-500` (on dark inputs) | keep emerald, add `bg-white border-slate-200` |

---

## Task 1: Add CSS design tokens + verify DealFeed renders correctly

**Files:**
- Modify: `frontend/src/index.css`

**Step 1: Add CSS custom properties at top of index.css (after @tailwind directives)**

Open `frontend/src/index.css` and add after line 3:

```css
/* ─── Design tokens ───────────────────────────────────────────── */
:root {
  --surface:       #ffffff;
  --surface-muted: #f8fafc;
  --border:        #e2e8f0;
  --text-primary:  #0f172a;
  --text-secondary:#475569;
  --text-muted:    #94a3b8;
  --accent:        #f59e0b;
  --accent-soft:   rgba(245,158,11,0.08);
}
```

**Step 2: Visual check — deploy is live**

Open the deployed URL and confirm:
- Status bar: white bg, slate text ✓
- Hero stats band: white with dot grid ✓
- Position cards: white with colored left border ✓
- Filter strip: white/slate bg, pill buttons ✓
- Table: slate-50 header, white rows ✓

If anything still looks dark → the Layout.tsx fix from the previous commit hasn't propagated. Wait for Railway build.

**Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: add CSS design tokens for light-mode system"
```

---

## Task 2: Heatmap.tsx + InvestorNetwork.tsx (3 dark classes each — easiest)

**Files:**
- Modify: `frontend/src/views/Heatmap.tsx`
- Modify: `frontend/src/views/InvestorNetwork.tsx`

**Step 1: Fix Heatmap.tsx**

Find and replace (exact strings, use Edit tool):

```
# Line ~101 — tab active state
'bg-zinc-800 text-zinc-50'
→ 'bg-slate-100 text-slate-900'

# Line ~102 — tab inactive
'text-zinc-400 hover:text-zinc-200 bg-transparent'
→ 'text-slate-500 hover:text-slate-700 bg-transparent'

# Line ~122 — chart container
className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 overflow-x-auto"
→ className="bg-white border border-slate-200 rounded-lg p-6 overflow-x-auto shadow-sm"
```

**Step 2: Fix InvestorNetwork.tsx**

Run: `grep -n "bg-zinc\|text-zinc-[1-4]" frontend/src/views/InvestorNetwork.tsx`

Apply the token table above to each match.

**Step 3: Commit**

```bash
git add frontend/src/views/Heatmap.tsx frontend/src/views/InvestorNetwork.tsx
git commit -m "style: light-mode flip — Heatmap, InvestorNetwork"
```

---

## Task 3: Trends.tsx + IntelDossier.tsx + IntelGraph.tsx (7–8 dark classes each)

**Files:**
- Modify: `frontend/src/views/Trends.tsx`
- Modify: `frontend/src/views/IntelDossier.tsx`
- Modify: `frontend/src/views/IntelGraph.tsx`

**Step 1: For each file, run the audit**

```bash
grep -n "bg-zinc\|border-zinc\|text-zinc-[1-4]\|placeholder-zinc" frontend/src/views/Trends.tsx
grep -n "bg-zinc\|border-zinc\|text-zinc-[1-4]\|placeholder-zinc" frontend/src/views/IntelDossier.tsx
grep -n "bg-zinc\|border-zinc\|text-zinc-[1-4]\|placeholder-zinc" frontend/src/views/IntelGraph.tsx
```

**Step 2: Apply token replacements**

Pay special attention to:
- `bg-zinc-900/80` stat cards → `bg-white border border-slate-200 shadow-sm` (remove the /80 opacity — not needed on white)
- `text-zinc-100` headings → `text-slate-900`
- Chart containers: add `shadow-sm` when replacing dark borders

**Step 3: Commit**

```bash
git add frontend/src/views/Trends.tsx frontend/src/views/IntelDossier.tsx frontend/src/views/IntelGraph.tsx
git commit -m "style: light-mode flip — Trends, IntelDossier, IntelGraph"
```

---

## Task 4: Admin.tsx + InvestorLeaderboard.tsx + Watchlist.tsx (8–9 dark classes each)

**Files:**
- Modify: `frontend/src/views/Admin.tsx`
- Modify: `frontend/src/views/InvestorLeaderboard.tsx`
- Modify: `frontend/src/views/Watchlist.tsx`

**Step 1: Audit each file**

```bash
grep -n "bg-zinc\|border-zinc\|text-zinc-[1-4]\|placeholder-zinc" frontend/src/views/Admin.tsx
grep -n "bg-zinc\|border-zinc\|text-zinc-[1-4]\|placeholder-zinc" frontend/src/views/InvestorLeaderboard.tsx
grep -n "bg-zinc\|border-zinc\|text-zinc-[1-4]\|placeholder-zinc" frontend/src/views/Watchlist.tsx
```

**Step 2: Apply token replacements**

Watch for table patterns — InvestorLeaderboard likely has a similar table to DealFeed:
- `thead tr bg-zinc-950` → `bg-slate-50`
- `tbody bg-zinc-950` → `bg-white`
- `border-zinc-800/30` row dividers → `border-slate-100`

**Step 3: Commit**

```bash
git add frontend/src/views/Admin.tsx frontend/src/views/InvestorLeaderboard.tsx frontend/src/views/Watchlist.tsx
git commit -m "style: light-mode flip — Admin, InvestorLeaderboard, Watchlist"
```

---

## Task 5: CompanyProfile.tsx + IntelQueue.tsx (13–15 dark classes — complex)

**Files:**
- Modify: `frontend/src/views/CompanyProfile.tsx`
- Modify: `frontend/src/views/IntelQueue.tsx`

**Step 1: Audit**

```bash
grep -n "bg-zinc\|border-zinc\|text-zinc-[1-4]\|placeholder-zinc" frontend/src/views/CompanyProfile.tsx
grep -n "bg-zinc\|border-zinc\|text-zinc-[1-4]\|placeholder-zinc" frontend/src/views/IntelQueue.tsx
```

**Step 2: Apply tokens — CompanyProfile**

CompanyProfile likely has:
- A hero/header section with company name — `text-zinc-100` → `text-slate-900`
- Stat cards — `bg-zinc-900` → `bg-white border-slate-200 shadow-sm`
- A details section with key/value pairs — `text-zinc-400` labels → `text-slate-500`
- Tech stack tags — `bg-zinc-800 text-zinc-400` → `bg-slate-100 text-slate-600 border-slate-200`

**Step 3: Apply tokens — IntelQueue**

IntelQueue likely has:
- A queue list with status indicators
- Input forms for adding URLs
- Dark input fields → `bg-white border-slate-200 text-slate-800 placeholder-slate-400`

**Step 4: Commit**

```bash
git add frontend/src/views/CompanyProfile.tsx frontend/src/views/IntelQueue.tsx
git commit -m "style: light-mode flip — CompanyProfile, IntelQueue"
```

---

## Task 6: Alerts.tsx (19 dark classes — most complex)

**Files:**
- Modify: `frontend/src/views/Alerts.tsx`

**Step 1: Audit**

```bash
grep -n "bg-zinc\|border-zinc\|text-zinc-[1-4]\|placeholder-zinc\|hover:bg-zinc\|hover:text-zinc" frontend/src/views/Alerts.tsx
```

**Step 2: Apply tokens — focus on form inputs (highest density)**

From the earlier audit, Alerts has many `bg-zinc-800 border-zinc-700 text-zinc-200` form inputs. Replace all with:
```
bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-amber-400
```

The "Create Alert Rule" card header:
```
bg-zinc-900 border border-zinc-700 → bg-white border border-slate-200 shadow-sm
text-zinc-200 → text-slate-800
text-zinc-500 hover:text-zinc-300 → text-slate-400 hover:text-slate-600
```

**Step 3: Commit**

```bash
git add frontend/src/views/Alerts.tsx
git commit -m "style: light-mode flip — Alerts (forms + rule cards)"
```

---

## Task 7: Pre-delivery checklist audit

**Files:**
- Read-only audit across all modified views

**Step 1: cursor-pointer audit**

```bash
grep -rn "onClick" frontend/src/views/ | grep -v "cursor-pointer" | grep "className=" | head -20
```

Any `onClick` handler without `cursor-pointer` in its className needs it added.

**Step 2: Contrast check — text on white**

Verify no remaining `text-zinc-700` or lighter on white backgrounds (those are #3f3f46 on white = 4.1:1 ratio, below WCAG AA 4.5:1).

Run:
```bash
grep -rn "text-zinc-700\|text-zinc-600" frontend/src/views/ | grep -v "\.tsx:#\|//\|amber\|emerald"
```

Replace any remaining `text-zinc-700` → `text-slate-500` (which is #64748b on white = 4.6:1 ✓).

**Step 3: Shared components check**

```bash
grep -rn "bg-zinc\|border-zinc\|text-zinc-[1-4]" frontend/src/components/ | grep -v "Sidebar\|CommandPalette"
```

Sidebar.tsx intentionally stays dark — skip it. Flag any other component that still has dark classes.

**Step 4: Final commit**

```bash
git add -A
git commit -m "style: pre-delivery a11y pass — cursor-pointer, contrast, shared components"
```

---

## Task 8: Deploy and visual QA

**Step 1: Deploy**

```bash
railway up --detach
```

**Step 2: Visual QA checklist**

Open each route and verify:

| Route | Check |
|---|---|
| `/` (DealFeed) | White content, amber accents, dark sidebar |
| `/heatmap` | Chart container white, tab pills light |
| `/trends` | Stat cards white shadow-sm, chart borders slate |
| `/investors` | Leaderboard table slate-50 header |
| `/network` | Graph white bg |
| `/intel` | Queue list white cards |
| `/alerts` | Form inputs white, rule cards white |
| `/watchlist` | List items white |
| `/admin` | Admin cards white |
| Company profile | Hero white, stat cards white |

**Step 3: Push and open PR**

```bash
git push
# Open: https://github.com/dferraros/deal-radar/pull/new/feat/light-mode-redesign
```

---

## Known Constraints

- **Sidebar stays dark** — intentional Harmonic-style split. Do not touch `Sidebar.tsx` bg classes.
- **CommandPalette** — also stays dark (modal overlay, dark is conventional).
- **Chart colors** (Recharts/D3 inside views) — amber/emerald/violet data colors stay. Only container bg/border/text flips.
- **Glow effects** (`.amount-glow`, `.mega-glow`) — already use filter drop-shadow, fine on light bg.
- **Emoji flags** (🌎 🇪🇸 in FilterBar) — keep, semantic geo indicators, not decorative icons.
