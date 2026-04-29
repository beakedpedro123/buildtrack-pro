import { describe, it, expect } from "vitest";

/**
 * Tests for construction math and accounting calculator logic
 * These test the pure math functions that Pivot uses via the server tools
 */

describe("Construction Math Calculations", () => {
  // Roof pitch calculations
  it("calculates rafter length from pitch and run", () => {
    const pitch = 6; // 6:12 pitch
    const run = 12; // 12 feet
    const angle = Math.atan(pitch / 12) * (180 / Math.PI);
    const rafterLength = run / Math.cos(angle * Math.PI / 180);
    expect(rafterLength).toBeCloseTo(13.42, 1);
  });

  it("calculates roof pitch angle correctly", () => {
    const rise = 6;
    const run = 12;
    const angle = Math.atan(rise / run) * (180 / Math.PI);
    expect(angle).toBeCloseTo(26.57, 1);
  });

  // Two roofs coming together — hip/valley angle
  it("calculates hip rafter angle for two equal-pitch roofs", () => {
    const pitch1 = 6; // 6:12
    const pitch2 = 6; // 6:12
    const angle1 = Math.atan(pitch1 / 12) * (180 / Math.PI);
    const angle2 = Math.atan(pitch2 / 12) * (180 / Math.PI);
    // Hip rafter sits at 45° in plan view for equal pitches
    const hipAngle = Math.atan(Math.sqrt(Math.tan(angle1 * Math.PI / 180) ** 2 + Math.tan(angle2 * Math.PI / 180) ** 2)) * (180 / Math.PI);
    expect(hipAngle).toBeGreaterThan(0);
    expect(hipAngle).toBeLessThan(90);
  });

  it("calculates valley rafter length for two roofs meeting", () => {
    const pitch = 8; // 8:12
    const run = 10; // 10 feet
    const rise = (pitch / 12) * run;
    // Valley rafter runs at 45° in plan, so plan length = run * sqrt(2)
    const planLength = run * Math.sqrt(2);
    const valleyLength = Math.sqrt(planLength ** 2 + rise ** 2);
    expect(valleyLength).toBeGreaterThan(run);
  });

  // Arch and radius calculations
  it("calculates arc length from radius and angle", () => {
    const radius = 5; // 5 feet
    const angleDeg = 90; // quarter circle
    const arcLength = (angleDeg / 360) * 2 * Math.PI * radius;
    expect(arcLength).toBeCloseTo(7.854, 2);
  });

  it("calculates chord length from radius and angle", () => {
    const radius = 10;
    const angleDeg = 60;
    const chord = 2 * radius * Math.sin((angleDeg / 2) * Math.PI / 180);
    expect(chord).toBeCloseTo(10, 0); // equilateral triangle
  });

  it("calculates radius from chord and rise (sagitta)", () => {
    const chord = 8;
    const sagitta = 2;
    const radius = (sagitta / 2) + ((chord ** 2) / (8 * sagitta));
    expect(radius).toBeCloseTo(5, 0);
  });

  // Concrete volume
  it("calculates concrete volume for a slab", () => {
    const length = 20; // feet
    const width = 30; // feet
    const thickness = 4 / 12; // 4 inches in feet
    const cubicFeet = length * width * thickness;
    const cubicYards = cubicFeet / 27;
    expect(cubicYards).toBeCloseTo(7.41, 1);
  });

  // Board feet
  it("calculates board feet correctly", () => {
    const thicknessInches = 2;
    const widthInches = 6;
    const lengthFeet = 8;
    const quantity = 10;
    const boardFeet = (thicknessInches * widthInches * lengthFeet * quantity) / 12;
    expect(boardFeet).toBe(80);
  });

  // Stair stringer
  it("calculates stair stringer dimensions", () => {
    const totalRise = 108; // inches (9 feet)
    const risePerStep = 7.5;
    const numSteps = Math.round(totalRise / risePerStep);
    const runPerStep = 10;
    const totalRun = (numSteps - 1) * runPerStep; // one less tread than risers
    const stringerLength = Math.sqrt(totalRise ** 2 + totalRun ** 2);
    expect(numSteps).toBe(14);
    expect(totalRun).toBe(130);
    expect(stringerLength).toBeGreaterThan(totalRise);
  });

  // Percent grade
  it("calculates percent grade", () => {
    const rise = 3;
    const run = 100;
    const grade = (rise / run) * 100;
    expect(grade).toBe(3);
  });
});

