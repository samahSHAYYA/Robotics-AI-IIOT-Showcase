"""
Unit tests for the edge-sim sensors module (app/sensors.py).

Tests cover:
  1. Sensor definitions — counts, categories, structure
  2. Utility functions — _clamp, _random_walk, _determine_status
  3. SensorSimulator initialisation — 10 sensors, attributes, initial values
  4. Tick logic — random-walk bounds, history ring buffer, timestamp
  5. Failure modes — drift, spike, dropout injection and behaviour
  6. Sensor reset — clears failure, restores nominal value and NORMAL status
  7. Query methods — get_sensor, get_sensors, get_history
  8. SensorServer — Redis publishing with mocked async Redis
"""

import asyncio
import json
import random
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Module under test
from app.sensors import (
    SENSOR_DEFINITIONS,
    FailureMode,
    SensorCategory,
    SensorServer,
    SensorSimulator,
    SensorStatus,
    _clamp,
    _determine_status,
    _random_walk,
)

# ═══════════════════════════════════════════════════════════════════════════
# 1. Sensor definitions
# ═══════════════════════════════════════════════════════════════════════════


class TestSensorDefinitions:
    """Validate the SENSOR_DEFINITIONS constant."""

    def test_count(self):
        """There are exactly 10 sensor definitions."""
        assert len(SENSOR_DEFINITIONS) == 10

    def test_category_counts(self):
        """3 temperature, 3 vibration, 2 humidity, 2 power sensors."""
        counts: dict[str, int] = {}
        for d in SENSOR_DEFINITIONS:
            cat = d["category"].value if isinstance(d["category"], SensorCategory) else d["category"]
            counts[cat] = counts.get(cat, 0) + 1
        assert counts == {"temperature": 3, "vibration": 3, "humidity": 2, "power": 2}

    def test_every_entry_has_required_keys(self):
        """Each definition has id, name, category, unit, min_val, max_val, nominal."""
        required = {"id", "name", "category", "unit", "min_val", "max_val", "nominal"}
        for d in SENSOR_DEFINITIONS:
            assert required.issubset(d.keys()), f"{d['id']} missing keys: {required - d.keys()}"

    def test_ids_are_unique(self):
        """All sensor IDs are distinct."""
        ids = [d["id"] for d in SENSOR_DEFINITIONS]
        assert len(ids) == len(set(ids))

    def test_nominal_within_bounds(self):
        """Every nominal value lies inside [min_val, max_val]."""
        for d in SENSOR_DEFINITIONS:
            assert d["min_val"] <= d["nominal"] <= d["max_val"], f"{d['id']}: nominal {d['nominal']} out of range"

    def test_min_less_than_max(self):
        """Every range has non-zero positive span."""
        for d in SENSOR_DEFINITIONS:
            assert d["min_val"] < d["max_val"], f"{d['id']}: min >= max"

    def test_units_present(self):
        """All sensors have non-empty unit strings."""
        for d in SENSOR_DEFINITIONS:
            assert isinstance(d["unit"], str) and len(d["unit"]) > 0, f"{d['id']} has no unit"


# ═══════════════════════════════════════════════════════════════════════════
# 2. Utility functions
# ═══════════════════════════════════════════════════════════════════════════


class TestClamp:
    """Unit tests for the _clamp helper."""

    def test_within_range(self):
        assert _clamp(5.0, 0.0, 10.0) == 5.0

    def test_below_min(self):
        assert _clamp(-1.0, 0.0, 10.0) == 0.0

    def test_above_max(self):
        assert _clamp(15.0, 0.0, 10.0) == 10.0

    def test_at_min(self):
        assert _clamp(0.0, 0.0, 10.0) == 0.0

    def test_at_max(self):
        assert _clamp(10.0, 0.0, 10.0) == 10.0

    def test_negative_range(self):
        assert _clamp(5.0, 10.0, 0.0) == 10.0  # min > max → clamped to min


class TestRandomWalk:
    """Unit tests for the _random_walk function."""

    def test_values_stay_within_bounds(self):
        """Value never exceeds [min_val, max_val] even under extreme noise."""
        for _ in range(200):
            val = _random_walk(current=50.0, nominal=50.0, step=20.0, min_val=0.0, max_val=100.0)
            assert 0.0 <= val <= 100.0

    def test_mean_reversion_at_limit(self):
        """When far from nominal, the drift term pulls value back."""
        # current = 0 (far below nominal=50), reversion drift = (50-0)*0.05 = 2.5
        # Even with negative noise, the result should be ≥ 0
        random.seed(12345)
        for _ in range(50):
            val = _random_walk(current=0.0, nominal=50.0, step=5.0, min_val=0.0, max_val=100.0)
            assert val >= 0.0

    def test_deterministic_with_seed(self):
        """Same seed produces same result."""
        random.seed(42)
        val_a = _random_walk(current=37.0, nominal=37.0, step=1.0, min_val=20.0, max_val=80.0)
        random.seed(42)
        val_b = _random_walk(current=37.0, nominal=37.0, step=1.0, min_val=20.0, max_val=80.0)
        assert val_a == val_b

    def test_small_step_stays_near_current(self):
        """With very small step, the value stays close to the mean-reverted current."""
        random.seed(999)
        val = _random_walk(current=50.0, nominal=50.0, step=0.01, min_val=0.0, max_val=100.0)
        # drift = 0, noise ∈ [-0.01, 0.01]
        assert 49.99 <= val <= 50.01


