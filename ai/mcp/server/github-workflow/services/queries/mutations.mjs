/**
 * GraphQL mutation definitions for GitHub issues.
 *
 * This module contains all mutations for modifying GitHub issues via the GraphQL API.
 *
 * @module Neo.ai.mcp.server.github-workflow.queries.mutations
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
