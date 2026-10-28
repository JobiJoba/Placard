import type { SearchFilter, SearchHit } from "@placard/domain"
import { Context, type Effect } from "effect"

/**
 * Host-provided search surface for modules.
 * Core maps its Search service onto this tag so plugins never import server internals.
 */
export class ModuleHostSearch extends Context.Service<
  ModuleHostSearch,
  {
    readonly query: (
      ownerId: string,
      filter: SearchFilter,
    ) => Effect.Effect<ReadonlyArray<SearchHit>>
  }
>()("placard/module-sdk/ModuleHostSearch") {}
