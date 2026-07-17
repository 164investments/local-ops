const CLUB = Object.freeze({
  id: 297,
  name: "Life Time Beaverton",
  scheduleLocation: "Beaverton",
  timeZone: "America/Los_Angeles",
  address: "600 SW 116th Ave, Beaverton, OR 97225",
  pageUrl: "https://my.lifetime.life/clubs/or/beaverton/classes.html",
  scheduleUrl:
    "https://api.lifetimefitness.com/ux/web-schedules/v2/schedules/classes",
});

let cachedSubscriptionKey = null;
let subscriptionKeyExpiresAt = 0;

export const LIFE_TIME_BEAVERTON = CLUB;

export function extractScheduleSubscriptionKey(html) {
  const prospectKey = html.match(
    /"prospectSchedules"\s*:\s*\{[^}]*"key"\s*:\s*"([a-zA-Z0-9-]+)"/,
  )?.[1];
  const fallbackKey = html.match(
    /"apimKey"\s*:\s*"([a-zA-Z0-9-]+)"/,
  )?.[1];
  const key = prospectKey ?? fallbackKey;
  if (!key) {
    throw new Error("Life Time's public schedule key was not found.");
  }
  return key;
}

function timeZoneOffset(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(new Date(`${date}T12:00:00Z`));
  return parts.find((part) => part.type === "timeZoneName")?.value
    ?.replace("GMT", "") || "-08:00";
}

async function getSubscriptionKey(fetchImpl) {
  if (cachedSubscriptionKey && Date.now() < subscriptionKeyExpiresAt) {
    return cachedSubscriptionKey;
  }

  const response = await fetchImpl(CLUB.pageUrl, {
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Life Time schedule page returned ${response.status}.`);
  }

  cachedSubscriptionKey = extractScheduleSubscriptionKey(await response.text());
  subscriptionKeyExpiresAt = Date.now() + 6 * 60 * 60 * 1_000;
  return cachedSubscriptionKey;
}

export function normalizeScheduleResponse(payload) {
  const events = [];
  for (const day of payload?.results ?? []) {
    for (const dayPart of day.dayParts ?? []) {
      for (const startTime of dayPart.startTimes ?? []) {
        for (const activity of startTime.activities ?? []) {
          const start = Number(startTime.timestamp);
          const end = Number(activity.endTimestamp);
          if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
          events.push({
            id: activity.id,
            name: activity.name,
            location: activity.location,
            start,
            end,
            cta: activity.cta ?? null,
            isRegistrable: activity.isRegistrable === true,
            isCanceled: activity.isCanceled === true,
          });
        }
      }
    }
  }
  return events;
}

export async function fetchBeavertonSchedule({
  startDate,
  endDate,
  fetchImpl = fetch,
  subscriptionKey,
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate ?? "")) {
    throw new Error("A valid startDate is required.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate ?? "")) {
    throw new Error("A valid endDate is required.");
  }

  const key = subscriptionKey ?? await getSubscriptionKey(fetchImpl);
  const offset = timeZoneOffset(startDate, CLUB.timeZone);
  const params = new URLSearchParams({
    start: `${startDate}T00:00:00${offset}`,
    end: `${endDate}T23:59:59${timeZoneOffset(endDate, CLUB.timeZone)}`,
    locations: CLUB.scheduleLocation,
    page: "0",
    pageSize: "750",
  });
  const response = await fetchImpl(`${CLUB.scheduleUrl}?${params}`, {
    headers: {
      Accept: "application/json",
      Pragma: "no-cache",
      "ocp-apim-subscription-key": key,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Life Time schedule API returned ${response.status}.`);
  }
  return normalizeScheduleResponse(await response.json());
}
