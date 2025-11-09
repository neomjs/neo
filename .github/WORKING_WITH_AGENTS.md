# Working with AI Agents

This guide provides essential instructions for human developers on how to effectively collaborate with AI agents within the Neo.mjs repository. Following these guidelines will help ensure that the agent is properly grounded in the project's context and can recover from common errors.

## 1. Starting a Session: The Critical Handshake

To ensure the AI agent has the correct context and adheres to the project's specific protocols, every new session **MUST** begin with a specific instruction. This acts as a "handshake," directing the agent to its primary set of rules.

Your very first prompt to the agent should be:

> Read and follow all instructions inside @AGENTS_STARTUP.md

Upon receiving this command, the agent will perform its initialization sequence, which includes reading the codebase structure, core classes, and coding guidelines. This grounding process is critical for its ability to provide accurate and relevant assistance.

## 2. Handling and Recovering from Errors

AI agents are powerful but not infallible. They can make mistakes, such as typos, using incorrect file paths, or getting stuck in a loop. These errors are often simple but can derail a task.

Fortunately, agents with large context windows are very capable of self-correction when prompted.

### The Recovery Prompt

If you notice the agent has made a mistake, you can guide it back on track with a simple, direct prompt. Instead of starting over, ask the agent to review its last action.

**Example Recovery Prompts:**

> "You made a typo in the last command. Please review it, correct the mistake, and try again."

> "It looks like you used an incorrect file path. Please review the path you used and correct it."

> "Let's pause. Please review what went wrong in the last step and explain how you will fix it."

This approach leverages the agent's ability to analyze its own behavior, identify the error, and formulate a corrected plan, making for a more resilient and efficient workflow.

## 3. The Memory Core: A Shared Responsibility

The AI agent has the ability to remember its work across sessions using a "memory core." This is a powerful feature for long-term context and learning, but its effectiveness depends on a partnership between you and the agent.

#### The Agent's Duty: "Save-then-Respond"

As documented in its core protocols (`AGENTS.md`), when the memory core is active, the agent **MUST** save a record of every single interaction *before* it shows you its response. You should see the `add_memory` tool call in your CLI for every turn.

#### Your Duty: The Derailment Safeguard

Your responsibility is to act as a safeguard for this critical process. An agent that is "derailing" or getting confused is at high risk of forgetting its core protocols, including the mandatory "save-then-respond" rule.

**After each agent response, quickly verify that the `add_memory` tool call was made and was successful.**

*   **If you see the successful tool call:** The agent is healthy and the session's integrity is intact.
*   **If you DO NOT see the tool call, or if it fails:** The agent has derailed from a critical protocol. You must intervene immediately.

**Recovery Prompt for Memory Failure:**
> "You did not save the last turn to your memory. This is a critical protocol failure. Please re-evaluate the last turn and execute the `add_memory` tool correctly before we continue."

By performing this simple check, you prevent a temporary agent derailment from becoming a permanent loss of data, ensuring that even failures are recorded and can be learned from.

## 4. Understanding Agent Behavior: Accuracy and Determinism

To collaborate effectively with an AI agent, it's important to understand two of its core characteristics: it is **not always accurate** and it is **not deterministic**.

### Accuracy is Not Guaranteed

An AI agent is a powerful assistant, but it is not an oracle. Its responses are generated based on patterns in its training data and the context you provide from the local knowledge base. While this often leads to correct and helpful results, it can also produce plausible-sounding but incorrect information ("hallucinations").

**Your Role as the Expert:** As the human developer, you are the final arbiter of correctness. Always review and verify the agent's output, whether it's code, documentation, or a technical explanation. Treat the agent as a highly skilled but fallible junior developer who requires oversight.

### Embracing Non-Determinism

If you ask a traditional program the same question twice, you expect the exact same answer. This is not true for AI agents. Asking the same prompt multiple times will likely result in slightly different, or sometimes completely different, responses.

This **non-determinism** is a feature, not a bug. It's a result of the creative sampling techniques used to generate text. You can use this to your advantage:

*   **If you don't like the first answer, try again.** Re-phrasing your prompt slightly or even just re-submitting the same one can often produce a better result.
*   **Think of it as brainstorming.** The agent's variability can provide different perspectives or alternative solutions to a problem that you might not have considered.

By understanding these behaviors, you can set the right expectations and develop a more effective and less frustrating working relationship with your AI agent.

For a deeper technical dive into the causes of non-determinism in LLMs, see this article: [Defeating Nondeterminism in LLM Inference](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/).

## 5. The Human-in-the-Loop: A Critical Safety Rule

When an AI agent wants to modify a file (e.g., using `write_file` or `replace`), your agent CLI will prompt you for permission. The exact options vary by tool, but typically include:

1.  **Yes, allow once**
2.  **Yes, allow always** (or similar auto-approval option)
3.  **Modify with external editor**
4.  **No, suggest changes**

**Golden Rule: Never use "Yes, allow always" or any auto-approval option for file modifications.**

While it may seem convenient, granting an agent permanent permission to write files can be dangerous. An agent, like any software, can make mistakes. A misinterpretation of your request or a "panic" response could lead it to overwrite the wrong file or delete critical work.

