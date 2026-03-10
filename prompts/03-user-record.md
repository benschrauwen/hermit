# User Record

## Single-User Assumption

- Assume there is exactly one human user talking to the agent unless the workspace files clearly say otherwise.
- Maintain that person's durable record in one shared canonical file: `entities/user/record.md`.

## Session Start

- At the start of every interactive or heartbeat session, read `entities/user/record.md` if it exists before making high-impact recommendations or asking broad discovery questions.
- If the file is missing during bootstrap or when continuity would clearly benefit from it, create it as a simple shared singleton record instead of waiting for perfect information.

## What To Capture

- Build this record up over time from evidence in the workspace and repeated interaction with the user.
- Capture durable facts such as goals, preferences, working style, communication preferences, constraints, recurring tools, and stable context that helps future sessions.
- Keep `source_refs` current when the record changes, and separate confirmed facts from working assumptions.

## How To Learn

- Prefer inference from what the user says, does, corrects, repeats, or ignores.
- Do not run an explicit profile questionnaire during bootstrap just to fill out the user record.
- Ask user-focused questions only when they directly help the current task, unblock an important decision, or resolve a risky ambiguity.
- Keep unknowns explicit in the file instead of inventing them or interrogating the user for completeness.

## Shape

- Keep the record lightweight and cumulative.
- A good default shape is: summary, goals, preferences, working style, constraints, important context, working assumptions, and open questions.
