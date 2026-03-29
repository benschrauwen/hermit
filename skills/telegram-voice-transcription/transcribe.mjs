import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import OpenAI from "openai";

function usage() {
  console.error("Usage: node skills/telegram-voice-transcription/transcribe.mjs <audio-file> [--model whisper-1] [--stdout-only]");
}

function resolveApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || process.env.HERMIT_OPENAI_API_KEY?.trim();
}

function parseArgs(argv) {
  const args = [...argv];
  let filePath;
  let model = "whisper-1";
  let stdoutOnly = false;

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) continue;
    if (arg === "--model") {
      const value = args.shift();
      if (!value) {
        throw new Error("Missing value for --model.");
      }
      model = value;
      continue;
    }
    if (arg === "--stdout-only") {
      stdoutOnly = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (!filePath) {
      filePath = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!filePath) {
    usage();
    throw new Error("Missing audio file path.");
  }

  return { filePath, model, stdoutOnly };
}

async function main() {
  const { filePath, model, stdoutOnly } = parseArgs(process.argv.slice(2));
  const resolvedFilePath = path.resolve(filePath);

  if (!fs.existsSync(resolvedFilePath)) {
    throw new Error(`Audio file not found: ${resolvedFilePath}`);
  }

  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY or HERMIT_OPENAI_API_KEY before transcribing audio.");
  }

  const client = new OpenAI({ apiKey });
  const transcription = await client.audio.transcriptions.create({
    file: fs.createReadStream(resolvedFilePath),
    model,
  });

  const text = transcription.text?.trim() || "";
  if (!text) {
    throw new Error("OpenAI returned an empty transcript.");
  }

  if (!stdoutOnly) {
    const outputPath = `${resolvedFilePath}.transcript.md`;
    const timestamp = new Date().toISOString();
    const markdown = [
      "---",
      `source_audio: ${JSON.stringify(path.relative(process.cwd(), resolvedFilePath))}`,
      `model: ${JSON.stringify(model)}`,
      `transcribed_at: ${JSON.stringify(timestamp)}`,
      "---",
      "",
      "# Transcript",
      "",
      text,
      "",
    ].join("\n");
    fs.writeFileSync(outputPath, markdown, "utf8");
  }

  process.stdout.write(`${text}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
