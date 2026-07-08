#!/usr/bin/env python3
"""Offline replica of pine/ema_cloud_fvg_strategy.pine for real parameter sweeps.

Feed it a TradingView 5-minute NQ export (CSV with time,open,high,low,close,volume
columns — extra columns are ignored). It rebuilds the 15-minute chart, replays the
strategy bar by bar with realistic fills, commission and slippage, and can
random-search the whole settings space.

Usage:
    python3 backtest.py NQ_5m.csv                 # single run, pine defaults
    python3 backtest.py NQ_5m.csv --sweep 500     # random-search 500 configs
    python3 backtest.py NQ_5m.csv --sweep 500 --min-trades 60

Export the CSV with the chart timezone set to America/Chicago so session
times line up (see README.md).

No external dependencies — plain Python 3.
"""
import argparse
import csv
import random
import sys
from datetime import datetime, timedelta

POINT_VALUE = 20.0      # $ per NQ point
TICK = 0.25
COMMISSION = 1.4        # $ per contract per side
SLIPPAGE_TICKS = 1      # applied to market fills, entry and exit


# --------------------------------------------------------------------------- data

def parse_time(raw):
    raw = raw.strip()
    try:
        return datetime.fromtimestamp(int(raw))
    except ValueError:
        pass
    # ISO with or without offset; keep the wall clock as exported
    dt = datetime.fromisoformat(raw)
    return dt.replace(tzinfo=None)


def load_5m(path):
    bars = []
    with open(path, newline="") as fh:
        reader = csv.DictReader(fh)
        cols = {c.lower().strip(): c for c in reader.fieldnames}
        need = ["time", "open", "high", "low", "close"]
        for n in need:
            if n not in cols:
                sys.exit(f"CSV is missing a '{n}' column (found: {reader.fieldnames})")
        vol_col = cols.get("volume")
        for row in reader:
            t = parse_time(row[cols["time"]])
            bars.append({
                "t": t,
                "o": float(row[cols["open"]]),
                "h": float(row[cols["high"]]),
                "l": float(row[cols["low"]]),
                "c": float(row[cols["close"]]),
                "v": float(row[vol_col]) if vol_col and row[vol_col] else 0.0,
            })
    bars.sort(key=lambda b: b["t"])
    return bars