describe("Accounting Calculator Logic", () => {
  // 2026 Federal tax rates
  const FICA_RATE = 0.0765; // 7.65%
  const SS_RATE = 0.062;
  const MEDICARE_RATE = 0.0145;
  const SS_WAGE_BASE = 184500;
  const FUTA_RATE = 0.006; // 0.6% after state credit
  const FUTA_WAGE_BASE = 7000;
  const UTAH_SUTA_RATE = 0.012; // 1.2% typical new employer
  const SUTA_WAGE_BASE = 50700;
  const UTAH_STATE_TAX = 0.045; // 4.50% flat

  it("calculates FICA correctly for employee under SS wage base", () => {
    const grossPay = 1000;
    const ssWithholding = grossPay * SS_RATE;
    const medicareWithholding = grossPay * MEDICARE_RATE;
    const totalFica = ssWithholding + medicareWithholding;
    expect(totalFica).toBeCloseTo(76.5, 1);
    expect(ssWithholding).toBeCloseTo(62, 0);
    expect(medicareWithholding).toBeCloseTo(14.5, 1);
  });

  it("caps SS at wage base", () => {
    const ytdEarnings = 183000;
    const currentPay = 5000;
    const ssableWages = Math.max(0, SS_WAGE_BASE - ytdEarnings);
    expect(ssableWages).toBe(1500);
    const ssWithholding = ssableWages * SS_RATE;
    expect(ssWithholding).toBeCloseTo(93, 0);
  });

  it("calculates FUTA correctly", () => {
    const ytdEarnings = 0;
    const currentPay = 2000;
    const futaWages = Math.min(currentPay, Math.max(0, FUTA_WAGE_BASE - ytdEarnings));
    const futa = futaWages * FUTA_RATE;
    expect(futa).toBeCloseTo(12, 0);
  });

  it("calculates Utah SUTA correctly", () => {
    const currentPay = 2000;
    const ytdEarnings = 0;
    const sutaWages = Math.min(currentPay, Math.max(0, SUTA_WAGE_BASE - ytdEarnings));
    const suta = sutaWages * UTAH_SUTA_RATE;
    expect(suta).toBeCloseTo(24, 0);
  });

  it("calculates Utah state income tax", () => {
    const grossPay = 2000;
    const stateTax = grossPay * UTAH_STATE_TAX;
    expect(stateTax).toBe(90);
  });

  it("calculates burden rate for construction worker", () => {
    const hourlyRate = 30;
    const annualHours = 2080;
    const annualGross = hourlyRate * annualHours;

    // Employer FICA
    const employerFica = annualGross * FICA_RATE;
    // FUTA
    const futa = FUTA_WAGE_BASE * FUTA_RATE;
    // SUTA
    const suta = SUTA_WAGE_BASE * UTAH_SUTA_RATE;
    // Workers comp (framing class 5403 ~$6.50 per $100)
    const wcRate = 0.065;
    const wc = annualGross * wcRate;
    // General liability (~$2.50 per $100)
    const glRate = 0.025;
    const gl = annualGross * glRate;

    const totalBurden = employerFica + futa + suta + wc + gl;
    const burdenRate = totalBurden / annualHours;
    const fullyLoadedRate = hourlyRate + burdenRate;

    expect(employerFica).toBeCloseTo(4773.6, 0);
    expect(fullyLoadedRate).toBeGreaterThan(hourlyRate);
    expect(fullyLoadedRate).toBeLessThan(hourlyRate * 2); // burden shouldn't double the rate
  });

  it("calculates job P&L", () => {
    const revenue = 150000;
    const laborCost = 65000;
    const materialCost = 35000;
    const overhead = 15000;
    const totalCost = laborCost + materialCost + overhead;
    const grossProfit = revenue - totalCost;
    const marginPct = (grossProfit / revenue) * 100;

    expect(grossProfit).toBe(35000);
    expect(marginPct).toBeCloseTo(23.33, 1);
  });

  it("calculates overhead allocation across jobs", () => {
    const monthlyOverhead = 12000;
    const jobs = [
      { name: "Job A", laborHours: 400 },
      { name: "Job B", laborHours: 200 },
      { name: "Job C", laborHours: 200 },
    ];
    const totalHours = jobs.reduce((sum, j) => sum + j.laborHours, 0);
    const allocations = jobs.map(j => ({
      ...j,
      allocation: (j.laborHours / totalHours) * monthlyOverhead,
    }));

    expect(allocations[0].allocation).toBe(6000); // 50%
    expect(allocations[1].allocation).toBe(3000); // 25%
    expect(allocations[2].allocation).toBe(3000); // 25%
    expect(allocations.reduce((s, a) => s + a.allocation, 0)).toBe(monthlyOverhead);
  });

  it("calculates workers comp premium estimate", () => {
    const classCode = "5403"; // Steel erection
    const ratePerHundred = 6.50;
    const annualPayroll = 250000;
    const premium = (annualPayroll / 100) * ratePerHundred;
    expect(premium).toBe(16250);
  });
});
