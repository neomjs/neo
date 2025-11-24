/**
 * GraphQL query definitions for GitHub issues.
 *
 * This module centralizes all issue-related GraphQL queries to keep the SyncService
 * clean and maintainable. Queries are exported as template literals for easy composition.
 *
 * IMPORTANT: Sub-issue queries require the header: GraphQL-Features: sub_issues
 *
 * @module Neo.ai.mcp.server.github-workflow.queries.issueQueries
 * @ignoreDocs
 */

/**
 * Comprehensive query to fetch issues with all nested data needed for sync.
 *
 * This query fetches:
 * - Basic issue metadata (number, title, state, dates, author)
 * - Labels, assignees, milestone
 * - All comments (with pagination support)
 * - Issue relationships (parent, sub-issues)
 *
 * The query uses pagination cursors to handle large result sets efficiently.
 *
 * Variables required:
 * - $owner: String! - Repository owner
 * - $repo: String! - Repository name
 * - $limit: Int! - Number of issues per page
 * - $cursor: String - Pagination cursor (null for first page)
 * - $states: [IssueState!] - Filter by state (e.g., [OPEN, CLOSED])
 * - $since: DateTime - Only fetch issues updated since this date
 * - $maxLabels: Int! - Max labels per issue
 * - $maxAssignees: Int! - Max assignees per issue
 * - $maxComments: Int! - Max comments per issue
 * - $maxSubIssues: Int! - Max sub-issues to fetch
 */
export const FETCH_ISSUES_FOR_SYNC = `
  query FetchIssuesForSync(
    $owner: String!
    $repo: String!
    $limit: Int!
    $cursor: String
    $states: [IssueState!]
    $since: DateTime
    $maxLabels: Int!
    $maxAssignees: Int!
    $maxComments: Int!
    $maxSubIssues: Int!
    $maxTimelineItems: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      issues(
        first: $limit
        after: $cursor
        states: $states
        orderBy: {field: UPDATED_AT, direction: DESC}
        filterBy: {since: $since}
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          number
          title
          body
          state
          createdAt
          updatedAt
          closedAt
          url
          
          author {
            login
          }
          
          labels(first: $maxLabels) {
            nodes {
              name
            }
          }
          
          assignees(first: $maxAssignees) {
            nodes {
              login
            }
          }
          
          milestone {
            title
          }
          
          comments(first: $maxComments) {
            nodes {
              author {
                login
              }
              body
              createdAt
            }
          }
          
          # Parent/child relationships
          parent {
            number
            title
          }
          
          subIssues(first: $maxSubIssues) {
            nodes {
              number
              title
              state
            }
          }
          
          subIssuesSummary {
            total
            completed
            percentCompleted
          }
          
          # Blocked-by relationships
          blockedBy(first: $maxSubIssues) {
            nodes {
              number
              title
              state
            }
          }
          
          blocking(first: $maxSubIssues) {
            nodes {
              number
              title
              state
            }
          }
          
          timelineItems(
            first: $maxTimelineItems,
            itemTypes: [
              REFERENCED_EVENT,       # Commits mentioning the ticket
              CROSS_REFERENCED_EVENT, # Other issues/PRs mentioning the ticket
              LABELED_EVENT,          # Label changes
              UNLABELED_EVENT,        # Label removals
              ASSIGNED_EVENT,         # Assignee changes
              UNASSIGNED_EVENT,       # Assignee removals
              CLOSED_EVENT,           # Issue closed
            ]) {
            nodes {
              __typename
              ... on ReferencedEvent {
                createdAt
                actor { login }
                commit { oid message }
              }
              ... on CrossReferencedEvent {
                createdAt
                actor { login }
                source { __typename ... on Issue { number } ... on PullRequest { number } }
              }
              ... on LabeledEvent {
                createdAt
                actor {
                  login
                }
                label {
                  name
                }
              }
              ... on UnlabeledEvent {
                createdAt
                actor {
                  login
                }
                label {
                  name
                }
              }
              ... on AssignedEvent {
                createdAt
                actor {
                  login
                }
                assignee {
                  ... on User {
                    login
                  }
                }
              }
              ... on UnassignedEvent {
                createdAt
                actor {
                  login
                }
                assignee {
                  ... on User {
                    login
                  }
                }
              }
              ... on ClosedEvent {
                createdAt
                actor {
                  login
                }
              }
            }
          }
        }
      }
    }
    
    # Monitor rate limit usage
    rateLimit {
      cost
      remaining
      resetAt
    }
  }
`;

