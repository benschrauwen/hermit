# Beginner Onboarding to Hermit

Hermit is a local, file-first system that turns a plain folder into a working tool for a real job or a collection of jobs working together.

Once it is installed, Hermit is not just a chat window. It becomes a living workspace where:

- you talk to an agent in natural language
- the agent keeps durable records in files
- background heartbeats keep work moving in the background
- a local explorer lets you browse what the system knows
- prompts, skills, data, and UI all evolve together in one place

That means Hermit can become a sales system, a production management system, a household command center, or something much more specific to your own work.

The best way to think about it is simple: you describe the job, and Hermit starts building the system around that job.

## What Hermit Does Once Installed

After install, most people start with one command:

- `npm start` opens the combined workspace screen with the explorer, the heartbeat daemon, and the main chat together

You can still run `npm run heartbeat-daemon` or `npm run explorer` separately when you explicitly want only one part of the system.

On a fresh setup, the first conversation usually defines your first agent. Hermit then starts shaping the workspace around that role by creating the files and structure it needs to do the work well.

Instead of forcing you into a rigid product setup, Hermit grows with the way you actually work.

It also does something important in the background: it keeps a simple operating system for each agent. If you know GTD, it will feel familiar. Each agent keeps an inbox for rough capture and a working record for things like active projects, next actions, waiting-on items, calendar items, and someday-or-maybe ideas. The workspace can also keep a shared `inbox/` folder where you drop incoming files for Hermit to route into the right records.

Then the heartbeat comes in. About once an hour, Hermit gives each agent a short background turn to clean up, review what is unblocked, and move one useful next step forward. About once a day, it also does a bigger review to step back and look at priorities, structure, and opportunities to improve the way the system is working.

## What You Can Ask Hermit To Do

You can ask Hermit to do practical work, not just answer questions.

Examples:

- "Set me up with a sales leader who tracks deals, accounts, and next steps."
- "Review the top open deals and tell me which ones need executive attention."
- "Create a production manager that tracks incidents, maintenance, and supplier issues."
- "Organize my household projects, recurring chores, bills, and service providers."
- "Look up the latest guidance on food safety audits and summarize the important changes."
- "Make the explorer show my deals as pipeline stages instead of a plain list."
- "Create a reusable skill for weekly planning and review."

Over time, Hermit can help you:

- capture and organize work
- create and update structured records
- review priorities and surface risks
- summarize notes or transcripts into durable records
- process files you drop into the shared `inbox/` and move them to the right place
- look things up online when current information matters
- improve its own ways of working and explorer views

## Entities vs Agents

This is the most important concept in Hermit.

An **entity** is a thing your system needs to keep track of.

Examples of entities:

- a deal
- an account
- a production issue
- a supplier
- a household project
- a family contact

An **agent** is the operator that works on those things.

Examples of agents:

- a sales leader
- a production manager
- a household organizer

A simple shortcut is:

- entity = the record
- agent = the worker

Hermit keeps these separate on purpose.

Entities hold durable domain truth. They are the things you want to remember, inspect, search, and update over time.

Agents hold behavior. They define how work gets done, what standards matter, what files to read first, and what good judgment looks like in that domain.

In practice, that separation gives you a much clearer system. You can change how an agent works without rewriting all your records, and you can keep growing the information Hermit tracks without turning the agent into a vague generic assistant.

## What You See In The Explorer

The explorer is Hermit's local read-only web UI.

It is meant for browsing, not editing. Hermit changes the system through your conversations and background work. The explorer shows you the current state in a cleaner way.

What you will usually see:

- a home page with the main workspace entry points
- an `Entities` area where you browse records by type
- an `Agents` area where you browse each agent's operating context
- detail pages for individual records

By default, the explorer is simple. If no special view exists yet, Hermit just shows the information clearly from the files.

That is a feature, not a limitation. It means you can ask Hermit to reshape the explorer around your work.

For example, you can say:

