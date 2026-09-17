# BalanceProof

Bank statement PDFs → verified Excel/CSV exports. The converter that proves its work.

Every export passes a **reconciliation check** before you download it:

- opening balance + Σ transactions = closing balance
- running-balance continuity per row
- duplicate & date-order detection
- confidence score per statement

## Architecture

```
browser ──▶ Next.js web app ──▶ FastAPI worker
             │  (upload, jobs,      │  (pdfplumber extraction,
             │   exports, billing)   │   bank configs, validation)
             ▼                      │
           Postgres ◀── results jsonb
           ./data/uploads (shared volume)
```

- `apps/web` — Next.js 14 (App Router) + Tailwind. Upload UI, REST API routes, Postgres via `postgres` (porsager).
- `apps/worker` — FastAPI + pdfplumber. Bank-specific parsers (`app/banks/`) with a generic fallback, plus the validation engine (`app/validate.py`) — the moat.

## Quickstart (Docker)

```bash
cp .env.example .env
docker compose up --build
# web    → http://localhost:3000
# worker → http://localhost:8000/healthz
```

## Quickstart (local dev)

```bash
# terminal 1
docker compose up db

# terminal 2: worker
cd apps/worker && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# terminal 3: web
cd apps/web && npm install && npm run dev
```

## Roadmap

- [ ] v0.1 — PDF → CSV with balance validation (this repo)
- [ ] XLSX + QBO/OFX export formats
- [ ] Top-20 bank config library + public accuracy benchmark page
- [ ] Batch/ZIP upload, client folders (Firm tier)
- [ ] Stripe credits + subscriptions ($9 pack / $19 Starter / $39 Pro / $79 Firm)
- [ ] Programmatic SEO pages (`/{bank}-bank-statement-to-excel` × top 200 banks)
