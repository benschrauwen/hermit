### Isn't this dangerous? I hear horror stories from OpenClaw.

By default, Hermit runs in a tightly locked-down sandbox. The agent gets very limited network access, can only read and write inside its own workspace directory, and only receives the credentials you explicitly choose to expose through the sandbox profile. Out of the box, the default setup is intentionally narrow: enough freedom to work on the repo, not enough freedom to roam around your machine or call arbitrary services.

That means the starting posture is not "trust the agent with your laptop." It is closer to "let the agent operate inside a small box." If you want Hermit to do more, such as reach additional APIs, use advanced skills, or integrate with external systems, you open that up deliberately. You can expand network policy, switch to the unsafe commands, or add integrations, but those are conscious choices under your control rather than ambient default power.

The model is progressive capability. Start with a bolted-down local runtime, then selectively open things up as the use case justifies it. So yes, autonomous software always deserves respect, but Hermit is designed so there is very little to worry about at the beginning and a clear boundary around what the agent can touch.

---

### Why is this not just built on OpenClaw?

OpenClaw is amazing, but Hermit is aiming at a narrower and more opinionated shape: a minimal, self-contained repo where the agent can improve the whole system from inside the system. The runtime, prompts, skills, datastore, explorer UI, and agent operating state all live together in one workspace so the agent is not merely using the app, it can also inspect and evolve the machinery that runs it.

That constraint is intentional. Hermit is trying to stay small enough that you can understand the whole stack, fork it, and let it co-evolve with a specific job. The point is not to out-feature a larger agent platform; it is to make a compact, hackable substrate where self-modification is a first-class property instead of an integration story.

---

### Why not call an external coding-agent framework like Cursor or Claude Code?

Because the thesis here is stronger than "an agent can invoke coding tools." Hermit is an attempt to show that one local agent runtime can own the full loop itself: conversation, durable state, workflow execution, telemetry, review cadence, and code or prompt changes when needed.

External coding agents can absolutely be useful, but once the core intelligence of the system lives outside the repo, the application stops being fully self-describing. Hermit is trying to prove the opposite model: the same framework that runs the operator should also be able to inspect its evidence, judge its performance, and improve its own harness without handing that responsibility off to a second, more privileged system.

---

### What do you mean by "self-improve"?

In Hermit, "self-improve" means the runtime has built-in feedback loops for making the harness itself better over time. It records local telemetry for LLM and tool calls, can aggregate that telemetry into reports, and runs recurring heartbeat turns that do more than advance tasks: they also perform strategic review on a roughly daily cadence to question whether the prompts, workflows, role setup, and operating structure are still serving the work well.

So self-improvement here is practical and observable. Hermit can notice friction, review the evidence from its own runs, and then tighten prompts, skills, role definitions, or process structure inside the same repo. The goal is a system that gets better at operating by editing its own harness based on local evidence, not a black-box agent that claims to learn without leaving artifacts behind.

---

### If it edits files in the background, how do I stay in control?

It would be dangerous if those edits were opaque or hard to unwind. Hermit's answer is to keep the whole system inside normal Git workflows. The app state, prompts, role files, and runtime code all live in the repository, and session activity is checkpointed into versioned history instead of disappearing into a hidden store.

That means you can treat the agent like a very active collaborator rather than an untouchable automaton. You can ask what changed, inspect diffs, review the latest commits, ask it to explain why a file was edited, or tell it to revert something you do not like. Because the artifacts are just files in Git, recovery is not a special feature bolted onto the side; it is the default operating model.

This does not remove all risk, but it makes the risk legible. Hermit is intentionally designed so that autonomous behavior stays inspectable, diffable, and reversible by the user.

---

### What models does it support?

OpenAI, Anthropic, Google, Mistral, Groq, xAI, Cerebras, and OpenRouter. You only need one API key to get started — Hermit auto-selects the best available model from whichever keys it finds.

---

### Is it free?

Yes. MIT-licensed open source. You bring your own model API key and run it locally. There is no SaaS, no subscription, and no hosted service. The cost is whatever your model provider charges for API usage.