- "Make the explorer show a pipeline view for deals."
- "Add a cleaner dashboard for production incidents."
- "Show household tasks grouped by due date and owner."
- "Turn this entity detail page into something easier to scan."

When you ask for that, Hermit can reshape the structure behind your records and create custom explorer views so the UI matches the way you want to see the work.

## How Hermit Works Internally, Very Simply

At a high level, Hermit works like this:

1. You describe the job you want done.
2. Hermit creates or updates agents, kinds of records, starter files, and instructions in the workspace.
3. The important information lives in normal files instead of disappearing into a hidden system.
4. Each agent keeps a simple GTD-style operating system with an inbox and a working record.
5. The shared `inbox/` folder can hold uncategorized incoming files until Hermit routes them into the right entity or role directories.
6. The heartbeat reviews that operating system in the background and moves useful work forward.
7. The explorer reads the same workspace and shows it to you.
8. Git keeps the history of how the system changed over time.

So the tool is not hidden behind a service. The tool is the workspace.

That is why Hermit feels different from a normal assistant. It does not just chat and disappear. It leaves behind a working system that can keep moving, be reviewed, and improve over time.

## How Hermit Looks Things Up Online

Hermit can look up current information online when your task needs fresh outside information.

You can ask for things like:

- recent changes in a regulation
- current product or API documentation
- competitor or market information
- a quick source-backed answer to an external question

Hermit has a built-in way to search the web for this. In normal use, it should still treat your own workspace as the source of truth for your project, and use the web for outside information that changes over time.

By default, Hermit starts from a safer local setup while still supporting web lookup when it is needed.

## How Skills Fit In

Skills are reusable ways of working that Hermit can bring in when they are useful.

Think of a skill as a focused playbook for a recurring job. Instead of cramming every workflow into one big set of instructions, Hermit can keep targeted guidance in skills and use it when it fits the moment.

That helps in two ways:

- the main agent stays cleaner and more focused
- recurring workflows become easier to reuse and improve

You can have:

- shared skills that any agent can use
- role-specific skills that only one agent uses

You can ask Hermit to:

- use an existing skill
- find a skill for a task
- create a new local skill for a recurring workflow
- improve a skill after you learn what works

This makes Hermit feel less like a one-off conversation tool and more like a system that can learn stable methods over time.

## A Few Things You Can Build

### Sales Leader

A sales leader setup could track accounts, deals, contacts, meeting notes, risks, and next actions. The role should own pipeline management proactively, while you remain the manager who sets direction and carries external asks when needed.

You could ask Hermit to:

- create a clean deal pipeline
- review which deals are most likely to slip
- summarize call notes into account records
- prepare weekly pipeline reviews
- draft follow-up asks or review agendas for you to carry to reps or customers
- reshape the explorer into something closer to a forecast board or deal dashboard

### Production Manager

A production manager setup could track production issues, maintenance work, suppliers, quality problems, shift handoffs, and operational follow-through.

You could ask Hermit to:

- create structured incident records
- surface recurring bottlenecks
- organize supplier and maintenance follow-up
- run daily or weekly operating reviews
- make the explorer feel more like a status board, review queue, or control room

### Household Organizer

A household organizer setup could track home projects, recurring chores, bills, important contacts, service providers, maintenance history, and planning for upcoming events.

You could ask Hermit to:

- keep one place for everything the household depends on
- organize open tasks and recurring responsibilities
- compare options for repairs or services
- remember what happened last time with a vendor or home issue
- shape the explorer into a calmer family dashboard

## Why People Get Excited About It

Hermit is inspiring because it gives you a way to build something around your real work without starting from scratch as a programmer and without squeezing yourself into a generic tool.

You are not only asking an AI for answers. You are slowly building a durable operating system for a domain you care about.

That system can stay small and personal, or become quite sophisticated over time. You can start with one sharp agent and a few kinds of records, then let Hermit evolve the rest as the work becomes clearer.

If you are wondering where to begin, start with one role you genuinely want help from, one or two kinds of records you know you need, and one explorer view you wish already existed. That is enough for Hermit to begin becoming your own project.
