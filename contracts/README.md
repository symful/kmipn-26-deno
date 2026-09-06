# SIGAP API Contract Conventions

## Envelope Keys (FROZEN — do not rename)

| Endpoint                          | List Key     | Pagination             | Notes                                                |
| --------------------------------- | ------------ | ---------------------- | ---------------------------------------------------- |
| `GET /api/reports`                | `items`      | `pagination`           |                                                      |
| `GET /api/reports/nearby`         | `reports`    | —                      |                                                      |
| `GET /api/reports/duplicates`     | `candidates` | —                      |                                                      |
| `GET /api/reports/{id}/timeline`  | `events`     | —                      |                                                      |
| `GET /api/surveyor/tasks`         | `tasks`      | —                      |                                                      |
| `GET /api/cases/queue`            | `items`      | `pagination`           |                                                      |
| `GET /api/cases/{id}`             | flat         | —                      | `report`, `assessments`, `visits`, `audit`           |
| `GET /api/tasks`                  | `tasks`      | —                      |                                                      |
| `GET /api/notifications`          | `entries`    | —                      |                                                      |
| `GET /api/auditor/audit-search`   | `entries`    | `total`,`page`,`limit` |                                                      |
| `GET /api/executive/dashboard`    | flat         | —                      | `total`,`by_status`,`by_category`,`sla_*`            |
| `GET /api/admin-daerah/dashboard` | flat         | —                      | `total`,`by_status`,`by_category`,`active_*`,`sla_*` |
| `GET /api/warga/stats`            | flat         | —                      | `by_status`,`total`                                  |
| `POST /api/sync/batch`            | flat         | —                      | `results`,`success_count`,`failure_count`            |

## New Endpoints

Paginated: `{ "items": [...], "pagination": { "page", "limit", "total", "total_pages" } }`  
Non-paginated: `{ "entries": [...] }`

## Types

**Hand-written canonical** — NOT generated from openapi.yaml:

- `contracts/types.ts` — TypeScript (hand-written canonical)
- `kmipn-26-flutter/lib/api/types.g.dart` — Dart (hand-written canonical)
