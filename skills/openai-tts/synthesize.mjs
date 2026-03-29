import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import OpenAI from "openai";

function usage() {
  console.error(
    "Usage: node skills/openai-tts/synthesize.mjs (--text <text> | --text-file <path>) --output <path> [--model gpt-4o-mini-tts] [--voice alloy] [--format opus] [--instructions <style>]",
  );
}

function resolveApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || process.env.HERMIT_OPENAI_API_KEY?.trim();
}

function parseArgs(argv) {
  const args = [...argv];
  let text;
  let textFile;
  let output;
  let model = "gpt-4o-mini-tts";
  let voice = "alloy";
  let format = "opus";
  let instructions;

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) continue;
    if (arg === "--text") {
      text = args.shift();
      continue;
    }
    if (arg === "--text-file") {
      textFile = args.shift();
      continue;
    }
    if (arg === "--output") {
      output = args.shift();
      continue;
    }
    if (arg === "--model") {
      model = args.shift();
      continue;
    }
    if (arg === "--voice") {
      voice = args.shift();
      continue;
    }
    if (arg === "--format") {
      format = args.shift();
      continue;
    }
    if (arg === "--instructions") {
      instructions = args.shift();
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!text && !textFile) {
    usage();
    throw new Error("Provide --text or --text-file.");
  }
  if (text && textFile) {
    throw new Error("Use either --text or --text-file, not both.");
  }
  if (!output) {
    usage();
    throw new Error("Provide --output.");
  }
  if (!model || !voice || !format) {
    throw new Error("Model, voice, and format must be non-empty.");
  }

  return { text, textFile, output, model, voice, format, instructions };
}

async function main() {
  const { text, textFile, output, model, voice, format, instructions } = parseArgs(process.argv.slice(2));
  const resolvedOutput = path.resolve(output);
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY or HERMIT_OPENAI_API_KEY before generating speech.");
  }

  const input = textFile
    ? fs.readFileSync(path.resolve(textFile), "utf8").trim()
    : (text ?? "").trim();
  if (!input) {
    throw new Error("Speech input cannot be empty.");
  }

  const client = new OpenAI({ apiKey });
  const response = await client.audio.speech.create({
    model,
    voice,
    input,
    response_format: format,
    ...(instructions ? { instructions } : {}),
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await fs.promises.writeFile(resolvedOutput, buffer);
  process.stdout.write(`${resolvedOutput}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
