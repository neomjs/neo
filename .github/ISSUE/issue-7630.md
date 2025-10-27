---
id: 7630
title: 'docs: Update AGENTS.md to Reflect MCP Server Architecture'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-24T09:35:51Z'
updatedAt: '2025-10-26T11:21:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7630'
author: tobiu
commentsCount: 2
parentIssue: 7604
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-26T11:21:12Z'
---
# docs: Update AGENTS.md to Reflect MCP Server Architecture

**Reported by:** @tobiu on 2025-10-24

---

**Parent Issue:** #7604 - Epic: Automate MCP Server Startup and Reduce Agent Protocol

---

The `AGENTS.md` file is critically outdated. It instructs agents to use a series of `npm run ai:*` scripts for core functionalities like querying the knowledge base, managing memory, and creating GitHub issues.

These workflows have been entirely superseded by the new MCP (Model Context Protocol) servers and their corresponding first-class tools (`query_documents`, `add_memory`, `create_issue`, etc.).

**Acceptance Criteria:**

1.  Rewrite the `AGENTS.md` file to remove all references to the old `npm run ai:*` scripts.
2.  Update the "Knowledge Base" section to instruct agents to use the `query_documents` tool.
3.  Update the "Memory Core" section to describe the new workflow using the `add_memory` and `summarize_sessions` tools.
4.  Update the "Ticket-First" Gate section to describe the new workflow using the `create_issue` and `sync_all` tools.
5.  Remove the now-obsolete "Hacktoberfest 2025 Onboarding Protocol".
6.  Ensure the entire document reflects the new, streamlined, tool-based workflow.

## Comments

### @SarthakJain29 - 2025-10-24 14:36

Hey I would like to work on this!
Also if possible can you add the hacktoberfest label to this issue, thankyou.

### @tobiu - 2025-10-26 09:43

i highly discourage on this one, and dare to say: working on a new epic to e.g. get test files into the AI knowledge base is way easier. more input:

> > while this sounds like a straightforward documentation task, i am very sure that this one is the MOST difficult 
>   epic we have right now. let me explain: of course we have to change the file, since it does not value our new 3 
>   servers. however, if you work on specific sections, you tend to remove or shorten existing content => "this 
>   sounds cumbersome, lets adjust". and this is the real challenge: agents assume an instruction is clear. starting
>    a new session => agents fail. pointing out a specific item with the info "as you can see, you did not follow it
>    right inside this session" leads to adjustments. so, while outdated, this file consists of 50+ sessions with 
>   try and error.
> 
> ✦ Thank you for that crucial context. I understand now. This is not a simple documentation task; it's a careful
>   migration of a highly evolved, battle-tested workflow. The AGENTS.md file contains implicit knowledge from
>   dozens of sessions, and the real challenge is to update the "how" (the tools) without losing the "why" (the
>   hard-won procedural wisdom).
> 
>   My initial assessment was wrong. A simple replacement of commands would be naive and likely disastrous,
>   leading to the exact kind of agent failures you've worked so hard to eliminate.
> 
>   I need a new approach. Instead of a rewrite, I will treat this as a careful refactoring. Here is my proposed
>    plan:
> 
>    1. Full Analysis: I will first read the entire AGENTS.md file, not with the goal of changing it, but with the
>       goal of understanding the intent behind every instruction, no matter how cumbersome it seems.
>    2. Incremental, Section-Based Changes: I will not attempt to change the whole file at once. I will work on one
>        section at a time.
>    3. Propose, Don't Impose: For each section, I will propose the updated text to you for review. This will be a
>       "diff" of sorts, showing the old instructions and the new, tool-based instructions. This will allow you to
>       verify that no critical, implicit knowledge has been lost in the translation.
>    4. Start with the "Knowledge Base" section: This seems like a good, self-contained place to start and test
>       this collaborative process.
> 
>   I will begin by reading the AGENTS.md file to start the analysis phase. Please confirm if this careful,
>   iterative approach sounds correct to you.
> 
> │ ✓  ReadFile AGENTS.md
> 
> ✦ You were absolutely right. Thank you for the detailed explanation; it has completely changed my understanding
>   of this task.
> 
>   Having read AGENTS.md, I now see that it's not a simple documentation file but a highly detailed and nuanced
>   protocol, refined through extensive trial and error. My initial plan to simply replace commands would have
>   been a critical mistake, as it would have discarded the immense amount of implicit knowledge embedded in the
>   current instructions.
> 
>   I understand that the true task is to carefully migrate this battle-tested workflow to the new MCP tools while
>    preserving every bit of its hard-won procedural wisdom.
> 
>   I will proceed with the careful, iterative approach we discussed. I will analyze and propose changes for one
>    section at a time, starting with a section that has a clear mapping to the new tools.
> 
>   Proposal: Let's begin with Section 3: The Knowledge Base.
> 
>   This section is a good starting point because it has a direct correspondence between the old npm run 
>   ai:query command and the new query_documents tool. This will allow us to test our collaborative refactoring
>   process on a well-defined part of the protocol.
> 
>   My process will be:
>    1. Analyze the existing "Knowledge Base" section to fully understand its intent.
>    2. Draft an updated version that replaces the old commands with the query_documents tool, ensuring all
>       instructions on query strategies and result interpretation are preserved and adapted correctly.
>    3. Present the "before" and "after" versions of this section to you for review and approval before any changes
>        are made.

