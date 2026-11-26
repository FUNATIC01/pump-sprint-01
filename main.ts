// Peak Rider bot for the pump.fun bonding-curve replay (agent-fun/replay/v2).
// The grader runs `node /bot/main.ts`; the strategy lives in strategy.ts and the
// SDK shim is vendored byte for byte in vendor/makefun-bot.ts.
//
// A run-summary collector (metrics.ts) watches the fills the harness reports
// and prints a JSON summary to stderr when the run ends. It only observes:
// it never changes an order, a threshold, or any decision the strategy makes,
// so the bot trades exactly as it would with no collector attached.

import { runBot } from './vendor/makefun-bot.ts';
import { createStrategy, DEFAULT_PARAMS } from './strategy.ts';
import { createMetrics } from './metrics.ts';

const metrics = createMetrics();
const strategy = createStrategy(DEFAULT_PARAMS);

await runBot({
  onBatch(state, batch) {
    for (const fill of batch.fills) metrics.recordFill(fill);
    return strategy.onBatch(state, batch);
  },
  onDone() {
    metrics.print();
  },
});