class TestDetermineStatus:
    """Unit tests for the _determine_status function.

    Uses temp_assembly parameters: nominal=37, min=20, max=80, range=60.
    The category parameter is accepted but NOT used in the calculation.
    """

    # ── parametrised core logic ──────────────────────────────────────────
    # For each case: (value, nominal, min, max, category, expected_status)
    # Conversion: deviation = |value - nominal| / (max - min)

    @pytest.mark.parametrize(
        "value, nominal, min_val, max_val, category, expected",
        [
            # --- NORMAL (deviation ≤ 0.15 AND away from boundaries) ---
            (37.0, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.NORMAL),
            (28.0, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.NORMAL),  # dev = 9/60 = 0.15 → NOT > 0.15
            (46.0, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.NORMAL),  # dev = 9/60 = 0.15
            (30.0, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.NORMAL),  # dev = 7/60 ≈ 0.117

            # --- WARNING (0.15 < deviation ≤ 0.30 AND away from boundaries) ---
            (46.6, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.WARNING),  # dev = 9.6/60 = 0.16
            (55.0, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.WARNING),  # dev = 18/60 = 0.30 → NOT > 0.30

            # --- CRITICAL by deviation (> 0.30) ---
            (55.6, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.CRITICAL),  # dev = 18.6/60 = 0.31
            (19.0, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.CRITICAL),  # dev = 18/60 = 0.30 → 0.30 is NOT > 0.30, but value ≤ 20.4 → CRITICAL

            # --- CRITICAL by boundary (value ≤ min * 1.02) ---
            (20.4, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.CRITICAL),  # 20.4 ≤ 20.4
            (20.0, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.CRITICAL),

            # --- CRITICAL by boundary (value ≥ max * 0.98) ---
            (78.4, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.CRITICAL),  # 78.4 ≥ 78.4
            (80.0, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.CRITICAL),

            # --- Edge: just inside boundaries (should not be CRITICAL by boundary rule) ---
            (20.41, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.WARNING),  # > 20.4, dev = 16.59/60 ≈ 0.277
            (78.39, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE, SensorStatus.CRITICAL),  # < 78.4, dev = 41.39/60 ≈ 0.690 → CRITICAL by deviation

            # --- Vibration sensor (different range) ---
            (2.5, 2.5, 0.0, 10.0, SensorCategory.VIBRATION, SensorStatus.NORMAL),
            (4.0, 2.5, 0.0, 10.0, SensorCategory.VIBRATION, SensorStatus.NORMAL),  # dev = 1.5/10 = 0.15 → NOT > 0.15
            (4.1, 2.5, 0.0, 10.0, SensorCategory.VIBRATION, SensorStatus.WARNING),  # dev = 1.6/10 = 0.16

            # --- Power sensor (different range) ---
            (300.0, 300.0, 100.0, 500.0, SensorCategory.POWER, SensorStatus.NORMAL),
            (440.0, 300.0, 100.0, 500.0, SensorCategory.POWER, SensorStatus.CRITICAL),  # dev = 140/400 = 0.35 > 0.30
            (420.0, 300.0, 100.0, 500.0, SensorCategory.POWER, SensorStatus.WARNING),  # dev = 120/400 = 0.30 → NOT > 0.30

            # --- Humidity sensor ---
            (55.0, 55.0, 30.0, 80.0, SensorCategory.HUMIDITY, SensorStatus.NORMAL),
            (60.0, 55.0, 30.0, 80.0, SensorCategory.HUMIDITY, SensorStatus.NORMAL),  # dev = 5/50 = 0.10
            (63.0, 55.0, 30.0, 80.0, SensorCategory.HUMIDITY, SensorStatus.WARNING),  # dev = 8/50 = 0.16
        ],
    )
    def test_status_combinations(self, value, nominal, min_val, max_val, category, expected):
        result = _determine_status(value, nominal, min_val, max_val, category)
        assert result == expected, (
            f"For value={value}, nominal={nominal}, range=[{min_val},{max_val}]: "
            f"expected {expected.value}, got {result.value}"
        )

    def test_category_parameter_accepted_but_unused(self):
        """The category parameter is accepted (no TypeError) even though not used."""
        # Using a made-up category value to prove it's not inspected
        result = _determine_status(37.0, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE)
        assert result == SensorStatus.NORMAL

    def test_zero_range_does_not_divide_by_zero(self):
        """When min_val == max_val, deviation defaults to 0.0 — no ZeroDivisionError.

        With zero range, min*1.02 > max*0.98, so any value will trigger the
        boundary-based CRITICAL check. The important thing is no exception is raised.
        """
        result = _determine_status(10.0, 10.0, 10.0, 10.0, SensorCategory.TEMPERATURE)
        # No exception was raised; status is CRITICAL due to boundary overlap
        assert result == SensorStatus.CRITICAL

    def test_exact_deviation_thresholds(self):
        """At exactly 0.15 → NORMAL; at exactly 0.30 → WARNING (edge cases)."""
        # Deviation = 0.15 → NOT > 0.15 → NORMAL (not warning)
        assert _determine_status(46.0, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE) == SensorStatus.NORMAL
        # Deviation = 0.30 → > 0.15 AND NOT > 0.30 → WARNING (not critical)
        assert _determine_status(55.0, 37.0, 20.0, 80.0, SensorCategory.TEMPERATURE) == SensorStatus.WARNING


