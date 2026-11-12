import assert from "node:assert/strict";
import { getDashboard, getGreenhouses } from "../dist/services/sensorSimulator.js";

const expected = [
  ["demo-gh-1", "1号玉米大棚", "attention"],
  ["demo-gh-2", "2号叶菜大棚", "optimal"],
  ["demo-gh-3", "3号番茄大棚", "optimal"]
];

assert.deepEqual(getGreenhouses().map(({ id, name, status }) => [id, name, status]), expected);

for (let hour = 0; hour < 48; hour++) {
  const date = new Date(Date.UTC(2026, 10, 3, hour));
  for (const [id, name, status] of expected) {
    const dashboard = getDashboard(id, date);
    assert.equal(dashboard.greenhouse.name, name);
    assert.equal(dashboard.greenhouse.status, status);
    assert.equal(dashboard.realtime.status, status);
    assert.ok(dashboard.realtime.metrics.length > 0);
    if (status === "optimal") {
      assert.ok(dashboard.realtime.metrics.every((metric) => metric.status === "normal"));
      assert.equal(dashboard.anomalies.length, 0);
    } else {
      assert.ok(dashboard.realtime.metrics.some((metric) => metric.status !== "normal"));
      assert.ok(dashboard.anomalies.every((anomaly) => anomaly.level !== "risk"));
    }
  }
}

console.log("Three greenhouse names, statuses, and 48-hour readings passed");
