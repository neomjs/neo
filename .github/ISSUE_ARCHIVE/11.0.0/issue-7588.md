---
id: 7588
title: Enhance Sync Result Payload with Comprehensive Statistics
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-21T07:55:29Z'
updatedAt: '2025-10-21T08:26:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7588'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-21T08:26:32Z'
---
# Enhance Sync Result Payload with Comprehensive Statistics

**Reported by:** @tobiu on 2025-10-21

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

The `runFullSync()` method currently returns minimal information (only the count
of pushed changes). For better observability and to help AI agents understand
what happened during a sync, the return payload should include comprehensive
statistics about all sync operations.

This requires updates to both the `SyncService` implementation and the OpenAPI
schema definition for the `sync_issues` tool.

## Current Behavior

**Service:**
```javascript
return {
    message: `Synchronization complete. Pushed ${pushedCount} local change(s).`
};
```

**OpenAPI Schema:**
```yaml
$ref: '#/components/schemas/SuccessResponse'  # Generic response
```

## Desired Behavior

**Service:**
```javascript
return {
    success: true,
    summary: "Synchronization complete",
    statistics: {
        pushed: {
            count: 2,
            issues: [1234, 1235]
        },
        pulled: {
            count: 15,
            created: 3,
            updated: 12,
            moved: 2,
            issues: [1230, 1231, ...]
        },
        dropped: {
            count: 1,
            issues: [999]
        },
        releases: {
            count: 5,
            synced: ['v11.0', 'v10.9', 'v10.8', 'v10.7', 'v10.6']
        }
    },
    timing: {
        startTime: "2025-10-21T10:00:00.000Z",
        endTime: "2025-10-21T10:02:30.000Z",
        durationMs: 150000
    }
};
```

**OpenAPI Schema:**
```yaml
# New dedicated response schema
$ref: '#/components/schemas/SyncIssuesResponse'
```

## Acceptance Criteria

### 1. Update OpenAPI Schema (`openapi.yaml`)

Add new schema to `components/schemas`:
```yaml
SyncIssuesResponse:
  type: object
  required:
    - success
    - summary
    - statistics
    - timing
  properties:
    success:
      type: boolean
      example: true
      description: Whether the sync operation completed successfully
    summary:
      type: string
      example: "Synchronization complete"
      description: Human-readable summary of the sync operation
    statistics:
      type: object
      required:
        - pushed
        - pulled
        - dropped
        - releases
      properties:
        pushed:
          type: object
          properties:
            count:
              type: integer
              example: 2
              description: Number of local changes pushed to GitHub
            issues:
              type: array
              items:
                type: integer
              example: [1234, 1235]
              description: Issue numbers that were pushed
        pulled:
          type: object
          properties:
            count:
              type: integer
              example: 15
              description: Total number of issues pulled from GitHub
            created:
              type: integer
              example: 3
              description: Number of new issues created locally
            updated:
              type: integer
              example: 12
              description: Number of existing issues updated locally
            moved:
              type: integer
              example: 2
              description: Number of issues moved between directories
            issues:
              type: array
              items:
                type: integer
              example: [1230, 1231, 1232]
              description: Issue numbers that were pulled
        dropped:
          type: object
          properties:
            count:
              type: integer
              example: 1
              description: Number of dropped issues removed locally
            issues:
              type: array
              items:
                type: integer
              example: [999]
              description: Issue numbers that were dropped
        releases:
          type: object
          properties:
            count:
              type: integer
              example: 5
              description: Number of release notes synced
            synced:
              type: array
              items:
                type: string
              example: ['v11.0', 'v10.9', 'v10.8']
              description: Release version tags that were synced
    timing:
      type: object
      required:
        - startTime
        - endTime
        - durationMs
      properties:
        startTime:
          type: string
          format: date-time
          example: "2025-10-21T10:00:00.000Z"
          description: ISO timestamp when sync started
        endTime:
          type: string
          format: date-time
          example: "2025-10-21T10:02:30.000Z"
          description: ISO timestamp when sync completed
        durationMs:
          type: integer
          example: 150000
          description: Total sync duration in milliseconds
```

Update the `/sync-issues` endpoint response:
```yaml
/sync-issues:
  post:
    # ... existing definition ...
    responses:
      '200':
        description: Synchronization process completed successfully.
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SyncIssuesResponse'  # Changed!
      '500':
        description: Internal server error during the sync process.
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ErrorResponse'
```

### 2. Update `SyncService.mjs`

**Update `#pullFromGitHub()`:**
- Track `created`, `updated`, and `moved` counts separately
- Return statistics object with these metrics
- Include list of affected issue numbers

**Update `#pushToGitHub()`:**
- Return statistics object instead of modifying metadata
- Include list of successfully pushed issue numbers
- Track any failed pushes separately (coordinates with ticket #TBD-track-failed-pushes)

**Update `#syncReleaseNotes()`:**
- Return object with count and list of synced release versions
- Example: `{ count: 5, synced: ['v11.0', 'v10.9', ...] }`

**Update `runFullSync()`:**
- Capture `startTime` before any operations
- Capture `endTime` after all operations complete
- Calculate `durationMs`
- Aggregate statistics from all sub-methods
- Return payload matching the OpenAPI schema
- Log a human-readable summary table

### 3. Add Summary Logging

At the end of `runFullSync()`, log a formatted summary:
```javascript
logger.info('✨ Sync Complete');
logger.info(`   Pushed:   ${stats.pushed.count} issues`);
logger.info(`   Pulled:   ${stats.pulled.count} issues (${stats.pulled.created} new, ${stats.pulled.updated} updated, ${stats.pulled.moved} moved)`);
logger.info(`   Dropped:  ${stats.dropped.count} issues`);
logger.info(`   Releases: ${stats.releases.count} synced`);
logger.info(`   Duration: ${Math.round(timing.durationMs / 1000)}s`);
```

## Benefits

- **API Contract:** OpenAPI schema documents the response structure for clients
- **Observability:** Clear insight into what changed during sync
- **Debugging:** Easy to identify if specific operations failed
- **Agent Context:** AI agents can make informed decisions based on detailed statistics
- **Audit Trail:** Statistics can be logged for historical analysis
- **Type Safety:** Schema validation ensures consistent responses

## Example Use Cases

**Agent workflow:**
```javascript
const result = await syncIssues();

// Check if new issues need triage
if (result.statistics.pulled.created > 0) {
    console.log(`New issues: ${result.statistics.pulled.created}`);
}

// Verify local changes were pushed
if (result.statistics.pushed.count === 0) {
    console.log('No local changes detected');
}

// Monitor sync performance
if (result.timing.durationMs > 300000) {
    console.warn('Sync took longer than 5 minutes');
}
```

**Human debugging:**
- "Why didn't my local edit sync?" → Check `statistics.pushed`
- "Did new PRs come in?" → Check `statistics.pulled.created`
- "Which releases were synced?" → Check `statistics.releases.synced`

