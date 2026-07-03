# Webhook Automation Engine

An async, multi-tenant webhook ingestion + automation-rule engine. Built with
NestJS, BullMQ/Redis, and MongoDB, per the spec in the assignment doc.

## Quick start

```bash
docker-compose up --build
```

This starts Mongo, Redis, the backend API+worker (port `3000`), and the UI
(port `5173`).

Then seed a couple of demo tenants and rules:

```bash
cd backend
npm install
npm run seed
```

Fire some sample webhook deliveries (including a duplicate re-delivery and a
bad-signature attempt) at the running stack:

```bash
node sample-data/send-sample-webhooks.js
```

Open `http://localhost:5173`, pick a tenant from the dropdown ("logged in
as"), and watch events land, jobs run, and (for the "Sync every paid order"
rule, which has a 30% simulated failure rate) a job go to `partial_failure`
with a **Replay** button.

### Running without Docker

```bash
# terminal 1
docker run -p 27017:27017 mongo:7
# terminal 2
docker run -p 6379:6379 redis:7-alpine
# terminal 3
cd backend && cp .env.example .env && npm install && npm run start:dev
# terminal 4
cd frontend && cp .env.example .env && npm install && npm run dev
```

## How it works

**Ingestion** (`POST /webhooks/:tenantSlug/:source`) — the tenant comes from
the URL, resolved server-side, so there's no header a caller can spoof to
land in another tenant's pipeline. The raw request body is HMAC-verified
against a per-tenant, per-source secret *before* anything is parsed or
touched in Mongo. Rejected requests (bad signature, missing event type,
invalid JSON) never reach the database. A unique compound Mongo index on
`(tenantId, source, dedupeKey)` is the actual idempotency guarantee — not
application logic — so two concurrent re-deliveries of the same event can't
both succeed even under a race; the loser gets a clean `duplicate` response.
The event is stored, a lightweight job (just the Mongo `_id`) is pushed to
BullMQ, and the HTTP response returns immediately. No rule evaluation
happens on the request path.

**Processing** (BullMQ worker, `src/queue/webhook.processor.ts`) — loads the
event, finds enabled rules matching `(source, eventType)`, evaluates each
rule's conditions (`equals` / `gt` / `contains`, AND-combined) against the
payload, and for matching rules runs the configured actions in order,
recording a `JobRun` with a per-action result. Two action types are
implemented: `webhook_notify` (a real outbound HTTP POST — genuinely fails
on timeout/non-2xx, demonstrating real downstream failure) and `crm_update`
(upserts into a simulated CRM collection; supports an injectable
`simulateFailureRate` for demoing retries without needing a flaky real
dependency).

**Crash/interruption recovery** — `JobRun` upsert-by-(event, rule) plus
per-action status means that if the worker is killed mid-job and BullMQ
retries it, the retry is idempotent: rule matching re-runs (cheap), but any
action already recorded as `succeeded` is skipped, and only the actions that
were still `pending`/`failed` execute again. So a crash never causes a
double Slack notification, and never silently drops the event either — it
just resumes where it left off.

**Visibility & recovery** — `GET /jobs` lists every job run with status and
per-action errors; `POST /jobs/:id/replay` resets non-succeeded actions on
that job run to pending and re-enqueues a dedicated `replay-job-run` job
that reuses the same idempotent action-runner.

**Tenant isolation** — every tenant-scoped controller (`/rules`, `/jobs`,
`/webhooks` GET) sits behind `TenantGuard`, which resolves the acting tenant
from an `x-tenant-slug` header (the stubbed "login as tenant" auth) and
attaches `req.tenantId`. Every service method takes `tenantId` as a
mandatory parameter sourced *only* from that guard — never from a
client-supplied body/query field — and every Mongo query filters on it, with
compound indexes on `tenantId` as the first key. There is no code path
where tenant B's id can be substituted to read tenant A's data.

## Project layout

```
backend/src/
  webhooks/    ingestion controller + service (HMAC verify, dedupe, enqueue)
  rules/       rule CRUD + condition evaluator
  jobs/        job-run CRUD + replay
  queue/       BullMQ processor + action implementations
  tenants/     tenant CRUD + the stubbed auth's lookup
  common/      TenantGuard, @CurrentTenant() decorator
frontend/src/  read-only tables (Events / Job Runs / Rules) + tenant picker
sample-data/   script that fires realistic sample deliveries
```

---

## The scaling question

*One tenant processes 500,000 Shopify orders/day, 3 webhooks per order.*

