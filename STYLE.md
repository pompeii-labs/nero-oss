# Nero code style

How we write the Nero backend. Opinionated. Adapted from the Pompeii / Lux Cloud API
guides for our stack: Bun, Hono, Lux, Magma. If a rule here fights you, raise it in review;
don't quietly deviate.

Nero is single-user, accountless, and self-hosted, so the multi-tenant parts of the house
style (auth middleware, authorization, rate limiting, billing) do not apply and are
intentionally absent.

---

## 1. File layout

```
src/
  index.ts        CLI entry
  config.ts       env/config (typed, loaded once)
  service/        HTTP bootstrap (Hono app, server, entrypoint)
  routes/         HTTP handlers only
  models/         DataModel classes (one per table)
  services/       domain logic: harness, projects, voice, mediums, memory, mcp, browser,
                  panels, ask, display, secrets, files, realtime
  tools/          agent tool classes + the utility builders
  lib/            long-lived clients / primitives (lux, openrouter, logger, queue)
  util/           pure helpers (errors, args, interpolate, tokens, truncate)
  lux/            generated Lux types (do not hand-edit types.ts)
```

`lib/` is for things with module-level lifecycle (clients, connections). `util/` is for
pure helpers. If unsure, it's probably `util/`.

## 2. Data: `DataModel` first

`src/models/datamodel.ts` is the base. A model is a class with a `static tableName`, a
snake_case `*Data` interface, instance fields mirroring the columns, and a
`constructor(data) { super(); Object.assign(this, data) }`. You get
`create/createMany/get/list/update/delete` (static) and `update/delete` (instance) for free.

- Reach for the base before writing anything custom. For a simple eq-filter, use
  `Model.list({ column, operator, value })`, don't add a one-off `getByX`.
- Add a static method only for genuinely custom queries (ordering, vector `near`, upserts,
  joins) or custom create logic.
- JSON columns decode on the SDK read path; no manual coercion.
- Tables keyed by something other than `id` (settings, secrets, presence) are plain classes
  with static methods, not DataModels.

## 3. Classes over loose functions

Anything with shared state, a cache, a client, or a family of related operations is a class
with one import surface (`Mediums`, `Dispatcher`, `Pricing`, `McpConnect`, `Memory`,
`Pricing`, `ProjectQueue`). A file that is a pile of exported functions sharing a theme
should be a class. Bare functions are fine only for genuinely stateless one-shot helpers
(`error(c, status)`, `interpolate(...)`).

## 4. Case conventions

| Place | Convention |
| --- | --- |
| DB columns + model fields | `snake_case` |
| Request/response bodies, the web's row types | `snake_case` |
| Local vars, functions, parameters | `camelCase` |
| Types, interfaces, classes | `PascalCase` |
| Constants | `SCREAMING_SNAKE_CASE` |

snake_case at the data boundary matches the DB and avoids a translation layer.

## 5. Routes are only routes

A `routes/*.ts` file is route handlers and nothing else (no helpers, types, or non-trivial
constants; move those to `util/`, `services/`, or the model). Each handler: one try/catch,
explicit status per branch via the `error(c, status, cause)` helper (`util/errors.ts`).
400 for validation (with a fixable message), 404 for missing, 500 only in the catch. Never
string-match on error messages; return typed results (`null` for not-found) instead.

## 6. Tools

Agent tools are Magma `@tool` classes. Parse arguments through `Args` (`util/args.ts`):
`a.text('x')`, `a.num('x', d)`, `a.bool('x')`, `a.json('x', fallback)`. No raw
`String(call.fn_args.x ?? '')`.

## 7. Logging

One `Logger` per module at the top: `const log = new Logger('tag')`. Info for lifecycle,
warn for recoverable anomalies, error for unexpected failures. No `console.log` in checked-in
code. Never log secrets or full request bodies.

## 8. General

- **No em-dashes.** Anywhere.
- **All imports at the top.** No inline `require` / `await import`.
- **No `any`** unless a third-party boundary genuinely forces it (e.g. the raw CDP protocol);
  prefer `unknown` + narrowing.
- **`async/await` only**; `Promise.all` for independent work. Fire-and-forget is explicit
  (`.catch(() => {})`).
- **Access `process.env.X` once**, at module top or in `config.ts`.
- **Never read or log secret values.** Secrets inject server-side and never reach the LLM
  or the browser.

## 9. Lux + queue notes

- DB access goes through `lib/lux.ts` (`getLux`, `unwrap`), almost always via a DataModel.
- The project queue uses BullMQ over `LUX_DIRECT_URL` (`lib/queue.ts`), URL-string ioredis
  form, `maxRetriesPerRequest: null`.
- No hand-written migrations outside `lux/migrations/`; regenerate `src/lux/types.ts` with
  `lux types` (never hand-edit it).
- Realtime is best-effort: write state to Lux first, the `.live()` broadcast follows.
