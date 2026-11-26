import { describe, expect, it } from "vitest";
import { runNormalWeek } from "./experiments";

describe("runNormalWeek", () => {
  it("es determinista y da cifras plausibles", () => {
    const run = runNormalWeek(3, 1);
    expect(runNormalWeek(3, 1)).toEqual(run);
    expect(run).toMatchObject({ seed: 3, days: 1, falseAlerts: 0, critical: 0 });
    expect(run.accuracy).toBeGreaterThan(0.95);
    expect(run.autonomy).toBeGreaterThan(30);
    expect(run.wanPerDay).toBeGreaterThan(run.payloadPerDay);
    expect(run.windows).toBeGreaterThan(0);
  });
});
