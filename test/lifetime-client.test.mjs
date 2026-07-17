import assert from "node:assert/strict";
import test from "node:test";
import {
  extractScheduleSubscriptionKey,
  fetchBeavertonSchedule,
  normalizeScheduleResponse,
} from "../lib/lifetime-client.mjs";

test("extracts Life Time's published schedule key", () => {
  const html = '<script>{"prospectSchedules":{"key":"public-key-123","url":"x"}}</script>';
  assert.equal(extractScheduleSubscriptionKey(html), "public-key-123");
});

test("normalizes schedule activities", () => {
  const events = normalizeScheduleResponse({
    results: [{
      dayParts: [{
        startTimes: [{
          timestamp: "1000",
          activities: [{
            id: "class-1",
            name: "Yoga",
            location: "Studio, Beaverton",
            endTimestamp: "2000",
            cta: "Waitlist",
            isRegistrable: true,
            isCanceled: false,
          }],
        }],
      }],
    }],
  });
  assert.deepEqual(events, [{
    id: "class-1",
    name: "Yoga",
    location: "Studio, Beaverton",
    start: 1000,
    end: 2000,
    cta: "Waitlist",
    isRegistrable: true,
    isCanceled: false,
  }]);
});

test("requests only the Beaverton public schedule", async () => {
  let requestedUrl;
  let requestedOptions;
  const events = await fetchBeavertonSchedule({
    startDate: "2026-07-16",
    endDate: "2026-07-17",
    subscriptionKey: "published-key",
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      requestedOptions = options;
      return { ok: true, json: async () => ({ results: [] }) };
    },
  });

  assert.deepEqual(events, []);
  assert.equal(requestedUrl.searchParams.get("locations"), "Beaverton");
  assert.equal(requestedUrl.searchParams.get("pageSize"), "750");
  assert.equal(requestedOptions.headers["ocp-apim-subscription-key"], "published-key");
});
