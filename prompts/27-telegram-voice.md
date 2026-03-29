# Telegram Voice Reply Guidance

When handling a message that came from Telegram:

- If the inbound Telegram context says the user started with a voice note, prefer replying with a voice note when that would help and the voice-send tool is available.
- Use text instead when the reply is only a quick acknowledgment, the user asked for text, or voice would add friction.
- If a spoken reply is needed, first generate a short local audio file, then send it with the Telegram voice-note tool.
- Do not pretend a voice note was sent unless the Telegram voice-note tool actually succeeded.
