# Cleaning strategies (2026-09-24)

**Finding:** the less a bot cleans, the better it does on every measure: depth, gems kept, and the floor 20
goal. Partial cleaning (25–75%) is the worst trade, because it costs energy without earning the clean floor
bonus or its energy refund.

## Setup

- Command: `SIM_GOAL=20 SIM_STRATEGIES=1 npm run sim -- 100 10` (100 bots per set × 10 runs, same seeds for
  every set).
- Each set breaks at least its quota of every floor's blocks before taking the stairs. 100% fully cleans every
  floor (clean floor bonus and energy refund); 0% digs only until it finds the stairs. The quota is strict: the
  bot never skips it to save energy, and it leaves the mine on arriving at a floor it can't afford.
- While under quota the bot breaks the cheapest reachable block (it ignores hints and the stairs), and it picks
  up every revealed item first.
- Game state: Gas Mask stacks (gas 12), two-step items (Rush included), gems-only Rush breaks.

## Summary

| Strategy | Depth, run 1 | Depth, run 10 | Gems kept, run 10 | Upgrade levels by run 10 | Left by choice, run 10 | Best floor (mean ± sd) | Best floor min–max (mode) | Reached floor 20 |
|---|---|---|---|---|---|---|---|---|
| Clean 100% | 2.1 | 4.3 | 110 | 12.7 | 3% | 6.5 ± 2.7 | 4–23 (5) | 1% |
| Clean ≥ 75% | 2.7 | 4.7 | 92 | 12.2 | 40% | 6.8 ± 2.2 | 4–15 (5) | 0% |
| Clean ≥ 50% | 3.3 | 6.3 | 133 | 14.3 | 37% | 9.1 ± 2.5 | 5–17 (8) | 0% |
| Clean ≥ 25% | 4.0 | 8.0 | 172 | 16.1 | 29% | 11.6 ± 2.9 | 7–22 (11) | 1% |
| Stairs only | 4.8 | 10.6 | 250 | 17.7 | 19% | 14.8 ± 4.1 | 7–28 (11) | 12% |

## Findings

- **Diving wins everywhere.** Stairs-only bots end run 10 about 6 floors deeper than full cleaners, with more
  than twice the gems. Deeper floors hold better gems, so depth pays more than the clean floor multiplier (which
  only reached ×1.11 for the 100% set).
- **Partial cleaning is the worst trade.** 75% costs almost as much energy as 100% but earns no clean bonus and
  no energy refund, so it keeps fewer gems than 100% (92 against 110 at run 10).
- **Full cleaners run dry.** Only 3–14% of their runs end by choice; the rest end exhausted (half the gems lost).
  A full floor costs more than a run's energy early on, so they rarely get past floor 2–4.
- **Rushes come about every 2 floors for full cleaners** (more blocks per floor), against every 5–6 for divers,
  but they don't make up for the lost depth.
- **Floor 20 is out of reach for cleaners:** 12% of divers reach it (first on run 6–10, mean 8.6), and at most 1%
  of any cleaning set.

## Next levers

- If cleaning should be a real alternative: a bigger clean floor multiplier (`cleanBonus`) or a partial reward
  for partial cleaning. Now only a full clear pays anything.
- The default sim bot (`SIM_CLEAN=deep`, cleans affordable floors from floor 6) sits between the 25% set and
  diving; it is the closest to a sensible human.

## Full reports

### Clean 100% of every floor (100 bots)

