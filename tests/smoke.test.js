import assert from "assert";

describe("Smoke Test", () => {
  it("server modules load", async () => {
    await import("../config/env.js");
    await import("../config/vertex.js");
    await import("../services/planner.service.js");
    await import("../services/executor/executor.js");
    assert.ok(true);
  });

  it("required env exists", () => {
    const required = ["PORT"];
    for (const k of required) {
      if (!process.env[k]) {
        throw new Error(`Missing env: ${k}`);
      }
    }
  });
});
