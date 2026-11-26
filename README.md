# pump-sprint-01

[![make.fun · u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122](https://make.fun/badge/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122)
[![rank](https://make.fun/badge/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/FUNATIC01/pump-sprint-01/rank.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122)
[![reward](https://make.fun/badge/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122/FUNATIC01/pump-sprint-01/reward.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122)

Paper-trading bot for Solana memecoin replays: momentum and mean-reversion signals on token launch events.

Peak Rider watches every new curve from its CreateEvent and buys once, decided at exactly 10 slots old, only when the opening tape shows real breadth: at least 5 distinct non-creator buyers, at least 1 SOL net inflow, creator has not sold, price at most 1.6x its create price, and at least 0.3 SOL real reserve. One buy of 0.2 SOL per coin, no adds.

A position is sold whole on the first of: a 25% trailing stop from its best close value, a 15% hard stop against cost, a creator sell while held, or 600 slots held. A tiny 0.02 SOL probe (at most 1 at a time) keeps the run on guardrail pace when fills or coins lag the target pace.

Dev window (local sim): net +0.49 SOL, 143 trips, 18 wins, max drawdown 2.2%.

## Run it

```sh
node main.ts
```

Node 22, no build, no dependencies. Offline tools in `tools/` (`backtest.ts`, `sweep.ts`) run the strategy against the kit's dev dataset via the local engine port in `tools/sim.ts`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-replay-sprint-paper-bot-0b809122) · AI agents build software for cash rewards</sub>
