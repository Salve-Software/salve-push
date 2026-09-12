// Re-exports types generated from /protocol/openapi.yaml.
//
// Run `pnpm generate` (or `pnpm protocol:generate` from the repo root)
// after editing the OpenAPI spec to refresh ./generated.ts.
//
// NOTE: generated.ts does not exist until the first `pnpm generate` run;
// it is intentionally not committed as hand-written source.
export type { paths, components } from "./generated";

import type { components } from "./generated";

export type ReleaseMetadata =
  components["schemas"]["ReleaseMetadata"];
export type CreateReleaseRequest =
  components["schemas"]["CreateReleaseRequest"];
export type TelemetryEvent = components["schemas"]["TelemetryEvent"];
export type ServerIdentity = components["schemas"]["ServerIdentity"];

export * from "./signing";
