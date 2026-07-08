# Offline backtester for the EMA Cloud + FVG strategy

A dependency-free Python replica of `pine/ema_cloud_fvg_strategy.pine` (15-minute
chart behavior) that can random-search the entire settings space against real
exported NQ data — hundreds of configs per minute instead of hand-flipping
toggles in TradingView.

## 1. Export the data from TradingView (one time)

1. Open an **NQ1! (continuous) 5-minute** chart.
2. Set the chart timezone to **America/Chicago** (bottom-right clock → Exchange).
3. Scroll/drag left so TradingView loads as much history as possible
   (each drag loads more bars; a few months is plenty).
4. Menu (⋯ or the chart's hamburger) → **Export chart data…** → CSV.

The CSV needs `time,open,high,low,close,volume` columns; extra columns are fine.

## 2. Run

```bash
# sanity check with the pine defaults
python3 backtest.py NQ_5m.csv

# random-search 500 setting combinations, keep configs with >= 60 trades
python3 backtest.py NQ_5m.csv --sweep 500 --min-trades 60
```

Each top config prints its full-sample stats, the settings that differ from the
defaults, and an **out-of-sample re-run on the last 30% of the data** — a config
whose out-of-sample line collapses was curve-fit to the sample and should be
discarded no matter how pretty the first line looks.

## Fidelity notes

- Entries fill at the next bar open (+1 tick slippage), matching TradingView's
  strategy engine; limit entries fill when price trades through the level.
- When a bar touches both stop and target, the **stop is assumed to fill
  first** (conservative; TradingView's tester is more optimistic).
- Commission $1.40/side per contract, NQ point value $20.
- The 5-minute FVG feed replicates what `request.security("5")` actually
  delivers to a 15-minute chart (one 5m sample per 15m bar), so results track
  the pine script's 15m-chart behavior, not an idealized 5m scan.

Numbers will not match TradingView to the decimal — use this to *rank* configs,
then verify the winners in the TradingView tester.