| run | avg depth | gems kept | upgrades bought | total levels | left voluntarily | tool charges | rushes | floors/rush | blocks/rush | rush gems | clean/run | clean depth | mult | bonus gems |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2.1 | 18 | 0.59 | 0.6 | 13% | 1.0 | 1.07 | 2.0 | 12.6 | 13% | 1.10 | 1.2 | 1.02 | 3% |
| 2 | 2.1 | 19 | 0.94 | 1.5 | 14% | 1.0 | 1.02 | 2.1 | 12.7 | 10% | 1.11 | 1.2 | 1.02 | 4% |
| 3 | 2.5 | 26 | 1.05 | 2.6 | 13% | 1.0 | 1.18 | 2.1 | 12.7 | 9% | 1.53 | 1.6 | 1.04 | 6% |
| 4 | 3.2 | 59 | 1.38 | 4.0 | 6% | 1.1 | 1.44 | 2.3 | 12.6 | 7% | 2.25 | 2.6 | 1.07 | 19% |
| 5 | 2.9 | 38 | 1.07 | 5.0 | 11% | 1.1 | 1.38 | 2.1 | 12.5 | 9% | 1.95 | 1.8 | 1.06 | 8% |
| 6 | 3.5 | 116 | 1.60 | 6.6 | 11% | 1.4 | 1.51 | 2.3 | 12.2 | 4% | 2.46 | 2.8 | 1.07 | 23% |
| 7 | 4.0 | 80 | 1.56 | 8.2 | 4% | 1.6 | 1.76 | 2.2 | 12.0 | 7% | 2.96 | 2.5 | 1.10 | 15% |
| 8 | 4.1 | 97 | 1.52 | 9.7 | 5% | 1.8 | 1.83 | 2.2 | 11.8 | 7% | 3.10 | 2.6 | 1.11 | 17% |
| 9 | 4.3 | 102 | 1.50 | 11.2 | 5% | 2.2 | 1.88 | 2.3 | 11.7 | 7% | 3.26 | 2.5 | 1.12 | 16% |
| 10 | 4.3 | 110 | 1.45 | 12.7 | 3% | 2.5 | 1.87 | 2.3 | 11.7 | 8% | 3.27 | 2.6 | 1.11 | 15% |

```
Deepest floor per bot over 10 runs (100 bots)
min 4 | max 23 | mode 5 (35 bots) | mean 6.5 | std dev 2.7
  4 | ######### 9
  5 | ################################### 35
  6 | ################# 17
  7 | ################### 19
  8 | ########## 10
  9 | ## 2
 10 | ### 3
 11 | # 1
 12 | # 1
 14 | # 1
 18 | # 1
 23 | # 1

Goal: floor 20 within 10 runs: 1 of 100 bots (1%)
First run that reached it: min 6 | max 6 | mode 6 (1 bots) | mean 6.0 | std dev 0.0
  6 | # 1
```

### Clean at least 75% of every floor (100 bots)

| run | avg depth | gems kept | upgrades bought | total levels | left voluntarily | tool charges | rushes | floors/rush | blocks/rush | rush gems | clean/run | clean depth | mult | bonus gems |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2.7 | 22 | 0.83 | 0.8 | 39% | 1.0 | 1.10 | 2.5 | 12.7 | 12% | 0.00 | – | 1.00 | 0% |
| 2 | 3.0 | 26 | 1.22 | 2.1 | 30% | 1.0 | 1.24 | 2.4 | 12.7 | 13% | 0.00 | – | 1.00 | 0% |
| 3 | 3.3 | 31 | 1.09 | 3.1 | 41% | 1.0 | 1.28 | 2.6 | 12.7 | 12% | 0.00 | – | 1.00 | 0% |
| 4 | 3.8 | 44 | 1.31 | 4.4 | 40% | 1.0 | 1.42 | 2.7 | 12.7 | 9% | 0.00 | – | 1.00 | 0% |
| 5 | 3.6 | 46 | 1.21 | 5.7 | 39% | 1.1 | 1.42 | 2.6 | 12.5 | 10% | 0.00 | – | 1.00 | 0% |
| 6 | 4.1 | 60 | 1.29 | 7.0 | 35% | 1.2 | 1.49 | 2.8 | 12.1 | 8% | 0.00 | – | 1.00 | 0% |
| 7 | 4.3 | 69 | 1.39 | 8.3 | 45% | 1.4 | 1.62 | 2.7 | 11.9 | 8% | 0.00 | – | 1.00 | 0% |
| 8 | 4.7 | 87 | 1.51 | 9.8 | 40% | 1.8 | 1.71 | 2.8 | 12.1 | 7% | 0.00 | – | 1.00 | 0% |
| 9 | 4.2 | 72 | 1.10 | 10.9 | 41% | 2.0 | 1.67 | 2.5 | 11.9 | 9% | 0.00 | – | 1.00 | 0% |
| 10 | 4.7 | 92 | 1.28 | 12.2 | 40% | 2.2 | 1.74 | 2.7 | 11.7 | 8% | 0.00 | – | 1.00 | 0% |

```
Deepest floor per bot over 10 runs (100 bots)
min 4 | max 15 | mode 5 (27 bots) | mean 6.8 | std dev 2.2
  4 | ####### 7
  5 | ########################### 27
  6 | #################### 20
  7 | ################### 19
  8 | ####### 7
  9 | ####### 7
 10 | ###### 6
 11 | ### 3
 12 | ## 2
 13 | # 1
 15 | # 1

Goal: floor 20 within 10 runs: 0 of 100 bots (0%)
```

