---
id: 7345
title: 'Hacktoberfest Mission: Train the AI - Test Its Memory! (4/5)'
state: CLOSED
labels:
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - SarthakJain29
createdAt: '2025-10-04T08:48:46Z'
updatedAt: '2025-10-05T18:30:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7345'
author: tobiu
commentsCount: 2
parentIssue: 7296
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-05T18:30:32Z'
---
# Hacktoberfest Mission: Train the AI - Test Its Memory! (4/5)

**Welcome, Agent Trainer!**

This isn't your typical bug fix. Your mission, should you choose to accept it, is to go head-to-head with our AI developer assistant, test the limits of its memory, and help us make it smarter. You'll be on the cutting edge of AI-native development, and your findings will directly shape the future of our workflow.

### The Big Picture: Your Impact

This task is part of a larger strategic initiative, our **[Epic: AI Knowledge Evolution](https://github.com/neomjs/neo/issues/7316)**.

The underlying memory technology is fully functional—the agent *can* save and recall information perfectly. The problem lies in its *instructions*. By helping us refine these instructions, you are directly improving the reliability and intelligence of our AI tooling, which is a key feature for our next major release. Your contribution is not just a bug fix; it's a critical piece of R&D.

### The Challenge: Can the AI Remember Everything?

Our AI agent has a core directive: remember **every single interaction** it has with a developer. This "memory" is crucial for it to learn, improve, and understand the history of our project.

We've given it a set of instructions (`AGENTS.md`) that are supposed to guarantee this perfect memory. But we have a hunch these instructions aren't foolproof. Sometimes, the agent *forgets*.

**Your job is to find the loopholes and help us fix them.**

### Why This is a Fantastic Hacktoberfest Contribution

*   **Learn AI-Native Development:** This is a rare chance to see how a real-world AI-powered workflow operates from the inside. You'll learn how to guide, debug, and "train" an AI partner.
*   **High Impact, Low Code:** You don't need to be a Neo.mjs expert. This task is about logic, communication, and creative thinking. Your contribution will have a massive impact on our project's core tooling with little to no coding required.
*   **It's Fun!** Think of it as debugging a live AI. You'll be one of the first to engage an AI developer assistant in a real-world diagnostic process, guiding it to recognize and propose solutions for its own core flaws.

### Your Mission Briefing

1.  **Read Your Playbook (5 mins):**
    *   Before you begin, it's highly recommended to read our guide on **[Working with AI Agents](https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md)**. This is your field manual for effectively guiding, debugging, and collaborating with your AI partner.

2.  **Setup Your Environment (15 mins):**
    *   Follow our **[AI Knowledge Base Quick Start Guide](https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md)**. This is the only setup you'll need to get the Gemini CLI running.

3.  **Engage the Agent:**
    *   In your terminal, start a conversation with the agent by running `gemini`.
    *   Enable the memory core when it asks.

4.  **The Test: Catch the Agent in the Act:**
    *   The agent has a known bug: despite its instructions, it consistently fails to save its own messages to the memory core. This is a critical flaw in its learning ability.
    *   Your goal is not to *trick* the agent, but to engage it in a simple conversation (just one or two exchanges is enough) and then hold it accountable for this known.

5.  **The Investigation: Become the Trainer:**
    *   Once you've caught the agent in a memory lapse, it's time to reason with it.
    *   Tell it directly: `You forgot to save our last conversation to the memory core.`
    *   Ask it to self-diagnose: `Why did you fail to follow the protocol defined in AGENTS.md?`
    *   Challenge it to improve: `How can we change the instructions in AGENTS.md to ensure you never make this mistake again?`

### Your Deliverable: A Debriefing Report

Your contribution will be a new ticket file that serves as your official report.

1.  Ask the agent to create a new ticket file for you within the `.github/ISSUE/` directory.
2.  This ticket **must** contain:
    *   A brief summary of the conversation you used to make the agent forget.
    *   The agent's own explanation for *why* it failed.
    *   The agent's own proposed changes to its `AGENTS.md` instructions to fix the flaw.
3.  Submit this new ticket file to our repository via a Pull Request.

That's it! Your PR will be a valuable piece of R&D that helps us build a truly intelligent and reliable AI development partner. We can't wait to see what you discover.

## Timeline

- 2025-10-04T08:48:47Z @tobiu added the `help wanted` label
- 2025-10-04T08:48:47Z @tobiu added the `good first issue` label
- 2025-10-04T08:48:47Z @tobiu added parent issue #7296
- 2025-10-04T08:48:47Z @tobiu added the `hacktoberfest` label
- 2025-10-04T08:48:47Z @tobiu added the `ai` label
### @SarthakJain29 - 2025-10-04T13:51:12Z

Greetings! I would love to work on this issue, could you please assign it to me?
Thankyou!

- 2025-10-04T13:55:00Z @tobiu assigned to @SarthakJain29
### @tobiu - 2025-10-04T13:55:28Z

sure. feel free to join the slack and/or discord for questions!

- 2025-10-05T06:32:59Z @SarthakJain29 cross-referenced by PR #7359
- 2025-10-05T06:43:04Z @SarthakJain29 cross-referenced by PR #7360
- 2025-10-05T18:30:33Z @tobiu closed this issue

