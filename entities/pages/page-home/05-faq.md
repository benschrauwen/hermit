## Frequently asked questions

### Isn't it dangerous to let an AI edit files autonomously?

By default, Hermit runs inside a kernel-enforced sandbox ([nono](https://github.com/always-further/nono)). The agent gets very limited network access, can only read and write inside its own workspace, and only receives the credentials you explicitly expose. The starting posture is "let the agent operate inside a small box," not "trust the agent with your laptop."

If you want Hermit to do more — reach additional APIs, use external skills, or integrate with other systems — you open that up deliberately. Start narrow, expand consciously.

### How do I stay in control if it edits files in the background?

Everything lives in git. Session activity is checkpointed into versioned commits. You can inspect diffs, review what changed, ask the agent to explain a decision, or revert anything. Autonomous behavior stays inspectable, diffable, and reversible — by design.

### Why not just use Lovable or Bolt?

Those tools are great for generating and deploying web apps fast. Hermit solves a different problem: building a **durable operating system** that keeps running after the first conversation. Agents don't just generate code — they own responsibilities, track work, run reviews, and improve themselves over time. And everything stays local, in files you control.

### How is this different from OpenClaw?

OpenClaw is a powerful agent platform for connecting AI to messaging channels, external tools, and a large skills marketplace. Hermit takes a different approach: instead of connecting an agent to external systems, it builds the entire application — data, workflows, agents, and UI — inside a single repo as readable files. The agent doesn't just use tools; it shapes and improves the system it operates in. Think of OpenClaw as an agent that talks to the world, and Hermit as an agent that builds a world.

### What does "self-improve" actually mean?

Hermit records local telemetry, aggregates it into reports, and runs strategic reviews on a daily cadence. It questions whether its prompts, workflows, and operating structure are still serving the work well — then tightens them based on evidence. The improvements are files in the repo: diffable, reviewable, and revertable. No black-box learning.

### What models does it support?

Hermit works with OpenAI, Anthropic, Google, Mistral, Groq, xAI, Cerebras, and OpenRouter. You only need one API key to get started — Hermit auto-selects the best available model.

### Is it free?

Yes. Hermit is MIT-licensed open source. You bring your own model API key and run it locally. There is no SaaS, no subscription, and no hosted service.
