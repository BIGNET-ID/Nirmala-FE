<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project guardrails (v3)

_v2 — 2026-08-28: added design/anti-AI-sloop guardrails._
_v3 — 2026-08-28: added exception for meteorological-convention color spectrums (rain indicator)._
_v4 — 2026-09-03: split the rain-ramp exception into two layers — Rain Density stays qualitative/sensor-based, a new OpenWeather Rain toggle uses real mm/h data._

## Environment variables & secrets
- Never commit `.env.local` or any file containing real API keys/tokens. It's gitignored (`.env*.local` in `.gitignore`) — keep it that way.
- `.env.example` is the source of truth for which env vars the app needs, with placeholder values only. When you add a new env var to the code, add it to `.env.example` too (placeholder, not the real value).
- If a secret ever gets committed or pushed (even briefly), treat it as compromised — rotate it, don't just remove it from a later commit.

## Repo layout note
- Canonical GitHub repo: `BIGNET-ID/Nirmala-FE` (this repo). Local working copy during development has previously lived at `~/Documents/Kerjaan/Nirmala 3` — its git history was merged into this repo's `main`. Prefer working directly in this repo going forward to avoid the two diverging.

## Design & visual guardrails (anti AI-sloop)

Added after a design revision (2026-08-28) triggered by feedback that the dashboard read as "AI-generated/generic" — especially its color choices — with no clear signal to a non-technical user that Nirmala is a weather forecasting/monitoring platform. Rules below are synthesized from an audit of common AI-generated-UI patterns and a design-system query for "enterprise dashboard, professional, trustworthy" (which recommended navy `#0F172A` + accent blue `#0369A1`, an "Accessible & Ethical" style, and explicitly flagged "AI purple/pink gradients" to avoid). Follow these for any new UI or visual changes to Nirmala:

**Color & surfaces**
- Don't use a rainbow/jet colormap (blue→green→yellow→orange→red→purple) for sequential data without meaning. Default to a sequential single-hue scale for normal intensity (e.g. light→dark blue); reserve a second color (e.g. red) strictly for an extreme/danger threshold, not as part of the regular gradient. Always pair a color ramp with a numeric/text legend — never rely on color alone (see `ColorRampLegend`).
  - **Exception (added v3):** a full spectrum (blue→cyan→green→yellow→orange→red) IS acceptable when it follows a recognized meteorological convention the user expects (Windy/BMKG-style precipitation scale) AND is always paired with a clear tick legend. Nirmala's rain-density indicator (`METRICS.rain` in `src/constants/metrics.js`, `RAIN_RAMP` in `CanvasOverlay.jsx`) intentionally uses this spectrum — this is a deliberate match to how other weather platforms look, not an accidental "AI rainbow". Don't "fix" it back to single-hue. Rain Density's own tick labels stay qualitative (Rendah/Sedang/Tinggi/Ekstrem / Low/Moderate/High/Extreme) — it has no real per-point measurement (sensors only report binary `is_raining`), so it must not fabricate mm/h numbers. Separately, the OpenWeather "Rain" toggle (`METRICS.openweatherRain` in `src/constants/metrics.js`, `OpenWeatherRainLayer.jsx`) is a different layer with a different, real data source — OpenWeather's own grid-sampled mm/h precipitation data (see `RAIN_MM_BREAKPOINTS` in `src/constants/metrics.js` and `mmToT()` in `src/lib/rainRamp.js`) — so its real mm/h tick labels are legitimate and must not be "corrected" back to qualitative words. Any *other* rain-related display with no real per-point measurement still must not fabricate mm/h numbers.
- Avoid "AI purple/pink gradients" and dark-navy + neon-cyan combinations ("sci-fi command center" cliché) as a default theme.
- At most **one** dominant accent color outside the neutral palette — don't mix several "cool" colors at once. Accent colors follow Nirmala's existing brand tokens (`--blue-navy`, `--blue-primary`, `--nirmala-cyan`), not new neon colors.
- Avoid `backdrop-filter: blur()` + translucent background (glassmorphism) and neon/glow box-shadows as default panel styling — this is a generic "AI-generated dashboard" pattern. Default to solid panels (solid `background` + thin 0.5-1px border), tinted soft shadows if needed, never a colored glow.
- Avoid perfectly symmetric 45° linear gradients as empty decoration; if depth is needed, use shade variation within the same palette, not a new color.

**Typography & content**
- Avoid all-caps on every subheader — use sentence case (also applies to microcopy labels, badges, buttons).
- Avoid AI copywriting clichés ("Seamless", "Next-Gen", "Unleash", "Elevate", etc.) in Nirmala's UI/microcopy — use direct, specific language, especially since the audience includes non-technical executives who need clarity, not jargon.
- Don't artificially round numbers/data (`99.99%`, `50%`) when the underlying source is precise — show the sensor's actual value.

**Layout & interaction**
- Hover/active states are required on all interactive elements (buttons, nav tabs, layer toggles) — smooth 150-300ms transitions, not instant.
- Keyboard focus rings must stay visible — never removed for aesthetics.
- z-index must follow a defined scale (not an arbitrary `9999`) — relevant for overlay panels/drawers above the map.

**Product identity**
- Every primary page a user sees after login must clearly signal that Nirmala is a weather forecasting/monitoring platform (product name + short tagline) — never drop straight into a technical view with no context, especially for non-technical users (CEO/executives).

**Icons** — Material Symbols/Iconify via `AppIcon` stays fine functionally, but don't add new generic decorative icons without need; consider consistency with Nirmala's identity first (custom iconography is a separate, later iteration).