/**
 * Optimized query for listing issues with minimal fields required by the Issue schema.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $limit: Int!
 * - $cursor: String
 * - $states: [IssueState!]
 * - $maxLabels: Int!
 * - $maxAssignees: Int!
 */
export const FETCH_ISSUES_LIST = `
  query FetchIssuesList(
    $owner: String!
    $repo: String!
    $limit: Int!
    $cursor: String
    $states: [IssueState!]
    $maxLabels: Int!
    $maxAssignees: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      issues(
        first: $limit
        after: $cursor
        states: $states
        orderBy: {field: UPDATED_AT, direction: DESC}
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          number
          title
          body
          state
          createdAt
          url
          
          author {
            login
          }
          
          labels(first: $maxLabels) {
            nodes {
              name
            }
          }
          
          assignees(first: $maxAssignees) {
            nodes {
              login
            }
          }
        }
      }
    }
  }
`;

/**
 * Simplified query for fetching a single issue's details.
 * Used for individual updates or debugging.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $number: Int!
 * - $maxLabels: Int!
 * - $maxAssignees: Int!
 * - $maxComments: Int!
 * - $maxSubIssues: Int!
 */
export const FETCH_SINGLE_ISSUE = `
  query FetchSingleIssue(
    $owner: String!
    $repo: String!
    $number: Int!
    $maxLabels: Int!
    $maxAssignees: Int!
    $maxComments: Int!
    $maxSubIssues: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        number
        title
        body
        state
        createdAt
        updatedAt
        closedAt
        url
        author {
          login
        }
        labels(first: $maxLabels) {
          nodes {
            name
          }
        }
        assignees(first: $maxAssignees) {
          nodes {
            login
          }
        }
        milestone {
          title
        }
        comments(first: $maxComments) {
          nodes {
            author {
              login
            }
            body
            createdAt
          }
        }
        parent {
          number
          title
        }
        subIssues(first: $maxSubIssues) {
          nodes {
            number
            title
            state
          }
        }
        subIssuesSummary {
          total
          completed
          percentCompleted
        }
        blockedBy(first: $maxSubIssues) {
          nodes {
            number
            title
            state
          }
        }
        blocking(first: $maxSubIssues) {
          nodes {
            number
            title
            state
          }
        }
      }
    }
  }
`;

/**
 * Query to get an issue's current blockedBy relationships.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $number: Int!
 */
export const GET_BLOCKED_BY = `
    query GetBlockedBy($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
            issue(number: $number) {
                blockedBy(first: 100) {
                    nodes {
                        id
                        number
                    }
                }
            }
        }
    }
`;

/**
 * Fetches the GraphQL node ID for an issue and all labels in the repository.
 * This is a utility query used by mutations that add/remove labels.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $issueNumber: Int!
 * - $maxLabels: Int!
 */
export const GET_ISSUE_AND_LABEL_IDS = `
    query GetIssueAndLabelIds($owner: String!, $repo: String!, $issueNumber: Int!, $maxLabels: Int!) {
        repository(owner: $owner, name: $repo) {
            issue(number: $issueNumber) {
                id
            }
            labels(first: $maxLabels) {
                nodes {
                    id
                    name
                }
            }
        }
    }
`;

/**
 * Query to get an issue's current parent relationship.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $number: Int!
 */
export const GET_ISSUE_PARENT = `
    query GetIssueParent($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
            issue(number: $number) {
                parent {
                    id
                    number
                }
            }
        }
    }
`;
