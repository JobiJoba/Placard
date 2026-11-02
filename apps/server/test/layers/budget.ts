import { Effect, Layer } from "effect"
import { Budget } from "../../src/budget/budget.ts"

/** Explicit test double; production always uses the persistent budget ledger. */
export const StubBudget = Layer.succeed(Budget, {
  view: Effect.die("unused"),
  update: () => Effect.die("unused"),
  estimate: () => Effect.die("unused"),
  reserve: () => Effect.succeed("test-event"),
  complete: () => Effect.void,
})
