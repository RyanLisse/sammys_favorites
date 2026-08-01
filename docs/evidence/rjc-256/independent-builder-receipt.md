# Independent clean-room builder receipt

Generated independently on 2026-08-01. The builder did not inspect Git history, `docs/decisions/**`, any other file in `docs/evidence/rjc-256/**`, any upstream/306 repository, or the prior contents of the replacement targets.

Official documentation was retrieved at `2026-08-01T11:07:59Z`. Digests are SHA-256 over the retrieved response bodies.

| Topic | Official URL | SHA-256 |
| --- | --- | --- |
| pnpm workspaces and workspace protocol | https://pnpm.io/workspaces | `75864216d86b1bf378f09ec318604e0bbe009c5e9da0f23308ba4521e445cbcf` |
| pnpm recursive workspace scripts | https://pnpm.io/cli/run | `d5afb1f7c10bfaef41c78273cdc88a918639ad5f70bd2825fd3bfeb670ddfcdc` |
| Turbo configuration and task graph | https://turborepo.com/docs/reference/configuration | `ec144504712ad296390b038b518df24b74ac2c2ffc14386f33ddc4a31c421b93` |
| Turbo environment variables | https://turborepo.com/docs/crafting-your-repository/using-environment-variables | `aa2eb9abc305773fe5f1a8b6ac2ccd70470de734ed77764395477344879b2ab8` |
| Next.js Turbopack root configuration | https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack | `de3c536a4403c1f95e4c9357f40c1495fe9bb36d0fcfa1833394da37178a9cdf` |
| Medusa installation | https://docs.medusajs.com/learn/installation | `1f524fa34bba8b1106cf9522b83b57470fc6460d03a75be2ad573ddc81c6e6e9` |
| Medusa configuration and environment loading | https://docs.medusajs.com/learn/configurations/medusa-config | `22cf2e4c1608ab8eeba61b7d4e87ab1ac59973eb3cc10ccd03e6dc41324d8e65` |
| Node.js package and module configuration | https://nodejs.org/docs/latest-v24.x/api/packages.html | `9ceea681cca188ed48c965ba4b1c116026f92eb8b8347404bc2ac045bb489476` |
| TypeScript centralized `tsconfig` inheritance | https://www.typescriptlang.org/docs/handbook/tsconfig-json.html | `c54a6291e8aeadeb17d7146ea0498fc64ed830e78276aafc43ff74bde85840db` |

The implementation uses pnpm workspace globs and `workspace:*` links, Turbo task dependencies plus runtime `env`, an absolute Next.js Turbopack root, Medusa's `defineConfig`/`loadEnv` pattern, Node 24 ESM/module facilities, and shared TypeScript configuration inheritance.