def aggregate_15m(bars5):
    """Group 5m bars into 15m bars aligned to :00/:15/:30/:45.

    Also record, per 15m bar, the last 5m bar inside it — that is exactly what
    request.security(\"5\") hands the pine tracker on a 15m chart."""
    out, last5 = [], []
    cur_key, cur = None, None
    for b in bars5:
        key = b["t"].replace(minute=(b["t"].minute // 15) * 15, second=0, microsecond=0)
        if key != cur_key:
            if cur is not None:
                out.append(cur)
                last5.append(prev_b)
            cur_key = key
            cur = {"t": key, "o": b["o"], "h": b["h"], "l": b["l"], "c": b["c"], "v": b["v"]}
        else:
            cur["h"] = max(cur["h"], b["h"])
            cur["l"] = min(cur["l"], b["l"])
            cur["c"] = b["c"]
            cur["v"] += b["v"]
        prev_b = b
    if cur is not None:
        out.append(cur)
        last5.append(prev_b)
    return out, last5


def trading_day(t):
    """CME trading day: rolls over at 17:00 Chicago."""
    return (t - timedelta(hours=17)).date()


# ---------------------------------------------------------------------- indicators

class Ema:
    def __init__(self, n):
        self.a = 2.0 / (n + 1)
        self.v = None
        self.n = n
        self._seed = []

    def update(self, x):
        if self.v is None:
            self._seed.append(x)
            if len(self._seed) == self.n:
                self.v = sum(self._seed) / self.n
            return self.v
        self.v += self.a * (x - self.v)
        return self.v


class Rma:
    def __init__(self, n):
        self.n = n
        self.v = None
        self._seed = []

    def update(self, x):
        if self.v is None:
            self._seed.append(x)
            if len(self._seed) == self.n:
                self.v = sum(self._seed) / self.n
            return self.v
        self.v += (x - self.v) / self.n
        return self.v


class Dmi:
    def __init__(self, n=14):
        self.tr, self.plus, self.minus, self.adx = Rma(n), Rma(n), Rma(n), Rma(n)
        self.ph = self.pl = self.pc = None
        self.adx_v = None

    def update(self, h, l, c):
        if self.ph is None:
            self.ph, self.pl, self.pc = h, l, c
            return None
        up, dn = h - self.ph, self.pl - l
        pdm = up if (up > dn and up > 0) else 0.0
        mdm = dn if (dn > up and dn > 0) else 0.0
        tr = max(h - l, abs(h - self.pc), abs(l - self.pc))
        self.ph, self.pl, self.pc = h, l, c
        trv = self.tr.update(tr)
        pv = self.plus.update(pdm)
        mv = self.minus.update(mdm)
        if trv is None or trv == 0:
            return None
        pdi, mdi = 100 * pv / trv, 100 * mv / trv
        s = pdi + mdi
        dx = 100 * abs(pdi - mdi) / s if s > 0 else 0.0
        self.adx_v = self.adx.update(dx)
        return self.adx_v


class FvgTracker:
    """Mirrors f_trackFvg: confirmed-bar triples, mitigation on chart close,
    overlap check on the chart bar, first-tap bookkeeping."""

    def __init__(self, min_gap_pts, max_zones=12):
        self.min_gap = min_gap_pts
        self.max_zones = max_zones
        self.conf = []          # last 3 confirmed (hi, lo)
        self.zones = []         # [top, bottom, touched]

    def new_bar(self, prev_hi, prev_lo):
        self.conf.append((prev_hi, prev_lo))
        if len(self.conf) > 3:
            self.conf.pop(0)
        if len(self.conf) == 3:
            bottom = self.conf[0][0]
            top = self.conf[2][1]
            if top - bottom > self.min_gap:
                self.zones.append([top, bottom, False])
                if len(self.zones) > self.max_zones:
                    self.zones.pop(0)

    def mitigate(self, close):
        self.zones = [z for z in self.zones if close >= z[1]]

    def check(self, low, high, first_only, cloud=None):
        aligned, bot = False, None
        for z in self.zones:
            if low <= z[0] and high >= z[1]:
                cloud_ok = cloud is None or (z[0] >= cloud[0] and z[1] <= cloud[1])
                if cloud_ok and (not first_only or not z[2]):
                    aligned = True
                    bot = z[1] if bot is None else min(bot, z[1])
                z[2] = True
        return aligned, bot


# ------------------------------------------------------------------------ strategy

DEFAULTS = {
    "fastLen": 20, "slowLen": 50,
    "needCloseAboveFast": True,
    "useTrendEma": False, "trendLen": 200,
    "use5": True, "use15": True, "fvgBoth": False,
    "minGapTicks": 0, "firstTapOnly": False, "useCloudFvg": True,
    "useSlope": False, "slopeBars": 3,
    "useThick": False, "thickAtr": 0.3,
    "useCandle": False, "closePosPct": 60,
    "useVol": False, "volMult": 1.2,
    "useHtfTrend": False, "htfTrendLen": 50,
    "useVwap": False, "useAdx": False, "adxMin": 20,
    "useStruct": True, "structLen": 20, "structWithin": 10,
    "useSweep": False, "sweepLen": 10, "sweepWithin": 3,
    "useDayOpen": False,
    "usePbReset": True, "pbResetBars": 2,
    "maxStretch": 0.0,
    "entryMode": "market",       # market | limitEMA | limitMid
    "limitTtl": 3,
    "stopBasis": "fvg",          # fvg | ema | both
    "stopBufTicks": 8,
    "atrFloor": 0.0,             # 0 = off, else ATR multiple
    "tpR": 2.0,
    "useSwingCap": False, "swingLen": 20, "minRR": 0.5,
    "useBE": False, "beTrigger": 0.6, "beOffTicks": 2,
    "exitOnFlip": True,
    "maxPerDay": 0, "maxLossDay": 0, "cooldownBars": 0,
    "session": None,             # (start_minute, end_minute) wall clock, or None
    "lunchSkip": None,           # (start_minute, end_minute) or None
}


def minutes(t):
    return t.hour * 60 + t.minute


def run(bars15, last5, cfg):
    c = dict(DEFAULTS)
    c.update(cfg)

    ema_f, ema_s = Ema(c["fastLen"]), Ema(c["slowLen"])
    ema_t = Ema(c["trendLen"])
    ema_h1 = Ema(c["htfTrendLen"])          # 1h EMA built from hourly closes
    atr = Rma(14)
    dmi = Dmi(14)
    vol_hist, ema_f_hist, ema_s_hist, high_hist, low_hist = [], [], [], [], []

    trk5 = FvgTracker(c["minGapTicks"] * TICK)
    trk15 = FvgTracker(c["minGapTicks"] * TICK)

    trades = []
    pos = None          # dict(entry, stop, tp, qty, be_done)
    pending = None      # dict(kind, price, placed_i, stop, tp, expires)
    flip_exit = False
    pb_armed, above_fast = True, 0
    day, day_trades, day_losses = None, 0, 0
    last_entry_bar = None
    vwap_pv = vwap_v = 0.0
    day_open = None
    h1_key, h1_close = None, None
    prev_close = None
    prev15 = None
    prev5 = None

    for i, b in enumerate(bars15):
        t, o, h, l, close, vol = b["t"], b["o"], b["h"], b["l"], b["c"], b["v"]
        td = trading_day(t)
        if td != day:
            day = td
            day_trades = day_losses = 0
            vwap_pv = vwap_v = 0.0
            day_open = o
        vwap_pv += (h + l + close) / 3 * vol
        vwap_v += vol
        vwap = vwap_pv / vwap_v if vwap_v > 0 else close

        # ---- open of bar: fill orders queued at previous close
        if pending is not None:
            if pending["kind"] == "market":
                fill = o + SLIPPAGE_TICKS * TICK
                pos = {"entry": fill, "stop": pending["stop"], "tp": pending["tp"],
                       "be_done": False, "bar": i}
                pending = None
            elif pending["kind"] == "limit":
                if i > pending["expires"] or (prev_close is not None and prev15 is not None
                                              and ema_f.v is not None and ema_s.v is not None
                                              and ema_f.v <= ema_s.v):
                    pending = None
                elif l <= pending["price"]:
                    fill = min(o, pending["price"])
                    pos = {"entry": fill, "stop": pending["stop"], "tp": pending["tp"],
                           "be_done": False, "bar": i}
                    pending = None
        if flip_exit and pos is not None:
            px = o - SLIPPAGE_TICKS * TICK
            trades.append((pos["entry"], px))
            if px < pos["entry"]:
                day_losses += 1
            pos = None
        flip_exit = False

        # ---- intrabar exits (stop first when both touch: conservative)
        if pos is not None and i >= pos["bar"]:
            if l <= pos["stop"]:
                px = min(o, pos["stop"]) - SLIPPAGE_TICKS * TICK
                trades.append((pos["entry"], px))
                if px < pos["entry"]:
                    day_losses += 1
                pos = None
            elif h >= pos["tp"]:
                px = max(o, pos["tp"])
                trades.append((pos["entry"], px))
                pos = None

        # ---- close of bar: indicators
        ef = ema_f.update(close)
        es = ema_s.update(close)
        et = ema_t.update(close)
        a = atr.update(max(h - l, abs(h - (prev_close or close)), abs(l - (prev_close or close))))
        adx = dmi.update(h, l, close)
        vol_hist.append(vol)
        high_hist.append(h)
        low_hist.append(l)
        if ef is not None:
            ema_f_hist.append(ef)
        if es is not None:
            ema_s_hist.append(es)
        hk = t.replace(minute=0, second=0, microsecond=0)
        if h1_key is not None and hk != h1_key and h1_close is not None:
            ema_h1.update(h1_close)
        h1_key, h1_close = hk, close

        # FVG trackers: push the just-confirmed bar, then mitigate on this close
        if prev15 is not None and c["use15"]:
            trk15.new_bar(prev15["h"], prev15["l"])
            trk15.mitigate(close)
        if prev5 is not None and c["use5"]:
            trk5.new_bar(prev5["h"], prev5["l"])
            trk5.mitigate(close)
        prev15, prev5 = b, last5[i]
        prev_close = close

        if ef is None or es is None or a is None:
            continue

        # ---- pullback re-arm state
        above_fast = above_fast + 1 if close > ef else 0
        if not pb_armed and above_fast >= c["pbResetBars"]:
            pb_armed = True

        # ---- signal evaluation on the confirmed bar
        bull = ef > es
        cloud = (max(ef, es), min(ef, es)) if c["useCloudFvg"] else None
        f5, b5 = trk5.check(l, h, c["firstTapOnly"], cloud) if c["use5"] else (False, None)
        f15, b15 = trk15.check(l, h, c["firstTapOnly"], cloud) if c["use15"] else (False, None)
        if c["fvgBoth"]:
            aligned = (not c["use5"] or f5) and (not c["use15"] or f15) and (c["use5"] or c["use15"])
        else:
            aligned = f5 or f15
        fvg_bottom = None
        for x, bb in ((f5, b5), (f15, b15)):
            if x and bb is not None:
                fvg_bottom = bb if fvg_bottom is None else min(fvg_bottom, bb)

        tap = bull and l <= ef and close > es and (not c["needCloseAboveFast"] or close > ef)

        def win(hist, n, skip_last=False):
            src = hist[:-1] if skip_last else hist
            return src[-n:] if len(src) >= n else None

        ok = tap and aligned
        ok = ok and (not c["useTrendEma"] or (et is not None and close > et))
        if ok and c["useSlope"]:
            n = c["slopeBars"]
            ok = (len(ema_f_hist) > n and len(ema_s_hist) > n
                  and ef > ema_f_hist[-1 - n] and es > ema_s_hist[-1 - n])
        ok = ok and (not c["useThick"] or ef - es >= c["thickAtr"] * a)
        if ok and c["useCandle"]:
            rng = h - l
            ok = rng > 0 and (close - l) / rng >= c["closePosPct"] / 100.0
        if ok and c["useVol"]:
            wv = win(vol_hist, 20)
            ok = wv is not None and vol > sum(wv) / len(wv) * c["volMult"]
        ok = ok and (not c["useHtfTrend"] or (ema_h1.v is not None and close > ema_h1.v))
        ok = ok and (not c["useVwap"] or close > vwap)
        ok = ok and (not c["useAdx"] or (adx is not None and adx >= c["adxMin"]))
        if ok and c["useStruct"]:
            hit = False
            for back in range(0, c["structWithin"] + 1):
                idx = len(high_hist) - 1 - back
                lo_w = high_hist[max(0, idx - c["structLen"]):idx]
                if idx > 0 and lo_w and high_hist[idx] > max(lo_w):
                    hit = True
                    break
            ok = hit
        if ok and c["useSweep"]:
            hit = False
            for back in range(0, c["sweepWithin"] + 1):
                idx = len(low_hist) - 1 - back
                w = low_hist[max(0, idx - c["sweepLen"]):idx]
                if idx > 0 and w:
                    pl = min(w)
                    cl = bars15[i - back]["c"]
                    if low_hist[idx] < pl and cl > pl:
                        hit = True
                        break
            ok = hit
        ok = ok and (not c["useDayOpen"] or (day_open is not None and close > day_open))
        ok = ok and (c["maxStretch"] == 0 or close - ef <= c["maxStretch"] * a)
        ok = ok and (not c["usePbReset"] or pb_armed)
        if ok and c["session"]:
            ok = c["session"][0] <= minutes(t) < c["session"][1]
        if ok and c["lunchSkip"]:
            ok = not (c["lunchSkip"][0] <= minutes(t) < c["lunchSkip"][1])
        ok = ok and (c["maxPerDay"] == 0 or day_trades < c["maxPerDay"])
        ok = ok and (c["maxLossDay"] == 0 or day_losses < c["maxLossDay"])
        ok = ok and (c["cooldownBars"] == 0 or last_entry_bar is None
                     or i - last_entry_bar > c["cooldownBars"])

        if ok:
            pb_armed = False

        # ---- BE management (evaluated on close, applied to open position)
        if pos is not None and c["useBE"] and not pos["be_done"]:
            risk0 = pos["entry"] - pos["stop"]
            if risk0 > 0 and h >= pos["entry"] + c["beTrigger"] * risk0:
                pos["stop"] = pos["entry"] + c["beOffTicks"] * TICK
                pos["be_done"] = True
        if pos is not None and c["exitOnFlip"] and not bull:
            flip_exit = True

        # ---- place the order for the next bar
        if ok and pos is None and pending is None:
            entry_px = close
            if c["entryMode"] == "limitEMA":
                entry_px = min(ef, close)
            elif c["entryMode"] == "limitMid":
                entry_px = min((h + l) / 2, close)
            base = {"fvg": fvg_bottom if fvg_bottom is not None else es,
                    "ema": es}.get(c["stopBasis"],
                                   min(fvg_bottom if fvg_bottom is not None else es, es))
            stop = base - c["stopBufTicks"] * TICK
            if c["atrFloor"] > 0:
                stop = min(stop, entry_px - c["atrFloor"] * a)
            risk = entry_px - stop
            if risk <= 0:
                continue
            tp = entry_px + c["tpR"] * risk
            if c["useSwingCap"]:
                sw = win(high_hist, c["swingLen"])
                if sw:
                    tp = min(tp, max(sw))
                if tp - entry_px < c["minRR"] * risk:
                    continue
            day_trades += 1
            last_entry_bar = i
            if c["entryMode"] == "market":
                pending = {"kind": "market", "stop": stop, "tp": tp}
            else:
                pending = {"kind": "limit", "price": entry_px, "stop": stop, "tp": tp,
                           "expires": i + c["limitTtl"]}

    return stats(trades)


def stats(trades):
    if not trades:
        return {"trades": 0, "wr": 0.0, "pf": 0.0, "net": 0.0, "gross_w": 0, "gross_l": 0,
                "max_dd": 0.0}
    pnl = [(x - e) * POINT_VALUE - 2 * COMMISSION for e, x in trades]
    wins = [p for p in pnl if p > 0]
    losses = [-p for p in pnl if p <= 0]
    gw, gl = sum(wins), sum(losses)
    eq = peak = dd = 0.0
    for p in pnl:
        eq += p
        peak = max(peak, eq)
        dd = max(dd, peak - eq)
    return {
        "trades": len(pnl),
        "wr": 100.0 * len(wins) / len(pnl),
        "pf": gw / gl if gl > 0 else float("inf"),
        "net": sum(pnl),
        "gross_w": gw, "gross_l": gl,
        "max_dd": dd,
    }


# --------------------------------------------------------------------------- sweep

SPACE = {
    "minGapTicks": [0, 10, 25],
    "fvgBoth": [False, True],
    "firstTapOnly": [False, True],
    "useCloudFvg": [True, False],
    "useStruct": [True, False],
    "structWithin": [10, 20],
    "useAdx": [False, True],
    "adxMin": [20, 25],
    "useVwap": [False, True],
    "useDayOpen": [False, True],
    "useSweep": [False, True],
    "useTrendEma": [False, True],
    "usePbReset": [True],
    "entryMode": ["market", "limitEMA"],
    "atrFloor": [0.0, 1.0, 1.5],
    "stopBasis": ["fvg", "ema", "both"],
    "tpR": [1.0, 1.5, 2.0, 2.5, 3.0],
    "useSwingCap": [False, True],
    "useBE": [False, True],
    "beTrigger": [0.6, 0.8],
    "maxLossDay": [0, 2],
    "maxPerDay": [0, 3],
    "session": [None, (8 * 60 + 30, 12 * 60), (8 * 60 + 30, 15 * 60)],
    "lunchSkip": [None, (10 * 60 + 30, 12 * 60 + 30)],
}


def fmt(r):
    return (f"trades={r['trades']:>4}  wr={r['wr']:5.1f}%  pf={r['pf']:5.2f}  "
            f"net=${r['net']:>10,.0f}  maxDD=${r['max_dd']:>8,.0f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", help="TradingView 5m export (time,open,high,low,close,volume)")
    ap.add_argument("--sweep", type=int, default=0, help="random-search N configs")
    ap.add_argument("--min-trades", type=int, default=40)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    bars5 = load_5m(args.csv)
    bars15, last5 = aggregate_15m(bars5)
    print(f"{len(bars5)} 5m bars -> {len(bars15)} 15m bars "
          f"({bars15[0]['t']} .. {bars15[-1]['t']})\n")

    if not args.sweep:
        r = run(bars15, last5, {})
        print("defaults:", fmt(r))
        return

    rng = random.Random(args.seed)
    split = int(len(bars15) * 0.7)
    results = []
    for n in range(args.sweep):
        cfg = {k: rng.choice(v) for k, v in SPACE.items()}
        r = run(bars15, last5, cfg)
        if r["trades"] >= args.min_trades and r["pf"] != float("inf"):
            results.append((r, cfg))
        if (n + 1) % 50 == 0:
            print(f"  ...{n + 1}/{args.sweep} tested, {len(results)} viable", file=sys.stderr)

    if not results:
        print("No config produced enough trades — lower --min-trades or loosen SPACE.")
        return

    def score(item):
        r = item[0]
        return (min(r["wr"], 80) / 80) * min(r["pf"], 5) / 5  # joint WR/PF score

    results.sort(key=score, reverse=True)
    print(f"top configs of {len(results)} viable (of {args.sweep} tested), "
          f"ranked by joint WR+PF score:\n")
    for r, cfg in results[:12]:
        print(fmt(r))
        diff = {k: v for k, v in cfg.items() if DEFAULTS.get(k) != v}
        print(f"    {diff}")
        # out-of-sample check: last 30% of the data only
        oos = run(bars15[split:], last5[split:], cfg)
        print(f"    out-of-sample last 30%: {fmt(oos)}\n")


if __name__ == "__main__":
    main()
