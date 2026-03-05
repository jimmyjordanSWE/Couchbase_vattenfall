# Wind Turbine Data Generation Foundation

This document explains what to simulate and why, based on real wind turbine telemetry practice.

## What Real Turbine Systems Typically Output

From public SCADA-oriented references, typical turbine/plant data includes:

- wind speed
- wind direction
- active power
- rotor speed
- blade pitch angle
- ambient/nacelle temperature
- status/alarm codes

Many SCADA datasets are 10-minute aggregates, while some fleets also archive higher-rate channels (for example 1 Hz) for analysis.

Inference from sources:
- Use SCADA-like channels for operational pipeline demo realism.
- Add higher-rate derived vibration indicators (RMS/kurtosis/crest factor) as a separate source for condition-monitoring style behavior.

## Source References

- OpenOA SCADA schema (field names/units commonly used in wind analytics):
  - https://openoa.readthedocs.io/en/latest/api/schema.html
- Wind Energy Science 2025 dataset paper (SCADA categories and 10 min recording context):
  - https://wes.copernicus.org/articles/10/1929/2025/wes-10-1929-2025.html
- Wind Energy Science 2024 study (example channels such as nacelle wind speed, direction, ambient temperature, pitch, rotor speed):
  - https://wes.copernicus.org/articles/9/2017/2024/
- NREL maintenance report excerpt showing 1 Hz and higher-rate archived channels in some contexts:
  - https://www.nrel.gov/docs/fy22osti/82704.pdf

## Recommended Simulation Model (Hackathon)

Use multi-source streams per turbine:

1. `source_type=scada`
- cadence: 1 Hz (demo speed)
- fields:
  - `wind_speed_m_s`
  - `wind_direction_deg`
  - `power_kw`
  - `rotor_speed_rpm`
  - `pitch_deg`
  - `ambient_temp_c`
  - `status_code`

2. `source_type=vibration_cms`
- cadence: 1 Hz (aggregated indicators for demo; not raw kHz waveform)
- fields:
  - `vibration_rms_mm_s`
  - `vibration_kurtosis`
  - `crest_factor`
  - `band_energy_hz_1_10`

3. `source_type=alarm_log`
- event-driven or sparse periodic
- fields:
  - `severity`
  - `alarm_code`
  - `message`

## Fault Scenarios to Simulate

1. `gearbox_overheat`
- ambient/gearbox-related temperature drift up
- mild power loss at same wind speed
- vibration RMS rises

2. `rotor_imbalance`
- periodic vibration amplitude increase
- rotor speed ripple
- power ripple

3. `sensor_stuck`
- one channel becomes flat for a window

4. `normal_operational_curtailment` (non-fault)
- temporary power and rotor speed reduction
- should not always map to critical behavior

## Why This is Good Enough

- Realistic enough for judges and architecture validation.
- Simple enough to build in hackathon time.
- Supports later replacement with real SCADA adapters without changing downstream contracts.