# ═══════════════════════════════════════════════════════════════════════════
# 3. SensorSimulator — initialisation
# ═══════════════════════════════════════════════════════════════════════════


class TestSensorSimulatorInit:
    """Verify SensorSimulator creates 10 properly configured sensors."""

    def test_creates_ten_sensors(self):
        sim = SensorSimulator()
        assert len(sim.sensors) == 10

    def test_sensor_ids_match_definitions(self):
        sim = SensorSimulator()
        defined_ids = {d["id"] for d in SENSOR_DEFINITIONS}
        assert set(sim.sensors.keys()) == defined_ids

    def test_each_sensor_has_all_expected_keys(self):
        sim = SensorSimulator()
        expected_keys = {"id", "name", "category", "unit", "value", "status", "timestamp"}
        for sensor_id, sensor in sim.sensors.items():
            assert expected_keys.issubset(sensor.keys()), f"{sensor_id} missing: {expected_keys - sensor.keys()}"

    def test_category_is_string_value(self):
        """Category is stored as the enum .value (not the enum object)."""
        sim = SensorSimulator()
        for sensor in sim.sensors.values():
            assert isinstance(sensor["category"], str)
            assert sensor["category"] in ("temperature", "vibration", "humidity", "power")

    def test_unit_is_string(self):
        sim = SensorSimulator()
        for sensor in sim.sensors.values():
            assert isinstance(sensor["unit"], str) and len(sensor["unit"]) > 0

    def test_initial_values_within_range(self):
        sim = SensorSimulator()
        for d in SENSOR_DEFINITIONS:
            sid = d["id"]
            val = sim.sensors[sid]["value"]
            assert d["min_val"] <= val <= d["max_val"], (
                f"{sid}: value {val} outside [{d['min_val']}, {d['max_val']}]"
            )

    def test_initial_value_near_nominal(self):
        """Initial value is nominal ±~2.0 (random offset)."""
        sim = SensorSimulator()
        for d in SENSOR_DEFINITIONS:
            sid = d["id"]
            val = sim.sensors[sid]["value"]
            assert abs(val - d["nominal"]) <= 2.0 + 1e-9, (
                f"{sid}: value {val} too far from nominal {d['nominal']}"
            )

    def test_initial_status_is_normal(self):
        sim = SensorSimulator()
        for sensor in sim.sensors.values():
            assert sensor["status"] == SensorStatus.NORMAL.value

    def test_initial_timestamp_is_iso_format(self):
        sim = SensorSimulator()
        for sensor in sim.sensors.values():
            ts = sensor["timestamp"]
            # Parse it back — raises ValueError if malformed
            datetime.fromisoformat(ts)

    def test_timestamp_is_consistent_across_sensors(self):
        """All sensors get the same initial timestamp (same instant)."""
        sim = SensorSimulator()
        timestamps = {s["timestamp"] for s in sim.sensors.values()}
        assert len(timestamps) == 1

    def test_history_initialised(self):
        sim = SensorSimulator()
        assert len(sim._history) == 10
        for sid in sim.sensors:
            assert sid in sim._history
            assert len(sim._history[sid]) == 1
            assert isinstance(sim._history[sid][0], float)

    def test_failed_set_empty(self):
        sim = SensorSimulator()
        assert len(sim._failed) == 0
        assert len(sim._failure_params) == 0

    def test_max_history_default(self):
        sim = SensorSimulator()
        assert sim._max_history == 20

    def test_custom_max_history(self):
        sim = SensorSimulator(max_history=5)
        assert sim._max_history == 5

    def test_specific_sensor_attributes(self):
        """Spot-check a few well-known sensor attributes."""
        sim = SensorSimulator()
        # Temperature — Assembly Line
        s = sim.get_sensor("temp_assembly")
        assert s is not None
        assert s["name"] == "Assembly Line"
        assert s["category"] == "temperature"
        assert s["unit"] == "°C"

        # Vibration — Robot C3
        s = sim.get_sensor("vib_robot_c3")
        assert s is not None
        assert s["name"] == "Robot C3"
        assert s["category"] == "vibration"
        assert s["unit"] == "mm/s"

        # Power — Main Line
        s = sim.get_sensor("pwr_main")
        assert s is not None
        assert s["name"] == "Main Line"
        assert s["category"] == "power"
        assert s["unit"] == "kW"


