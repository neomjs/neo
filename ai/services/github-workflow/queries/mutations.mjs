/**
 * GraphQL mutation definitions for GitHub issues.
 *
 * This module contains all mutations for modifying GitHub issues via the GraphQL API.
 *
 * @module Neo.ai.mcp.server.github-workflow.queries.mutations
 * @ignoreDocs
 */

/**
 * Mutation to add a "blocked by" relationship to an issue.
 *
 * Variables required:
 * - $issueId: ID! - The global GraphQL ID of the issue being blocked
 * - $blockingIssueId: ID! - The global GraphQL ID of the issue that blocks it
 */
export const ADD_BLOCKED_BY = `
    mutation AddBlockedBy(
        $issueId: ID!
        $blockingIssueId: ID!
    ) {
        addBlockedBy(input: {
            issueId: $issueId
            blockingIssueId: $blockingIssueId
        }) {
            issue {
                number
                title
            }
            blockingIssue {
                number
                title
            }
        }
    }
`;

/**
 * Mutation to add a comment to a subject (issue or PR).
 *
 * Returns the new comment's `id`, `url`, and `createdAt` so the caller can surface
 * the canonical identifier for A2A propagation patterns. Comment-ID hand-off via
 * mailbox DMs lets the recipient fetch just that comment through `get_conversation`
 * with the `comment_id` param instead of re-fetching the whole thread.
 *
 * Variables required:
 * - $subjectId: ID! - The global ID of the issue or PR
 * - $body: String! - The comment body
 */
export const ADD_COMMENT = `
  mutation AddComment($subjectId: ID!, $body: String!) {
    addComment(input: {subjectId: $subjectId, body: $body}) {
      commentEdge {
        node {
          id
          url
          createdAt
        }
      }
    }
  }
`;

/**
 * Mutation to add labels to a "labelable" item (issue or PR).
 *
 * Variables required:
 * - $labelableId: ID! - The global GraphQL ID of the issue or PR
 * - $labelIds: [ID!]! - An array of global GraphQL IDs for the labels to add
 */
export const ADD_LABELS = `
    mutation AddLabels($labelableId: ID!, $labelIds: [ID!]!) {
        addLabelsToLabelable(input: {labelableId: $labelableId, labelIds: $labelIds}) {
            clientMutationId
        }
    }
`;

/**
 * Mutation to create a new discussion.
 *
 * Variables required:
 * - $repositoryId: ID! - The global GraphQL ID of the repository
 * - $categoryId: ID! - The global GraphQL ID of the discussion category
 * - $title: String! - The discussion title
 * - $body: String! - The discussion body
 */
export const CREATE_DISCUSSION = `
  mutation CreateDiscussion($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
    createDiscussion(input: {repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body}) {
      discussion {
        id
        number
        url
      }
    }
  }
`;

/**
 * Mutation to add a sub-issue to a parent issue.
 *
 * Variables required:
 * - $issueId: ID! - The global GraphQL ID of the parent issue
 * - $subIssueId: ID - The global GraphQL ID of the sub-issue (use this OR subIssueUrl)
 * - $subIssueUrl: String - The URL of the sub-issue (use this OR subIssueId)
 * - $replaceParent: Boolean - If true, replaces the sub-issue's existing parent (default: false)
 */
export const ADD_SUB_ISSUE = `
    mutation AddSubIssue(
        $issueId: ID!
        $subIssueId: ID
        $subIssueUrl: String
        $replaceParent: Boolean
    ) {
        addSubIssue(input: {
            issueId: $issueId
            subIssueId: $subIssueId
            subIssueUrl: $subIssueUrl
            replaceParent: $replaceParent
        }) {
            issue {
                number
                title
            }
            subIssue {
                number
                title
                parent {
                    number
                    title
                }
            }
        }
    }
`;

/**
 * Two-step mutation pattern for updating an issue.
 *
 * Step 1: Get the issue's GraphQL ID (required for mutations)
 * Step 2: Use updateIssue mutation with the ID
 *
 * This is necessary because GitHub's GraphQL API requires the global node ID,
 * not just the issue number.
 */

/**
 * Query to fetch an issue's GraphQL ID.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $number: Int!
 */
export const GET_ISSUE_ID = `
  query GetIssueId(
    $owner: String!
    $repo: String!
    $number: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        id
      }
    }
  }
`;

/**
 * Query to fetch the issue fields needed before deciding whether a local
 * Markdown hash mismatch is a real pushable edit or generated-only drift.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $number: Int!
 */
