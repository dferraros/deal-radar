# Deal Radar — Phase 8: Dark SaaS Premium UI Redesign

**Date:** 2026-04-05
**Author:** Daniel Ferraro
**Status:** Approved

---

## Goal

Transform Deal Radar from a functional admin dashboard into a compelling Dark SaaS Premium product — polished enough to impress VC analysts and startup founders, while remaining dense and fast for power users. Key differentiator: niche geo coverage (LatAm/Spain/Europe) + AI intelligence layer, presented at CB Insights quality.

---

## Design Philosophy

- **Semantic color** — every color means something. Not just "dark zinc with amber."
- **Data hierarchy** — the eye goes to the most important signal first, not top-left by default.
- **Speed** — Cmd+K command palette, pre-filtered drilldowns, no page reloads for context.
- **Intelligence visible** — AI summaries and insights are front-and-center, not footnotes.

---

## 1. Design System

### Color Tokens

| Token | Value | Meaning |
|-------|-------|---------|
| `accent-primary` | amber-400 | Brand, active nav, CTA |
| `signal-vc` | emerald-400 | VC rounds, growth, amounts |
| `signal-crypto` | violet-400 | Crypto/web3 deal type |
| `signal-ma` | sky-400 | M&A deal type |
| `signal-ipo` | rose-400 | IPO deal type |
| `surface-base` | zinc-950 | Page background |
| `surface-card` | zinc-900 | Cards, panels |
| `surface-elevated` | zinc-800 | Hover states, borders |

### Typography

- **Body**: Inter (keep)
- **Numbers**: `font-feature-settings: "tnum"` on all numeric columns (tabular figures)
- **KPI values**: `text-3xl font-bold tabular-nums`
- **Amounts**: emerald text with `drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]` glow
- **Mono labels**: JetBrains Mono (keep for source names, timestamps, badges)

### Component Upgrades

- Cards: `rounded-xl`, `border-zinc-800/60`, `shadow-xl`
- Active nav: `border-l-2 border-amber-400` + amber tint background
- Hover rows: `ring-1 ring-zinc-700/50` — elevated, not just color change
- Sector tags: colored pills (not plain text)
- Geo: flag emoji prefix (`🇧🇷`, `🇪🇸`, `🇺🇸`, etc.)

---

## 2. Navigation & Global Chrome

### Sidebar Changes

- **Brand mark**: radar pulse SVG icon + `DEAL RADAR` tracked caps logotype
- **Active item**: left amber border + tint (replace flat `bg-zinc-800`)
- **Nav badges**: live deal count / alert count pills on each nav item
- **Remove `Navbar.tsx`** entirely — sidebar is sole navigation, reclaim ~80px vertical space on all views

### Global Pulse Bar

- 2px bar at very top of viewport (`fixed top-0 w-full z-50`)
- Static amber at rest
- Left-to-right scan animation during ingestion (wire to `/api/admin/runs` polling)

### Command Palette (Cmd+K)

- Floating modal over the app, triggered by `Cmd+K` / `Ctrl+K`
- Search companies by name → jump to company profile
- Search by sector/geo → jump to filtered Deal Feed
- Navigate views by name (`/briefing`, `/trends`)
- Built with a simple `useState` + `useEffect` keydown listener + filtered results list
- **Files**: new `frontend/src/components/CommandPalette.tsx`, wired in `Layout.tsx`

---

## 3. Deal Feed (Homepage)

### "Today at a Glance" Strip

Full-width top strip replacing the 3 basic KPI cards:

```
$2.4B raised this week  ▲14% WoW  |  47 deals  |  Top sector: Crypto  |  Biggest: Stripe $600M
```

- Capital figure: count-up animation on load, sparkline trend (last 8 weeks inline)
- WoW delta: green arrow + % if positive, red if negative
- "Biggest deal" callout: company name + amount, click navigates to company profile

### Hero Deal Cards

3 horizontal cards replacing the briefing text banner, showing today's top 3 deals by amount:

```
[Company Name]          [Round]   [$Amount]
[Lead Investor]    [Sector pill]  [Geo flag]
```

