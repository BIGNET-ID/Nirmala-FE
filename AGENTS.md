<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project guardrails

## Environment variables & secrets
- Never commit `.env.local` or any file containing real API keys/tokens. It's gitignored (`.env*.local` in `.gitignore`) — keep it that way.
- `.env.example` is the source of truth for which env vars the app needs, with placeholder values only. When you add a new env var to the code, add it to `.env.example` too (placeholder, not the real value).
- If a secret ever gets committed or pushed (even briefly), treat it as compromised — rotate it, don't just remove it from a later commit.

## Repo layout note
- Canonical GitHub repo: `BIGNET-ID/Nirmala-FE` (this repo). Local working copy during development has previously lived at `~/Documents/Kerjaan/Nirmala 3` — its git history was merged into this repo's `main`. Prefer working directly in this repo going forward to avoid the two diverging.