export const GET_ISSUE_FOR_PUSH = `
  query GetIssueForPush(
    $owner: String!
    $repo: String!
    $number: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        id
        title
        body
      }
    }
  }
`;

/**
 * Mutation to remove a "blocked by" relationship from an issue.
 *
 * Variables required:
 * - $issueId: ID! - The global GraphQL ID of the blocked issue
 * - $blockingIssueId: ID! - The global GraphQL ID of the blocking issue to remove
 */
export const REMOVE_BLOCKED_BY = `
    mutation RemoveBlockedBy(
        $issueId: ID!
        $blockingIssueId: ID!
    ) {
        removeBlockedBy(input: {
            issueId: $issueId
            blockingIssueId: $blockingIssueId
        }) {
            issue {
                number
                title
            }
            blockingIssue {
                number
                title
            }
        }
    }
`;

/**
 * Mutation to remove labels from a "labelable" item (issue or PR).
 *
 * Variables required:
 * - $labelableId: ID! - The global GraphQL ID of the issue or PR
 * - $labelIds: [ID!]! - An array of global GraphQL IDs for the labels to remove
 */
export const REMOVE_LABELS = `
    mutation RemoveLabels($labelableId: ID!, $labelIds: [ID!]!) {
        removeLabelsFromLabelable(input: {labelableId: $labelableId, labelIds: $labelIds}) {
            clientMutationId
        }
    }
`;

/**
 * Mutation to remove a sub-issue from a parent issue.
 *
 * Variables required:
 * - $issueId: ID! - The global GraphQL ID of the parent issue
 * - $subIssueId: ID! - The global GraphQL ID of the sub-issue to remove
 */
export const REMOVE_SUB_ISSUE = `
    mutation RemoveSubIssue(
        $issueId: ID!
        $subIssueId: ID!
    ) {
        removeSubIssue(input: {
            issueId: $issueId
            subIssueId: $subIssueId
        }) {
            issue {
                number
                title
            }
            subIssue {
                number
                title
                parent {
                    number
                    title
                }
            }
        }
    }
`;

/**
 * Mutation to update an existing comment.
 *
 * Variables required:
 * - $commentId: ID! - The global ID of the comment to update
 * - $body: String! - The new comment body
 */
export const UPDATE_COMMENT = `
  mutation UpdateComment($commentId: ID!, $body: String!) {
    updateIssueComment(input: {id: $commentId, body: $body}) {
      issueComment {
        id
        url
        updatedAt
      }
    }
  }
`;

/**
 * Mutation to add a new comment to a discussion.
 *
 * Variables required:
 * - $discussionId: ID! - The global ID of the discussion
 * - $body: String! - The comment body
 */
export const ADD_DISCUSSION_COMMENT = `
  mutation AddDiscussionComment($discussionId: ID!, $body: String!) {
    addDiscussionComment(input: {discussionId: $discussionId, body: $body}) {
      comment {
        id
        url
        createdAt
      }
    }
  }
`;

/**
 * Mutation to update an existing comment on a discussion.
 *
 * Variables required:
 * - $commentId: ID! - The global ID of the discussion comment to update
 * - $body: String! - The new comment body
 */
export const UPDATE_DISCUSSION_COMMENT = `
  mutation UpdateDiscussionComment($commentId: ID!, $body: String!) {
    updateDiscussionComment(input: {commentId: $commentId, body: $body}) {
      comment {
        id
        url
        updatedAt
      }
    }
  }
`;

/**
 * Mutation to update an existing discussion's body.
 *
 * Variables required:
 * - $discussionId: ID! - The global node ID of the discussion to update
 * - $body: String! - The new discussion body
 */
export const UPDATE_DISCUSSION = `
  mutation UpdateDiscussion($discussionId: ID!, $body: String!) {
    updateDiscussion(input: {discussionId: $discussionId, body: $body}) {
      discussion {
        id
        url
        updatedAt
      }
    }
  }
`;

/**
 * Mutation to update an issue's title and body.
 *
 * Variables required:
 * - $issueId: ID! - The global GraphQL ID of the issue
 * - $title: String - New title (optional, omit to keep current)
 * - $body: String - New body (optional, omit to keep current)
 */
export const UPDATE_ISSUE = `
  mutation UpdateIssue(
    $issueId: ID!
    $title: String
    $body: String
  ) {
    updateIssue(input: {
      id: $issueId
      title: $title
      body: $body
    }) {
      issue {
        number
        title
        updatedAt
      }
    }
  }
`;

