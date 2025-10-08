# Ticket & Issue Management Strategy  
> **Updated October 2025 — AI-Native Hybrid Archival Workflow**

This document defines the **hybrid archival strategy** for managing tasks, features, and bug fixes, ensuring:  

- A clean, maintainable repository  
- A rich and queryable knowledge base  
- Seamless linkage between local Markdown tickets and the GitHub issue tracker  

This process applies to **all contributors — human and AI**.

---

## 🧩 The Process Overview

The workflow consists of **three main phases**:  
**Creation → Association → Archival**

It is designed to be **simple**, **robust**, and **AI-friendly**.

---

### 1️⃣ Creation

- Every new task begins as a **local Markdown ticket** inside `.github/ISSUE/`.  
- Use a clear, descriptive filename:
**Example:** `ticket-enhance-helix-example.md`
- Each ticket must clearly define:
- Scope of work  
- Acceptance criteria  
- Relevant background or dependencies  

The Markdown ticket acts as the **primary brief** for the task and becomes part of the AI knowledge base.

---

### 2️⃣ Association (Manual or Automated)

Once the local ticket is created:

1. A **corresponding GitHub issue must be created.**
 - **Human contributors:** create it manually on GitHub.  
 - **AI agents:** use the automated command:

   ```bash
   npm run ai:create-gh-issue -- --file .github/ISSUE/<TICKET_ID>.md
   ```

2. After the issue is created, **add the GitHub issue number and URL** at the very top of the ticket file.

---

**Example:**

```markdown
# GitHub Issue: #1234
# https://github.com/neomjs/neo/issues/1234

# Ticket: Enhance Helix Example with Query-Driven Comments

**Assignee:** Gemini  
**Status:** Done  

## Description
Add intent-driven comments to the Helix example to improve AI discoverability.
