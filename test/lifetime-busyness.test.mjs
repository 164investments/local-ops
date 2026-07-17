import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBusynessForecast,
  validateObservation,
} from "../lib/lifetime-busyness.mjs";

const localTimestamp = (value) => new Date(`${value}-07:00`).getTime();

test("waitlisted classes increase the matching hour's pressure", () => {
  const now = new Date("2026-07-16T16:10:00-07:00");
  const withoutClasses = buildBusynessForecast({ now, events: [] });
  const withClasses = buildBusynessForecast({
    now,
    events: [{
      id: "class-1",
      name: "GTX",
      location: "GTX Space, Beaverton",
      start: localTimestamp("2026-07-16T17:00:00"),
      end: localTimestamp("2026-07-16T18:00:00"),
      cta: "Waitlist",
      isRegistrable: true,
      isCanceled: false,
    }],
  });

  const base = withoutClasses.days[0].slots.find((slot) => slot.hour === 17);
  const pressured = withClasses.days[0].slots.find((slot) => slot.hour === 17);
  assert.ok(pressured.score > base.score);
  assert.equal(pressured.schedule.waitlistedClasses, 1);
});

test("personal observations calibrate the same weekday and hour", () => {
  const now = new Date("2026-07-16T18:10:00-07:00");
  const observations = [
    { recordedAt: "2026-07-02T18:05:00-07:00", level: 1 },
    { recordedAt: "2026-07-09T18:15:00-07:00", level: 1 },
    { recordedAt: "2026-06-25T18:20:00-07:00", level: 1 },
  ];
  const forecast = buildBusynessForecast({ now, observations, events: [] });
  assert.equal(forecast.current.observations, 3);
  assert.equal(forecast.current.confidence, "high");
  assert.ok(forecast.current.score < forecast.current.baseline);
});

test("recommendations are future open hours ordered chronologically", () => {
  const now = new Date("2026-07-16T20:10:00-07:00");
  const forecast = buildBusynessForecast({ now, events: [] });
  assert.equal(forecast.recommendations.length, 3);
  assert.ok(forecast.recommendations.every((slot) => slot.hour >= 4 && slot.hour < 24));
  const keys = forecast.recommendations.map((slot) => `${slot.date}-${String(slot.hour).padStart(2, "0")}`);
  assert.deepEqual(keys, [...keys].sort());
});

test("validates one-tap observations", () => {
  assert.deepEqual(
    validateObservation({ level: 4 }, new Date("2026-07-16T18:00:00Z")),
    { recordedAt: "2026-07-16T18:00:00.000Z", level: 4 },
  );
  assert.throws(() => validateObservation({ level: 0 }), /1 to 5/);
});
