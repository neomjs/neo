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
            # We explicitly list event types to:
            # 1. Filter out noise (like automated bot comments or minor edits).
            # 2. Capture relationship changes (Sub-issues, Blocking) which do NOT reliably update
            #    the issue's top-level \`updatedAt\` timestamp on GitHub.
            itemTypes: [
              REFERENCED_EVENT,       # Commits mentioning the ticket
              CROSS_REFERENCED_EVENT, # Other issues/PRs mentioning the ticket
              LABELED_EVENT,          # Label changes
              UNLABELED_EVENT,        # Label removals
              ASSIGNED_EVENT,         # Assignee changes
              UNASSIGNED_EVENT,       # Assignee removals
              CLOSED_EVENT,           # Issue closed
              ISSUE_COMMENT,          # Comments
              REOPENED_EVENT,         # Issue reopened
              RENAMED_TITLE_EVENT,    # Title updates
              MILESTONED_EVENT,       # Added to milestone
              DEMILESTONED_EVENT,     # Removed from milestone

              # Relationship Events
              # Critical for sync: Adding/removing sub-issues does not always bump the parent's updatedAt.
              SUB_ISSUE_ADDED_EVENT,
              SUB_ISSUE_REMOVED_EVENT,
              PARENT_ISSUE_ADDED_EVENT,
              PARENT_ISSUE_REMOVED_EVENT,
              BLOCKED_BY_ADDED_EVENT,
              BLOCKING_ADDED_EVENT,
              BLOCKED_BY_REMOVED_EVENT,
              BLOCKING_REMOVED_EVENT
            ]) {
            # pageInfo enables continuation-fetching when an issue's timeline has outgrown
            # a single page of \`maxTimelineItems\`. Without this, tail events (including
            # newly-authored comments) are silently dropped once totalCount > first.
            pageInfo { hasNextPage endCursor }
            nodes {
              __typename
              ... on IssueComment {
                createdAt
                author { login }
                body
              }
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
              ... on ReopenedEvent {
                createdAt
                actor { login }
              }
              ... on RenamedTitleEvent {
                createdAt
                actor { login }
                previousTitle
                currentTitle
              }
              ... on MilestonedEvent {
                createdAt
                actor { login }
                milestoneTitle
              }
              ... on DemilestonedEvent {
                createdAt
                actor { login }
                milestoneTitle
              }
              ... on SubIssueAddedEvent {
                createdAt
                actor { login }
                subIssue { number }
              }
              ... on SubIssueRemovedEvent {
                createdAt
                actor { login }
                subIssue { number }
              }
              ... on ParentIssueAddedEvent {
                createdAt
                actor { login }
                parent { number }
              }
              ... on ParentIssueRemovedEvent {
                createdAt
                actor { login }
                parent { number }
              }
              ... on BlockedByAddedEvent {
                createdAt
                actor { login }
                blockingIssue { number }
              }
              ... on BlockingAddedEvent {
                createdAt
                actor { login }
                blockedIssue { number }
              }
              ... on BlockedByRemovedEvent {
                createdAt
                actor { login }
                blockingIssue { number }
              }
              ... on BlockingRemovedEvent {
                createdAt
                actor { login }
                blockedIssue { number }
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
 * Builds the optimized query for listing issues with minimal fields required by the Issue schema,
 * with or without the assignee `filterBy` argument.
 *
 * The no-filter variant exists because GitHub routes an issues connection carrying
 * `filterBy: {assignee: null}` through a stale, hours-lagged read path. Measured live on
 * 2026-07-22, #15603; ticket-ref-ok: measured-quirk evidence ledger): the same query with the null-valued argument returned an UPDATED_AT first
 * page frozen hours behind (a controlled assignment did not surface for 10+ minutes and prior
 * observations lagged 1.5h+), while the identical connection without `filterBy` returned the live
 * page — and `after: null` was exonerated as the trigger. An unfiltered list must therefore OMIT
 * the argument entirely. GraphQL has no conditional-argument mechanism and rejects unused declared
 * variables, so the two shapes are built from one selection source here.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $limit: Int!
 * - $cursor: String
 * - $states: [IssueState!]
 * - $assignee: String (filtered variant only)
 * - $maxLabels: Int!
 * - $maxAssignees: Int!
 *
 * `orderField` exists because freshness sweeps cannot use the UPDATED_AT default: an
 * updated-descending page buries an untouched fresh filing below older issues that merely
 * received recent activity (measured live 2026-07-22: 4 of the latest-20 filings displaced).
 * The duplicate-sweep evidence bar is creation order, so `CREATED_AT` is the sweep's field.
 *
 * @param {Object}  options
 * @param {Boolean} options.withAssigneeFilter Include `filterBy: {assignee: $assignee}` + its variable declaration.
 * @param {String} [options.orderField='UPDATED_AT'] GraphQL IssueOrderField — `UPDATED_AT` or `CREATED_AT`.
 * @returns {String} The GraphQL query text.
 */
export const buildIssuesListQuery = ({withAssigneeFilter, orderField = 'UPDATED_AT'}) => `
  query FetchIssuesList(
    $owner: String!
    $repo: String!
    $limit: Int!
    $cursor: String
    $states: [IssueState!]
    ${withAssigneeFilter ? '$assignee: String' : ''}
    $maxLabels: Int!
    $maxAssignees: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      issues(
        first: $limit
        after: $cursor
        states: $states
        ${withAssigneeFilter ? 'filterBy: {assignee: $assignee}' : ''}
        orderBy: {field: ${orderField}, direction: DESC}
      ) {
        totalCount
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
 * Issue listing filtered by assignee. See `buildIssuesListQuery` for why this constant must only
 * be used when an assignee filter is actually requested (#15603; ticket-ref-ok: measured-quirk evidence ledger).
 */
export const FETCH_ISSUES_LIST = buildIssuesListQuery({withAssigneeFilter: true});

/**
 * Issue listing WITHOUT the assignee `filterBy` argument — the live-read-path variant. Use
 * whenever no assignee filter is requested; an unfiltered call through `FETCH_ISSUES_LIST` is
 * served from GitHub's stale filtered-read path (measured 2026-07-22, #15603; ticket-ref-ok: measured-quirk evidence ledger).
 */
export const FETCH_ISSUES_LIST_NO_FILTER = buildIssuesListQuery({withAssigneeFilter: false});

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
 * - $maxSubIssues: Int!
 */
export const FETCH_SINGLE_ISSUE = `
  query FetchSingleIssue(
    $owner: String!
    $repo: String!
    $number: Int!
    $maxLabels: Int!
    $maxAssignees: Int!
    $maxSubIssues: Int!
    $maxTimelineItems: Int!
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
        timelineItems(
            first: $maxTimelineItems,
            # We explicitly list event types to:
            # 1. Filter out noise (like automated bot comments or minor edits).
            # 2. Capture relationship changes (Sub-issues, Blocking) which do NOT reliably update
            #    the issue's top-level \`updatedAt\` timestamp on GitHub.
            itemTypes: [
              REFERENCED_EVENT,       # Commits mentioning the ticket
              CROSS_REFERENCED_EVENT, # Other issues/PRs mentioning the ticket
              LABELED_EVENT,          # Label changes
              UNLABELED_EVENT,        # Label removals
              ASSIGNED_EVENT,         # Assignee changes
              UNASSIGNED_EVENT,       # Assignee removals
              CLOSED_EVENT,           # Issue closed
              ISSUE_COMMENT,          # Comments
              REOPENED_EVENT,         # Issue reopened
              RENAMED_TITLE_EVENT,    # Title updates
              MILESTONED_EVENT,       # Added to milestone
              DEMILESTONED_EVENT,     # Removed from milestone

              # Relationship Events
              # Critical for sync: Adding/removing sub-issues does not always bump the parent's updatedAt.
              SUB_ISSUE_ADDED_EVENT,
              SUB_ISSUE_REMOVED_EVENT,
              PARENT_ISSUE_ADDED_EVENT,
              PARENT_ISSUE_REMOVED_EVENT,
              BLOCKED_BY_ADDED_EVENT,
              BLOCKING_ADDED_EVENT,
              BLOCKED_BY_REMOVED_EVENT,
              BLOCKING_REMOVED_EVENT
            ]) {
            # pageInfo enables continuation-fetching for issues whose timeline has outgrown
            # a single page of \`maxTimelineItems\`. See FETCH_ISSUES_FOR_SYNC above for detail.
            pageInfo { hasNextPage endCursor }
            nodes {
              __typename
              ... on IssueComment {
                createdAt
                author { login }
                body
              }
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
              ... on ReopenedEvent {
                createdAt
                actor { login }
              }
              ... on RenamedTitleEvent {
                createdAt
                actor { login }
                previousTitle
                currentTitle
              }
              ... on MilestonedEvent {
                createdAt
                actor { login }
                milestoneTitle
              }
              ... on DemilestonedEvent {
                createdAt
                actor { login }
                milestoneTitle
              }
              ... on SubIssueAddedEvent {
                createdAt
                actor { login }
                subIssue { number }
              }
              ... on SubIssueRemovedEvent {
                createdAt
                actor { login }
                subIssue { number }
              }
              ... on ParentIssueAddedEvent {
                createdAt
                actor { login }
                parent { number }
              }
              ... on ParentIssueRemovedEvent {
                createdAt
                actor { login }
                parent { number }
              }
              ... on BlockedByAddedEvent {
                createdAt
                actor { login }
                blockingIssue { number }
              }
              ... on BlockingAddedEvent {
                createdAt
                actor { login }
                blockedIssue { number }
              }
              ... on BlockedByRemovedEvent {
                createdAt
                actor { login }
                blockingIssue { number }
              }
              ... on BlockingRemovedEvent {
                createdAt
                actor { login }
                blockedIssue { number }
              }
            }
          }
      }
    }
  }
`;

/**
 * Continuation query for a single issue's timelineItems connection.
 *
 * Used by IssueSyncer when an issue's timeline exceeds one page of \`maxTimelineItems\` —
 * i.e. \`FETCH_ISSUES_FOR_SYNC\` or \`FETCH_SINGLE_ISSUE\` returned \`pageInfo.hasNextPage: true\`.
 * Fetches only the next page of timeline events (no redundant issue metadata) keyed by the
 * cursor from the prior page.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $number: Int!
 * - $maxTimelineItems: Int!
 * - $cursor: String! - The endCursor from the previous page's pageInfo
 */
export const FETCH_ISSUE_TIMELINE_PAGE = `
  query FetchIssueTimelinePage(
    $owner: String!
    $repo: String!
    $number: Int!
    $maxTimelineItems: Int!
    $cursor: String!
  ) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        timelineItems(
          first: $maxTimelineItems,
          after: $cursor,
          itemTypes: [
            REFERENCED_EVENT,
            CROSS_REFERENCED_EVENT,
            LABELED_EVENT,
            UNLABELED_EVENT,
            ASSIGNED_EVENT,
            UNASSIGNED_EVENT,
            CLOSED_EVENT,
            ISSUE_COMMENT,
            REOPENED_EVENT,
            RENAMED_TITLE_EVENT,
            MILESTONED_EVENT,
            DEMILESTONED_EVENT,
            SUB_ISSUE_ADDED_EVENT,
            SUB_ISSUE_REMOVED_EVENT,
            PARENT_ISSUE_ADDED_EVENT,
            PARENT_ISSUE_REMOVED_EVENT,
            BLOCKED_BY_ADDED_EVENT,
            BLOCKING_ADDED_EVENT,
            BLOCKED_BY_REMOVED_EVENT,
            BLOCKING_REMOVED_EVENT
          ]
        ) {
          pageInfo { hasNextPage endCursor }
          nodes {
            __typename
            ... on IssueComment {
              createdAt
              author { login }
              body
            }
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
              actor { login }
              label { name }
            }
            ... on UnlabeledEvent {
              createdAt
              actor { login }
              label { name }
            }
            ... on AssignedEvent {
              createdAt
              actor { login }
              assignee { ... on User { login } }
            }
            ... on UnassignedEvent {
              createdAt
              actor { login }
              assignee { ... on User { login } }
            }
            ... on ClosedEvent {
              createdAt
              actor { login }
            }
            ... on ReopenedEvent {
              createdAt
              actor { login }
            }
            ... on RenamedTitleEvent {
              createdAt
              actor { login }
              previousTitle
              currentTitle
            }
            ... on MilestonedEvent {
              createdAt
              actor { login }
              milestoneTitle
            }
            ... on DemilestonedEvent {
              createdAt
              actor { login }
              milestoneTitle
            }
            ... on SubIssueAddedEvent {
              createdAt
              actor { login }
              subIssue { number }
            }
            ... on SubIssueRemovedEvent {
              createdAt
              actor { login }
              subIssue { number }
            }
            ... on ParentIssueAddedEvent {
              createdAt
              actor { login }
              parent { number }
            }
            ... on ParentIssueRemovedEvent {
              createdAt
              actor { login }
              parent { number }
            }
            ... on BlockedByAddedEvent {
              createdAt
              actor { login }
              blockingIssue { number }
            }
            ... on BlockingAddedEvent {
              createdAt
              actor { login }
              blockedIssue { number }
            }
            ... on BlockedByRemovedEvent {
              createdAt
              actor { login }
              blockingIssue { number }
            }
            ... on BlockingRemovedEvent {
              createdAt
              actor { login }
              blockedIssue { number }
            }
          }
        }
      }
    }
    rateLimit { cost remaining resetAt }
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
 * Fetches the GraphQL Labelable node ID for an issue and all labels in the repository.
 * This is a utility query used by mutations that add/remove labels.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $issueNumber: Int!
 * - $maxLabels: Int!
 */
