import { describe, expect, it } from "vitest";

import { resolveStartLauncherArgs, resolveStartLauncherEnv } from "../src/start-launcher-args.js";

describe("resolveStartLauncherArgs", () => {
  it("forwards explicit start arguments unchanged", () => {
    expect(resolveStartLauncherArgs(["--continue"])).toEqual(["--continue"]);
  });

  it("maps npm start --continue into the raw CLI flag", () => {
    expect(
      resolveStartLauncherArgs([], {
        npm_config_continue: "true",
      }),
    ).toEqual(["--continue"]);
  });

  it("does not duplicate continue when npm and argv both supply it", () => {
    expect(
      resolveStartLauncherArgs(["--continue"], {
        npm_config_continue: "true",
      }),
    ).toEqual(["--continue"]);
  });

  it("ignores falsey npm continue config values", () => {
    expect(
      resolveStartLauncherArgs([], {
        npm_config_continue: "false",
      }),
    ).toEqual([]);
  });
});

describe("resolveStartLauncherEnv", () => {
  it("strips npm continue config before nested npm calls", () => {
    expect(
      resolveStartLauncherEnv({
        npm_config_continue: "true",
        PATH: "/tmp/bin",
      }),
    ).toEqual({
      npm_config_continue: undefined,
      PATH: "/tmp/bin",
    });
  });
});