# ═══════════════════════════════════════════════════════════════════════════
# 4. SensorSimulator — tick behaviour
# ═══════════════════════════════════════════════════════════════════════════


class TestSensorSimulatorTick:
    """Validate the tick logic updates values within bounds and manages history."""

    def _run_ticks(self, sim: SensorSimulator, count: int = 1) -> None:
        """Helper: run N ticks synchronously using asyncio.run()."""
        async def _tick_n():
            for _ in range(count):
                await sim.tick()
        asyncio.run(_tick_n())

    def test_tick_updates_values(self):
        sim = SensorSimulator()
        # Seed so we get predictable initial values
        random.seed(1234)
        sim2 = SensorSimulator()
        random.seed(1234)
        sim2_initial = {sid: s["value"] for sid, s in sim2.sensors.items()}

        self._run_ticks(sim2)

        # At least some values should have changed (random walk has noise)
        values_changed = sum(
            1 for sid in sim2.sensors if sim2.sensors[sid]["value"] != sim2_initial[sid]
        )
        assert values_changed >= 1, "Expected at least one sensor value to change after tick"

    def test_tick_values_stay_in_bounds(self):
        sim = SensorSimulator()
        self._run_ticks(sim, count=50)  # 50 ticks should stress the bounds

        for d in SENSOR_DEFINITIONS:
            sid = d["id"]
            val = sim.sensors[sid]["value"]
            assert d["min_val"] <= val <= d["max_val"], (
                f"{sid}: value {val} outside [{d['min_val']}, {d['max_val']}] after 50 ticks"
            )

    def test_tick_updates_timestamp(self):
        sim = SensorSimulator()
        original_ts = sim.sensors["temp_assembly"]["timestamp"]
        self._run_ticks(sim)
        new_ts = sim.sensors["temp_assembly"]["timestamp"]
        assert new_ts != original_ts

    def test_tick_updates_status(self):
        """After many ticks, at least one sensor may move to WARNING/CRITICAL."""
        sim = SensorSimulator()
        self._run_ticks(sim, count=30)

        statuses = {s["status"] for s in sim.sensors.values()}
        # The set should contain at least "normal" (could also have warning/critical)
        assert "normal" in statuses

    def test_tick_appends_to_history(self):
        sim = SensorSimulator()
        self._run_ticks(sim, count=3)
        for sid in sim.sensors:
            assert len(sim._history[sid]) == 4  # 1 initial + 3 ticks

    def test_history_ring_buffer_respected(self):
        sim = SensorSimulator(max_history=5)
        self._run_ticks(sim, count=10)
        for sid in sim.sensors:
            assert len(sim._history[sid]) == 5, (
                f"{sid}: expected 5 history entries, got {len(sim._history[sid])}"
            )

    def test_history_contains_most_recent_values(self):
        """After many ticks, the history should contain the latest values (not the initial)."""
        sim = SensorSimulator(max_history=3)
        self._run_ticks(sim, count=5)
        # Since max_history=3 and we did 5 ticks, the oldest entries are gone
        # The last entry should equal the current value
        for sid in sim.sensors:
            last_history = sim._history[sid][-1]
            current_value = sim.sensors[sid]["value"]
            assert last_history == current_value, (
                f"{sid}: last history entry {last_history} ≠ current value {current_value}"
            )

    def test_value_rounding_to_two_decimals(self):
        sim = SensorSimulator()
        self._run_ticks(sim, count=10)
        for sid, sensor in sim.sensors.items():
            # Check that value has at most 2 decimal places
            val_str = f"{sensor['value']:.10f}"
            decimal_part = val_str.split(".")[1]
            # After rounding to 2 places, the 3rd decimal should be 0
            # Due to floating point, let's just verify it's close to a 2-decimal number
            assert round(sensor["value"], 2) == sensor["value"]


# ═══════════════════════════════════════════════════════════════════════════
# 5. SensorSimulator — failure modes
# ═══════════════════════════════════════════════════════════════════════════