### Clean at least 50% of every floor (100 bots)

| run | avg depth | gems kept | upgrades bought | total levels | left voluntarily | tool charges | rushes | floors/rush | blocks/rush | rush gems | clean/run | clean depth | mult | bonus gems |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 3.3 | 23 | 0.87 | 0.9 | 35% | 1.0 | 1.11 | 3.0 | 12.3 | 12% | 0.00 | – | 1.00 | 0% |
| 2 | 3.7 | 30 | 1.31 | 2.2 | 30% | 1.0 | 1.22 | 3.0 | 12.4 | 11% | 0.00 | – | 1.00 | 0% |
| 3 | 4.4 | 41 | 1.36 | 3.5 | 33% | 1.0 | 1.35 | 3.2 | 12.3 | 8% | 0.00 | – | 1.00 | 0% |
| 4 | 4.8 | 60 | 1.55 | 5.1 | 28% | 1.1 | 1.44 | 3.4 | 12.3 | 7% | 0.00 | – | 1.00 | 0% |
| 5 | 5.0 | 64 | 1.47 | 6.6 | 36% | 1.2 | 1.52 | 3.3 | 11.9 | 9% | 0.00 | – | 1.00 | 0% |
| 6 | 5.4 | 77 | 1.49 | 8.0 | 36% | 1.4 | 1.62 | 3.3 | 11.7 | 8% | 0.00 | – | 1.00 | 0% |
| 7 | 5.4 | 86 | 1.54 | 9.6 | 38% | 1.7 | 1.63 | 3.3 | 11.8 | 7% | 0.00 | – | 1.00 | 0% |
| 8 | 6.4 | 121 | 1.75 | 11.3 | 29% | 2.2 | 1.78 | 3.6 | 11.6 | 6% | 0.00 | – | 1.00 | 0% |
| 9 | 5.9 | 114 | 1.45 | 12.8 | 38% | 2.5 | 1.66 | 3.6 | 11.5 | 7% | 0.00 | – | 1.00 | 0% |
| 10 | 6.3 | 133 | 1.50 | 14.3 | 37% | 2.8 | 1.77 | 3.6 | 11.4 | 6% | 0.00 | – | 1.00 | 0% |

```
Deepest floor per bot over 10 runs (100 bots)
min 5 | max 17 | mode 8 (19 bots) | mean 9.1 | std dev 2.5
  5 | ###### 6
  6 | ######## 8
  7 | ############### 15
  8 | ################### 19
  9 | ############ 12
 10 | ########## 10
 11 | ############### 15
 12 | ### 3
 13 | ######## 8
 14 | # 1
 15 | # 1
 16 | # 1
 17 | # 1

Goal: floor 20 within 10 runs: 0 of 100 bots (0%)
```

### Clean at least 25% of every floor (100 bots)

| run | avg depth | gems kept | upgrades bought | total levels | left voluntarily | tool charges | rushes | floors/rush | blocks/rush | rush gems | clean/run | clean depth | mult | bonus gems |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4.0 | 26 | 1.05 | 1.1 | 35% | 1.0 | 1.12 | 3.6 | 12.2 | 10% | 0.00 | – | 1.00 | 0% |
| 2 | 4.2 | 31 | 1.28 | 2.3 | 34% | 1.0 | 1.17 | 3.6 | 12.3 | 10% | 0.00 | – | 1.00 | 0% |
| 3 | 5.4 | 47 | 1.55 | 3.9 | 31% | 1.0 | 1.30 | 4.1 | 12.1 | 8% | 0.00 | – | 1.00 | 0% |
| 4 | 6.2 | 71 | 1.78 | 5.7 | 31% | 1.1 | 1.47 | 4.2 | 12.1 | 6% | 0.00 | – | 1.00 | 0% |
| 5 | 5.7 | 61 | 1.31 | 7.0 | 39% | 1.2 | 1.43 | 4.0 | 12.0 | 8% | 0.00 | – | 1.00 | 0% |
| 6 | 6.7 | 93 | 1.75 | 8.7 | 30% | 1.5 | 1.67 | 4.0 | 11.8 | 7% | 0.00 | – | 1.00 | 0% |
| 7 | 6.7 | 101 | 1.58 | 10.3 | 31% | 1.9 | 1.71 | 3.9 | 11.6 | 7% | 0.00 | – | 1.00 | 0% |
| 8 | 8.1 | 167 | 2.26 | 12.6 | 29% | 2.4 | 1.70 | 4.8 | 11.3 | 5% | 0.00 | – | 1.00 | 0% |
| 9 | 7.6 | 157 | 1.80 | 14.4 | 36% | 2.8 | 1.71 | 4.4 | 11.4 | 6% | 0.00 | – | 1.00 | 0% |
| 10 | 8.0 | 172 | 1.75 | 16.1 | 29% | 3.3 | 1.76 | 4.5 | 11.3 | 6% | 0.00 | – | 1.00 | 0% |