export const GET_ISSUE_LABEL_IDS = `
    query GetIssueLabelIds($owner: String!, $repo: String!, $issueNumber: Int!, $maxLabels: Int!) {
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
 * Fetches the GraphQL Labelable node ID for a pull request and all labels in the repository.
 * This is a utility query used by mutations that add/remove labels.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $issueNumber: Int!
 * - $maxLabels: Int!
 */
export const GET_PULL_REQUEST_LABEL_IDS = `
    query GetPullRequestLabelIds($owner: String!, $repo: String!, $issueNumber: Int!, $maxLabels: Int!) {
        repository(owner: $owner, name: $repo) {
            pullRequest(number: $issueNumber) {
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

/**
 * @summary Fetches the current assignee logins for a single issue.
 *
 * Narrow query used by `manage_issue_assignees` as the precondition fetch step in the
 * precondition + post-verify gate. Distinct from `FETCH_SINGLE_ISSUE` which
 * also pulls timeline, sub-issues, blocking relationships — too heavy for a gate check.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $number: Int!
 * - $maxAssignees: Int!
 */
export const GET_ISSUE_ASSIGNEES = `
    query GetIssueAssignees($owner: String!, $repo: String!, $number: Int!, $maxAssignees: Int!) {
        repository(owner: $owner, name: $repo) {
            issue(number: $number) {
                assignees(first: $maxAssignees) {
                    nodes {
                        login
                    }
                }
            }
        }
    }
`;

/**
 * Query to fetch the full conversation for an issue.
 *
 * Issue-side twin of `pullRequestQueries.GET_CONVERSATION` — identical shape, querying the
 * `issue` field instead of `pullRequest`. Powers the `get_conversation` tool when the
 * caller supplies an `issue_number`.
 *
 * Variables required:
 * - $owner: String! - Repository owner
 * - $repo: String! - Repository name
 * - $issueNumber: Int! - The issue number
 * - $maxComments: Int! - Max comments to fetch
 */
export const GET_ISSUE_CONVERSATION = `
  query GetIssueConversation($owner: String!, $repo: String!, $issueNumber: Int!, $maxComments: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $issueNumber) {
        title
        body
        author {
          login
        }
        comments(first: $maxComments) {
          nodes {
            id
            databaseId
            author {
              login
            }
            body
            createdAt
          }
        }
      }
    }
  }
`;
