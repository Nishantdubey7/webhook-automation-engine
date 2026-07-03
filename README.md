# Webhook Automation Engine

An asynchronous, multi-tenant webhook automation engine built with **NestJS**, **BullMQ**, **MongoDB**, **Redis**, and **React**. The system ingests webhooks, processes them asynchronously using a queue, applies configurable automation rules, and provides replay support for failed jobs.

---

## Features

- Multi-tenant webhook ingestion
- HMAC signature verification
- Idempotent webhook processing
- Asynchronous job processing with BullMQ
- Rule-based automation engine
- Job status tracking and replay
- Failure recovery and retry support
- Simple dashboard for monitoring events, jobs, and rules

---

## Tech Stack

- Backend: NestJS
- Frontend: React (Vite)
- Database: MongoDB
- Queue: BullMQ + Redis
- Containerization: Docker

---

## Dashboard

The application provides a simple multi-tenant dashboard to monitor webhook events, automation rules, job execution status, and replay failed jobs.

### Job Runs

<p align="center">
  <img src="assets/dashboard.png" alt="Job Runs Dashboard" width="900">
</p>

### Incoming Events

<p align="center">
  <img src="assets/incoming-events.png" alt="Incoming Events" width="900">
</p>

### Rules

<p align="center">
  <img src="assets/rules.png" alt="Automation Rules" width="900">
</p>

```

## Project Structure

```

backend/
frontend/
sample-data/
docker-compose.yml

````

---

## Running the Project

### 1. Start the application

```bash
docker compose up --build
````

This starts:

- Backend (http://localhost:3000)
- Frontend (http://localhost:5173)
- MongoDB
- Redis

### 2. Seed the database

```bash
docker exec -it webhook-backend-1 npm run seed
```

This creates demo tenants and automation rules.

### 3. Send sample webhooks

```bash
node sample-data/send-sample-webhooks.js
```

The script demonstrates:

- Successful webhook processing
- Duplicate webhook detection
- Invalid signature rejection
- Multi-tenant webhook handling

---

## Data Model

The application consists of four main collections:

- **Tenant** – Stores tenant information and webhook signing secrets.
- **WebhookEvent** – Stores every incoming webhook for auditing, deduplication, and replay.
- **Rule** – Defines automation rules using triggers, conditions, and actions.
- **JobRun** – Tracks execution status, retries, failures, and replay information.

This separation keeps ingestion, rule configuration, and execution history independent while maintaining tenant isolation.

---

## Queue Design

Each webhook is acknowledged immediately after validation and stored in MongoDB.

Only the event ID is pushed to BullMQ. The worker:

1. Loads the event
2. Finds matching rules
3. Evaluates rule conditions
4. Executes configured actions
5. Stores the execution result in a JobRun document

If a worker crashes, BullMQ retries the job. Successful actions are skipped during replay, ensuring idempotent execution.

---

## Simulating Incoming Webhooks

Run:

```bash
node sample-data/send-sample-webhooks.js
```

The script sends:

- Valid webhook
- Duplicate webhook
- Invalid signature webhook
- Webhook for another tenant

---

## Triggering Failure and Replay

A simulated downstream failure is included in the sample workflow.

To replay a failed job:

1. Open the dashboard.
2. Navigate to **Job Runs**.
3. Click **Replay** on the failed job.

Only failed actions are executed again.

---

## Scaling Considerations

For a tenant processing 500,000 orders per day (approximately 1.5 million webhook events), the primary bottleneck is external action execution rather than MongoDB or Redis.

The system can be scaled by:

- Running multiple BullMQ worker instances
- Processing independent actions concurrently
- Separating slow actions into dedicated queues
- Horizontally scaling workers independently from the API

---

## Demo

The project demonstrates:

- Fast webhook acknowledgement
- Asynchronous processing
- Deduplication
- Failure recovery
- Replay support
- Multi-tenant isolation
