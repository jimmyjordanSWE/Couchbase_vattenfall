# Wind Turbine Data Simulation Guide (Hackathon)

## Goal

Generate realistic synthetic turbine telemetry that supports:

- baseline "healthy" behavior for Isolation Forest training
- controllable fault injections for scoring/demo validation
- repeatable runs for debugging and judging demos

## Scope

Simulate one or more turbines with a 1-second cadence.

Core signals per event:

- `temperature_c`
- `vibration_mm_s`
- `rpm`
- `power_kw`
- `wind_speed_m_s`

Metadata per event:

- `device_id`
- `ts`
- `seq`
- `scenario_id`
- `fault_label` (`normal` or fault type)

## Data Contract

Each emitted event should follow this shape:

```json
{
  "device_id": "TURBINE_01",
  "ts": "2026-03-05T12:00:01Z",
  "seq": 1001,
  "scenario_id": "baseline_day",
  "signals": {
    "temperature_c": 65.4,
    "vibration_mm_s": 2.1,
    "rpm": 1492.0,
    "power_kw": 1194.0,
    "wind_speed_m_s": 10.2
  },
  "fault_label": "normal"
}
```

## Baseline Generator (Healthy Behavior)

Use smooth periodic curves plus small Gaussian noise.

Example formulas at time step `t`:

- `wind_speed = 10 + 2 * sin(t/120) + N(0, 0.3)`
- `rpm = 1400 + 120 * sigmoid(wind_speed) + N(0, 8)`
- `power_kw = clamp(0.8 * rpm, 0, rated_power) + N(0, 12)`
- `temperature_c = 62 + 0.004 * power_kw + N(0, 0.5)`
- `vibration_mm_s = 1.8 + 0.0007 * rpm + N(0, 0.08)`

Notes:

- Keep signals physically correlated.
- Keep random seed configurable for deterministic runs.
- Keep multiple turbine profiles by varying constants slightly per `device_id`.

## Fault Injection Library

Inject faults as time-bounded scenarios with explicit start/end.

### 1. Bearing Wear (gradual)

- Effect: slowly rising vibration, then temperature drift.
- Injection:
  - add `+0.01` to `vibration_mm_s` per second during fault window
  - add delayed temp drift `+0.005` per second
- Expected model behavior: score rises gradually from normal to warning/critical.

### 2. Gearbox Overheat (step)

- Effect: sudden temperature jump and sustained high temp.
- Injection:
  - temperature `+10 to +18 C` step at fault start
  - mild vibration increase
- Expected model behavior: immediate high anomaly score.

### 3. Rotor Imbalance (oscillatory vibration)

- Effect: periodic vibration spikes with higher variance.
- Injection:
  - `vibration += 0.8 * sin(t/3) + N(0, 0.2)`
  - small power instability
- Expected model behavior: repeated warning spikes.

### 4. Sensor Drift (slow bias)

- Effect: one sensor drifts without matching physical relations.
- Injection:
  - temperature slowly drifts upward while power/rpm stay normal
- Expected model behavior: anomaly detected from broken feature correlation.

### 5. Curtailment / Operational Event (non-fault)

- Effect: rpm/power drop intentionally.
- Injection:
  - reduce rpm and power in controlled window
- Purpose: hard negative case so model does not flag every operational change as failure.

## Scenario Schedule

Use timeline blocks in a config file so runs are reproducible.

Example:

```yaml
seed: 42
cadence_seconds: 1
duration_minutes: 30
turbines: [TURBINE_01, TURBINE_02]
scenarios:
  - id: baseline_day
    start_s: 0
    end_s: 300
    type: normal
  - id: bearing_wear_1
    start_s: 301
    end_s: 540
    type: bearing_wear
  - id: curtailment_1
    start_s: 541
    end_s: 620
    type: curtailment
  - id: gearbox_overheat_1
    start_s: 621
    end_s: 760
    type: gearbox_overheat
```

## Training vs Demo Data

### Training set (for Isolation Forest)

- Mostly normal baseline data (90-100% normal)
- Include operational non-fault variations (wind changes, curtailment)
- Avoid heavy fault contamination in training

### Validation/demo set

- Mix normal + all fault patterns
- Keep labels for evaluation and dashboard display
- Include at least one subtle fault and one obvious fault

## Feature Builder Inputs

From raw signals, compute:

- direct features: `temperature_c`, `vibration_mm_s`, `rpm`, `power_kw`, `wind_speed_m_s`
- delta features: `d_temp`, `d_vibration`, `d_rpm`, `d_power`
- rolling features (window 30-60s): mean/std for vibration and temperature
- ratio features: `power_per_rpm`, `temp_per_power`

These features are passed to Isolation Forest inference.

## Scoring Thresholds

Use contamination and score quantiles to map classes:

- `normal`: score >= p25
- `warning`: p10 <= score < p25
- `critical`: score < p10

Tune on validation set to ensure:

- clear response on injected faults
- low false positives on normal and curtailment windows

## Minimal Implementation Plan

1. Build `simulator` module with baseline formulas and deterministic seed.
2. Add `fault library` with switchable injectors.
3. Add `scenario scheduler` driven by YAML/JSON.
4. Emit events to:
   - JSONL file for offline training
   - websocket/http stream for live dashboard
5. Train Isolation Forest on training split.
6. Run validation split and plot score distributions by `fault_label`.
7. Freeze thresholds used in live demo.

## Demo Controls to Expose

- start/stop stream
- select scenario pack (`baseline`, `mixed faults`, `stress mode`)
- inject fault now (manual override)
- set random seed
- set speed multiplier (`1x`, `5x`, `20x`)

## Success Criteria

- Simulator produces stable normal baseline and believable correlated signals.
- Each fault type produces distinct score behavior visible in dashboard.
- Model classifies obvious faults as `critical` consistently.
- False positives remain low during normal/curtailment periods.
- Same seed reproduces same run for reliable demos.
