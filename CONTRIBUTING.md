# Contributing to Placard

Read the [documentation index](docs/README.md), [architecture](docs/tech-stack.md),
and [v1 scope](docs/release-1.0.md) before proposing changes.

## Development

Use Node 24+, pnpm 12, Docker, and the Aspire CLI. Run `pnpm install`, then
`pnpm dev` to start the local stack. See the [README](README.md#develop) for
manual startup and certificate guidance. Keep credentials in ignored environment
files and personal Takeout exports outside tracked fixtures.

## Where changes belong

- `apps/web`: product UI; pages coordinate focused components.
- `apps/server`: API, domain services, background jobs, database migrations.
- `apps/site`: marketing and the published Markdown reading experience.
- `packages/domain`: shared schemas and API contracts.
- `packages/module-sdk` and `packages/modules/skeleton`: plugin contracts and starter.
- `docs`: canonical product, operator, and contributor documentation.

## Before opening a change

Run `pnpm typecheck` and `pnpm lint`. Use `pnpm test:unit` for logic,
`pnpm test:integration` for database/API behavior, and `pnpm test:e2e` for user flows
(build the web app first). Integration and browser tests need Docker.
Run `pnpm --filter @placard/site build` for site or published-doc changes.
Use `pnpm check:recovery` for deployment or backup changes; it removes only its
own randomly named disposable project's volumes.

Explain the user-visible problem, resulting behavior, and validation in the PR.
Add regression coverage for behavioral bugs. Update the relevant guide when a
workflow changes. Label future ideas explicitly; do not describe planned features
as available. Keep release evidence separate from feature claims.