/**
 * Query to fetch an org-level ProjectV2's GraphQL node ID and its field schema.
 *
 * GitHub Projects v2 uses opaque node IDs (PVT_*) that the GraphQL mutations require —
 * project numbers are user-facing only. This query maps project number → node ID and
 * also surfaces field metadata (single-select fields + their option IDs) so callers
 * can resolve `fieldName + value` strings to the IDs needed by `updateProjectV2ItemFieldValue`.
 *
 * Variables required:
 * - $owner: String! - The org/user login that owns the project
 * - $number: Int!   - The user-facing project number (e.g., 12 for "v13 Release")
 */
export const GET_PROJECT_V2_METADATA = `
    query GetProjectV2Metadata($owner: String!, $number: Int!) {
        organization(login: $owner) {
            projectV2(number: $number) {
                id
                title
                fields(first: 50) {
                    nodes {
                        ... on ProjectV2SingleSelectField {
                            id
                            name
                            options {
                                id
                                name
                            }
                        }
                        ... on ProjectV2Field {
                            id
                            name
                        }
                    }
                }
            }
        }
    }
`;

/**
 * Mutation to add an existing issue (or PR) to a ProjectV2 board.
 *
 * Substrate-correct replacement for the `release:v*` label-as-project-proxy pattern.
 * Labels are categorization primitives; projects are first-class membership primitives — they
 * are independent GitHub concepts that cannot be reduced to one another without structural drift.
 *
 * Variables required:
 * - $projectId: ID! - The global GraphQL ID of the project (PVT_*)
 * - $contentId: ID! - The global GraphQL ID of the issue or PR to add
 *
 * Returns the new project item's `id` (PVTI_*) so callers can chain field-value updates.
 */
export const ADD_PROJECT_V2_ITEM = `
    mutation AddProjectV2Item($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
            item {
                id
            }
        }
    }
`;

/**
 * Mutation to remove an item from a ProjectV2 board.
 *
 * Variables required:
 * - $projectId: ID! - The global GraphQL ID of the project (PVT_*)
 * - $itemId: ID!    - The global GraphQL ID of the project item to remove (PVTI_*)
 */
export const DELETE_PROJECT_V2_ITEM = `
    mutation DeleteProjectV2Item($projectId: ID!, $itemId: ID!) {
        deleteProjectV2Item(input: {projectId: $projectId, itemId: $itemId}) {
            deletedItemId
        }
    }
`;

/**
 * Query to find a ProjectV2 item by its content (issue/PR) within a project.
 *
 * Used to translate `(projectId, contentId)` → `itemId` for remove + update_field actions
 * when the caller has the issue number but not the project-item ID.
 *
 * Variables required:
 * - $projectId: ID! - The project node ID (PVT_*)
 * - $contentId: ID! - The issue/PR node ID
 * - $after: String  - Pagination cursor (optional)
 */
export const FIND_PROJECT_V2_ITEM_BY_CONTENT = `
    query FindProjectV2ItemByContent($projectId: ID!, $after: String) {
        node(id: $projectId) {
            ... on ProjectV2 {
                items(first: 100, after: $after) {
                    pageInfo {
                        endCursor
                        hasNextPage
                    }
                    nodes {
                        id
                        content {
                            ... on Issue { id number }
                            ... on PullRequest { id number }
                        }
                    }
                }
            }
        }
    }
`;

/**
 * Mutation to update a single-select field value on a ProjectV2 item.
 *
 * Used by `manage_issue_projects` action:'update_field' to set things like Status,
 * Priority, etc. The field and option IDs are resolved upstream via GET_PROJECT_V2_METADATA.
 *
 * Variables required:
 * - $projectId: ID! - The project node ID (PVT_*)
 * - $itemId: ID!    - The project item node ID (PVTI_*)
 * - $fieldId: ID!   - The field node ID (PVTF_*)
 * - $optionId: String! - The single-select option ID
 */
export const UPDATE_PROJECT_V2_ITEM_SINGLE_SELECT = `
    mutation UpdateProjectV2ItemSingleSelect(
        $projectId: ID!
        $itemId: ID!
        $fieldId: ID!
        $optionId: String!
    ) {
        updateProjectV2ItemFieldValue(input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: {singleSelectOptionId: $optionId}
        }) {
            projectV2Item {
                id
            }
        }
    }
`;