- Amount: large, emerald, with glow
- Card background: subtle left-border colored stripe by deal type
- Click → company profile

### Deal Table Upgrades

- **Left-border stripe** per deal type: 3px colored border replaces plain badge
  - VC → emerald, Crypto → violet, M&A → sky, IPO → rose
- **Amount cell**: scaled background intensity — `$500M` gets brighter cell than `$5M`
  - Implementation: compute percentile rank, map to `bg-emerald-950/0` → `bg-emerald-950/80`
- **Momentum column**: 6 mini-dots showing funding round count for that company
  - 1 dot (zinc) = first deal, up to 6 dots (emerald) = 6+ rounds. Visual trajectory.
- **Sector**: colored pills (violet=crypto, emerald=fintech/vc, sky=saas, etc.)
- **Geo**: flag emoji + region label
- **Row hover**: slide-in preview panel (240px, fixed right side) with AI summary + investors — stays without clicking

### Filter Bar Upgrade

- Deal type + sector: pill toggles (not dropdowns) — click to activate, amber ring when active
- Active filters: dismissible amber tags displayed above table
- Geo + amount: keep as dropdowns (too many options for pills)

---

## 4. Trends View

- **Chart colors**: replace Tremor default blue with semantic palette (VC=emerald, crypto=violet, M&A=sky, IPO=rose)
- **AI Insight card**: amber left-border card above charts — single AI-generated sentence from briefing endpoint
  - Example: *"Crypto funding up 34% WoW, driven by 3 large raises in Asia"*
- **Custom tooltips**: dark card with deal count + capital formatted — not browser default

---

## 5. Heatmap View

- **Cell color ramp**: full emerald `50`→`950` saturation scale (not just opacity) — higher capital = saturated emerald
- **Zero cells**: `zinc-900` with subtle border
- **Hover ring**: visible ring + cursor pointer on all non-zero cells (drilldown already wired)

---

## 6. Investor Leaderboard

- **Rank treatment**: `#1` in amber-400, `#2`/`#3` in zinc-300, rest in zinc-500
- **Capital bar**: inline horizontal bar behind row text, scaled to max investor
- **Investor hover tooltip**: top 3 co-investors for that investor (from network data)

---

## 7. Investor Network

- **Node color by quartile**: low=zinc-600, mid=amber-400, high=emerald-400 (not flat amber)
- **Edge color by weight**: thin/dark for 1 co-investment, thick/amber for 3+
- **Hover focus**: highlight connected edges, dim everything else (focus mode)

---

## 8. Company Profile

- **Header**: full-width banner with large company initial, sector pill, geo flag, founded year
- **Funding timeline**: vertical timeline (not table) — circles sized by amount, connected line
  - Each node: round label, amount, date, lead investor
- **Investor chips**: clickable → filters leaderboard to that investor
- **Watchlist toggle**: large amber star, prominent placement

---

## 9. Alerts & Watchlist

### Alerts

- Add "Triggered alerts" feed below the form — same row style as Deal Feed
- Each triggered alert shows: rule label + matching deal inline (company, amount, date)

### Watchlist

- Same table as Deal Feed
- Amber left-border on every row (pinned identity)
- New `Last Activity` column: "X days ago" — shows freshness of each watched company

---

## Execution Order

| # | Feature | Impact | Effort |
|---|---------|--------|--------|
| 1 | Design system tokens + typography | High | Low |
| 2 | Deal Feed hero strip + hero cards | High | Medium |
| 3 | Deal table upgrades (borders, amounts, momentum, pills) | High | Medium |
| 4 | Sidebar + command palette | High | Medium |
| 5 | Trends chart colors + AI insight card | Medium | Low |
| 6 | Heatmap color ramp | Medium | Low |
| 7 | Investor leaderboard upgrades | Medium | Low |
| 8 | Investor network focus mode + color by quartile | Medium | Low |
| 9 | Company profile timeline | Medium | Medium |
| 10 | Alerts triggered feed + watchlist last-activity | Low | Low |

All changes are purely frontend — no backend schema changes required.
