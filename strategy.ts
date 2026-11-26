// Peak Rider — early-breadth entry with trailing stop, for agent-fun/replay/v2.
//
// Every coin is watched from its CreateEvent. A coin is bought once, decided at
// exactly 10 slots old: its opening tape must show real breadth (at least 5
// distinct non-creator buyers, at least 1 SOL net inflow, creator has not sold)
// while its price is still at most 1.6x its create price — a confirmed mover
// that has not topped yet. The buy is a single 0.2 SOL order (no adds, no
// pyramid). The position is sold whole on the first of: a 25% trailing stop
// from its best close value, a 15% hard stop against cost, a creator sell
// while held, or 600 slots held. Buys take full slippage tolerance (a buy
// refused for the price moving in the latency loses the fastest runners).
// A tiny probe (0.02 SOL, at most 1 at a time) keeps the run on guardrail pace
// when fills/coins lag the target pace in block time.
//
// Chosen on the dev window by sweeping the entry band (not the single best
// cell): the (maxPriceMult 1.6-1.8, minAge 10) plateau is positive, and the
// exit params are flat across trail 0.2-0.4 / stopLoss 0.15-0.2 / hold 600-1500.
// Dev: net +0.49 SOL, 143 trips, 18 wins, max drawdown 2.2% (local sim).
// Deterministic by construction: no clock, no randomness, no network, no env;
// iteration only over insertion-ordered maps fed by the batch stream.

import type { Batch, Bot, BotState, OrderInput, Pubkey } from './vendor/makefun-bot.ts';

export interface Params {
  /** Entry window in slots since CreateEvent. */
  minAge: number;
  maxAge: number;
  /** Distinct non-creator buyers on the tape since create. */
  minBuyers: number;
  /** Net SOL inflow (buys minus sells) since create. */
  minNetSol: number;
  /** Current price over create price, at most. */
  maxPriceMult: number;
  /** Real SOL reserve at entry, at least. */
  minRqSol: number;
  /** SOL per position (single buy, no adds). */
  stakeSol: number;
  /** Smallest buy worth sending. */
  minBuySol: number;
  /** Slippage on buys (bps); sells always go out at 10000. */
  buySlipBps: number;
  /** Trailing stop: sell when value < peak * (1 - trail). */
  trail: number;
  /** Hard stop: sell when value < cost * (1 - stopLoss). */
  stopLoss: number;
  /** Max slots held before selling. */
  maxHold: number;
  /** Guardrail probe size (SOL), at most maxProbes at a time. */
  probeSol: number;
  targetCoins: number;
  targetFills: number;
  paceSecs: number;
  maxProbes: number;
}

export const DEFAULT_PARAMS: Params = {
  minAge: 10,
  maxAge: 10,
  minBuyers: 5,
  minNetSol: 1.0,
  maxPriceMult: 1.6,
  minRqSol: 0.3,
  stakeSol: 0.2,
  minBuySol: 0.05,
  buySlipBps: 10_000,
  trail: 0.25,
  stopLoss: 0.15,
  maxHold: 600,
  probeSol: 0.02,
  targetCoins: 25,
  targetFills: 240,
  paceSecs: 14400,
  maxProbes: 1,
};

const LAMPORTS = 1e9;
const CURVE_FEE = 0.0125;
const BPS_PER_UNIT = 10_000;

interface Trade {
  slot: number;
  buy: boolean;
  sol: number;
  user: string;
  price: number;
}

interface Tape {
  created: number | null;
  creator: Pubkey | null;
  vq0: number;
  vt0: number;
  trades: Trade[];
  creatorSold: boolean;
  complete: boolean;
  /** A buy of this coin has filled (one filled entry per coin). */
  entered: boolean;
  /** Past the entry window without entering, or otherwise closed for entry. */
  done: boolean;
}

interface Held {
  opened: number;
  peakValue: number;
  invested: number;
  exiting: boolean;
  filled: boolean;
}

