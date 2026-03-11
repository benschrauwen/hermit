# Getting Started on macOS

This guide is for people who are not technical and want the simplest possible path to running Hermit on a Mac.

It assumes:

- You are using macOS
- You have never used Terminal before, or barely have
- You want to run Hermit safely

If a command below looks unfamiliar, that is okay. Copy it exactly, paste it into Terminal, then press `Return`.

## What You Will End Up With

By the end of this guide, you will have:

- Installed Homebrew
- Installed Node.js, Git, and `nono`
- Downloaded the Hermit repo
- Installed Hermit's packages
- Created an OpenAI API key
- Saved that key into your Mac's Keychain
- Started Hermit safely
- Started `heartbeat-daemon` in a second Terminal tab
- Started the explorer in a third Terminal tab
- Opened the explorer in your browser

## Before You Start

You need:

- A Mac with internet access
- An [OpenAI account](https://platform.openai.com/)
- Enough permission on your Mac to install software

## 1. Open Terminal

Terminal is the app where you will paste commands.

1. Press `Command + Space` to open Spotlight.
2. Type `Terminal`.
3. Press `Return`.

A window will open with a text cursor.

Useful basics:

- `Command + V` pastes copied text
- `Command + T` opens a new Terminal tab
- `Control + C` stops the command currently running in that tab

Three commands you may see in this guide:

- `cd` means "go into this folder"
- `pwd` means "show me which folder I am in"
- `ls` means "show me the files in this folder"

## 2. Install Homebrew

Homebrew is the standard app installer for Terminal tools on a Mac.

Paste this into Terminal and press `Return`:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Important notes:

- If Terminal asks for your Mac password, type it and press `Return`
- If macOS asks to install Command Line Tools, click `Install` and wait for it to finish.

When the Homebrew installer finishes, it may print a `Next steps` section.

If it does, run the commands it tells you to run.

Then check that Homebrew works:

```bash
brew --version
```

If you see a version number, Homebrew is installed.

## 3. Install the Tools Hermit Needs

Now install Node.js, Git, and `nono`.

`nono` is the safety layer Hermit uses for the Hermit chat and `heartbeat-daemon` commands in this guide.

Run these one at a time:

```bash
brew install node git
```

```bash
brew install nono
```

## 4. Make a Folder for Projects

This step gives you a simple place to keep the Hermit folder.

Run:

```bash
mkdir -p ~/Projects
cd ~/Projects
```

If you want to confirm where you are, run:

```bash
pwd
```

You should see a path ending in `/Projects`.

## 5. Download the Hermit Repo

Now download Hermit onto your Mac.

Run:

```bash
git clone https://github.com/benschrauwen/hermit.git
cd hermit
```

You are now inside the Hermit folder.

## 6. Install Hermit's Packages

Run:

```bash
npm install
```

This installs the main runtime and the explorer's packages for you.

The install may take 30 seconds or a few minutes. That is normal.

When it is done, you should be back in the main `hermit` folder.

## 7. Create an OpenAI API Key

Hermit needs an OpenAI API key so it can use the AI.

1. Open [OpenAI API Keys](https://platform.openai.com/api-keys) in your browser.
2. Sign in, or create an account if you do not have one yet.
3. If OpenAI asks for billing setup, finish that first.
4. Click `Create new secret key`.
5. Give it a name and choose a project, and click `Create secret key`.
5. Keep that browser tab open.

Important:

- The key usually starts with `sk-`
- OpenAI may only show the full key once
- Do not share the key with anyone

## 8. Save the OpenAI Key in Your Mac Keychain

This is the recommended way to use Hermit. Your key stays in macOS Keychain and `nono` injects it into Hermit only when needed.

Do this in this order:

1. Copy and paste this command into Terminal, then press `Return`:

```bash
printf 'Paste your OpenAI key, then press Return: '; read -s OPENAI_KEY; echo; security add-generic-password -s "nono" -a "openai_api_key" -w "$OPENAI_KEY" -U; unset OPENAI_KEY
```

2. Terminal will wait for your input.
3. Go back to the OpenAI page and copy your key.
4. Return to Terminal and paste the key.
5. Press `Return`.

What happens next:

- Terminal asks for the key
- Your pasted key is saved into your Mac Keychain
- `nono` can then inject it into Hermit when needed

Important:

- You may not see the key appear while you paste it. That is normal.
- If you copied the wrong thing, press `Control + C` and start the step again.

If you would rather paste the key into the command manually, use this version instead and replace the placeholder text before pressing `Return`:

```bash
security add-generic-password -s "nono" -a "openai_api_key" -w "PASTE_YOUR_OPENAI_KEY_HERE" -U
```

If the command succeeds, Terminal may print nothing at all. That is okay.

## 9. Start Hermit

Now start Hermit:

```bash
npm start
```

This short command already starts Hermit inside the included sandbox profile.

Leave this Terminal tab open. This is your main Hermit tab where you talk to the AI.

## 10. Start `heartbeat-daemon` in a Second Terminal Tab

The daemon is the background loop that runs heartbeats for all configured roles on a schedule.

1. Press `Command + T` to open a new Terminal tab.
2. Run:

```bash
cd ~/Projects/hermit
```

3. Then run:

```bash
npm run heartbeat-daemon
```

This short command also runs inside the included sandbox profile.

Leave this tab open too.

You should see log lines with timestamps. By default, the daemon runs all role heartbeats once every hour and keeps going until you stop it.

## 11. Start the Explorer in a Third Terminal Tab

The explorer is the local web UI for viewing the workspace in your browser.

1. Press `Command + T` again to open a third Terminal tab.
2. Run:

```bash
cd ~/Projects/hermit
```

3. Then run:

```bash
npm run explorer
```

This command does not use `nono`. That is intentional. The explorer runs as a normal local web server so you can open it in your browser.

Leave this tab open.

The first time it starts, it may need a little time to build. When it is ready, Terminal will print a local web address.

Usually that address is:

```text
http://localhost:4321
```

## 12. Open the Explorer in Your Browser

Once the explorer command is running:

1. Look at the third Terminal tab
2. Find the local URL it printed
3. Open Safari, Chrome, or another browser
4. Paste the URL into the address bar
5. Press `Return`

If you are unsure, try:

```text
http://localhost:4321
```

If that does not load, use the exact address shown in Terminal.

## 13. What You Should Have Running

At this point you should have three Terminal tabs open:

1. Hermit chat
2. `heartbeat-daemon`
3. Explorer

And one browser tab open to the explorer.

## 14. How To Stop Everything

To stop any of the running commands:

1. Click that Terminal tab
2. Press `Control + C`

Do that once per tab.

## 15. The Next Time You Want To Use Hermit

After the first setup, you do not need to reinstall everything.

Next time:

1. Open Terminal
2. Run `cd ~/Projects/hermit`
3. Start Hermit again in one tab
4. Start `heartbeat-daemon` in a second tab
5. Start the explorer in a third tab

These are the three commands you will reuse:

```bash
npm start
```

```bash
npm run heartbeat-daemon
```

```bash
npm run explorer
```

## 16. Read This Next

Once Hermit is running, read [`docs/beginner-onboarding.md`](beginner-onboarding.md).

That guide explains:

- what Hermit becomes after install
- what you can ask it to do
- how entities and agents differ
- what you are seeing in the explorer
- how web lookup and skills fit into the system
- how heartbeat keeps the agent going

## Troubleshooting

### `brew: command not found`

Homebrew finished installing, but Terminal does not know where it is yet.

Try closing Terminal completely, then open it again and run:

```bash
brew --version
```

If that still fails, go back to the end of the Homebrew installer output and run the commands shown under `Next steps`.

### A popup asks to install Apple Command Line Tools

Click `Install`, wait for it to finish, then rerun the command that triggered the popup.

### `nono: command not found`

Run:

```bash
brew install nono
```

### `npm` or `node` is not found

Run:

```bash
brew install node
```

### The explorer command fails with missing packages

Run the main install again from the repo root:

```bash
cd ~/Projects/hermit
npm install
```

Then try starting the explorer again.

### Hermit says the OpenAI key is missing

Save the key again:

```bash
printf 'Paste your OpenAI key, then press Return: '; read -s OPENAI_KEY; echo; security add-generic-password -s "nono" -a "openai_api_key" -w "$OPENAI_KEY" -U; unset OPENAI_KEY
```

Then restart the Hermit command.

### The browser will not open the explorer

Make sure the explorer Terminal tab is still running.

Then copy the exact local URL printed in that tab and open it in your browser. The default is usually `http://localhost:4321`.
