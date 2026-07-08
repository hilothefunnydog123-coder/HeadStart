#!/usr/bin/env python3
"""Offline replica of pine/x_levels_strategy.pine for real parameter sweeps.

Feed it a TradingView 1-minute NQ export (CSV with time,open,high,low,close
columns; volume optional). It replays the XVX level detection, HTF FVG memory,
and the tap-entry strategy bar by bar with realistic fills, and can
random-search the settings space with out-of-sample validation.

Usage:
    python3 xlevels_backtest.py NQ_1m.csv                  # pine defaults
    python3 xlevels_backtest.py NQ_1m.csv --sweep 800      # random search
    python3 xlevels_backtest.py NQ_1m.csv --sweep 800 --min-trades 60

Export with the chart timezone set to America/Chicago (see README.md).
No external dependencies — plain Python 3.
"""
import argparse
import random
import sys
from datetime import datetime, timedelta

from backtest import load_5m as load_csv, trading_day, minutes

POINT_VALUE = 20.0
TICK = 0.25
COMMISSION = 1.4
SLIPPAGE_TICKS = 1

EPOCH = datetime(2000, 1, 1)


# ---------------------------------------------------------------- HTF FVG memory

class HtfFvg:
    """One timeframe's rolling bar builder + 3-bar FVG zones (mirrors the pine)."""

    def __init__(self, step_min, max_fvgs):
        self.step = step_min
        self.max_fvgs = max_fvgs
        self.key = None
        self.cur_hi = self.cur_lo = None
        self.hist = []          # completed (hi, lo), capped at 10
        self.zones = []         # (lo, hi, dir)

    def _key(self, t):
        return int((t - EPOCH) / timedelta(minutes=self.step))

    def update(self, t, h, l):
        k = self._key(t)
        if self.cur_hi is None:
            self.cur_hi, self.cur_lo, self.key = h, l, k
            return
        if k != self.key:
            self.hist.append((self.cur_hi, self.cur_lo))
            if len(self.hist) > 10:
                self.hist.pop(0)
            if len(self.hist) >= 3:
                c0hi, c0lo = self.hist[-3]
                c2hi, c2lo = self.hist[-1]
                if c2lo > c0hi:
                    self.zones.append((c0hi, c2lo, 1))
                if c2hi < c0lo:
                    self.zones.append((c2hi, c0lo, -1))
                while len(self.zones) > self.max_fvgs:
                    self.zones.pop(0)
            self.cur_hi, self.cur_lo, self.key = h, l, k
        else:
            self.cur_hi = max(self.cur_hi, h)
            self.cur_lo = min(self.cur_lo, l)

    def clean(self, close):
        self.zones = [z for z in self.zones
                      if not (z[2] == 1 and close < z[0])
                      and not (z[2] == -1 and close > z[1])]

    def match(self, price, d, near_pts, require_inside):
        for lo, hi, zd in self.zones:
            if zd != d:
                continue
            inside = lo <= price <= hi
            near = inside or abs(price - lo) <= near_pts or abs(price - hi) <= near_pts
            if inside if require_inside else near:
                return True
        return False


# --------------------------------------------------------------------- strategy

DEFAULTS = {
    "alignPts": 5.0, "minGapPts": 1.0, "minImpulsePts": 0.0,
    "requireHtf": False, "requireInside": False, "nearPts": 5.0,
    "use5m": True, "use15m": True, "use1h": False, "use4h": False,
    "showBullish": True, "showBearish": True,
    "maxLevels": 80, "maxFvgs": 200, "dupPts": 3.0,
    "deleteOnTap": True, "deleteInvalid": True, "invalidPts": 5.0,
    "maxAgeBars": 0,
    "allowLong": True, "allowShort": False,
    "minGrade": 0,               # 0 any, 1 B+, 2 A+, 3 A+ only
    "rejectClose": True,
    "stopPts": 10.0, "tpR": 1.5,
    "useBE": False, "beTrigger": 0.7, "beOffTicks": 2,
    "session": None,             # (start_min, end_min) wall clock or None
    "maxPerDay": 0, "maxLossDay": 0,
}


