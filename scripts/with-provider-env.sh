#!/usr/bin/env bash
set -euo pipefail

load_key_from_keychain() {
  local env_name="$1"
  local account_name="$2"
  local current_value="${!env_name:-}"

  if [[ -n "$current_value" ]]; then
    return
  fi

  if [[ "${OSTYPE:-}" == darwin* ]] && command -v security >/dev/null 2>&1; then
    local keychain_value
    keychain_value="$(security find-generic-password -s 'nono' -a "$account_name" -w 2>/dev/null || printf '')"
    if [[ -n "$keychain_value" ]]; then
      export "$env_name=$keychain_value"
    fi
  fi
}

load_key_from_keychain OPENAI_API_KEY openai_api_key
load_key_from_keychain ANTHROPIC_API_KEY anthropic_api_key
load_key_from_keychain GOOGLE_API_KEY google_api_key
load_key_from_keychain GEMINI_API_KEY gemini_api_key
load_key_from_keychain OPENROUTER_API_KEY openrouter_api_key
load_key_from_keychain GROQ_API_KEY groq_api_key
load_key_from_keychain XAI_API_KEY xai_api_key
load_key_from_keychain MISTRAL_API_KEY mistral_api_key
load_key_from_keychain CEREBRAS_API_KEY cerebras_api_key
load_key_from_keychain HERMIT_TELEGRAM_BOT_TOKEN hermit_telegram_bot_token

if [[ -n "${GOOGLE_API_KEY:-}" && -z "${GEMINI_API_KEY:-}" ]]; then
  export "GEMINI_API_KEY=$GOOGLE_API_KEY"
fi

if [[ -n "${GEMINI_API_KEY:-}" && -z "${GOOGLE_API_KEY:-}" ]]; then
  export "GOOGLE_API_KEY=$GEMINI_API_KEY"
fi

exec "$@"
