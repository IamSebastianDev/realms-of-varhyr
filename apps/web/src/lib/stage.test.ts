import { describe, expect, it } from "vitest";
import { STAGE_HEIGHT, stageSize } from "./stage";

describe("stageSize", () => {
  it("fits inside the window and keeps the chosen aspect", () => {
    const { width, height, scale } = stageSize("16:9", 1920, 1200);
    expect(height).toBe(STAGE_HEIGHT);
    expect(width).toBe(1600);
    expect(width * scale).toBeLessThanOrEqual(1920);
    expect(height * scale).toBeLessThanOrEqual(1200);
    expect(width * scale).toBeCloseTo(1920);
  });
  it("is limited by height in a wide window", () => {
    const { scale } = stageSize("4:3", 2000, 600);
    expect(scale).toBeCloseTo(600 / STAGE_HEIGHT);
  });
  it("auto follows the window shape within 4:3 to 21:9", () => {
    expect(stageSize("auto", 1000, 1000).width).toBe(Math.round(STAGE_HEIGHT * (4 / 3)));
    expect(stageSize("auto", 4000, 1000).width).toBe(Math.round(STAGE_HEIGHT * (21 / 9)));
    expect(stageSize("auto", 1600, 900).width).toBe(1600);
  });
});
