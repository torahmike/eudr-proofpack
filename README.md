# EUDR ProofPack

EUDR ProofPack is an MVP MicroSaaS for small importers and suppliers preparing buyer-ready EUDR evidence packs. It collects importer details, commodity and batch data, supplier declarations, farm or plot coordinates, due-diligence documents, risk notes, and tokenized share links.

This product provides EUDR readiness and due-diligence support only. It is not legal advice, not official EUDR certification, and does not guarantee compliance.

## Stack

- React, TypeScript, Vite, Tailwind CSS
- Cloudflare Workers for API/runtime
- Cloudflare D1 for relational data
- Cloudflare R2 for evidence files
- Cloudflare Queues placeholder for future ZIP export jobs
- Wrangler JSONC config with `nodejs_compat` and observability enabled

## Setup

```bash
npm install
npm run types
wrangler d1 create eudr-proofpack-db
wrangler r2 bucket create eudr-proofpack-files
wrangler queues create eudr-proofpack-zip-exports
```

Put the D1 database ID into `wrangler.jsonc`, then run:

```bash
npm run db:migrate:local
npm run db:seed
npm run dev
```

Open the local URL printed by Vite, then use `demo@proofpack.dev` on `/login`.

## Deploy

```bash
npm run db:migrate:remote
npm run deploy
```

Secrets should be set with Wrangler prompts, never committed:

```bash
wrangler secret put SOME_SECRET
```

The current MVP does not require production secrets because email magic links are mocked by direct email login.

## Features

- Landing page with compliance-safe language
- Demo passwordless login and organization model
- Dashboard metrics, status badges, recent activity, empty/loading/error states
- Multi-section proof pack editor
- Latitude/longitude server validation
- R2-backed document uploads with size and content-type checks
- Readiness score and missing item guidance
- Tokenized buyer share page
- Tokenized supplier portal for assigned fields and uploads
- Printable/downloadable JSON summary export
- D1 migrations and local seed script

## Cloudflare Resources

Create one D1 database, one R2 bucket, and one queue:

- D1 binding: `DB`
- R2 binding: `PROOF_PACK_FILES`
- Queue binding: `ZIP_EXPORT_QUEUE`

The Worker uses bindings directly rather than Cloudflare REST APIs.

## Known Limitations

- Login is a demo passwordless flow; real email magic links are not wired yet.
- PDF export is represented by a printable/shareable summary and JSON download.
- ZIP export is queued as a placeholder; archive assembly is a future Worker job.
- Map preview validates coordinates but does not render polygons yet.
- Rate limiting is a placeholder requirement and should be backed by a durable store before production.
- The MVP keeps team permissions simple after initial owner membership.

## Roadmap

- Real email magic links via Resend or Postmark
- Stripe billing
- Mapbox or Leaflet polygon and GeoJSON support
- Country-risk data integration
- EU TRACES or EUDR system integration if applicable and available
- PDF generation
- ZIP export Worker queue
- Accountant or compliance consultant review workflow
- Team roles and permissions
- Audit log export

## Folder Structure

- `src/worker/index.ts`: Worker routes and queue consumer
- `src/worker/auth`: session helpers
- `src/worker/db`: D1 row types and queries
- `src/worker/storage`: R2 upload helpers
- `src/worker/validation`: Zod schemas
- `src/frontend`: React app
- `migrations`: D1 schema
- `scripts/seed.ts`: local demo seed
- `docs`: product notes
