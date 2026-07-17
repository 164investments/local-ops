import { LIFE_TIME_BEAVERTON } from "./lifetime-client.mjs";

const LEVEL_SCORES = Object.freeze([15, 35, 58, 78, 95]);

const WEEKDAY_BASELINE = Object.freeze({
  4: 18, 5: 38, 6: 58, 7: 55, 8: 46, 9: 40, 10: 34, 11: 32,
  12: 39, 13: 34, 14: 31, 15: 37, 16: 52, 17: 76, 18: 88,
  19: 76, 20: 55, 21: 38, 22: 25, 23: 16,
});
const WEEKEND_BASELINE = Object.freeze({
  5: 17, 6: 27, 7: 39, 8: 54, 9: 70, 10: 80, 11: 76, 12: 68,
  13: 61, 14: 57, 15: 53, 16: 50, 17: 46, 18: 40, 19: 33,
  20: 25, 21: 17,
});

export function addDateDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function dateKey(date, timeZone = LIFE_TIME_BEAVERTON.timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function zonedParts(timestamp, timeZone = LIFE_TIME_BEAVERTON.timeZone) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function dayIndex(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function clubHours(date) {
  const day = dayIndex(date);
  return day === 0 || day === 6
    ? { open: 5, close: 22 }
    : { open: 4, close: 24 };
}

function baselineFor(date, hour) {
  const day = dayIndex(date);
  return (day === 0 || day === 6 ? WEEKEND_BASELINE : WEEKDAY_BASELINE)[hour] ?? 20;
}

function labelFor(score) {
  if (score <= 30) return "Quiet";
  if (score <= 48) return "Light";
  if (score <= 68) return "Moderate";
  if (score <= 84) return "Busy";
  return "Peak";
}

function buildObservationIndex(observations) {
  const index = new Map();
  for (const observation of observations) {
    const parts = zonedParts(observation.recordedAt);
    const observationDate = `${parts.year}-${parts.month}-${parts.day}`;
    const key = `${dayIndex(observationDate)}-${Number(parts.hour)}`;
    const entry = index.get(key) ?? { count: 0, scoreTotal: 0 };
    entry.count += 1;
    entry.scoreTotal += LEVEL_SCORES[observation.level - 1];
    index.set(key, entry);
  }
  return index;
}

function buildScheduleIndex(events) {
  const index = new Map();
  const entryFor = (parts) => {
    const eventDate = `${parts.year}-${parts.month}-${parts.day}`;
    const key = `${eventDate}-${Number(parts.hour)}`;
    const entry = index.get(key) ?? {
      activeClasses: 0,
      startingClasses: 0,
      waitlistedClasses: 0,
    };
    index.set(key, entry);
    return entry;
  };

  for (const event of events) {
    if (!event.isRegistrable || event.isCanceled) continue;
    const start = zonedParts(event.start);
    const startEntry = entryFor(start);
    startEntry.startingClasses += 1;
    if (event.cta?.toLowerCase() === "waitlist") startEntry.waitlistedClasses += 1;

    const midpoint = event.start + (event.end - event.start) / 2;
    entryFor(zonedParts(midpoint)).activeClasses += 1;
  }
  return index;
}

function buildSlot({ date, hour, scheduleIndex, observationIndex, source }) {
  const baseline = baselineFor(date, hour);
  const schedule = scheduleIndex.get(`${date}-${hour}`) ?? {
    activeClasses: 0,
    startingClasses: 0,
    waitlistedClasses: 0,
  };
  const schedulePressure = Math.min(
    24,
    schedule.startingClasses * 2
      + schedule.activeClasses * 1.25
      + schedule.waitlistedClasses * 3,
  );
  const samples = observationIndex.get(`${dayIndex(date)}-${hour}`) ?? {
    count: 0,
    scoreTotal: 0,
  };
  const observedScore = samples.count
    ? samples.scoreTotal / samples.count
    : null;
  const estimatedScore = Math.min(100, baseline + schedulePressure);
  const observationWeight = Math.min(0.7, samples.count * 0.18);
  const score = Math.round(
    observedScore === null
      ? estimatedScore
      : estimatedScore * (1 - observationWeight) + observedScore * observationWeight,
  );

  return {
    date,
    hour,
    score,
    label: labelFor(score),
    baseline,
    schedule: {
      activeClasses: schedule.activeClasses,
      startingClasses: schedule.startingClasses,
      waitlistedClasses: schedule.waitlistedClasses,
    },
    observations: samples.count,
    confidence: samples.count >= 3
      ? "high"
      : samples.count > 0 || source === "live"
        ? "medium"
        : "low",
  };
}

function formatHour(hour) {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  return `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? "PM" : "AM"}`;
}

function isFutureSlot(slot, now) {
  const parts = zonedParts(now);
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  return slot.date > today || (slot.date === today && slot.hour >= Number(parts.hour));
}

function buildRecommendations(slots, now) {
  const selected = [];
  const candidates = slots
    .filter((slot) => isFutureSlot(slot, now))
    .slice(0, 42)
    .sort((a, b) => a.score - b.score || a.date.localeCompare(b.date) || a.hour - b.hour);

  for (const slot of candidates) {
    const tooClose = selected.some((chosen) =>
      chosen.date === slot.date && Math.abs(chosen.hour - slot.hour) < 2,
    );
    if (!tooClose) selected.push(slot);
    if (selected.length === 3) break;
  }
  return selected.sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
}

export function buildBusynessForecast({
  events = [],
  observations = [],
  now = new Date(),
  source = "live",
  generatedAt = new Date(),
} = {}) {
  const startDate = dateKey(now);
  const scheduleIndex = buildScheduleIndex(events);
  const observationIndex = buildObservationIndex(observations);
  const slots = [];
  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const date = addDateDays(startDate, dayOffset);
    const hours = clubHours(date);
    for (let hour = hours.open; hour < hours.close; hour += 1) {
      slots.push(buildSlot({ date, hour, scheduleIndex, observationIndex, source }));
    }
  }

  const nowParts = zonedParts(now);
  const current = slots.find((slot) =>
    slot.date === startDate && slot.hour === Number(nowParts.hour),
  ) ?? null;

  return {
    club: LIFE_TIME_BEAVERTON,
    generatedAt: new Date(generatedAt).toISOString(),
    source,
    methodology: "Baseline demand + official class-schedule pressure + your observations",
    disclaimer: "Relative estimate, not a live member count.",
    current,
    recommendations: buildRecommendations(slots, now),
    days: Array.from({ length: 7 }, (_, dayOffset) => {
      const date = addDateDays(startDate, dayOffset);
      return {
        date,
        label: new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC",
          weekday: "short",
          month: "short",
          day: "numeric",
        }).format(new Date(`${date}T12:00:00Z`)),
        slots: slots.filter((slot) => slot.date === date).map((slot) => ({
          ...slot,
          timeLabel: formatHour(slot.hour),
        })),
      };
    }),
    observationCount: observations.length,
  };
}

export function validateObservation(input, now = new Date()) {
  const level = Number(input?.level);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new Error("Crowd level must be an integer from 1 to 5.");
  }
  return {
    recordedAt: new Date(now).toISOString(),
    level,
  };
}
