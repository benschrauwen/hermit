import { promises as fs } from "node:fs";

import { HERMIT_ROLE_ID } from "./constants.js";
import { listRoleIds, loadRole } from "./roles.js";
import { resolveBootstrapSessionDirectory, resolvePersistedSessionDirectory, type InteractiveChatSession } from "./session.js";

async function directoryHasEntries(directoryPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(directoryPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

export async function snapshotPreexistingInteractiveSessionKeys(root: string): Promise<Set<string>> {
  const keys = new Set<string>();
  if (await directoryHasEntries(resolveBootstrapSessionDirectory(root))) {
    keys.add(HERMIT_ROLE_ID);
  }

  const roleIds = await listRoleIds(root);
  const roles = await Promise.all(roleIds.map((roleId) => loadRole(root, roleId)));
  await Promise.all(
    roles.map(async (role) => {
      if (await directoryHasEntries(resolvePersistedSessionDirectory(role))) {
        keys.add(role.id);
      }
    }),
  );
  return keys;
}

export interface InteractiveSessionCacheEntry {
  session: InteractiveChatSession;
  continuedFromPersistedSession: boolean;
}

export class InteractiveSessionCache {
  private readonly sessions = new Map<string, InteractiveSessionCacheEntry>();

  constructor(
    private readonly continueRequested: boolean,
    private readonly preexistingSessionKeys: Set<string>,
  ) {}

  async getOrCreate(
    sessionKey: string,
    createSession: (continueRecent: boolean) => Promise<InteractiveChatSession>,
  ): Promise<InteractiveSessionCacheEntry> {
    const existing = this.sessions.get(sessionKey);
    if (existing) {
      return existing;
    }

    const continuedFromPersistedSession = this.continueRequested && this.preexistingSessionKeys.has(sessionKey);
    const entry = {
      session: await createSession(continuedFromPersistedSession),
      continuedFromPersistedSession,
    };
    this.sessions.set(sessionKey, entry);
    return entry;
  }
}