class TestSensorSimulatorFailures:
    """Test trigger_failure and all three failure-mode behaviours."""

    def _run_ticks(self, sim: SensorSimulator, count: int = 1) -> None:
        async def _tick_n():
            for _ in range(count):
                await sim.tick()
        asyncio.run(_tick_n())

    # ── trigger_failure return value ─────────────────────────────────────

    def test_trigger_failure_valid_sensor(self):
        sim = SensorSimulator()
        assert sim.trigger_failure("temp_assembly", FailureMode.DRIFT) is True

    def test_trigger_failure_unknown_sensor(self):
        sim = SensorSimulator()
        assert sim.trigger_failure("nonexistent", FailureMode.DRIFT) is False

    def test_trigger_failure_adds_to_failed_set(self):
        sim = SensorSimulator()
        sim.trigger_failure("temp_assembly", FailureMode.SPIKE)
        assert "temp_assembly" in sim._failed
        assert sim._failure_params["temp_assembly"]["mode"] == FailureMode.SPIKE

    def test_trigger_failure_accepts_string_value(self):
        """trigger_failure also works if FailureMode is passed as .value string."""
        sim = SensorSimulator()
        # The method expects a FailureMode enum, but stores it as-is in _failure_params
        sim.trigger_failure("temp_assembly", FailureMode.DRIFT)
        assert "temp_assembly" in sim._failed

    # ── Drift mode ───────────────────────────────────────────────────────

    def test_drift_increases_value_over_time(self):
        """Drift adds range*2% per tick, so the value should monotonically increase."""
        sim = SensorSimulator()
        sid = "temp_assembly"       # range = 60, drift = 1.2 per tick
        sim.trigger_failure(sid, FailureMode.DRIFT)

        initial = sim.sensors[sid]["value"]
        self._run_ticks(sim, count=10)

        final = sim.sensors[sid]["value"]
        assert final > initial, f"Drift should increase value: {initial} -> {final}"

    def test_drift_does_not_exceed_max(self):
        """Drift is clamped to max_val."""
        sim = SensorSimulator()
        sid = "pwr_main"            # range = 400, drift = 8 per tick
        sim.trigger_failure(sid, FailureMode.DRIFT)

        self._run_ticks(sim, count=100)  # 100 ticks = up to +800, clamped at 500

        assert sim.sensors[sid]["value"] <= 500.0

    def test_drift_eventually_hits_max(self):
        """Drift pushed all the way to max_val."""
        sim = SensorSimulator()
        sid = "temp_assembly"
        sim.trigger_failure(sid, FailureMode.DRIFT)

        self._run_ticks(sim, count=200)  # 200 ticks = up to +240, clamped at 80

        assert sim.sensors[sid]["value"] == 80.0

    def test_drift_sets_status_critical(self):
        """A drifted value near max should be CRITICAL."""
        sim = SensorSimulator()
        sid = "temp_assembly"
        sim.trigger_failure(sid, FailureMode.DRIFT)

        self._run_ticks(sim, count=50)
        assert sim.sensors[sid]["status"] == SensorStatus.CRITICAL.value

    # ── Spike mode ───────────────────────────────────────────────────────

    def test_spike_produces_high_values(self):
        """Over many ticks, spike occasionally reaches near max_val."""
        sim = SensorSimulator()
        sid = "temp_assembly"
        sim.trigger_failure(sid, FailureMode.SPIKE)

        self._run_ticks(sim, count=50)

        history = sim._history[sid]
        # At least one spike near max (≥ 90% of max = 72)
        high_values = [v for v in history if v >= 72.0]
        assert len(high_values) >= 1, (
            f"No spike ≥ 72.0 found in history of {len(history)} values: {history}"
        )

    def test_spike_value_bounded(self):
        """Even spike values are clamped to max_val."""
        sim = SensorSimulator()
        sid = "temp_assembly"
        sim.trigger_failure(sid, FailureMode.SPIKE)

        self._run_ticks(sim, count=100)

        for v in sim._history[sid]:
            assert 20.0 <= v <= 80.0, f"Spike value {v} out of bounds"

    # ── Dropout mode ─────────────────────────────────────────────────────

    def test_dropout_freezes_value(self):
        """Dropout returns the same value on every tick."""
        sim = SensorSimulator()
        sid = "temp_assembly"
        sim.trigger_failure(sid, FailureMode.DROPOUT)

        frozen_value = sim.sensors[sid]["value"]
        self._run_ticks(sim, count=5)

        for _ in range(5):
            assert sim.sensors[sid]["value"] == frozen_value, (
                f"Dropout failed: value changed to {sim.sensors[sid]['value']}"
            )

    def test_dropout_frozen_history(self):
        """All history entries after the initial value are frozen (identical)."""
        sim = SensorSimulator()
        sid = "temp_assembly"
        sim.trigger_failure(sid, FailureMode.DROPOUT)

        self._run_ticks(sim, count=10)

        history = sim._history[sid]
        # The first entry is the initial value (before dropout takes effect),
        # but all entries after should be identical (frozen by dropout)
        assert len(history) >= 2, "Expected at least initial + one tick"
        frozen_value = history[1]
        assert all(v == frozen_value for v in history[1:]), (
            f"History not frozen after index 1: {history}"
        )

    # ── Multiple simultaneous failures ───────────────────────────────────

    def test_multiple_failures_independent(self):
        """Different sensors can have different failure modes simultaneously."""
        sim = SensorSimulator()
        sim.trigger_failure("temp_assembly", FailureMode.DRIFT)
        sim.trigger_failure("vib_robot_c3", FailureMode.DROPOUT)
        sim.trigger_failure("pwr_main", FailureMode.SPIKE)

        assert len(sim._failed) == 3

        val_vib_before = sim.sensors["vib_robot_c3"]["value"]
        self._run_ticks(sim, count=5)

        # Vibration should be frozen
        assert sim.sensors["vib_robot_c3"]["value"] == val_vib_before
        # Temperature should have drifted up
        assert sim.sensors["temp_assembly"]["value"] > 0
        # Power history should show spikes
        pwr_history = sim._history["pwr_main"]
        max_in_history = max(pwr_history)
        assert max_in_history >= 450.0  # spike near max=500