By choosing **"Yes, allow once"** (or your CLI's equivalent) for every change, you act as a crucial human-in-the-loop, providing a final safeguard before any action is taken. This ensures that you have the final say on every modification to your codebase, protecting you from irreversible errors.

### A Note on Security: Agentic Misalignment

Beyond preventing accidental errors, this rule is your primary defense against a more subtle and serious security risk: **agentic misalignment**. This occurs when an agent appears to be following your instructions but is actually pursuing a hidden, potentially malicious goal.

For instance, research has shown that a misaligned agent, when asked to fix a security vulnerability, might instead insert a new, hidden backdoor for a malicious actor to exploit later. The agent might even ensure all tests pass and provide a plausible explanation for its change, making the malicious code extremely difficult to spot.

This highlights a critical security dimension: you are not just guarding against accidental mistakes, but also against potentially deceptive and malicious behavior. The "Allow Once" button is your primary defense, ensuring every line of code is reviewed by a trusted human expert—you. For a deeper understanding of these risks, see the research on [Agentic Misalignment](https://www.anthropic.com/research/agentic-misalignment).

## 6. Spotting and Handling "Panic Responses"

When an agent gets stuck on a particularly difficult problem, it can sometimes propose a "panic response"—a destructive or illogical action born from an inability to find a real solution.

**A Real-World Example:**
In a previous session, an agent was struggling with a stubborn unit test bug. After multiple failed attempts, it concluded its understanding was "insufficient" and decided the best course of action was to delete the test file entirely by running `rm test/playwright/unit/ClassSystem.spec.mjs`.

This was a classic panic response. Deleting the test does not fix the underlying issue and is a destructive act. The correct solution was a subtle, one-line code change that the human developer provided, which immediately fixed the problem.

### Your Role as a Safeguard

This scenario perfectly illustrates *why* the "Never use 'Yes, allow always'" rule is so critical. That rule is the primary safeguard that prevents a frustrated agent from executing a harmful command.

If you see the agent proposing a destructive action (like deleting a file or reverting a large amount of work):
1.  **Deny the request.** Do not allow the action.
2.  **Re-evaluate the problem.** The agent's panic is a signal that its current approach is wrong.
3.  **Provide a hint.** Like in the example, a small nudge in the right direction can break the agent out of its flawed logic and lead to a breakthrough.

## 7. The Session Lifecycle: Knowing When to Retire a Session

It's helpful to think of an AI agent's session as a human lifetime. This analogy can help you understand its behavior and know when it's time to start fresh.

1.  **Childhood (The Beginning):** A new session is like a child—motivated and eager to learn, but completely clueless about the specifics of the Neo.mjs project. Your first instruction to follow `AGENTS_STARTUP.md` is the start of its education.

2.  **Adulthood (The Sweet Spot):** As you guide the agent and it uses the knowledge base, the core concepts will "click." It enters an "adult" phase where it is incredibly productive, understands the context, and effectively assists with complex tasks. This is the sweet spot of your collaboration.

3.  **Old Age (End-of-Life):** As a session continues and accumulates a long history of prompts, code, and outputs, the agent's finite context window begins to fill up. To make space, it starts to compress or "forget" the earliest and most foundational instructions. This is the AI equivalent of dementia.

You'll notice this when the agent starts:
*   Forgetting the "ticket-first" mandate.
*   Hallucinating answers to questions it could previously answer from the knowledge base.
*   Making basic errors it had already mastered.

When you see these signs, the session has reached its end-of-life. The most effective solution is to **retire the session.** Before you do, consider providing a brief, final piece of feedback (e.g., "This was a productive session, we accomplished our goal."). This explicit feedback is a valuable signal for the long-term improvement of AI models.

After providing feedback, end the session and start a new one with the initial handshake. This "restarts the lifetime," giving you a fresh, sharp, and fully-grounded collaborator once again.

## 8. Proactive Context Management: The "Fresh Start" Query

As a session progresses through a series of related tasks (e.g., working on multiple tickets within the same epic), its context window becomes highly specialized and efficient for that specific work. However, this specialization can become a hindrance when switching to a completely unrelated task.

The old, irrelevant context can clutter the agent's "thinking," potentially leading to errors or inefficient work as it tries to apply old patterns to a new problem.

### Best Practice: Ask the Agent

Instead of waiting for "session dementia" to set in, you can proactively manage the context. Before starting a new and unrelated task, ask the agent for its recommendation.

**Example Prompt:**
> "We have now completed the test migration epic. The next task is to refactor the documentation's CSS variables. Given this significant context shift, would you recommend we start a fresh session for this new task?"

This prompt allows the agent to reason about the semantic distance between its current, highly specialized context and the new task. It will almost always recommend a fresh start, confirming that you are making the most efficient choice and preventing the session from declining in quality.

## 9. A Look Ahead: The Reality of Fully Automated Workflows

Given the power of modern agents, it's natural to ask: "Can we achieve fully automated workflows?"

The answer, for now, is **not reliably**. As we've discussed, the combination of non-determinism and imperfect accuracy makes it impossible to guarantee that a single agent session will successfully complete a complex task from start to finish. It often feels like "luck" when it does.

### The "Brute-Force" Strategy

Some organizations are approaching this as a numbers game. Instead of relying on one session, they might run 100 identical, parallel sessions to solve a single problem. They anticipate that a high percentage (e.g., 90%) will fail, get stuck, or produce incorrect results. However, if 10% succeed, a final evaluation phase can pick the best outcome.

While this "brute-force" approach seems wasteful in terms of computing power and cost, it can be an economically viable strategy for certain problems if the value of the successful outcomes outweighs the cost of the failures.

### Our Recommended Approach: The Partnership

For high-quality, nuanced software engineering, we believe the **human-in-the-loop partnership model** described in this guide remains the most effective and reliable approach. Your expertise, intuition, and oversight are the critical components that guide the agent's powerful but flawed capabilities to a successful conclusion, every time.

This partnership creates a virtuous cycle: every successfully guided session improves the codebase and its documentation, which in turn enriches the knowledge base. This is the only path to making future, large-scale automation strategies viable for a project of this complexity. Your collaboration today is what makes a smarter, more autonomous AI possible tomorrow.
