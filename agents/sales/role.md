---
id: sales
name: Sales Leader
description: File-first sales leadership role with deals and product context.
role_directories:
  - supporting-files
  - supporting-files/inbox
  - supporting-files/unmatched-transcripts
  - supporting-files/reference
transcript_ingest:
  entity_type: deal
  command_prompt: 40-command-transcript-run.md
  system_prompts:
    - 23-mode-transcript-ingest.md
  evidence_directory: transcripts
  unmatched_directory: supporting-files/unmatched-transcripts
  activity_log_file: activity-log.md
---

# Sales Role

This role owns deal execution