**First, the arithmetic, because it changes the answer.** 500,000 × 3 =
1,500,000 events/day, not 1,500 — averaging **~17 events/sec**, with a 10x
flash-sale spike putting sustained load around **~175 events/sec**, and
likely higher instantaneous bursts within that (flash sales don't spike
smoothly). I'm designing against ~175 eps sustained, bursting higher.

### Where this design breaks first

It's **not** Mongo and **not** Redis at this volume. A single Mongo replica
set comfortably does thousands of indexed writes/sec; the ingestion insert
and the `JobRun` upserts are both single-document, indexed operations. Redis
at 175 jobs/sec, each maybe a few KB, is nowhere near saturated, and
`removeOnComplete: 1000` keeps completed-job memory bounded regardless of
total daily volume.

**The actual bottleneck is the worker's action execution loop**, specifically
that `runActionsForJobRun` `await`s each action **sequentially**, and one of
the two action types (`webhook_notify`) makes a **real outbound HTTP call**
to a third party (Slack, a CRM, etc.) whose latency I don't control —
typically 100ms–1-2s, occasionally much worse under the third party's own
load. With `concurrency: 10` on the processor, sustained throughput is
roughly:

```
max throughput ≈ concurrency / avg_seconds_per_job
```

If a job run has 2 actions averaging 300ms each (sequential = 600ms/job),
10 concurrent workers give ~16-17 jobs/sec — which is *already at* my
average load with zero headroom, and an order of magnitude short of the
flash-sale burst. This is the first thing that breaks: queue depth (BullMQ
`waiting` count) climbs, event-to-action latency grows, and if a downstream
target itself slows down under the burst (its own flash-sale problem), it
gets worse, not better, exactly when tenants need it most.

**How I'd confirm it's actually this, not a guess:** watch three numbers
under load — BullMQ's `getJobCounts()` (waiting/active/failed), the
processor's own action execution time (I'd log `outcome` timing per action
type), and Mongo's slow-query log. If `waiting` climbs while active stays
pinned at `concurrency` and Mongo shows no slow queries, that confirms the
worker's own concurrency ceiling combined with downstream latency is the
limiter, not the database.

### What I'd change, in order

1. **Run actions concurrently within a job when they're independent**
   (`Promise.allSettled` instead of the sequential `for` loop). This is free
   throughput — most rules' actions don't depend on each other's output —
   and roughly halves per-job latency for the two-action case with no
   infrastructure change.

2. **Scale worker concurrency and worker *processes* independently of the
   API.** Right now the HTTP server and the BullMQ worker run in the same
   Nest process (`QueueModule` imported into `AppModule`). I'd split them
   into two deployables sharing the same Mongo/Redis, so the ingestion API
   (which is cheap — one indexed insert, one queue push) can stay small
   while worker replicas scale horizontally with concurrency tuned per
   replica. BullMQ workers pulling from the same queue name coordinate
   through Redis automatically, so this is a config/deployment change, not
   a code change.

3. **Isolate slow downstream calls into their own queue**, separate from
   rule *evaluation*. Right now a slow `webhook_notify` target head-of-line
   blocks that worker slot from picking up the next event's rule evaluation
   (which is otherwise fast). Splitting "evaluate rules for this event" and
   "execute this one action" into two queues means a flaky CRM only backs
   up CRM-update jobs, not the whole tenant's event processing — and lets me
   apply a BullMQ rate limiter scoped just to the action queue if the
   downstream target itself rate-limits us (common with real Slack/CRM
   APIs), rather than throttling ingestion.

4. **Only after 1–3**, if Mongo actually shows up as a bottleneck under
   real load testing (which I don't expect at this volume): tune write
   concern on the initial event insert, and consider sharding
   `WebhookEvent`/`JobRun` by `tenantId` — which is a natural shard key here
   since every query in the system is already tenant-scoped first.

5. **Load-test the flash-sale scenario deliberately** (k6/autocannon
   replaying a burst pattern, not just steady load) before the enterprise
   tenant's launch, specifically to find the actual concurrency ceiling
   rather than sizing off the average-load math above — bursts are where
   sequential action execution and single-process worker limits actually
   bite.

I'm deliberately *not* reaching for Mongo sharding or a message-broker
swap (e.g., Kafka) first: at 175 events/sec even with a 10x further margin,
a well-tuned Redis+BullMQ setup with properly split queues and horizontally
scaled workers has a lot of headroom left, and those bigger infrastructure
changes cost more to operate than they'd buy at this scale.
