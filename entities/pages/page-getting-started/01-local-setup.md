## Start with the safe local path

If you want the simplest first run, use the macOS guide in `docs/getting-started-macos.md` as the full step-by-step path.

The short version is:

1. Install `node`, `git`, and `nono`.
2. Clone the repo and run `npm install`.
3. Save your OpenAI key into macOS Keychain for sandboxed runs.
4. Start Hermit with `npm start`.
5. In other tabs, run `npm run heartbeat-daemon` and `npm run explorer`.

That gives you the main chat, the background upkeep loop, and the browser UI.

## What to understand before your first session

- Hermit is designed to run locally.
- The repo is the system of record.
- On a fresh workspace, the first conversation usually creates the first role.
- The explorer is read-only by design; the agent changes the system through files.

When you want the fuller walkthrough, read the canonical install doc and then the beginner onboarding guide.
