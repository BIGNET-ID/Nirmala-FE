# English-copy audit — 2026-09-07 dashboard UI/UX update (Task 14)

Verification-only pass over every new/changed user-facing string introduced by
Tasks 1–13 of the 2026-09-07 dashboard UI/UX update plan. Strings below are
copied verbatim from the current source (grepped/read directly, not recalled
from memory), each tagged with its file and line number as of this audit.

Cross-reference: `docs/superpowers/specs/2026-09-01-batch4-english-glossary.md`
is the standing ID→EN glossary for this codebase's microcopy — used here to
check the new strings for consistency with already-agreed terms and style
(sentence case vs. Title Case, terminology re-use, etc.).

---

## 1. SegmentTogglePanel.jsx

### 1a. "Show all layers" master-toggle label (Task 3)

| File:line | Text |
|---|---|
| `src/components/dashboard/SegmentTogglePanel.jsx:422` | `Show all layers` |

Context: caption next to the per-tab master on/off `Switch` in
`CollapsiblePanel`, paired with a tooltip that reads `Turn off all filters` /
`Turn on all filters` (line 424, unchanged from the Batch-4 glossary: "Matikan
semua filter" / "Aktifkan semua filter").

**Observation:** the static label says "layers" while the switch's own
tooltip says "filters" ("Turn off all **filters**" / "Turn on all
**filters**"). Same control, two different nouns for what it does.

### 1b. Rain / Clouds / Wind button labels + aria-labels (Task 4)

| File:line | Visible label | `aria-label` |
|---|---|---|
| `src/components/dashboard/SegmentTogglePanel.jsx:194–196` | `Rain` | `Toggle OpenWeather rain overlay` (line 191) |
| `src/components/dashboard/SegmentTogglePanel.jsx:197–206` | `Clouds` | `Toggle OpenWeather cloud overlay` (line 201) |
| `src/components/dashboard/SegmentTogglePanel.jsx:210–224` | `Wind` | `Toggle wind particles` (line 214) |

**Observations:**
- Visible label "Clouds" (plural) vs. its `aria-label` "cloud overlay"
  (singular) — "Rain"/"rain overlay" and "Wind"/"wind particles" don't have
  this plural/singular mismatch since "Rain" and "Wind" are mass nouns.
- The Wind `aria-label` ("Toggle wind particles") names the rendering
  technique (particles) rather than the layer, unlike the Rain/Clouds
  aria-labels which both say "OpenWeather ... overlay". Minor inconsistency
  in pattern, though "Wind" is a genuinely different (non-OpenWeather-tile)
  layer, so the divergence may be intentional.

---

## 2. MapTypeControl.jsx — 3 segment labels/tooltips (Task 7)

| File:line | `id` | `label` (used as both `Tooltip title` and `aria-label`) |
|---|---|---|
| `src/components/map/MapTypeControl.jsx:8` | `roadmap` | `Default map` |
| `src/components/map/MapTypeControl.jsx:9` | `satellite` | `Satellite` |
| `src/components/map/MapTypeControl.jsx:10` | `outline` | `Outline` |

**Observation:** "Default map" is a two-word noun phrase while its siblings
("Satellite", "Outline") are single words — the odd one out in an otherwise
parallel three-item list. ("Default map" is also the only label that
describes the *category* the option is the default of, rather than naming
the style itself the way "Satellite"/"Outline" do.)

---

## 3. ProvinceFilterSelect.jsx (Task 9 — unchanged text, now more visible)

| File:line | Text |
|---|---|
| `src/components/dashboard/ProvinceFilterSelect.jsx:91` (desktop eyebrow), `:124` (compact popover eyebrow) | `Province` |
| `src/components/dashboard/ProvinceFilterSelect.jsx:51` | `Search a region...` (Autocomplete placeholder) |
| `src/components/dashboard/ProvinceFilterSelect.jsx:19` | `No sensor data detected in this region yet` (`MatchedCaption`, zero-match case) |
| `src/components/dashboard/ProvinceFilterSelect.jsx:23` | `{matched.total}` ... `sensors` ... `{matched.raining}` ... `reporting rain` (`MatchedCaption`, match case) |

Related, not explicitly listed in the brief but same component:
- Line 100: `Province: ${selected.name}` (compact tooltip) / `Search province` (fallback tooltip + `aria-label`, lines 100–101).

**Observations:**
- Placeholder uses an ellipsis ("Search a region...") built from three literal
  dots rather than the `…` (U+2026) character; `DashboardHeader`'s equivalent
  loading string in the Batch-4 glossary ("Memuat data sensor…" → "Loading
  sensor data…") uses the real ellipsis character. Cosmetic-only, not a
  correctness bug, but an inconsistency in the same codebase.
- Terminology: this component says "region" throughout ("Search a region...",
  "in this region yet") while its own eyebrow label two lines above it says
  "Province" — i.e. the same UI element is called "Province" in one string
  and "region" in the next. The original Batch-4 glossary row for this
  component's matched-count caption was `{matched.total} sensor di
  {selected.name}` → `{matched.total} sensors in {selected.name}` (naming the
  selected province), but the current code (unchanged by Task 9, carried over
  from whenever it last changed) has simplified this to just `{total}
  sensors ... reporting rain` with no province name at all — flagged here
  for visibility per the brief's "include for completeness" instruction, not
  as a Task 9 regression.

---

## 4. SensorDetailDrawer.jsx — new `Meta` labels (Task 12)

| File:line | Label | Sibling labels in the same `Stack` (for style comparison) |
|---|---|---|
| `src/components/dashboard/SensorDetailDrawer.jsx:178` | `Nearest BMKG region` | — |
| `src/components/dashboard/SensorDetailDrawer.jsx:180` | `Temperature (BMKG)` | — |
| `src/components/dashboard/SensorDetailDrawer.jsx:181` | `Humidity (BMKG)` | — |
| `src/components/dashboard/SensorDetailDrawer.jsx:171` | `Coordinates` (pre-existing) | single word, case-neutral |
| `src/components/dashboard/SensorDetailDrawer.jsx:173` | `Currently Raining` (pre-existing) | Title Case |
| `src/components/dashboard/SensorDetailDrawer.jsx:174` | `Last Update` (pre-existing) | Title Case |

**Observation:** every pre-existing `Meta` label in this drawer that has more
than one word is Title Case ("Currently Raining", "Last Update"). The three
new Task-12 labels break that local pattern: "Temperature (BMKG)" and
"Humidity (BMKG)" are Title Case (consistent), but **"Nearest BMKG region"
lowercases "region"** — it should likely read "Nearest BMKG Region" to match
"Currently Raining" / "Last Update" directly above it in the same `Stack`.

---

## Summary of candidate issues for the doc-coauthoring pass to weigh in on

1. `SegmentTogglePanel.jsx:422` "Show all layers" vs. its own tooltip's
   "filters" (lines 424) — same control, two nouns.
2. `SegmentTogglePanel.jsx:201` aria-label "cloud overlay" (singular) vs.
   visible label "Clouds" (plural).
3. `MapTypeControl.jsx:8` "Default map" — two words among two one-word
   siblings ("Satellite", "Outline").
4. `ProvinceFilterSelect.jsx` "Province" (eyebrow) vs. "region" (placeholder
   + caption) — same field named two ways.
5. `SensorDetailDrawer.jsx:178` "Nearest BMKG region" — lowercase "region"
   breaks the Title Case used by sibling labels "Currently Raining" / "Last
   Update" in the same metadata block.

---

## Verification pass (doc-coauthoring skill, Stage 3 "Reader Testing" applied)

The `doc-coauthoring` skill loaded is built for co-authoring a *new* document
with a live user (context gathering → section drafting → reader testing with
a fresh sub-agent). This document was already fully compiled before
invoking the skill, and Task 14's parent brief disallows dispatching
subagents for this task — so the applicable part of the workflow is Stage 3
("Reader Testing"): predict the questions a reader would ask, then answer
them against the actual source (re-verified by re-reading the four files
above), checking for contradictions, missed errors, and whether each
candidate issue is genuine or bikeshedding. Performed directly rather than
via a fresh sub-agent instance, per the no-subagents constraint on this task.

**Reader questions checked:** "Which of the 5 candidates are real bugs vs.
nitpicks?" / "Does the doc's own reasoning hold up against the live source?"
/ "Did it miss anything?"

**Verdicts:**

1. **"Show all layers" vs. "filters" tooltip — CONFIRM, fix.** Task 3 paired
   a *new* "layers"-worded label with a pre-existing "filters"-worded
   tooltip on the exact same switch. "Layers" is the term used everywhere
   else in this UI (MapControls' `layers-rounded`/`layers-clear-rounded`
   icons, the Space/Ground segment panels themselves) — "filters" is an
   internal-only name (`handleResetFilters`, `skyFilterActive`) that leaked
   into one user-facing string. Fixed: tooltip now says "Turn off/on all
   layers".
2. **aria-label "cloud overlay" vs. "Clouds" — REJECT, non-issue.**
   "cloud overlay" is a normal adjectival-noun compound (like "cloud cover",
   "cloud layer") independent of the visible button's plural label; screen
   readers announcing "Toggle OpenWeather cloud overlay" is not confusing or
   incorrect. Bikeshedding — no fix applied.
3. **"Default map" vs. "Satellite"/"Outline" — REJECT, non-issue.**
   A single word here ("Default") would be ambiguous out of context (default
   *what*?), unlike "Satellite"/"Outline" which are self-explanatory map
   styles. The two-word phrasing is a deliberate concession to clarity, not
   an English error. No fix applied.
4. **"Province" vs. "region" — REJECT, verified intentional.** Re-reading
   `ProvinceFilterSelect.jsx`'s own doc comment (lines 67–71) shows this is
   not an accidental inconsistency: "an always-visible search card (matches
   the product reference: rounded card, 'Province' eyebrow, 'Search a
   region...' input, chevron)" — both exact strings were copied from an
   approved design reference. Changing either would contradict that
   reference. No fix applied; doc above updated to note this is a verified
   non-issue rather than an open question.
5. **"Nearest BMKG region" — CONFIRM, fix.** Genuine, in-scope (Task 12)
   capitalization inconsistency against its own sibling labels in the same
   `Stack`. Fixed: now "Nearest BMKG Region".

**Missed items check:** re-read every quoted string in sections 1–4 above
against the live source a second time for typos/grammar beyond the 5
candidates — none found (all other strings are grammatically correct and
internally consistent).

**Corrections applied to source (see commits):**
- `src/components/dashboard/SensorDetailDrawer.jsx:178` — `Nearest BMKG region` → `Nearest BMKG Region`
- `src/components/dashboard/SegmentTogglePanel.jsx:424` — `Turn off all filters` / `Turn on all filters` → `Turn off all layers` / `Turn on all layers`
