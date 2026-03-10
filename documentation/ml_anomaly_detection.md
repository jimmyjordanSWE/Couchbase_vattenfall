# EdgeGuard ML: Isolation Forest Anomaly Detection

## Why Isolation Forest?

Isolation Forest is a tree-based unsupervised anomaly detection algorithm. It works by randomly isolating observations — anomalies are isolated in fewer steps because they are rare and have unusual feature combinations. This makes it:

- **Training-data friendly**: Only needs normal operational data to train. No labelled fault examples required.
- **Edge-capable**: Inference is a single matrix operation. No GPU, no cloud API call.
- **Explainable**: The anomaly score is a direct measure of how easily the point was isolated — judges can understand it intuitively.
- **Appropriate for multi-sensor data**: Captures correlations between all 6 turbine signals simultaneously.

---

## Features

Six sensors are scored together as a single feature vector:

| Feature | Unit | Normal Range | Physical Meaning |
|---|---|---|---|
| `vibration` | mm/s | 0.5 – 2.0 | Gearbox/drivetrain vibration |
| `temperature` | °C | 40 – 65 | Nacelle/gearbox temperature |
| `rpm` | rev/min | 10 – 20 | Rotor rotational speed |
| `powerOutput` | kW | 500 – 2000 | Active electrical output |
| `windSpeed` | m/s | 5 – 15 | Measured wind at hub |
| `bladePitch` | degrees | 2 – 15 | Blade pitch angle (0 = flat, 90 = feathered) |

---

## Training Data Generation

Rather than using a static dataset, EdgeGuard generates 5000 synthetic training samples using real wind turbine physics. This ensures the model understands **correlated normal behaviour**, not just per-sensor bounds.

**Correlations encoded in training data:**

```
wind_speed (Weibull-distributed)
    │
    ├──► rpm          (linear: rpm ≈ 1.2 × wind_speed, capped at 20)
    │
    ├──► power_output (cubic: power ≈ 0.5 × wind_speed^2.5, capped at 2000 kW)
    │         │
    │         └──► temperature  (rises with power: temp = 35 + (power/2000) × 25)
    │
    ├──► vibration    (slight positive correlation with rpm)
    │
    └──► blade_pitch  (low wind: pitch rises with wind; high wind >12 m/s: feathers sharply)
```

**Wind speed distribution:**
Wind speeds follow a Weibull distribution (shape=2, scale=9), clipped to 3–25 m/s. This matches real offshore wind farm statistics and produces a realistic spread of operating points rather than a flat random distribution.

**Result:** The model learns that a turbine producing 1800 kW at 14 m/s wind with temperature 58°C is normal. But if the same wind produces only 200 kW while temperature is 110°C and vibration is 8 mm/s — that is an anomaly.

---

## Model Configuration

```python
IsolationForest(
    n_estimators=100,    # 100 isolation trees
    contamination=0.05,  # Expect ~5% anomalies in training data
    random_state=42,
    n_jobs=-1,           # Use all CPU cores for training
)
```

**Score normalisation:**
scikit-learn's `decision_function` returns higher values for normal points and negative values for anomalies. EdgeGuard inverts and normalises this to 0–1:

```
normalised = 1.0 - (raw - score_min) / (score_max - score_min)
```

Where `score_min` and `score_max` are calibrated on training data. This gives:
- `0.0` = most normal reading possible
- `1.0` = most anomalous reading possible
- `> 0.5` → labelled `"anomaly"`

---

## Anomaly Injection (Demo Mode)

The API supports on-demand anomaly injection for live demos:

```
POST /api/turbines/{turbine_id}/anomaly
```

This triggers an 8-reading burst of anomalous data for the specified turbine. Four failure modes are randomly selected per reading:

| Failure Mode | Vibration | Temperature | RPM | Power | Description |
|---|---|---|---|---|---|
| `overheating` | 2.5–5.0 | **85–120°C** | Normal | High | Gearbox/bearing overheat |
| `mechanical_failure` | **6–15** | 55–80°C | **18–28** | Low | Drivetrain fault with vibration |
| `stall` | Very low | Cool | **0–4** | ~0 | Rotor stall despite wind present |
| `power_surge` | 3–7 | 70–95°C | **22–35** | **2400–3500 kW** | Runaway above rated power |

All of these produce anomaly scores well above 0.5 and are immediately labelled `"anomaly"` by the Isolation Forest.

---

## Storage Impact of Anomaly Classification

The anomaly label (`"normal"` vs `"anomaly"`) directly drives storage policy:

| Label | Compaction | Eviction |
|---|---|---|
| `"normal"` | ✅ Eligible to be merged into CompactedBlocks | ✅ Oldest can be dropped under pressure |
| `"anomaly"` | ❌ Never merged | ❌ **Never evicted** |

This means every detected fault is guaranteed to reach central storage, regardless of how long the turbine stays offline.

---

## Model Persistence

The trained model is saved to `model/isolation_forest.joblib` using `joblib`:

```python
joblib.dump(
    {"model": self._model, "score_min": self._score_min, "score_max": self._score_max},
    _MODEL_CACHE_PATH,
)
```

On server startup, `load_from_disk()` restores the model instantly — no retraining needed. The model can also be serialised to base64 for storage in Couchbase (`serialize_model()` / `deserialize_model()`), enabling future model versioning and central distribution.

---

## Model Status API

```
GET /api/model/status
```

Returns:
```json
{
  "trained": true,
  "trainingSamples": 5000,
  "contamination": 0.05,
  "threshold": 0.5,
  "features": ["vibration", "temperature", "rpm", "powerOutput", "windSpeed", "bladePitch"],
  "version": "1.0.0"
}
```

---

## Future Enhancements

The current Isolation Forest can be replaced with a real SCADA-trained model without changing any downstream contracts. The `AnomalyDetector` class exposes a clean interface:

```python
score(sensors: SensorData) -> tuple[float, str]
# Returns (anomaly_score_0_to_1, "normal" | "anomaly")
```

Candidate upgrades:
- LSTM autoencoder trained on historical fault data
- Ensemble of per-turbine models (currently all turbines share one model)
- Online learning to adapt to seasonal operating condition shifts
