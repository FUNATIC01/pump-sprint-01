// Run-summary metrics for Peak Rider (observability only).
//
// The collector watches the fills the harness reports back and keeps a small
// tally: how many orders filled, how many round trips closed, how many of
// them won or lost, the realized profit in SOL, the worst realized drawdown,
// and which coin made or lost the most. It never feeds anything back into
// the strategy: no threshold, exit, size, or order is ever decided from
// these numbers, so a run with the collector attached trades exactly like
// a run without it. The summary is printed to stderr at the end of the run
// (stdout belongs to the harness replies), as one JSON object.
//
// A round trip is one filled buy followed by one filled sell on the same
// mint. The sell may be the bot's own exit or one of the harness's closes
// (a curve completing, the replay flattening, or a write-off): either way
// the position is gone and the proceeds are real, so the trip counts.
// A trip's profit is the cash it actually moved: the sell's SOL received
// minus its transaction fee, less the buy's SOL spent plus its transaction
// fee. The fill's quote is gross either way, so the fee rides separately
// in tx_fee_lamports and is netted here; a failed order's fee is charged
// to the trip that was open on its mint when it failed, or, when no trip
// was open, straight to the run's total. That makes realizedSol the run's
// true net cash profit, the same number the local engine reports as net.
// Drawdown here is measured on realized profit only: the running total's
// high-water mark minus its current value, so an open position that is
// underwater does not show up until it closes.

import type { Fill, Pubkey } from './vendor/makefun-bot.ts';

/** Lamports in one SOL, for turning the harness's lamport strings into SOL. */
const SOL_IN_LAMPORTS = 1e9;

/** One coin's total realized profit, for the best/worst-coin ranking. */
export interface CoinPnl {
  mint: Pubkey;
  pnlSol: number;
}

/** Everything summary() reports, all in SOL unless it is a count. */
export interface MetricsSummary {
  /** Filled orders the bot itself sent (harness closes excluded). */
  fills: number;
  /** Round trips closed: a filled buy followed by a filled sell. */
  trips: number;
  /** Trips that closed above their all-in cost. */
  wins: number;
  /** Trips that closed below their all-in cost. */
  losses: number;
  /** Net cash profit of the run: closed trips minus stray failed-tx fees, SOL. */
  realizedSol: number;
  /** Worst dip of the running realized total below its high-water mark, SOL. */
  maxDrawdownSol: number;
  /** The coin with the largest total realized profit, if any trip closed. */
  bestCoin: CoinPnl | null;
  /** The coin with the largest total realized loss, if any trip closed. */
  worstCoin: CoinPnl | null;
}

/** A run's metrics collector: feed it fills, read the summary at the end. */
export interface Metrics {
  recordFill(fill: Fill): void;
  summary(): MetricsSummary;
  print(): void;
}

export function createMetrics(): Metrics {
  let fills = 0;
  let trips = 0;
  let wins = 0;
  let losses = 0;
  /** Net cash profit so far: closed trips minus stray failed-tx fees. */
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  /** The open leg of each mint: what its buy cost all-in, plus the failed fees charged to it since. */
  const openLegs = new Map<Pubkey, { cost: number; extra: number }>();
  /** Total realized profit per mint, for the best/worst ranking. */
  const perCoin = new Map<Pubkey, number>();

  /** Fold a cash move into the running total and refresh the drawdown. */
  const noteCash = (delta: number): void => {
    equity += delta;
    if (equity > peak) peak = equity;
    const dip = peak - equity;
    if (dip > maxDrawdown) maxDrawdown = dip;
  };

  /** Close the open leg of `mint` at `proceedsNet` SOL received after its fee and tally the trip. */
  const closeTrip = (mint: Pubkey, proceedsNet: number): void => {
    const leg = openLegs.get(mint);
    if (leg === undefined) return;
    openLegs.delete(mint);
    const pnl = proceedsNet - leg.cost - leg.extra;
    trips += 1;
    if (pnl > 0) wins += 1;
    else if (pnl < 0) losses += 1;
    perCoin.set(mint, (perCoin.get(mint) ?? 0) + pnl);
    noteCash(pnl);
  };

  const summary = (): MetricsSummary => {
    let best: CoinPnl | null = null;
    let worst: CoinPnl | null = null;
    for (const [mint, pnlSol] of perCoin) {
      if (best === null || pnlSol > best.pnlSol) best = { mint, pnlSol };
      if (worst === null || pnlSol < worst.pnlSol) worst = { mint, pnlSol };
    }
    return {
      fills,
      trips,
      wins,
      losses,
      realizedSol: equity,
      maxDrawdownSol: maxDrawdown,
      bestCoin: best,
      worstCoin: worst,
    };
  };

  return {
    recordFill(fill: Fill): void {
      const txFee = Number(fill.tx_fee_lamports) / SOL_IN_LAMPORTS;
      if (fill.status === 'failed') {
        const leg = openLegs.get(fill.mint);
        if (leg !== undefined) {
          // Charged to the trip's profit when it closes, not now: the fee
          // must hit the run total exactly once.
          leg.extra += txFee;
        } else {
          perCoin.set(fill.mint, (perCoin.get(fill.mint) ?? 0) - txFee);
          noteCash(-txFee);
        }
        return;
      }
      if (fill.status !== 'filled') return;
      const own = !fill.client_id.startsWith('_');
      const quote = Number(fill.quote_lamports) / SOL_IN_LAMPORTS;
      if (fill.side === 'buy') {
        if (own) {
          fills += 1;
          openLegs.set(fill.mint, { cost: quote + txFee, extra: 0 });
        }
        return;
      }
      if (own) fills += 1;
      closeTrip(fill.mint, quote - txFee);
    },
    summary,
    print(): void {
      console.error(JSON.stringify(summary(), null, 2));
    },
  };
}
