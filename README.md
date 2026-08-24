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

| Variable                                     | Purpose                                       | Default/example                 |
| -------------------------------------------- | --------------------------------------------- | ------------------------------- |
| `PORT`                                       | HTTP port                                     | `3000`                          |
| `DATABASE_URL`                               | PostgreSQL connection URL                     | See `.env.example`              |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | BullMQ connection; password is optional       | `localhost`, `6379`, empty      |
| `URBANEBOLT_BASE_URL`                        | UrbaneBolt API base URL                       | `https://uat.urbanebolt.in`     |
| `URBANEBOLT_USERNAME`, `URBANEBOLT_PASSWORD` | Credentials supplied by UrbaneBolt            | Optional unless adapter is used |
| `URBANEBOLT_CUSTOMER_CODE`                   | Manifest customer code supplied by UrbaneBolt | Optional unless adapter is used |
| `URBANEBOLT_SERVICE_TYPE`                    | Manifest service type                         | `SDD`                           |
| `RUN_URBANEBOLT_INTEGRATION_TESTS`           | Enables the external UAT test                 | `false`                         |
| `COURIER_TIMEOUT_MS`                         | Courier timeout                               | `10000`                         |
| `COURIER_MAX_RETRIES`                        | Retries after the initial transient failure   | `3`                             |
| `COURIER_RETRY_BASE_DELAY_MS`                | Initial exponential-backoff delay             | `500`                           |
| `BULK_WORKER_CONCURRENCY`                    | Concurrent bulk jobs per process              | `10`                            |

## Commands

```bash
npm run build
npm run lint
npm test
npm run test:e2e
npm run test:integration
npm run test:urbanebolt
npm run prisma:migrate
```

The unit and HTTP contract tests do not require external services. `npm run test:integration` exercises the running application against PostgreSQL, Redis, and BullMQ; start the Docker stack first. `npm run test:urbanebolt` runs only when `RUN_URBANEBOLT_INTEGRATION_TESTS=true` and requires all UrbaneBolt variables; it creates a uniquely named UAT shipment and cancels it in cleanup.

## Public endpoints

| Method | Path                             | Purpose                                      |
| ------ | -------------------------------- | -------------------------------------------- |
| `POST` | `/api/v1/orders`                 | Create an idempotent shipment                |
| `GET`  | `/api/v1/orders`                 | Paginated order list                         |
| `GET`  | `/api/v1/orders/:orderId/track`  | Refresh normalized tracking                  |
| `POST` | `/api/v1/orders/:orderId/cancel` | Idempotently cancel a shipment               |
| `POST` | `/api/v1/orders/bulk`            | Validate, persist, and queue 1-100 orders    |
| `GET`  | `/api/v1/batches/:batchId`       | Return batch counters and item results       |
| `GET`  | `/health`                        | Check the application, PostgreSQL, and Redis |

Successful responses use `{ "success": true, "data": ..., "request_id": "..." }`. Errors use `{ "success": false, "error": { "code": "...", "message": "...", "details": ... }, "request_id": "..." }`. Validation details contain field-level messages; courier-native errors and raw payloads are never returned.

## API examples

Create:

```bash
curl -X POST http://localhost:3000/api/v1/orders -H "Content-Type: application/json" -d '{"order_id":"ORD-1001","courier_partner":"mock","pickup":{"name":"Warehouse","phone":"9999999999","address_line1":"1 Depot Road","city":"Bengaluru","state":"Karnataka","postal_code":"560001","country":"IN"},"delivery":{"name":"Customer","phone":"8888888888","address_line1":"2 Market Road","city":"Mysuru","state":"Karnataka","postal_code":"570001","country":"IN"},"package":{"weight":1.5},"payment":{"type":"PREPAID"}}'
```

For UrbaneBolt, use the same normalized endpoint with `courier_partner: "urbanebolt"` and include `package.length`, `package.width`, and `package.height`. Customer codes, service types, authentication fields, and UrbaneBolt-native names are supplied by configuration or the adapter rather than API consumers.

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

The endpoint validates all items and courier names, persists the batch, queues one job per order, and returns `202`. Workers reuse `OrdersService`, propagate the originating request ID, and run at bounded concurrency. Item completion and counters update transactionally; batch status becomes `COMPLETED`, `PARTIALLY_COMPLETED`, or `FAILED`. If enqueueing fails, the persisted batch and items are marked failed instead of remaining stuck. Running the worker in the API process keeps this assessment simple; it can be moved into a separate process later.

## Reliability and request correlation

Courier timeout, retry count, and exponential-backoff delay come from the environment. Network failures, timeouts, and 5xx responses are retried; ordinary 4xx responses are not. A 401 invalidates the cached token, coalesces concurrent authentication attempts, and retries the original operation exactly once. Incoming `X-Request-ID` values are reused, otherwise a UUID is generated. The ID is returned in the header/body and carried into bulk jobs and structured failure logs.

## Adding a courier

1. Implement `CourierAdapter`.
2. Add the partner client and mapper.
3. Register the adapter in `CouriersModule`.
4. Add environment configuration.
5. Add mapper/client/adapter tests.

No changes are required to `OrdersController`, the `OrdersService` business contract, normalized DTOs, routes, or existing adapters.

## UrbaneBolt integration

The adapter implements the published [UrbaneBolt UAT contract](https://bit.ly/ease-commerce-assignment): token authentication, manifest/create, public tracking, and cancellation. Credentials and the customer code are required only when `courier_partner` is `urbanebolt`. UrbaneBolt also requires package length, width, and height; missing dimensions return a normalized validation error.

Authentication, create, tracking, and cancellation request/response shapes were verified against UAT. A uniquely named verification shipment was cancelled immediately after creation. Timeout, selective retry, coalesced token caching/invalidation, and one-time 401 refresh behavior are unit tested. Real credentials are never committed.

## Assumptions and limitations

- Consumer authentication is out of scope; this is assumed to be an internal API.
- Tracking is pull-based; webhooks are not implemented.
- UrbaneBolt status mapping covers documented and common lifecycle descriptions; unrecognized codes map to `UNKNOWN` while the raw value remains in audit history.
- Raw courier payloads contain customer data and need a retention policy in production.
- Batch status uses polling and has no pagination because a batch is capped at 100 items.
- The e2e suite verifies HTTP contracts with mocked application services. `test:integration` provides Docker-backed create/idempotency/conflict/list/track/cancel/bulk/health coverage.
