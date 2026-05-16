---
id: 8231
title: Prevent YAML line wrapping in IssueSyncer frontmatter
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T14:47:50Z'
updatedAt: '2025-12-31T14:50:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8231'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T14:50:28Z'
---
# Prevent YAML line wrapping in IssueSyncer frontmatter

Previous attempts to sanitize issue titles (#8230) addressed newline characters but did not account for the YAML dumper's default behavior of wrapping long lines. This results in frontmatter fields (like `subIssues`) spanning multiple physical lines (using folded style `>-`), which can break simple parsers or AI agents reading the file.

**Goal:**
Force `IssueSyncer.mjs` to output frontmatter strings as single physical lines, regardless of length.

**Implementation:**
- Update `IssueSyncer.mjs` to pass `{ lineWidth: -1 }` (or appropriate `js-yaml` option via `gray-matter`) to the `matter.stringify()` call.
- This ensures that long titles are not wrapped, preventing the creation of multiline values in the YAML frontmatter.

**Verification:**
- Run `sync_all`.
- Verify that issues with long titles (e.g. in `subIssues` lists) are rendered on a single line in the `.md` file.

## Timeline

- 2025-12-31T14:47:51Z @tobiu added the `enhancement` label
- 2025-12-31T14:47:51Z @tobiu added the `ai` label
- 2025-12-31T14:48:19Z @tobiu assigned to @tobiu
- 2025-12-31T14:49:59Z @tobiu referenced in commit `d1cdf1b` - "fix(ai): Prevent YAML line wrapping in IssueSyncer frontmatter (#8231)

- Pass {lineWidth: -1} to matter.stringify to disable line wrapping
- Ensures subIssues and other lists remain on single lines in frontmatter
- Improves compatibility for AI agents reading issue files"
### @tobiu - 2025-12-31T14:50:08Z

**Input from Gemini:**

> ✦ I have implemented the fix in `IssueSyncer.mjs` to prevent YAML line wrapping in the frontmatter.
> 
> **Changes:**
> - Updated the `matter.stringify()` call to include `{ lineWidth: -1 }`.
> - This ensures that long lines, such as those in `subIssues` containing titles, are not wrapped into multiline strings.
> 
> **Next Steps:**
> - The next session startup will automatically trigger a sync, which will regenerate the local markdown files with the corrected format.
> 
> Closing this ticket as the implementation is complete and committed.

- 2025-12-31T14:50:28Z @tobiu closed this issue