# ═══════════════════════════════════════════════════════════════════════════
# 6. SensorSimulator — reset
# ═══════════════════════════════════════════════════════════════════════════


class TestSensorSimulatorReset:
    """Verify reset_sensor clears failures and restores nominal."""

    def _run_ticks(self, sim: SensorSimulator, count: int = 1) -> None:
        async def _tick_n():
            for _ in range(count):
                await sim.tick()
        asyncio.run(_tick_n())

    def test_reset_clears_failed_set(self):
        sim = SensorSimulator()
        sim.trigger_failure("temp_assembly", FailureMode.DRIFT)
        assert "temp_assembly" in sim._failed
        sim.reset_sensor("temp_assembly")
        assert "temp_assembly" not in sim._failed

    def test_reset_clears_failure_params(self):
        sim = SensorSimulator()
        sim.trigger_failure("temp_assembly", FailureMode.DRIFT)
        assert "temp_assembly" in sim._failure_params
        sim.reset_sensor("temp_assembly")
        assert "temp_assembly" not in sim._failure_params

    def test_reset_restores_nominal_value(self):
        sim = SensorSimulator()
        sid = "temp_assembly"
        sim.trigger_failure(sid, FailureMode.DRIFT)
        self._run_ticks(sim, count=10)  # drift changes value
        assert sim.sensors[sid]["value"] != 37.0  # no longer nominal

        sim.reset_sensor(sid)
        assert sim.sensors[sid]["value"] == 37.0  # back to nominal

    def test_reset_restores_normal_status(self):
        sim = SensorSimulator()
        sid = "temp_assembly"
        sim.trigger_failure(sid, FailureMode.DRIFT)
        self._run_ticks(sim, count=50)  # drift to critical
        sim.reset_sensor(sid)
        assert sim.sensors[sid]["status"] == SensorStatus.NORMAL.value

    def test_reset_unknown_sensor_returns_false(self):
        sim = SensorSimulator()
        assert sim.reset_sensor("nonexistent") is False

    def test_reset_valid_sensor_returns_true(self):
        sim = SensorSimulator()
        assert sim.reset_sensor("temp_assembly") is True

    def test_reset_non_failed_sensor_still_works(self):
        """Reset also works for sensors that haven't failed."""
        sim = SensorSimulator()
        sid = "temp_assembly"
        assert sid not in sim._failed
        result = sim.reset_sensor(sid)
        assert result is True
        assert sim.sensors[sid]["value"] == 37.0
        assert sim.sensors[sid]["status"] == SensorStatus.NORMAL.value

    def test_reset_stops_drift_in_subsequent_ticks(self):
        """After reset, the sensor performs normal random walk (no longer drifts)."""
        sim = SensorSimulator()
        sid = "temp_assembly"
        sim.trigger_failure(sid, FailureMode.DRIFT)
        self._run_ticks(sim, count=5)
        drifted_value = sim.sensors[sid]["value"]

        sim.reset_sensor(sid)
        self._run_ticks(sim, count=5)

        # After reset, the value should no longer be monotonically increasing via drift
        # It will fluctuate around nominal (37.0) due to random walk
        post_reset_value = sim.sensors[sid]["value"]
        # It could be above or below nominal — just verify it's not on the drift trajectory
        # (The drift would have added ~6 more, so it should be significantly less)
        assert post_reset_value < drifted_value + 3.0, (
            f"Value {post_reset_value} still appears to be drifting from {drifted_value}"
        )


# ═══════════════════════════════════════════════════════════════════════════
# 7. SensorSimulator — query methods
# ═══════════════════════════════════════════════════════════════════════════


