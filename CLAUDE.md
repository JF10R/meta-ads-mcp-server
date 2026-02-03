# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run build          # Compile TS → build/, then set exec bit on build/index.js
bun run dev            # Run with Bun watch (live reload, no compile step needed)
bun run lint           # ESLint on src/
bun run clean          # Remove build/
bun test               # Run tests (Bun test runner)
bun run test:watch     # Same as test, with --watch
```

Tests run from `tests/` and import `src/` directly; Bun executes TypeScript without a pre-build. Test files live in `tests/unit/*.test.ts` and mirror the `src/` folder structure.

## Architecture

This is an MCP (Model Context Protocol) server that wraps the Meta Ads API via the `facebook-nodejs-business-sdk`. It exposes ~40 tools to MCP clients (e.g. Claude Desktop). The server communicates over **stdio** — stdout is reserved for the MCP protocol, all logging goes to **stderr**.

### Layer structure

```
src/index.ts            ← MCP server bootstrap: registers all tools, routes CallTool requests
src/config/             ← Load + validate env vars (auth token, API version)
src/types/              ← Shared TypeScript types; includes hand-written .d.ts for the FB SDK
src/utils/              ← Cross-cutting concerns (see below)
src/services/           ← One service per Meta entity; all extend MetaAdsService
src/tools/              ← One tools file per entity; defines schemas + handler classes/functions
```

### Two tool patterns coexist

- **Class-based** (campaign, adset, ad, account, audience, pixel, budget, batch): Export a class (e.g. `CampaignTools`) and plain-object `inputSchema` definitions. Schemas are registered directly in the `ListToolsRequestSchema` handler.
- **Function-based** (creative, insights): Export a factory function (e.g. `createCreativeTools`) that returns an array of `{ name, description, inputSchema (Zod), handler }` objects. Their Zod schemas are converted to JSON Schema at registration time via `zod-to-json-schema`.

When adding a new tool, match the pattern already used by its closest sibling.

### Service layer

All services extend `MetaAdsService` (`src/services/meta-ads.service.ts`), which:
- Initializes and caches a single `FacebookAdsApi` instance (singleton keyed on config).
- Exposes `paginateAll` / `paginateWithLimit` helpers that consume the SDK's cursor objects.
- Normalizes account IDs to the `act_` prefix format.

Services use the retry utility (`src/utils/retry.ts` — exponential backoff up to 5 retries) and the error handler (`src/utils/error-handler.ts` — converts SDK errors into `MetaAdsError` with Meta error codes and human-friendly messages).

### Tool registration flow in `src/index.ts`

1. `loadAuthConfig()` reads env; returns `null` if no token (server still starts).
2. All tool class instances and factory results are created only if a token is present.
3. `ListToolsRequestSchema` handler returns every schema.
4. `CallToolRequestSchema` handler dispatches by tool name via a flat if/else chain. Class-based tools are checked first, then creative/insights arrays are searched by name.

## Key details

- **Budgets are in cents** (integer). Minimum valid budget is 100 cents ($1.00).
- Account IDs accept both `"123"` and `"act_123"` — all services normalize internally.
- The `facebook-nodejs-business-sdk` has no official types; `src/types/facebook-nodejs-business-sdk.d.ts` is the project's hand-maintained declarations for it.
- Rate limiting is tracked via Meta's `X-Business-Use-Case-Usage` response header. The `RateLimiter` utility (`src/utils/rate-limiter.ts`) will pause requests when usage approaches the configured threshold (default 80%).
- PII hashing for Custom Audiences follows Meta's spec: email is lowercased/trimmed before SHA-256, phone must be E.164, etc. See `src/utils/hasher.ts`.
- `scripts/set-exec-bit.mjs` runs as part of `npm run build` to make `build/index.js` executable on Unix. It's a no-op on Windows.

## Environment

Configuration is via `.env` (loaded by `dotenv` at the very top of `src/index.ts`). See `.env.example` for all available variables. The only required variable is `META_ACCESS_TOKEN` (must have `ads_management` and `ads_read` permissions); the server starts without it but all tool calls will return a configuration error.

## Conventions

- **Indentation**: 2 spaces, no tabs.
- **Naming**: `camelCase` for variables/functions, `PascalCase` for types/classes. Filenames use dot-suffixed roles: `ad.service.ts`, `campaign.tools.ts`, `meta.config.ts`.
- **Commits**: short, imperative, sentence-case subject (e.g. `Add quick start guide`). Optional prefixes like `Fix:` only if consistent with surrounding history.
- **Docs**: if behavior changes, update the relevant file in `docs/`.
