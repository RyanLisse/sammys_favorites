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