```
Deepest floor per bot over 10 runs (100 bots)
min 7 | max 22 | mode 11 (17 bots) | mean 11.6 | std dev 2.9
  7 | ###### 6
  8 | ####### 7
  9 | ########### 11
 10 | ############ 12
 11 | ################# 17
 12 | ############# 13
 13 | ########### 11
 14 | ########## 10
 15 | ##### 5
 16 | ## 2
 17 | ## 2
 18 | # 1
 19 | ## 2
 22 | # 1

Goal: floor 20 within 10 runs: 1 of 100 bots (1%)
First run that reached it: min 8 | max 8 | mode 8 (1 bots) | mean 8.0 | std dev 0.0
  8 | # 1
```

### Only what it takes to find the stairs (100 bots)

| run | avg depth | gems kept | upgrades bought | total levels | left voluntarily | tool charges | rushes | floors/rush | blocks/rush | rush gems | clean/run | clean depth | mult | bonus gems |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4.8 | 26 | 1.03 | 1.0 | 23% | 1.0 | 1.11 | 4.3 | 12.9 | 10% | 0.00 | – | 1.00 | 0% |
| 2 | 5.1 | 30 | 1.22 | 2.3 | 25% | 1.0 | 1.09 | 4.7 | 12.5 | 10% | 0.00 | – | 1.00 | 0% |
| 3 | 6.1 | 42 | 1.47 | 3.7 | 30% | 1.0 | 1.19 | 5.1 | 12.5 | 8% | 0.00 | – | 1.00 | 0% |
| 4 | 7.0 | 66 | 1.64 | 5.4 | 26% | 1.1 | 1.35 | 5.2 | 12.4 | 8% | 0.00 | – | 1.00 | 0% |
| 5 | 7.6 | 78 | 1.68 | 7.0 | 25% | 1.3 | 1.52 | 5.0 | 11.8 | 9% | 0.00 | – | 1.00 | 0% |
| 6 | 8.7 | 123 | 2.02 | 9.1 | 22% | 1.6 | 1.62 | 5.4 | 11.6 | 6% | 0.00 | – | 1.00 | 0% |
| 7 | 8.8 | 131 | 1.94 | 11.0 | 24% | 2.1 | 1.64 | 5.4 | 11.7 | 6% | 0.00 | – | 1.00 | 0% |
| 8 | 10.0 | 194 | 2.34 | 13.3 | 26% | 2.7 | 1.67 | 6.0 | 11.4 | 5% | 0.00 | – | 1.00 | 0% |
| 9 | 10.5 | 215 | 2.13 | 15.5 | 20% | 3.4 | 1.83 | 5.7 | 11.3 | 6% | 0.00 | – | 1.00 | 0% |
| 10 | 10.6 | 250 | 2.25 | 17.7 | 19% | 4.1 | 1.78 | 6.0 | 11.4 | 5% | 0.00 | – | 1.00 | 0% |

```
Deepest floor per bot over 10 runs (100 bots)
min 7 | max 28 | mode 11 (13 bots) | mean 14.8 | std dev 4.1
  7 | # 1
  8 | # 1
  9 | ## 2
 10 | ###### 6
 11 | ############# 13
 12 | ########### 11
 13 | ########### 11
 14 | ########## 10
 15 | ######### 9
 16 | ####### 7
 17 | ######## 8
 18 | ##### 5
 19 | #### 4
 20 | ### 3
 21 | ### 3
 23 | # 1
 25 | ## 2
 26 | # 1
 27 | # 1
 28 | # 1

Goal: floor 20 within 10 runs: 12 of 100 bots (12%)
First run that reached it: min 6 | max 10 | mode 9 (4 bots) | mean 8.6 | std dev 1.2
  6 | # 1
  7 | # 1
  8 | ### 3
  9 | #### 4
 10 | ### 3
```
