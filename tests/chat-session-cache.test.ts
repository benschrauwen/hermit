import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { InteractiveSessionCache, snapshotPreexistingInteractiveSessionKeys } from "../src/chat-session-cache.js";
import { HERMIT_ROLE_ID } from "../src/constants.js";
import { seedRoleWorkspace } from "./test-helpers.js";

function replaceInFile(filePath: string, oldText: string, newText: string): void {
  const original = readFileSync(filePath, "utf8");
  writeFileSync(filePath, original.replace(oldText, newText));
}

describe("snapshotPreexistingInteractiveSessionKeys", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("captures only sessions that existed before chat startup", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "chat-session-snapshot-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a", "role-b"]);

    const hermitSessionsDir = path.join(root, ".hermit", "sessions", "hermit");
    mkdirSync(hermitSessionsDir, { recursive: true });
    writeFileSync(path.join(hermitSessionsDir, "existing-session.json"), "{}");

    const roleASessionsDir = path.join(root, "agents", "role-a", ".role-agent", "sessions");
    mkdirSync(roleASessionsDir, { recursive: true });
    writeFileSync(path.join(roleASessionsDir, "existing-session.json"), "{}");

    const keys = await snapshotPreexistingInteractiveSessionKeys(root);

    expect(keys).toEqual(new Set([HERMIT_ROLE_ID, "role-a"]));
  });

  it("skips invalid roles instead of failing startup", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "chat-session-invalid-role-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a", "role-b"]);

    const roleASessionsDir = path.join(root, "agents", "role-a", ".role-agent", "sessions");
    mkdirSync(roleASessionsDir, { recursive: true });
    writeFileSync(path.join(roleASessionsDir, "existing-session.json"), "{}");

    const roleBSessionsDir = path.join(root, "agents", "role-b", ".role-agent", "sessions");
    mkdirSync(roleBSessionsDir, { recursive: true });
    writeFileSync(path.join(roleBSessionsDir, "existing-session.json"), "{}");
    replaceInFile(path.join(root, "agents", "role-b", "role.md"), "id: role-b", "id: mismatched-role");

    const keys = await snapshotPreexistingInteractiveSessionKeys(root);

    expect(keys).toEqual(new Set(["role-a"]));
  });
});

describe("InteractiveSessionCache", () => {
  it("reuses the in-run session after the first load", async () => {
    const cache = new InteractiveSessionCache(true, new Set(["role-a"]));
    const continueFlags: boolean[] = [];

    const first = await cache.getOrCreate("role-a", async (continueRecent) => {
      continueFlags.push(continueRecent);
      return {
        session: {} as never,
        telemetry: {} as never,
        workspaceState: {
          initialized: true,
          sharedEntityCount: 0,
          roleEntityCount: 0,
          roleEntityCounts: {},
        },
        activeRoleLabel: "role-a",
        modelLabel: "openai/gpt-5.4",
        consumeRoleSwitchRequest: () => undefined,
      };
    });
    const second = await cache.getOrCreate("role-a", async (continueRecent) => {
      continueFlags.push(continueRecent);
      throw new Error("role-a session should have been reused");
    });
    const other = await cache.getOrCreate("role-b", async (continueRecent) => {
      continueFlags.push(continueRecent);
      return {
        session: {} as never,
        telemetry: {} as never,
        workspaceState: {
          initialized: true,
          sharedEntityCount: 0,
          roleEntityCount: 0,
          roleEntityCounts: {},
        },
        activeRoleLabel: "role-b",
        modelLabel: "openai/gpt-5.4",
        consumeRoleSwitchRequest: () => undefined,
      };
    });

    expect(first).toBe(second);
    expect(first.continuedFromPersistedSession).toBe(true);
    expect(other.continuedFromPersistedSession).toBe(false);
    expect(continueFlags).toEqual([true, false]);
  });

  it("starts fresh when continue was not requested", async () => {
    const cache = new InteractiveSessionCache(false, new Set(["role-a"]));

    const entry = await cache.getOrCreate("role-a", async (continueRecent) => ({
      session: {} as never,
      telemetry: {} as never,
      workspaceState: {
        initialized: true,
        sharedEntityCount: 0,
        roleEntityCount: 0,
        roleEntityCounts: {},
      },
      activeRoleLabel: continueRecent ? "continued" : "fresh",
      modelLabel: "openai/gpt-5.4",
      consumeRoleSwitchRequest: () => undefined,
    }));

    expect(entry.continuedFromPersistedSession).toBe(false);
    expect(entry.session.activeRoleLabel).toBe("fresh");
  });
});
