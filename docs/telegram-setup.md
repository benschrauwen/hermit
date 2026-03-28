# Telegram Setup

This guide is for people who already have Hermit running and want the simplest possible Telegram connection.

What this integration does:

- One Telegram chat is connected to the combined `npm start` session
- New Telegram messages are queued into Hermit's main chat thread
- Hermit can reply by using the built-in `send_telegram_message` tool
- Telegram replies are meant to stay shorter than the normal desktop chat

What this simple version does **not** do:

- It does not create a separate Telegram-only agent
- It does not support multiple Telegram chats at once
- It does not try to fully understand photos, voice notes, or other rich message types

## Before You Start

You need:

- a working Hermit install
- a Telegram account
- about 10 minutes

This guide assumes you run Hermit from the repo root with:

```bash
npm start
```

## 1. Create a Telegram Bot

1. Open Telegram.
2. Search for `@BotFather`.
3. Start a chat with BotFather.
4. Send `/newbot`.
5. Follow the prompts to choose a name and a username.
6. Copy the bot token BotFather gives you.

The token looks something like this:

```text
123456789:AAExampleTokenFromBotFather
```

Keep that token private.

## 2. Start a Chat With Your Bot

1. Search for your new bot in Telegram.
2. Open the chat.
3. Press `Start` or send any message such as `hello`.

Hermit needs this step so Telegram has a real chat to report.

## 3. Find Your Chat ID

The easiest way is to ask Telegram for the recent updates from your bot.

Open this URL in your browser and replace `PASTE_YOUR_BOT_TOKEN_HERE` with your real token:

```text
https://api.telegram.org/botPASTE_YOUR_BOT_TOKEN_HERE/getUpdates
```

Look for a section like this:

```json
{
  "message": {
    "chat": {
      "id": 123456789,
      "first_name": "Your Name"
    }
  }
}
```

Copy the `chat.id` number.

Notes:

- In a private chat, the chat ID is usually a normal positive number.
- In a group chat, the chat ID is often a negative number.
- If the page says there are no updates, send your bot another message and refresh.

## 4. Add the Telegram Settings

The easiest setup is a local `.env` file in the Hermit repo root.

Create or edit `.env` and add:

```bash
HERMIT_TELEGRAM_BOT_TOKEN=PASTE_YOUR_BOT_TOKEN_HERE
HERMIT_TELEGRAM_CHAT_ID=PASTE_YOUR_CHAT_ID_HERE
```

Example:

```bash
HERMIT_TELEGRAM_BOT_TOKEN=123456789:AAExampleTokenFromBotFather
HERMIT_TELEGRAM_CHAT_ID=123456789
```

This repo already ignores `.env`, so Git will not try to commit it.

## 5. Optional: Keep the Bot Token in macOS Keychain Instead

If you are on a Mac and want the token outside `.env`, you can store just the token in Keychain and leave only the chat ID in `.env`.

Save the token:

```bash
printf 'Paste your Telegram bot token, then press Return: '; read -s TELEGRAM_BOT_TOKEN; echo; security add-generic-password -s "nono" -a "hermit_telegram_bot_token" -w "$TELEGRAM_BOT_TOKEN" -U; unset TELEGRAM_BOT_TOKEN
```

Then your `.env` only needs:

```bash
HERMIT_TELEGRAM_CHAT_ID=PASTE_YOUR_CHAT_ID_HERE
```

## 6. Start Hermit

From the Hermit repo root, run:

```bash
npm start
```

When Telegram is configured correctly, Hermit will start listening for messages from that one chat while the combined workspace screen is running.

## 7. Test It

1. Leave `npm start` running.
2. Send your bot a short message in Telegram such as `What should I focus on today?`
3. Watch the Hermit chat pane.

You should see the Telegram message appear in the main chat thread with extra instructions telling Hermit:

- this came from Telegram
- it must use the Telegram send tool to reply
- the reply should stay short

If Hermit decides to answer, it should answer back in Telegram by using `send_telegram_message`.

## How To Use It Day To Day

The intended flow is simple:

1. Keep Hermit running with `npm start`.
2. Send a message to the configured bot chat.
3. Hermit sees that message in its main chat thread.
4. Hermit replies through `send_telegram_message` when it wants to answer in Telegram.

This is intentionally a light bridge, not a full Telegram workflow engine.

## Limitations

- Only the combined `npm start` session listens for Telegram messages.
- This simple setup supports one Telegram chat ID at a time.
- Non-text Telegram messages are reduced to a short placeholder when possible.
- If you run more than one Hermit process against the same bot token, Telegram polling can conflict.

## Troubleshooting

### Nothing shows up in Hermit

Check all of these:

- `npm start` is still running
- the bot token is correct
- the chat ID is correct
- you sent the message to the same chat ID you configured

If you changed `.env`, stop Hermit and start it again.

### `getUpdates` shows no messages

Send your bot a fresh message in Telegram, then reload the page.

If the bot is in a group, make sure you actually messaged the group after adding the bot.

### Telegram says there is a polling conflict

This usually means something else is already using `getUpdates` for that bot.

Common causes:

- another Hermit session is already running
- another script is polling the same bot
- you previously connected the bot to a webhook-based service

For this simple integration, use one polling consumer only.

### Hermit answers in the desktop chat but not in Telegram

That usually means the tool call failed.

Check the Hermit chat output for a Telegram error message. Common causes are:

- the token is wrong
- the bot no longer has access to that chat
- the message was too long
