# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the TypeScript source.
- `src/config/` holds auth and Meta API configuration.
- `src/services/` contains domain services (`*.service.ts`) that wrap Meta Ads operations.
- `src/tools/` defines MCP tool handlers (`*.tools.ts`).
- `src/utils/` contains shared helpers (logging, retries, pagination, validation).
- `src/types/` defines shared TypeScript types and SDK shims.
- `tests/` holds unit tests and fixtures; see `tests/unit/` and `tests/fixtures/`.
- `build/` is generated output from `tsc` (not committed by default).
- `docs/` contains setup, tool, and troubleshooting guides.

## Build, Test, and Development Commands
- `bun run dev`: run the MCP server in watch mode.
- `bun run build`: compile TypeScript to `build/` and make the CLI executable.
- `bun test`: run tests with Bun’s test runner.
- `bun run test:watch`: re-run tests on file changes.
- `bun run lint`: lint `src/` TypeScript with ESLint.
- `bun run clean`: remove the `build/` directory.

## Coding Style & Naming Conventions
- Language: TypeScript (ES2022), strict mode enabled via `tsconfig.json`.
- Indentation: 2 spaces, no tabs.
- Filenames: use descriptive, dot-suffixed roles such as `ad.service.ts`, `campaign.tools.ts`, `meta.config.ts`.
- Symbols: prefer `camelCase` for variables/functions and `PascalCase` for types/classes.
- Keep exports focused; favor small, testable functions.

## Testing Guidelines
- Framework: Bun test runner (`bun test`) running TypeScript directly.
- Test files live in `tests/**` and use `*.test.ts` naming.
- Add tests for utilities and config behavior; mirror folder structure under `tests/unit/`.

## Commit & Pull Request Guidelines
- Commit subjects are short, imperative, and sentence-case (e.g., `Add quick start guide`).
- History shows optional prefixes like `Fix:`; use only if helpful and consistent.
- PRs should include: summary, rationale, test results, and linked issues (`Closes #123`).
- If behavior changes, update docs in `docs/` and relevant examples.

## Security & Configuration Tips
- Do not commit secrets. Use `.env` locally and keep `.env.example` up to date.
- Required tokens: `META_ACCESS_TOKEN` with `ads_management` and `ads_read`.

## Architecture & Runtime Notes
- MCP runs over stdio: stdout is reserved for protocol messages; logs must go to stderr.
- Two tool patterns exist: class-based tools in `src/tools/` and function-based tool factories.
- All services extend `MetaAdsService`, which manages a shared Meta SDK instance.
- Budgets are in cents; account IDs accept `123` or `act_123` (normalized internally).