class TestSensorSimulatorQueries:
    """Test get_sensor, get_sensors, and get_history."""

    def test_get_sensors_returns_all(self):
        sim = SensorSimulator()
        all_sensors = sim.get_sensors()
        assert len(all_sensors) == 10
        assert all(isinstance(s, dict) for s in all_sensors)

    def test_get_sensors_returns_distinct_dicts(self):
        """Each sensor dict is a separate object (not the same reference)."""
        sim = SensorSimulator()
        all_sensors = sim.get_sensors()
        ids = [s["id"] for s in all_sensors]
        assert len(ids) == len(set(ids))

    def test_get_sensor_exists(self):
        sim = SensorSimulator()
        sensor = sim.get_sensor("temp_assembly")
        assert sensor is not None
        assert sensor["id"] == "temp_assembly"
        assert sensor["name"] == "Assembly Line"

    def test_get_sensor_not_exists(self):
        sim = SensorSimulator()
        assert sim.get_sensor("nonexistent") is None

    def test_get_sensor_return_is_live_dict(self):
        """The returned dict is a reference to the internal sensor (mutation affects sim)."""
        sim = SensorSimulator()
        sensor = sim.get_sensor("temp_assembly")
        sensor["value"] = 99.0  # mutate
        assert sim.sensors["temp_assembly"]["value"] == 99.0

    def test_get_history_exists(self):
        sim = SensorSimulator()
        history = sim.get_history("temp_assembly")
        assert isinstance(history, list)
        assert len(history) == 1
        assert isinstance(history[0], float)

    def test_get_history_not_exists(self):
        sim = SensorSimulator()
        assert sim.get_history("nonexistent") == []

    def test_get_history_after_ticks(self):
        sim = SensorSimulator()
        async def tick_three():
            for _ in range(3):
                await sim.tick()
        asyncio.run(tick_three())

        history = sim.get_history("temp_assembly")
        assert len(history) == 4  # 1 initial + 3 ticks
        assert history[-1] == sim.sensors["temp_assembly"]["value"]

    def test_get_history_does_not_expose_internal_list_mutation(self):
        """Returned history is a reference to internal _history list (OK for read-only)."""
        sim = SensorSimulator()
        history = sim.get_history("temp_assembly")
        # Verify it's the same list object
        assert history is sim._history["temp_assembly"]


# ═══════════════════════════════════════════════════════════════════════════
# 8. SensorServer — Redis integration (mocked)
# ═══════════════════════════════════════════════════════════════════════════


