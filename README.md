# EUDR ProofPack

EUDR ProofPack is an MVP MicroSaaS for small importers and suppliers preparing buyer-ready EUDR evidence packs. It collects importer details, commodity and batch data, supplier declarations, farm or plot coordinates, due-diligence documents, risk notes, and tokenized share links.

This product provides EUDR readiness and due-diligence support only. It is not legal advice, not official EUDR certification, and does not guarantee compliance.

## Launch Pricing

Pricing is listed in EUR because EUDR is EU-driven and most target buyers are EU-facing.

| Plan | Price | Best for | Included |
| --- | ---: | --- | --- |
| Starter | €49/month | Small importers and exporters preparing their first EUDR evidence packs | 1 user, 5 active proof packs, supplier upload links, basic ZIP/PDF export |
| Growth | €149/month | Recurring shipments and teams that need a repeatable supplier evidence workflow | 3-5 users, 25 active proof packs, supplier portal, audit trail, branded exports |
| Consultant | €399/month | Compliance consultants, brokers, and operators managing multiple clients | 15 users, 100+ proof packs, multi-client workspace, bulk CSV import, priority support |

Usage and higher-touch options:

- €99 one-time single proof pack export
- €25 per extra active proof pack
- Enterprise from €1,000/month for SSO, API access, custom retention, dedicated onboarding, and future ERP or TRACES workflows

Plan limits are enforced server-side. Starter, Growth, and Consultant cap active proof packs at 5, 25, and 100 respectively, and cap seats at 1, 5, and 15. Enterprise has unlimited caps. Extra proof packs are represented by `organizations.extra_proof_pack_allowance`, which increases the active proof pack limit without changing the base plan.

## Stack

- React, TypeScript, Vite, Tailwind CSS
- Cloudflare Workers for API/runtime
- Cloudflare D1 for relational data
- Cloudflare R2 for evidence files
- Cloudflare Queues for optional async export orchestration
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

Open the local URL printed by Vite, then create an account on `/login` with an email and a 12+ character password.

## Deploy

Production:

```bash
npm run db:migrate:remote
npm run deploy
```

Staging, using the separate resources configured under `env.staging`:

```bash
npm run db:migrate:staging
npm run deploy:staging
```

Secrets should be set with Wrangler prompts, never committed. Email verification delivery is production-ready when one of these configurations is present:

```bash
wrangler secret put EMAIL_WEBHOOK_URL
# or
wrangler secret put RESEND_API_KEY
wrangler secret put EMAIL_FROM
```

Set `REQUIRE_VERIFIED_EMAIL` to `true` after email delivery is configured.

Google OAuth is optional and appears on `/login` only when both secrets are present. Configure the authorized redirect URI in Google Cloud as `${APP_URL}/api/auth/oauth/google/callback`, then set:

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

A custom domain requires adding a DNS zone to the Cloudflare account, then adding the hostname route/custom domain in `wrangler.jsonc`.

## Features

- Landing page with compliance-safe language
- Password login, optional Google OAuth, secure sessions, logout revocation, and email verification tokens
- Dashboard metrics, status badges, recent activity, empty/loading/error states
- Multi-section proof pack editor
- Latitude/longitude server validation
- R2-backed document uploads with size and content-type checks
- Readiness score and missing item guidance
- Tokenized buyer share page
- Tokenized supplier portal for assigned fields and uploads
- Printable/downloadable JSON summary export and real ZIP archive export with uploaded R2 evidence files
- D1 migrations and local seed script

## Cloudflare Resources

Production uses one D1 database, one R2 bucket, and one queue. Staging uses its own D1 database, R2 bucket, and queue configured under `env.staging`:

- D1 binding: `DB`
- R2 binding: `PROOF_PACK_FILES`
- Queue binding: `ZIP_EXPORT_QUEUE`

The Worker uses bindings directly rather than Cloudflare REST APIs.

## Known Limitations

- Email verification can create secure tokens immediately; actual delivery requires `EMAIL_WEBHOOK_URL` or Resend secrets.
- Google OAuth requires a Google Cloud OAuth client with `${APP_URL}/api/auth/oauth/google/callback` as an authorized redirect URI.
- A custom domain cannot be bound until the Cloudflare account has a DNS zone for the desired hostname.
- PDF export is represented by a printable/shareable summary, JSON download, and ZIP archive.
- Map preview validates coordinates but does not render polygons yet.
- The MVP keeps team permissions simple after initial owner membership.

## Roadmap

- Stripe billing
- Mapbox or Leaflet polygon and GeoJSON support
- Country-risk data integration
- EU TRACES or EUDR system integration if applicable and available
- PDF generation
- Accountant or compliance consultant review workflow
- Team roles and permissions
- Audit log export

## Folder Structure

- `src/worker/index.ts`: Worker routes and queue consumer
- `src/worker/auth`: session and email verification helpers
- `src/worker/db`: D1 row types and queries
- `src/worker/export`: JSON and ZIP export helpers
- `src/worker/storage`: R2 upload helpers
- `src/worker/validation`: Zod schemas
- `src/frontend`: React app
- `migrations`: D1 schema
- `scripts/seed.ts`: local demo seed
- `docs`: product notes