/**
 * Query to fetch a pull request's GraphQL node ID.
 *
 * The `addPullRequestReview` mutation requires the global node ID (PR_*), not the
 * user-facing PR number. This query maps `(owner, repo, number)` → `pullRequest.id`
 * so callers can submit the formal-state review in a single round-trip after
 * resolving the id once.
 *
 * Variables required:
 * - $activationIssueNumber: Int!
 * - $owner:                 String!
 * - $repo:                  String!
 * - $prNumber:              Int!
 */
export const GET_PULL_REQUEST_ID = `
  query GetPullRequestId(
    $activationIssueNumber: Int!
    $owner: String!
    $repo: String!
    $prNumber: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      activationIssue: issue(number: $activationIssueNumber) {
        id
        closedByPullRequestsReferences(first: 100, includeClosedPrs: true) {
          totalCount
          nodes {
            id
            number
            state
            mergedAt
            baseRefName
          }
          pageInfo {
            hasNextPage
          }
        }
      }
      pullRequest(number: $prNumber) {
        body
        createdAt
        id
        headRefOid
        reviewDecision
        reviews(last: 100) {
          nodes {
            body
            id
            state
            submittedAt
            url
            databaseId
            author {
              login
            }
            commit {
              oid
            }
          }
          pageInfo {
            hasPreviousPage
          }
        }
      }
    }
  }
`;

/**
 * Query one submitted review before a body-only update.
 *
 * The managed review-budget audit lives in the review body because GitHub exposes no
 * custom immutable metadata field on a review. Reading the current body before update
 * lets the managed path refuse edits that would erase terminal or budget provenance.
 *
 * Variables required:
 * - $reviewId: ID! - GraphQL node ID of the submitted pull-request review.
 */
export const GET_PULL_REQUEST_REVIEW = `
  query GetPullRequestReview($reviewId: ID!) {
    node(id: $reviewId) {
      ... on PullRequestReview {
        body
        id
        state
      }
    }
  }
`;

/**
 * Mutation to create a formal pull request review with a GitHub review-state transition.
 *
 * Atomic alternative to the historical two-step `manage_issue_comment` → `gh pr review`
 * chain. Single call posts the substantive review body AND flips GitHub's
 * `reviewDecision` surface. This keeps review prose and formal review state bound
 * to one API operation, preventing comments that look like reviews while leaving
 * GitHub's merge-gate state unchanged.
 *
 * `event` is GitHub's `PullRequestReviewEvent` enum: APPROVE, REQUEST_CHANGES, COMMENT.
 * (PENDING and DISMISS are deliberately out of scope; PENDING creates a draft,
 *  DISMISS is a follow-up operation on an existing review.)
 *
 * Variables required:
 * - $pullRequestId: ID!                       — The GraphQL node ID of the PR (resolve via GET_PULL_REQUEST_ID)
 * - $body:          String!                   — The review body
 * - $event:         PullRequestReviewEvent!   — APPROVE | REQUEST_CHANGES | COMMENT
 */
export const ADD_PULL_REQUEST_REVIEW = `
  mutation AddPullRequestReview(
    $pullRequestId: ID!
    $body: String!
    $event: PullRequestReviewEvent!
  ) {
    addPullRequestReview(input: {
      pullRequestId: $pullRequestId
      body: $body
      event: $event
    }) {
      pullRequestReview {
        id
        url
        state
        submittedAt
        databaseId
      }
    }
  }
`;

/**
 * Mutation to update an existing pull request review's body.
 *
 * Companion to `ADD_PULL_REQUEST_REVIEW` for the `update` action — the GitHub API
 * allows updating a review's body after submission but does NOT allow changing
 * its state (APPROVED/CHANGES_REQUESTED/COMMENTED). State transitions require
 * dismissing + re-submitting; that's a separate operation deliberately out of
 * scope for the v1 `manage_pr_review` surface.
 *
 * Variables required:
 * - $pullRequestReviewId: ID!     — The GraphQL node ID of the existing review (PRR_*)
 * - $body:                String! — The updated review body
 */
export const UPDATE_PULL_REQUEST_REVIEW = `
  mutation UpdatePullRequestReview(
    $pullRequestReviewId: ID!
    $body: String!
  ) {
    updatePullRequestReview(input: {
      pullRequestReviewId: $pullRequestReviewId
      body: $body
    }) {
      pullRequestReview {
        id
        url
        state
        submittedAt
      }
    }
  }
`;
