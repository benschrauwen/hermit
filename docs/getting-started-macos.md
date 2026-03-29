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
- Created one provider API key
- Saved that key into your Mac's Keychain
- Started Hermit safely in one Terminal tab
- Opened the explorer in your browser

## Before You Start

You need:

- A Mac with internet access
- An account for at least one supported model provider
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

`nono` is the safety layer Hermit uses for the main `npm start` flow in this guide.

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

## 7. Create One Provider API Key

Hermit needs one supported provider API key so it can use the AI.

The simplest options for most people are:

- [OpenAI API Keys](https://platform.openai.com/api-keys)
- [Anthropic Console](https://console.anthropic.com/)
- [Google AI Studio](https://aistudio.google.com/)

You only need one key to get started. Hermit will automatically pick the best model it can use from the key you provide.

1. Open your provider's API key page in your browser.
2. Sign in, or create an account if you do not have one yet.
3. If the provider asks for billing setup, finish that first.
4. Create a new API key or secret key.
5. Keep that browser tab open.

Important:

- Some providers only show the full key once
- Do not share the key with anyone

## 8. Save the Provider Key in Your Mac Keychain

This is the recommended way to use Hermit. Your key stays in macOS Keychain and Hermit loads it before entering the sandbox when needed.

Choose the command that matches your provider, then paste it into Terminal and press `Return`:

```bash
printf 'Paste your OpenAI key, then press Return: '; read -s PROVIDER_KEY; echo; security add-generic-password -s "nono" -a "openai_api_key" -w "$PROVIDER_KEY" -U; unset PROVIDER_KEY
```

```bash
printf 'Paste your Anthropic key, then press Return: '; read -s PROVIDER_KEY; echo; security add-generic-password -s "nono" -a "anthropic_api_key" -w "$PROVIDER_KEY" -U; unset PROVIDER_KEY
```

```bash
printf 'Paste your Google Gemini key, then press Return: '; read -s PROVIDER_KEY; echo; security add-generic-password -s "nono" -a "gemini_api_key" -w "$PROVIDER_KEY" -U; unset PROVIDER_KEY
```

You can also use these account names for other supported providers:

- `google_api_key`
- `openrouter_api_key`
- `groq_api_key`
- `xai_api_key`
- `mistral_api_key`
- `cerebras_api_key`

Hermit accepts both `GEMINI_API_KEY` and `GOOGLE_API_KEY` for Google Gemini. `gemini_api_key` is the preferred macOS Keychain account name, and `google_api_key` remains a compatible alias.

Then:

1. Terminal will wait for your input.
2. Go back to your provider page and copy your key.
3. Return to Terminal and paste the key.
4. Press `Return`.

What happens next:

- Terminal asks for the key
- Your pasted key is saved into your Mac Keychain
- Hermit can then load it automatically when needed

Important:

- You may not see the key appear while you paste it. That is normal.
- If you copied the wrong thing, press `Control + C` and start the step again.

If you would rather paste the key into the command manually, use this version instead and replace the placeholder text before pressing `Return`:

```bash
security add-generic-password -s "nono" -a "anthropic_api_key" -w "PASTE_YOUR_PROVIDER_KEY_HERE" -U
```

If the command succeeds, Terminal may print nothing at all. That is okay.

## 9. Start Hermit

Now start Hermit:

```bash
npm start
```

This short command already starts Hermit inside the included sandbox profile at `nono/hermit.json`.

Leave this Terminal tab open. This is your main Hermit tab where you talk to the AI.

## 10. Open the Explorer in Your Browser

`npm start` now launches the explorer for you inside the same sandboxed session as the chat and heartbeat daemon.

The first time it starts, it may need a little time to build. When it is ready, open your browser and visit:

```text
http://localhost:4321
```

If that does not load, use the exact local URL shown in the `npm start` Terminal tab.

## 11. What You Should Have Running

At this point you should have:

1. One Terminal tab running `npm start`
2. One browser tab open to the explorer

Inside the Terminal tab, the top pane shows the heartbeat daemon and the bottom pane is the interactive chat UI.

## 12. How To Stop Everything

To stop Hermit:

1. Click the Terminal tab running `npm start`
2. Press `Control + C`

That one keypress cleanly stops the explorer, cancels live AI sessions, and exits the combined workspace screen.

## 13. The Next Time You Want To Use Hermit

After the first setup, you do not need to reinstall everything.

Next time:

1. Open Terminal
2. Run `cd ~/Projects/hermit`
3. Run `npm start`
4. Open `http://localhost:4321` in your browser


## 14. Read This Next

Once Hermit is running, read [`docs/beginner-onboarding.md`](beginner-onboarding.md).

That guide explains:

- what Hermit becomes after install
- what you can ask it to do
- how entities and agents differ
- what you are seeing in the explorer
- how web lookup and skills fit into the system
- how heartbeat keeps the agent going

If you want to connect one Telegram chat after that, read [`docs/telegram-setup.md`](telegram-setup.md).

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

### Hermit says no provider key was found

Save a supported provider key again. Example for Anthropic:

```bash
printf 'Paste your Anthropic key, then press Return: '; read -s PROVIDER_KEY; echo; security add-generic-password -s "nono" -a "anthropic_api_key" -w "$PROVIDER_KEY" -U; unset PROVIDER_KEY
```

Then restart the Hermit command.

### The browser will not open the explorer

Make sure the explorer Terminal tab is still running.

Then copy the exact local URL printed in that tab and open it in your browser. The default is usually `http://localhost:4321`.