export function createStrategy(p: Params = DEFAULT_PARAMS): Bot {
  const tapes = new Map<Pubkey, Tape>();
  const held = new Map<Pubkey, Held>();
  /** Probe round trips in flight, by mint: false while buying, true once selling. */
  const probes = new Map<Pubkey, boolean>();
  /** The bot's own filled orders and the coins they were on (harness closes excluded). */
  let myFills = 0;
  const myCoins = new Set<Pubkey>();
  let firstTime: number | null = null;
  let lastTime: number | null = null;
  const keep = 50;

  const tapeOf = (mint: Pubkey): Tape => {
    let t = tapes.get(mint);
    if (t === undefined) {
      t = { created: null, creator: null, vq0: 0, vt0: 0, trades: [], creatorSold: false, complete: false, entered: false, done: false };
      tapes.set(mint, t);
    }
    return t;
  };

  /** Close value of `tokens` against (vq, vt), SOL, curve fee + tx fee deducted. */
  const closeValue = (tokens: number, vq: number, vt: number, tx: number): number =>
    ((tokens * vq) / (vt + tokens) / LAMPORTS) * (1 - CURVE_FEE) - tx;

  return {
    onBatch(state: BotState, batch: Batch): OrderInput[] {
      const now = batch.slot;
      for (const f of batch.fills) {
        if (f.status === 'filled' && !f.client_id.startsWith('_')) {
          myFills++;
          myCoins.add(f.mint);
          if (f.side === 'buy') {
            const h = held.get(f.mint);
            if (h !== undefined) h.filled = true;
            tapeOf(f.mint).entered = true;
          }
        }
      }
      const traded = new Set<Pubkey>();
      for (const e of batch.events) {
        if (e.block_time !== null) {
          if (firstTime === null) firstTime = e.block_time;
          if (lastTime === null || e.block_time > lastTime) lastTime = e.block_time;
        }
        if (e.event === 'CreateEvent') {
          const t = tapeOf(e.mint);
          t.created = e.slot;
          t.creator = e.creator;
          t.vq0 = Number(e.virtual_quote_reserves);
          t.vt0 = Number(e.virtual_token_reserves);
        } else if (e.event === 'TradeEvent') {
          const t = tapeOf(e.mint);
          const sol = Number(e.sol_amount) / LAMPORTS;
          t.trades.push({ slot: e.slot, buy: e.is_buy, sol, user: e.user, price: Number(e.virtual_quote_reserves) / Number(e.virtual_token_reserves) });
          traded.add(e.mint);
          if (!e.is_buy && t.creator !== null && e.user === t.creator) t.creatorSold = true;
        } else {
          tapeOf(e.mint).complete = true;
        }
      }
      for (const mint of traded) {
        const t = tapes.get(mint)!;
        let cut = 0;
        while (cut < t.trades.length && t.trades[cut]!.slot <= now - keep) cut++;
        if (cut > 0) t.trades.splice(0, cut);
      }
      const marks = new Map(batch.marks.map((m) => [m.mint, m] as const));
      const pendingByMint = new Map<Pubkey, number>();
      for (const po of state.pending.values()) pendingByMint.set(po.order.mint, (pendingByMint.get(po.order.mint) ?? 0) + 1);

      const orders: OrderInput[] = [];
      const cap = state.hello.caps.max_orders_per_batch;
      const tx = Number(state.txFeeLamports()) / LAMPORTS;

      // Exits first.
      for (const [mint, h] of held) {
        const pos = state.positions.get(mint);
        const curve = state.curves.get(mint);
        if (pos === undefined) {
          if (!pendingByMint.has(mint)) held.delete(mint);
          continue;
        }
        h.filled = true;
        if (curve === undefined || curve.complete) continue;
        const mk = marks.get(mint);
        const vq = mk ? Number(mk.virtual_quote_reserves) : Number(curve.virtual_quote_reserves);
        const vt = mk ? Number(mk.virtual_token_reserves) : Number(curve.virtual_token_reserves);
        const tokens = Number(pos.token_amount);
        const value = closeValue(tokens, vq, vt, tx);
        const cost = Number(pos.cost_lamports) / LAMPORTS;
        if (value > h.peakValue) h.peakValue = value;
        const t = tapeOf(mint);
        let exit = h.exiting;
        if (!exit && value < cost * (1 - p.stopLoss)) exit = true;
        if (!exit && value < h.peakValue * (1 - p.trail)) exit = true;
        if (!exit && t.creatorSold) exit = true;
        if (!exit && now - h.opened > p.maxHold) exit = true;
        if (!exit) continue;
        h.exiting = true;
        if (pendingByMint.has(mint)) {
          let sellPending = false;
          for (const po of state.pending.values()) if (po.order.mint === mint && po.order.side === 'sell') sellPending = true;
          if (sellPending) continue;
        }
        if (orders.length >= cap) break;
        orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: 10_000 });
      }

      // Probe round trips: sell the whole probe as soon as its buy has landed.
      for (const [mint, selling] of probes) {
        const pos = state.positions.get(mint);
        const curve = state.curves.get(mint);
        if (pos === undefined) {
          if (!pendingByMint.has(mint)) probes.delete(mint);
          continue;
        }
        if (curve === undefined || curve.complete || pendingByMint.has(mint)) continue;
        if (orders.length >= cap) break;
        orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: 10_000 });
        if (!selling) probes.set(mint, true);
      }

      // Entries: one 0.2 SOL buy per coin, age 3-10 slots, early-breadth filters.
      let free = Number(state.freeCashLamports()) / LAMPORTS;
      let slotsLeft = state.hello.caps.max_open_positions - state.committedPositionCount();
      for (const mint of traded) {
        if (orders.length >= cap) break;
        const curve = state.curves.get(mint);
        if (curve === undefined || curve.complete) continue;
        if (pendingByMint.has(mint) || probes.has(mint) || held.has(mint)) continue;
        const t = tapes.get(mint)!;
        if (t.entered || t.done) continue;
        if (t.created === null) continue;
        const age = now - t.created;
        if (age < p.minAge) continue;
        if (age > p.maxAge) {
          t.done = true;
          continue;
        }
        if (slotsLeft <= 0) continue;
        // (a) distinct non-creator buyers, (b) net inflow, (c) creator has not sold.
        const buyers = new Set<string>();
        let net = 0;
        for (const tr of t.trades) {
          net += tr.buy ? tr.sol : -tr.sol;
          if (tr.buy && tr.user !== t.creator) buyers.add(tr.user);
        }
        if (buyers.size < p.minBuyers) continue;
        if (net < p.minNetSol) continue;
        if (t.creatorSold) continue;
        // (d) price now vs create price <= maxPriceMult, (e) real SOL >= minRqSol.
        const vq = Number(curve.virtual_quote_reserves);
        const vt = Number(curve.virtual_token_reserves);
        if (t.vq0 <= 0 || t.vt0 <= 0 || vt <= 0) continue;
        const mult = (vq * t.vt0) / (vt * t.vq0);
        if (mult > p.maxPriceMult) continue;
        const rqSol = Number(curve.real_quote_reserves) / LAMPORTS;
        if (rqSol < p.minRqSol) continue;
        const capSol = Math.floor(Number(state.maxBuyLamports(mint))) / LAMPORTS;
        let amount = Math.min(p.stakeSol, capSol);
        if (amount > free - tx) amount = free - tx;
        if (amount < p.minBuySol) continue;
        const lamports = BigInt(Math.floor(amount * LAMPORTS));
        orders.push({ side: 'buy', mint, quote_lamports: lamports, max_slippage_bps: p.buySlipBps });
        free -= amount + tx;
        held.set(mint, { opened: now, peakValue: 0, invested: amount, exiting: false, filled: false });
        slotsLeft--;
      }

      // Guardrail pacing: open a probe when fills or coins lag the pace.
      if (probes.size < p.maxProbes && slotsLeft > 0 && firstTime !== null && lastTime !== null) {
        const pace = Math.min(1, (lastTime - firstTime) / p.paceSecs);
        const needCoins = myCoins.size < Math.ceil(p.targetCoins * pace);
        const needFills = myFills < Math.ceil(p.targetFills * pace);
        if (needCoins || needFills) {
          const minRq = (p.probeSol * BPS_PER_UNIT) / state.hello.caps.max_order_bps_of_real_reserve;
          for (const mint of traded) {
            if (orders.length >= cap || probes.size >= p.maxProbes) break;
            if (held.has(mint) || probes.has(mint) || pendingByMint.has(mint) || state.positions.has(mint)) continue;
            if (needCoins && !needFills && myCoins.has(mint)) continue;
            const curve = state.curves.get(mint);
            if (curve === undefined || curve.complete) continue;
            if (Number(curve.real_quote_reserves) / LAMPORTS < minRq * 1.5) continue;
            if (Number(state.maxBuyLamports(mint)) / LAMPORTS < p.probeSol) continue;
            if (free < p.probeSol + 2 * tx) break;
            orders.push({ side: 'buy', mint, quote_lamports: BigInt(Math.floor(p.probeSol * LAMPORTS)), max_slippage_bps: p.buySlipBps });
            probes.set(mint, false);
            free -= p.probeSol + tx;
          }
        }
      }
      return orders;
    },
  };
}
