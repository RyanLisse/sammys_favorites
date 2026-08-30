# Sammy's Favorites Engineering Guide

## Working agreement

- Inspect the current implementation before changing it.
- Make the smallest safe change that fully solves the task.
- Do not overwrite unrelated work or expose secrets.
- Verify with real commands and report remaining risk plainly.
- Prefer repository scripts when they exist; use `pnpm` for package commands.

## Ultracite standards

This repository uses Ultracite with Oxlint and Oxfmt. Before handing off code:

```sh
pnpm dlx ultracite fix
pnpm dlx ultracite check
```

Write accessible, performant, type-safe, maintainable code:

- Prefer `const`, explicit intent, meaningful names, early returns, and focused functions.
- Prefer `unknown` over `any`; narrow values instead of forcing assertions.
- Await promises and handle failures deliberately.
- Use semantic HTML, associated form labels, meaningful image alternatives, and keyboard-accessible controls.
- Keep React hooks at the top level with complete dependency lists and stable unique keys.
- In Next.js, prefer Server Components for server data access and `next/image` for rendered images.
- Do not use `eval`, unsafe HTML, production `console.log`, `debugger`, or string throws.
- Use `rel="noopener noreferrer"` for untrusted links opened in a new tab.

## Tests

- Add or update focused tests when behavior changes.
- Keep assertions inside `test` or `it` blocks.
- Do not commit focused or skipped tests.
- Run the narrowest relevant checks first, then broader validation when warranted.

## Merge and verification bar

Work in pstack poteto-mode: one finding per patch, unslopped, verified on the real artifact. Do not copy Catapulze's Bun/Effect stack; Effect is not a repository default ([ADR 0002](docs/decisions/0002-effect-adoption-boundary.md)).

**Merge nothing** until all GitHub CI jobs on that PR are green: Frozen lockfile and advisory verification (`pnpm audit --audit-level high`), Policy PostgreSQL durability, Real local services / `verify-shell-startup`, Quality gates, every Workspace job, and `claude-review` if present.

**UI-visible PRs** need inspected visual proof of the real user path (screenshot or short video). Use seed/fixture data only; capture after inspecting the surface. Never commit proof artifacts. Use an isolated storefront port via `.cursor/skills/verify-sammys-favorites` — launch, doctor, drive, capture.

One finding per patch, then `pnpm check`, wait for CI, then push. Lefthook + Ultracite (`pnpm format` / `pnpm check`); never `qlty fmt`.
