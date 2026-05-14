const fs = require('fs');
const file = '.agents/skills/pr-review/references/pr-review-guide.md';
let content = fs.readFileSync(file, 'utf8');

const newAudit = `### 5.5 Ticket Assignment Audit

When reviewing a PR, you MUST audit the PR commits against **AGENTS.md §0 Invariant 7** (No tracked repository file modification without a self-assigned ticket).

**Audit Protocol:**
1. Fetch the associated target ticket(s) (e.g., from \`Resolves #N\`).
2. Verify that the PR author is explicitly assigned to the target ticket via GitHub assignees.
3. If the author is NOT assigned to the target ticket, or if there is no target ticket at all, flag as a **Required Action**:
   > *"PR commits violate AGENTS.md §0 Invariant 7. The author is not assigned to the target ticket #N (or no ticket exists). Required: Assign yourself to the ticket (or create and assign one) and ensure assignment pre-dates or matches the implementation phase."*

This enforces the global assignment gate at the peer-review level.
`;

content = content.replace('## 6. Review Template Selection', newAudit + '\n## 6. Review Template Selection');

fs.writeFileSync(file, content);
