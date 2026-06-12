---
id: 7777
title: Enhance `DocumentHead` addon to support multiple `ld+json` schemas
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-15T12:41:46Z'
updatedAt: '2025-11-15T12:51:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7777'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-15T12:51:55Z'
---
# Enhance `DocumentHead` addon to support multiple `ld+json` schemas

The `src/main/addon/DocumentHead.mjs` addon currently assumes only a single `<script type="application/ld+json">` tag exists in the document's head. This is evident in the `getLdJson` and `setLdJson` methods, which use `querySelector` to find and manipulate the script tag.

As seen in `apps/portal/index.html`, we now have multiple `ld+json` schemas (e.g., for the framework itself, for AI-native features, and an FAQ page). The current implementation cannot distinguish between them, leading to incorrect reading and writing of structured data.

This ticket proposes enhancing the `DocumentHead` addon to properly handle multiple `ld+json` schemas while maintaining backward compatibility.

**Proposed Changes:**

The `getLdJson` and `setLdJson` methods need to be updated to allow selecting a specific schema, probably via a `name` or `id`.

For example, in `apps/portal/index.html`, we could add a `data-schema-name` attribute:
```html
<script type="application/ld+json" data-schema-name="runtime-framework">
...
</script>
```

The addon methods would be updated:
- `getLdJson({name} = {})`:
    - If `name` is provided, retrieves the JSON from the script with the matching `data-schema-name`.
    - If `name` is not provided, it finds the first `application/ld+json` script and returns its content (maintaining backward compatibility).
- `setLdJson({name, value})`:
    - If `name` is provided, it updates or creates the script with the matching `data-schema-name`.
    - If `name` is not provided, it finds the first `application/ld+json` script and updates it, or creates a new one if none exists (maintaining backward compatibility).

The `update` method should also be adjusted to handle named schemas.

**Acceptance Criteria:**
- `DocumentHead` can read a specific `ld+json` schema by a unique identifier.
- `DocumentHead` can write to a specific `ld+json` schema by a unique identifier.
- `DocumentHead` can create a new, uniquely identified `ld+json` schema.
- When no identifier is provided, `getLdJson` and `setLdJson` default to the current behavior (find first or create).
- `apps/portal/index.html` is updated with unique identifiers for each `ld+json` script.

## Timeline

- 2025-11-15T12:41:48Z @tobiu added the `enhancement` label
- 2025-11-15T12:41:48Z @tobiu added the `ai` label
- 2025-11-15T12:42:06Z @tobiu assigned to @tobiu
- 2025-11-15T12:51:52Z @tobiu referenced in commit `d55c07e` - "Enhance DocumentHead addon to support multiple ld+json schemas #7777"
- 2025-11-15T12:51:55Z @tobiu closed this issue

