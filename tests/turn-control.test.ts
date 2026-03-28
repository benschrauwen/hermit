import { describe, expect, it } from "vitest";

import { createWorkspaceTurnCoordinator, formatWorkspaceTurnOwner } from "../src/turn-control.js";

describe("createWorkspaceTurnCoordinator", () => {
  it("waits for the active turn to release before granting the next one", async () => {
    const coordinator = createWorkspaceTurnCoordinator();
    const firstTurn = await coordinator.acquire({
      kind: "interactive",
      commandName: "chat",
      roleId: "role-a",
    });

    const waitedForOwners: string[] = [];
    let secondResolved = false;
    const secondTurnPromise = coordinator
      .acquire(
        {
          kind: "heartbeat",
          commandName: "heartbeat",
          roleId: "role-b",
        },
        {
          onWait: (owner) => {
            waitedForOwners.push(formatWorkspaceTurnOwner(owner));
          },
        },
      )
      .then((handle) => {
        secondResolved = true;
        return handle;
      });

    await Promise.resolve();
    expect(secondResolved).toBe(false);
    expect(waitedForOwners).toEqual(["interactive turn for role-a"]);

    await firstTurn?.release();
    const secondTurn = await secondTurnPromise;
    expect(secondTurn?.owner).toMatchObject({
      kind: "heartbeat",
      commandName: "heartbeat",
      roleId: "role-b",
    });
  });

  it("returns undefined in skip mode while another turn is active", async () => {
    const coordinator = createWorkspaceTurnCoordinator();
    const activeTurn = await coordinator.acquire({
      kind: "interactive",
      commandName: "chat",
      roleId: "role-a",
    });

    const skippedTurn = await coordinator.acquire(
      {
        kind: "heartbeat",
        commandName: "heartbeat",
        roleId: "role-b",
      },
      { mode: "skip" },
    );

    expect(skippedTurn).toBeUndefined();
    expect(coordinator.getActiveOwner()).toMatchObject({
      kind: "interactive",
      roleId: "role-a",
    });

    await activeTurn?.release();
  });
});

describe("formatWorkspaceTurnOwner", () => {
  it("falls back to a generic label when no owner is active", () => {
    expect(formatWorkspaceTurnOwner(undefined)).toBe("another AI turn");
  });
});