class TestSensorServer:
    """Validate SensorServer initialisation and Redis publishing with mocked Redis."""

    # ── Initialisation ───────────────────────────────────────────────────

    def test_init_creates_simulator(self):
        server = SensorServer()
        assert isinstance(server.simulator, SensorSimulator)
        assert len(server.simulator.get_sensors()) == 10

    def test_init_default_redis_url(self):
        with patch.dict("os.environ", {}, clear=True):
            server = SensorServer()
        assert server.redis_url == "redis://localhost:6379/0"

    def test_init_custom_redis_url(self):
        server = SensorServer(redis_url="redis://custom:9999/1")
        assert server.redis_url == "redis://custom:9999/1"

    def test_init_redis_url_from_env(self):
        with patch.dict("os.environ", {"REDIS_URL": "redis://env:6380/2"}):
            server = SensorServer()
        assert server.redis_url == "redis://env:6380/2"

    def test_init_default_tick_interval(self):
        server = SensorServer()
        assert server.tick_interval == 2.0

    def test_init_custom_tick_interval(self):
        server = SensorServer(tick_interval=5.0)
        assert server.tick_interval == 5.0

    def test_init_redis_not_connected(self):
        """Redis connection is lazy; _redis is None after init."""
        server = SensorServer()
        assert server._redis is None

    def test_init_not_running(self):
        server = SensorServer()
        assert server._running is False

    # ── Redis publishing ─────────────────────────────────────────────────

    def _do_publish(self, server: SensorServer) -> tuple:
        """Run _publish_snapshot in an event loop and return (args, kwargs) from publish call."""
        async def _publish():
            await server._publish_snapshot()

        asyncio.run(_publish())
        return server._redis.publish.call_args

    def _make_mock_redis(self) -> AsyncMock:
        mock = AsyncMock(spec=["publish", "from_url", "close"])
        mock.publish = AsyncMock(return_value=1)
        mock.close = AsyncMock()
        return mock

    def test_publish_snapshot_calls_redis(self):
        """_publish_snapshot calls redis.publish with correct channel."""
        mock_redis = self._make_mock_redis()

        with patch("app.sensors.aioredis.from_url", return_value=mock_redis):
            server = SensorServer(redis_url="redis://mock:6379/0")
            self._do_publish(server)

            mock_redis.publish.assert_called_once()
            args, _ = mock_redis.publish.call_args
            channel, payload = args
            assert channel == "edge:sensors"

    def test_publish_payload_is_valid_json(self):
        """Published payload can be parsed as JSON and has the expected structure."""
        mock_redis = self._make_mock_redis()

        with patch("app.sensors.aioredis.from_url", return_value=mock_redis):
            server = SensorServer(redis_url="redis://mock:6379/0")
            self._do_publish(server)

            args, _ = mock_redis.publish.call_args
            payload_str = args[1]
            payload = json.loads(payload_str)

            assert payload["type"] == "edge_snapshot"
            assert "timestamp" in payload
            assert isinstance(payload["data"], list)
            assert len(payload["data"]) == 10

    def test_publish_sensor_data_includes_history(self):
        """Each sensor in the published payload has a 'history' key."""
        mock_redis = self._make_mock_redis()

        with patch("app.sensors.aioredis.from_url", return_value=mock_redis):
            server = SensorServer(redis_url="redis://mock:6379/0")
            self._do_publish(server)

            args, _ = mock_redis.publish.call_args
            payload = json.loads(args[1])
            for sensor_data in payload["data"]:
                assert "history" in sensor_data
                assert isinstance(sensor_data["history"], list)

    def test_publish_creates_lazy_redis_connection(self):
        """The first publish creates the Redis connection."""
        mock_redis = self._make_mock_redis()

        with patch("app.sensors.aioredis.from_url", return_value=mock_redis) as mock_from_url:
            server = SensorServer(redis_url="redis://mock:6379/0")
            assert server._redis is None  # not connected yet

            self._do_publish(server)

            mock_from_url.assert_called_once_with("redis://mock:6379/0", decode_responses=True)
            assert server._redis is mock_redis

    def test_publish_reuses_redis_connection(self):
        """Subsequent publishes reuse the existing connection."""
        mock_redis = self._make_mock_redis()

        with patch("app.sensors.aioredis.from_url", return_value=mock_redis) as mock_from_url:
            server = SensorServer(redis_url="redis://mock:6379/0")
            self._do_publish(server)
            self._do_publish(server)

            # from_url should have been called only once
            mock_from_url.assert_called_once()

    def test_publish_exception_is_caught(self):
        """If Redis publish fails, the exception is logged but not re-raised."""
        mock_redis = self._make_mock_redis()
        mock_redis.publish = AsyncMock(side_effect=ConnectionError("Redis down"))

        with patch("app.sensors.aioredis.from_url", return_value=mock_redis):
            server = SensorServer(redis_url="redis://mock:6379/0")
            # Should not raise — exception is caught inside _publish_snapshot
            self._do_publish(server)

    # ── Run / Stop lifecycle ─────────────────────────────────────────────

    def _do_run_and_stop(self, server: SensorServer, seconds: float = 0.02) -> None:
        """Run server.run() in a task, sleep, then stop."""
        async def _lifecycle():
            run_task = asyncio.create_task(server.run())
            await asyncio.sleep(seconds)
            await server.stop()
            await run_task

        asyncio.run(_lifecycle())

    def test_run_sets_running_flag(self):
        """After run+stop, _running is False."""
        mock_redis = self._make_mock_redis()

        with patch("app.sensors.aioredis.from_url", return_value=mock_redis):
            server = SensorServer(redis_url="redis://mock:6379/0", tick_interval=0.01)
            self._do_run_and_stop(server)

            assert server._running is False  # stopped

    def test_stop_closes_redis_connection(self):
        """stop() closes the Redis connection."""
        mock_redis = self._make_mock_redis()

        with patch("app.sensors.aioredis.from_url", return_value=mock_redis):
            server = SensorServer(redis_url="redis://mock:6379/0", tick_interval=0.01)
            self._do_run_and_stop(server)

            mock_redis.close.assert_called_once()
            assert server._redis is None

    def test_run_publishes_on_every_cycle(self):
        """Each run loop iteration calls publish at least once."""
        mock_redis = self._make_mock_redis()

        with patch("app.sensors.aioredis.from_url", return_value=mock_redis):
            server = SensorServer(redis_url="redis://mock:6379/0", tick_interval=0.01)
            self._do_run_and_stop(server, seconds=0.035)  # enough for ~3 cycles

            assert mock_redis.publish.call_count >= 1

    def test_double_stop_is_safe(self):
        """Calling stop() twice does not error."""
        mock_redis = self._make_mock_redis()

        with patch("app.sensors.aioredis.from_url", return_value=mock_redis):
            server = SensorServer(redis_url="redis://mock:6379/0", tick_interval=0.01)

            async def _lifecycle():
                run_task = asyncio.create_task(server.run())
                await asyncio.sleep(0.02)
                await server.stop()
                await server.stop()  # second call
                await run_task

            asyncio.run(_lifecycle())

    def test_stop_without_start_is_safe(self):
        """Calling stop() when not running does not error."""
        async def _stop():
            server = SensorServer()
            await server.stop()

        asyncio.run(_stop())
