### Isn't it dangerous to let an AI edit files autonomously?

It deserves respect, but Hermit's default posture is deliberately narrow. It runs inside a kernel-enforced sandbox ([nono](https://github.com/always-further/nono)) with very limited network access. The agent can only read and write inside its own workspace, and only receives the credentials you explicitly expose through the sandbox profile.

The starting position is "let the agent operate inside a small box," not "trust the agent with your laptop." If you want it to do more — reach additional APIs, use external skills, integrate with other systems — you open that up deliberately, one permission at a time.

---

### How do I stay in control if it edits files in the background?

Everything lives in git. Every session creates checkpoint commits. You can inspect diffs, review what changed between sessions, ask the agent to explain a decision, or revert anything you don't like with a normal `git revert`.

This doesn't eliminate all risk, but it makes the risk legible. Autonomous behavior stays inspectable, diffable, and reversible — that's the design, not an afterthought.

---

### Why not just use Lovable or Bolt?

Those tools are genuinely good at what they do: generating and deploying web apps from prompts, fast. If that's the job, use them.

Hermit is solving a different problem. It builds a durable operating system — not just a deployed app, but agents that own responsibilities, track their work in files, run reviews, and improve themselves over time. The output isn't a codebase you maintain; it's a system that maintains itself. And it stays local, in files you control.

---

### How is this different from OpenClaw?

OpenClaw is a powerful open-source platform for connecting AI agents to messaging channels, external tools, and a large skills marketplace. It's great at making an agent reachable across WhatsApp, Slack, Discord, and dozens of other surfaces.

Hermit takes a different approach. Instead of connecting an agent to external systems, it builds the entire application — data, workflows, agents, and UI — inside a single repo as readable files. The agent doesn't just use tools; it shapes and improves the system it operates in, including its own prompts and workflows.

Think of OpenClaw as an agent that reaches outward, and Hermit as an agent that builds inward.

---

### Why build your own runtime instead of using an existing agent framework?

The thesis is that one local runtime can own the full loop: conversation, durable state, workflow execution, telemetry, and self-improvement. Once the core intelligence of the system lives outside the repo, the application stops being fully self-describing.

Hermit is trying to prove the opposite model: the same framework that runs the operator can also inspect its own evidence, judge its performance, and improve its own prompts and tools — without handing that responsibility off to a second, more privileged system.

Whether that thesis is right is still an open question. But that's the bet.

---

### What does "self-improve" actually mean?

Concretely: Hermit records local telemetry for every tool call and LLM interaction. It aggregates that into reports. It runs strategic reviews on a daily cadence that question whether the prompts, workflows, role setup, and operating structure are still serving the work well.

When it finds friction, it can tighten prompts, restructure workflows, or adjust its own process — and those changes are files in the repo. Diffable, reviewable, revertable. No black-box learning. No hidden weight updates. Just file edits with git history.

---

### What models does it support?

OpenAI, Anthropic, Google, Mistral, Groq, xAI, Cerebras, and OpenRouter. You only need one API key to get started — Hermit auto-selects the best available model from whichever keys it finds.

---

### Is it free?

Yes. MIT-licensed open source. You bring your own model API key and run it locally. There is no SaaS, no subscription, and no hosted service. The cost is whatever your model provider charges for API usage.

---

### What's the catch?

Hermit is early-stage software built by a small team. It works, and the architecture is sound, but it's not yet polished to the level of mature commercial products. You should expect rough edges, evolving APIs, and the need to occasionally read source code when something isn't obvious.

If you're comfortable with that — and you're interested in a genuinely different model for how AI applications should work — it's worth trying.
