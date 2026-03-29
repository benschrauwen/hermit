---
name: telegram-voice-transcription
description: Transcribe saved Telegram voice notes and other audio attachments with OpenAI before replying. Use when a Telegram prompt includes an audio file path under inbox/telegram/.
compatibility: Requires OPENAI_API_KEY or HERMIT_OPENAI_API_KEY, network access to api.openai.com, and a saved local audio file.
---

# Telegram Voice Transcription

Use this skill when a Telegram message includes a saved audio attachment such as:

- `inbox/telegram/...voice-note.ogg`
- `inbox/telegram/...audio.mp3`
- `inbox/telegram/...video-note.mp4`

## What it does

- sends the local audio file to OpenAI transcription
- defaults to `whisper-1`
- writes a sidecar transcript file next to the audio
- prints the transcript to stdout so you can use it immediately

## Usage

From the repo root:

```bash
node skills/telegram-voice-transcription/transcribe.mjs workspace/inbox/telegram/<file>
```

Examples:

```bash
node skills/telegram-voice-transcription/transcribe.mjs workspace/inbox/telegram/00000011-000013-voice-note.ogg

node skills/telegram-voice-transcription/transcribe.mjs workspace/inbox/telegram/00000011-000013-voice-note.ogg --model whisper-1

node skills/telegram-voice-transcription/transcribe.mjs workspace/inbox/telegram/00000011-000013-voice-note.ogg --stdout-only
```

## Output

By default the script writes:

- `<audio-file>.transcript.md`

The file contains:

- source audio path
- model used
- timestamp
- transcript text

## Recommended workflow

1. Run the script on the saved Telegram audio file.
2. Read the transcript.
3. Answer the human based on the transcript.
4. Use `send_telegram_message` or `send_telegram_voice_note` for the reply.

## Notes

- If the audio is unclear, say that plainly instead of pretending it was clear.
- If transcription fails because the API key or network is missing, tell the human and ask for text instead.
