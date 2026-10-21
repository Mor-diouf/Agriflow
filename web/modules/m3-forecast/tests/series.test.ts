import { describe, expect, it } from "vitest";

import { calibration } from "../src/levels";
import { seasonStats, seasonWindow, weeklySeries, type WeekForecast } from "../src/series";

const point = (zone: string, week: number, actual: number, central: number) => ({
  year: 2025, zone, week, actual_t: actual, central_t: central, prudent_t: central + 2, stress_t: central + 4,
});

const week = (w: number, actual: number, central: number, prudent: number, stress: number): WeekForecast => ({
  week: w, actual_t: actual, central_t: central, prudent_t: prudent, stress_t: stress,
});

describe("weeklySeries", () => {
  it("additionne les zones semaine par semaine, ou ne garde qu'une zone", () => {
    const points = [point("A", 2, 10, 12), point("B", 2, 5, 4), point("A", 1, 0, 0), point("B", 1, 0, 1)];
    expect(weeklySeries(points, null)).toEqual([week(1, 0, 1, 5, 9), week(2, 15, 16, 20, 24)]);
    expect(weeklySeries(points, "B").map((w) => w.central_t)).toEqual([1, 4]);
  });
});

describe("seasonWindow", () => {
  it("garde les semaines actives avec une semaine de marge", () => {
    const weeks = [1, 2, 3, 4, 5, 6].map((w) => week(w, w === 3 ? 5 : 0, w === 4 ? 8 : 0, 0, 0));
    expect(seasonWindow(weeks).map((w) => w.week)).toEqual([2, 3, 4, 5]);
    expect(seasonWindow([week(1, 0, 0, 0, 0)])).toEqual([]);
  });
});

describe("seasonStats", () => {
  it("mesure l'erreur et la couverture sur les seules semaines de récolte", () => {
    const weeks = [week(1, 0, 0, 0, 0), week(2, 10, 12, 14, 16), week(3, 20, 15, 18, 25), week(4, 0, 1, 2, 3)];
    const s = seasonStats(weeks)!;
    expect(s.forecast_t).toBe(28);
    expect(s.actual_t).toBe(30);
    expect(s.gap).toBeCloseTo(-2 / 30);
    expect(s.harvestWeeks).toBe(2);
    expect(s.mae_t).toBeCloseTo(3.5);
    expect(s.wape).toBeCloseTo(7 / 30);
    expect(s.prudentCoverage).toBe(0.5);
    expect(s.stressCoverage).toBe(1);
    expect(s.peak.week).toBe(3);
    expect(s.actualPeak.week).toBe(3);
  });

  it("ne conclut rien sans récolte observée", () => {
    expect(seasonStats([week(1, 0, 2, 3, 4)])).toBeNull();
  });
});

describe("calibration", () => {
  // Couvertures réelles du benchmark Phase I sur 541 semaines de récolte
  it("compare la couverture observée à la cible du quantile", () => {
    expect(calibration(76.0, 0.75, 541)).toBe("calibrated");
    expect(calibration(86.7, 0.9, 541)).toBe("too_low");
    expect(calibration(97.0, 0.9, 541)).toBe("too_wide");
  });

  it("tolère un écart plus grand quand peu de semaines sont évaluées", () => {
    expect(calibration(86.7, 0.9, 30)).toBe("calibrated");
  });
});