def run(bars, cfg):
    c = dict(DEFAULTS)
    c.update(cfg)

    tfs = {}
    if c["use5m"]:
        tfs["5m"] = HtfFvg(5, c["maxFvgs"])
    if c["use15m"]:
        tfs["15m"] = HtfFvg(15, c["maxFvgs"])
    if c["use1h"]:
        tfs["1h"] = HtfFvg(60, c["maxFvgs"])
    if c["use4h"]:
        tfs["4h"] = HtfFvg(240, c["maxFvgs"])

    levels = []            # dict(lvl, dir, grade, born)
    pos = None             # dict(dir, entry, stop, tp, be_done)
    pending = None         # dict(dir, stop, tp)
    pnl_dollars = []
    day = None
    day_trades = day_losses = 0

    def close_trade(exit_px):
        nonlocal pos, day_losses
        pts = (exit_px - pos["entry"]) if pos["dir"] == 1 else (pos["entry"] - exit_px)
        d = pts * POINT_VALUE - 2 * COMMISSION
        pnl_dollars.append(d)
        if d < 0:
            day_losses += 1
        pos = None

    for i, b in enumerate(bars):
        t, o, h, l, close = b["t"], b["o"], b["h"], b["l"], b["c"]
        td = trading_day(t)
        if td != day:
            day = td
            day_trades = day_losses = 0

        # ---- bar open: fill pending market order
        if pending is not None:
            slip = SLIPPAGE_TICKS * TICK
            fill = o + slip if pending["dir"] == 1 else o - slip
            pos = {"dir": pending["dir"], "entry": fill,
                   "stop": pending["stop"], "tp": pending["tp"], "be_done": False}
            pending = None

        # ---- intrabar exits (stop first when both touch: conservative)
        if pos is not None:
            slip = SLIPPAGE_TICKS * TICK
            if pos["dir"] == 1:
                if l <= pos["stop"]:
                    close_trade(min(o, pos["stop"]) - slip)
                elif h >= pos["tp"]:
                    close_trade(max(o, pos["tp"]))
            else:
                if h >= pos["stop"]:
                    close_trade(max(o, pos["stop"]) + slip)
                elif l <= pos["tp"]:
                    close_trade(min(o, pos["tp"]))

        # ---- bar close: HTF memory first (matches pine ordering)
        for trk in tfs.values():
            trk.update(t, h, l)
            trk.clean(close)

        # ---- XVX detection on the confirmed 1m bar
        if i >= 3:
            b3, b2 = bars[i - 3], bars[i - 2]

            def grade_of(level, d):
                m5 = "5m" in tfs and tfs["5m"].match(level, d, c["nearPts"], c["requireInside"])
                m15 = "15m" in tfs and tfs["15m"].match(level, d, c["nearPts"], c["requireInside"])
                m1h = "1h" in tfs and tfs["1h"].match(level, d, c["nearPts"], c["requireInside"])
                m4h = "4h" in tfs and tfs["4h"].match(level, d, c["nearPts"], c["requireInside"])
                any_htf = m5 or m15 or m1h or m4h
                g = 3 if (m5 and m15) else 2 if (m5 or m15) else 1 if any_htf else 0
                return g, any_htf

            def add_level(level, d):
                for lv in levels:
                    if lv["dir"] == d and abs(lv["lvl"] - level) <= c["dupPts"]:
                        return
                g, any_htf = grade_of(level, d)
                if c["requireHtf"] and not any_htf:
                    return
                if len(levels) >= c["maxLevels"]:
                    levels.pop(0)
                levels.append({"lvl": level, "dir": d, "grade": g, "born": i})

            if c["showBullish"]:
                edge_a = min(b3["o"], b3["c"])
                edge_b = min(b2["o"], b2["c"])
                level = (edge_a + edge_b) / 2.0
                if (l > b2["h"] and l - b2["h"] >= c["minGapPts"]
                        and abs(edge_a - edge_b) <= c["alignPts"]
                        and close - level >= c["minImpulsePts"]):
                    add_level(level, 1)

            if c["showBearish"]:
                edge_a = max(b3["o"], b3["c"])
                edge_b = max(b2["o"], b2["c"])
                level = (edge_a + edge_b) / 2.0
                if (h < b2["l"] and b2["l"] - h >= c["minGapPts"]
                        and abs(edge_a - edge_b) <= c["alignPts"]
                        and level - close >= c["minImpulsePts"]):
                    add_level(level, -1)

        # ---- trade gating
        in_session = c["session"] is None or c["session"][0] <= minutes(t) < c["session"][1]
        can_trade = (pos is None and pending is None and in_session
                     and (c["maxPerDay"] == 0 or day_trades < c["maxPerDay"])
                     and (c["maxLossDay"] == 0 or day_losses < c["maxLossDay"]))

        # ---- tap detection + level lifecycle (newest level wins, like the pine)
        sig = None
        keep = []
        for idx in range(len(levels) - 1, -1, -1):
            lv = levels[idx]
            can_check = i > lv["born"]
            tapped = can_check and l <= lv["lvl"] <= h
            invalid = can_check and (close < lv["lvl"] - c["invalidPts"] if lv["dir"] == 1
                                     else close > lv["lvl"] + c["invalidPts"])
            expired = c["maxAgeBars"] > 0 and i - lv["born"] > c["maxAgeBars"]

            want = (tapped and can_trade and sig is None and lv["grade"] >= c["minGrade"]
                    and ((lv["dir"] == 1 and c["allowLong"]
                          and (not c["rejectClose"] or close >= lv["lvl"]))
                         or (lv["dir"] == -1 and c["allowShort"]
                             and (not c["rejectClose"] or close <= lv["lvl"]))))
            if want:
                sig = lv
            if want or (c["deleteOnTap"] and tapped) or (c["deleteInvalid"] and invalid) or expired:
                continue
            keep.append(idx)
        levels = [levels[idx] for idx in sorted(keep)]

        # ---- queue the entry for the next bar open (pine stop/tp are set from
        # the signal close, so compute them here)
        if sig is not None:
            if sig["dir"] == 1:
                stop = sig["lvl"] - c["stopPts"]
                risk = close - stop
                if risk > 0:
                    day_trades += 1
                    pending = {"dir": 1, "stop": stop, "tp": close + c["tpR"] * risk}
            else:
                stop = sig["lvl"] + c["stopPts"]
                risk = stop - close
                if risk > 0:
                    day_trades += 1
                    pending = {"dir": -1, "stop": stop, "tp": close - c["tpR"] * risk}

        # ---- breakeven management (evaluated on close, like the pine)
        if pos is not None and c["useBE"] and not pos["be_done"]:
            if pos["dir"] == 1:
                risk0 = pos["entry"] - pos["stop"]
                if risk0 > 0 and h >= pos["entry"] + c["beTrigger"] * risk0:
                    pos["stop"] = pos["entry"] + c["beOffTicks"] * TICK
                    pos["be_done"] = True
            else:
                risk0 = pos["stop"] - pos["entry"]
                if risk0 > 0 and l <= pos["entry"] - c["beTrigger"] * risk0:
                    pos["stop"] = pos["entry"] - c["beOffTicks"] * TICK
                    pos["be_done"] = True

    return stats(pnl_dollars)


