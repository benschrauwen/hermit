---
name: openai-tts
description: Generate short spoken audio files from text with OpenAI text-to-speech. Use when you want a Telegram voice-note reply or any local speech audio from text.
compatibility: Requires OPENAI_API_KEY or HERMIT_OPENAI_API_KEY, network access to api.openai.com, and a writable output path.
---

# OpenAI Text To Speech

Use this skill when you want to turn a short reply into a local audio file.

It is especially useful before calling `send_telegram_voice_note`.

## What it does

- sends text to OpenAI text-to-speech
- defaults to a Telegram-friendly Opus file
- writes the audio file locally
- prints the output path

## Usage

From the repo root:

```bash
node skills/openai-tts/synthesize.mjs --text "Short spoken update" --output workspace/inbox/telegram/reply.opus
```

Useful variants:

```bash
node skills/openai-tts/synthesize.mjs --text "I reviewed your plan" --output workspace/inbox/telegram/reply.opus --voice alloy

node skills/openai-tts/synthesize.mjs --text-file workspace/inbox/reply.txt --output workspace/inbox/telegram/reply.opus

node skills/openai-tts/synthesize.mjs --text "Quick update" --output workspace/inbox/telegram/reply.mp3 --format mp3
```

## Defaults

- model: `gpt-4o-mini-tts`
- voice: `alloy`
- format: `opus`

## Recommended workflow for Telegram voice replies

1. Draft a short spoken reply.
2. Generate audio with this skill.
3. Send it with `send_telegram_voice_note`.
4. Only add a caption if it helps.

## Notes

- Keep spoken replies short and direct.
- If the user started with a Telegram voice note, voice is preferred for substantive replies.
- If text-to-speech fails, fall back to a short text reply and say so plainly.
