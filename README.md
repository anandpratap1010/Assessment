# Multi-Courier Integration Platform

A normalized REST API for creating, tracking, and cancelling courier shipments. Courier-specific mapping and transport live behind adapters, so callers and the order workflow do not need to understand partner payloads. Bulk requests are processed asynchronously with BullMQ.

## Architecture

`HTTP API → OrdersService → CourierRegistry → CourierAdapter → courier`

`POST /orders/bulk → PostgreSQL + BullMQ → BulkOrderProcessor → OrdersService`

NestJS provides the API and dependency injection, Prisma persists orders and audit data in PostgreSQL, and Redis/BullMQ provides controlled background concurrency. Axios is isolated in the UrbaneBolt client.

## Setup

Requirements: Node.js 22+, npm, PostgreSQL, and Redis.

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Alternatively, start the complete stack:

```bash
docker compose up --build
```

Swagger is available at `http://localhost:3000/api/docs`.

## Environment variables

| Variable                                     | Purpose                                     | Default/example                  |
| -------------------------------------------- | ------------------------------------------- | -------------------------------- |
| `PORT`                                       | HTTP port                                   | `3000`                           |
| `DATABASE_URL`                               | PostgreSQL connection URL                   | See `.env.example`               |
| `REDIS_HOST`, `REDIS_PORT`                   | BullMQ connection                           | `localhost`, `6379`              |
| `URBANEBOLT_BASE_URL`                        | UAT base URL                                | Empty until contract is supplied |
| `URBANEBOLT_USERNAME`, `URBANEBOLT_PASSWORD` | UAT credentials                             | Optional at startup              |
| `COURIER_TIMEOUT_MS`                         | Courier timeout                             | `10000`                          |
| `COURIER_MAX_RETRIES`                        | Retries after the initial transient failure | `3`                              |
| `COURIER_RETRY_BASE_DELAY_MS`                | Initial exponential-backoff delay           | `500`                            |
| `BULK_WORKER_CONCURRENCY`                    | Concurrent bulk jobs per process            | `10`                             |

## Commands

```bash
npm run build
npm run lint
npm test
npm run test:e2e
npm run prisma:migrate
```

The unit and HTTP contract tests do not require external services. Runtime/manual tests use PostgreSQL and Redis.

## API examples

Create:

```bash
curl -X POST http://localhost:3000/api/v1/orders -H "Content-Type: application/json" -d '{"order_id":"ORD-1001","courier_partner":"mock","pickup":{"name":"Warehouse","phone":"9999999999","address_line1":"1 Depot Road","city":"Bengaluru","state":"Karnataka","postal_code":"560001","country":"IN"},"delivery":{"name":"Customer","phone":"8888888888","address_line1":"2 Market Road","city":"Mysuru","state":"Karnataka","postal_code":"570001","country":"IN"},"package":{"weight":1.5},"payment":{"type":"PREPAID"}}'
```

```bash
curl "http://localhost:3000/api/v1/orders?page=1&limit=20&courier_partner=mock&status=CREATED"
curl http://localhost:3000/api/v1/orders/ORD-1001/track
curl -X POST http://localhost:3000/api/v1/orders/ORD-1001/cancel
```

Bulk creation:

```bash
curl -X POST http://localhost:3000/api/v1/orders/bulk -H "Content-Type: application/json" -d '{"orders":[{"order_id":"BULK-1","courier_partner":"mock","pickup":{"name":"Warehouse","phone":"9999999999","address_line1":"1 Depot Road","city":"Bengaluru","state":"Karnataka","postal_code":"560001","country":"IN"},"delivery":{"name":"Customer","phone":"8888888888","address_line1":"2 Market Road","city":"Mysuru","state":"Karnataka","postal_code":"570001","country":"IN"},"package":{"weight":1}}]}'
curl http://localhost:3000/api/v1/batches/BATCH_ID_FROM_RESPONSE
```

The mock adapter creates `MOCK-{orderId}` / `AWB-{orderId}`. IDs ending in `FAIL` are rejected and IDs ending in `TIMEOUT` simulate a timeout.

## Idempotency

`orders.order_id` is unique. Creation first inserts a `PROCESSING` reservation, then calls the courier. A concurrent identical request sees `ORDER_IN_PROGRESS`; a completed identical request returns the stored result. Reusing the ID with different normalized input returns `ORDER_ID_CONFLICT`. Failed attempts remain recorded, preventing an accidental second external shipment.

The request hash uses canonical JSON and SHA-256. A real courier idempotency key is still needed to close the crash window where the courier succeeds but the final database update fails.

## Bulk processing

The endpoint validates all items, persists the batch, queues one job per order, and returns `202`. Workers reuse `OrdersService`. Item completion and counters update transactionally; batch status becomes `COMPLETED`, `PARTIALLY_COMPLETED`, or `FAILED`. Running the worker in the API process keeps this assessment simple; it can be moved into a separate process later.

## Adding a courier

1. Implement `CourierAdapter`.
2. Add the partner client and mapper.
3. Register the adapter in `CouriersModule`.
4. Add environment configuration.
5. Add mapper/client/adapter tests.

No changes are required to `OrdersController`, the `OrdersService` business contract, normalized DTOs, routes, or existing adapters.

## UrbaneBolt integration status

The UrbaneBolt integration skeleton is implemented, but actual UAT endpoint and payload mappings require the supplied UrbaneBolt API contract. Timeout, transient retry, token caching/invalidation, and one-time 401 refresh structure exist and are unit tested. Authentication and courier operations deliberately return `COURIER_CONFIGURATION_ERROR`; they have not been verified against UrbaneBolt.

Blocked contract details: authentication, create shipment, tracking, cancellation, and status/error mappings.

## Assumptions and limitations

- Consumer authentication is out of scope; this is assumed to be an internal API.
- Tracking is pull-based; webhooks are not implemented.
- Raw courier payloads contain customer data and need a retention policy in production.
- Batch status uses polling and has no pagination because a batch is capped at 100 items.
- The automated e2e suite verifies HTTP contracts with mocked application services; Docker-backed workflows are manual integration checks.
