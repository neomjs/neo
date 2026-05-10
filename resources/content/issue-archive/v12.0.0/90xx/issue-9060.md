---
id: 9060
title: 'Fix: RecordFactory defaultValue prevents mapping execution'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-02-08T22:31:38Z'
updatedAt: '2026-02-08T22:53:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9060'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T22:53:42Z'
---
# Fix: RecordFactory defaultValue prevents mapping execution

`Neo.data.RecordFactory` has a logic flaw in `assignDefaultValues` where `defaultValue` assignment takes precedence over `mapping`.

**Current Logic:**
```javascript
if (Object.hasOwn(field, 'defaultValue')) {
    // ...
    if (data[fieldName] === undefined) {
        data[fieldName] = defaultValue; // Assigns default
    }
} else if (field.mapping) { // ELSE IF prevents mapping!
    // Mapping logic...
}
```

**Problem:**
If a field has both `defaultValue` and `mapping` (e.g. `{name: 'location', mapping: 'lc', defaultValue: null}`), and the raw data contains the mapped key (`lc`) but not the target key (`location`):
1.  `data['location']` is `undefined`.
2.  It enters the first `if`.
3.  It assigns `null` to `data['location']`.
4.  It **SKIPS** the `else if` block, so the mapping from `lc` never happens.

**Solution:**
The mapping logic must run *before* the default value check, or they must be decoupled so that mapping can populate the field first, and then the default value fills in only if it remains undefined.

## Timeline

- 2026-02-08T22:31:40Z @tobiu added the `bug` label
- 2026-02-08T22:31:40Z @tobiu added the `ai` label
- 2026-02-08T22:31:40Z @tobiu added the `core` label
- 2026-02-08T22:33:08Z @tobiu assigned to @tobiu
- 2026-02-08T22:53:38Z @tobiu referenced in commit `720605d` - "fix: RecordFactory defaultValue prevents mapping execution (#9060)"
- 2026-02-08T22:53:42Z @tobiu closed this issue