def stats(pnl):
    if not pnl:
        return {"trades": 0, "wr": 0.0, "pf": 0.0, "net": 0.0, "max_dd": 0.0}
    wins = [p for p in pnl if p > 0]
    losses = [-p for p in pnl if p <= 0]
    gw, gl = sum(wins), sum(losses)
    eq = peak = dd = 0.0
    for p in pnl:
        eq += p
        peak = max(peak, eq)
        dd = max(dd, peak - eq)
    return {"trades": len(pnl), "wr": 100.0 * len(wins) / len(pnl),
            "pf": gw / gl if gl > 0 else float("inf"),
            "net": sum(pnl), "max_dd": dd}


# ------------------------------------------------------------------------ sweep

SPACE = {
    "alignPts": [3.0, 5.0, 8.0],
    "minGapPts": [1.0, 2.0, 3.0],
    "minImpulsePts": [0.0, 5.0, 10.0],
    "requireHtf": [False, True],
    "requireInside": [False, True],
    "nearPts": [3.0, 5.0, 8.0],
    "use1h": [False, True],
    "use4h": [False, True],
    "minGrade": [0, 1, 2, 3],
    "rejectClose": [True, False],
    "allowShort": [False, True],
    "stopPts": [6.0, 10.0, 15.0, 20.0],
    "tpR": [1.0, 1.5, 2.0, 3.0],
    "useBE": [False, True],
    "maxAgeBars": [0, 120, 390],
    "session": [None, (8 * 60 + 30, 12 * 60), (8 * 60 + 30, 15 * 60)],
    "maxPerDay": [0, 3, 5],
    "maxLossDay": [0, 2],
}


def fmt(r):
    return (f"trades={r['trades']:>4}  wr={r['wr']:5.1f}%  pf={r['pf']:5.2f}  "
            f"net=${r['net']:>10,.0f}  maxDD=${r['max_dd']:>8,.0f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", help="TradingView 1m export (time,open,high,low,close[,volume])")
    ap.add_argument("--sweep", type=int, default=0)
    ap.add_argument("--min-trades", type=int, default=40)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    bars = load_csv(args.csv)
    print(f"{len(bars)} 1m bars ({bars[0]['t']} .. {bars[-1]['t']})\n")

    if not args.sweep:
        r = run(bars, {})
        print("defaults:", fmt(r))
        return

    rng = random.Random(args.seed)
    split = int(len(bars) * 0.7)
    results = []
    for n in range(args.sweep):
        cfg = {k: rng.choice(v) for k, v in SPACE.items()}
        r = run(bars, cfg)
        if r["trades"] >= args.min_trades and r["pf"] != float("inf"):
            results.append((r, cfg))
        if (n + 1) % 50 == 0:
            print(f"  ...{n + 1}/{args.sweep} tested, {len(results)} viable", file=sys.stderr)

    if not results:
        print("No config produced enough trades — lower --min-trades or loosen SPACE.")
        return

    def score(item):
        r = item[0]
        return (min(r["wr"], 80) / 80) * min(r["pf"], 5) / 5

    results.sort(key=score, reverse=True)
    print(f"top configs of {len(results)} viable (of {args.sweep} tested), "
          f"ranked by joint WR+PF score:\n")
    for r, cfg in results[:12]:
        print(fmt(r))
        diff = {k: v for k, v in cfg.items() if DEFAULTS.get(k) != v}
        print(f"    {diff}")
        oos = run(bars[split:], cfg)
        print(f"    out-of-sample last 30%: {fmt(oos)}\n")


if __name__ == "__main__":
    main()
