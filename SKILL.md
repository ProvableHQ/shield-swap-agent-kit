---
name: shield-swap
description: Use when a user asks how to trade with Shield Swap or get started, wants to build an integration or bot, configure trading tools, or operate a Shield Swap account on Aleo.
---

# Shield Swap

This is the top-level Shield Swap onboarding guide. When invoked without a concrete task—including `/shield-swap`, `$shield-swap`, or a fresh session started with `skills use`—open the [intro screen](context/getting-started.md) immediately. Invoking the skill is enough: do not wait for a second request or ask what the user needs before showing the guide. Introductory prompts such as “How do I trade with Shield Swap?”, “Get started”, or “Show the menu” open the same guide. Show the **SHIELD SWAP** heading, **Private asset trading**, the three status rows **Tools**, **Aleo account**, **Funding**, and all four journey choices. Show it again when asked, even after setup. Existing accounts change status values; they never remove the heading or menu.

The guide covers the shared account and funding steps, then routes to the chosen journey using the user’s existing or selected tools. It works with SDK, CLI, and MCP paths; an MCP connection is not required to display it.

During tool setup or dependency updates, guide the user to the [latest published SDKs and CLI](context/toolchains/updates.md) with the commands for their selected interface. Keep the opening screen focused on the journey; show installation commands in the setup step.

Use the MCP `setup` response’s `welcome` text when available. Otherwise use the template in the intro guide. Keep paths, network rows, SDK choices, journals and protocol explanations out of this opening screen. Old notes about funding mean **Not checked** until current holdings are read.

For a concrete task already supplied, retain the heading and status panel and continue that task without making the user select a menu option again. After the introduction, read [AGENTS.md](AGENTS.md) and the relevant [tool-use guide](tools/SKILL.md) to carry out the chosen journey. A broad introductory question is not a selected trade or spending authorization.

This file is the installation entrypoint for the whole repository. Keep journey instructions in `AGENTS.md` and the supporting context files. Installing context does not configure tools, create an account, or authorize transactions.
