/**
 * GraphQL query definitions for GitHub Pull Requests.
 * @module Neo.ai.mcp.server.github-workflow.queries.pullRequestQueries
 * @ignoreDocs
 */

/**
 * Query to fetch the full conversation for a pull request.
 *
 * Variables required:
 * - $owner: String! - Repository owner
 * - $repo: String! - Repository name
 * - $prNumber: Int! - The pull request number
 * - $maxComments: Int! - Max comments to fetch
 */
export const GET_CONVERSATION = `
  query GetConversation($owner: String!, $repo: String!, $prNumber: Int!, $maxComments: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
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

/**
 * @summary Fetches every source-owned PR field needed for a merge-readiness observation.
 *
 * The caller executes this query twice around the branch-rules read and compares the normalized
 * payloads. `pageInfo` is part of the contract: either bounded connection truncating at 100 makes
 * the observation fail closed instead of silently treating the partial collection as complete.
 *
 * `reviews` is fetched with `last` rather than `first`, and that is the whole point of the field:
 * it feeds the approval ANCHOR — which commit earned `reviewDecision: APPROVED` — and only the most
 * recent approval can answer that. Fetching the oldest 100 would truncate away exactly the reviews
 * the question is about. `hasPreviousPage` is fetched to bound the connection and **deliberately
 * neither gates nor surfaces the APPROVAL ANCHOR**: an approval found inside the most-recent window
 * IS the latest one however many older reviews exist, so truncation cannot change the anchor.
 *
 * It DOES gate the cross-family mandate, and that is a later addition rather than an exception. The
 * mandate asks whether ANY approval came from a differing family, which is a question about the
 * whole population rather than the most recent member: a qualifying older approval can sit outside
 * the retained suffix. So a positive witness inside the window is decisive, while a negative over a
 * truncated connection is missing evidence rather than evidence of absence, and degrades to an
 * unresolved verdict the consumer fails closed on.
 *
 * The distinction is worth holding: the same flag is inert for one consumer and load-bearing for
 * another, because "the latest approval" and "any approval" are different questions over the same
 * bounded list. This paragraph used to say truncation could change no decision this query feeds —
 * true until the mandate became one of them.
 *
 * Variables required:
 * - $owner: String! - Repository owner
 * - $repo: String! - Repository name
 * - $prNumber: Int! - Pull request number
 */
export const GET_MERGE_READINESS = `
  query GetMergeReadiness($owner: String!, $repo: String!, $prNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        number
        state
        mergedAt
        baseRefName
        headRefOid
        mergeStateStatus
        reviewDecision
        body
        author {
          login
        }
        reviewRequests(first: 100) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            requestedReviewer {
              __typename
              ... on User {
                login
              }
              ... on Team {
                slug
                organization {
                  login
                }
              }
            }
          }
        }
        reviews(last: 100) {
          pageInfo {
            hasPreviousPage
          }
          nodes {
            state
            submittedAt
            author {
              login
            }
            commit {
              oid
            }
          }
        }
        commits(last: 1) {
          nodes {
            commit {
              oid
              statusCheckRollup {
                contexts(first: 100) {
                  totalCount
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                  nodes {
                    __typename
                    ... on CheckRun {
                      name
                      status
                      conclusion
                      detailsUrl
                      checkSuite {
                        app {
                          databaseId
                          slug
                        }
                        workflowRun {
                          databaseId
                          runNumber
                          runAttempt
                          workflow {
                            databaseId
                            name
                            resourcePath
                          }
                        }
                      }
                    }
                    ... on StatusContext {
                      context
                      state
                      targetUrl
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Query to fetch a list of pull requests.
 *
 * Variables required:
 * - $owner: String! - Repository owner
 * - $repo: String! - Repository name
 * - $limit: Int! - Number of PRs per page
 * - $states: [PullRequestState!] - Filter by state (e.g., [OPEN])
 */
export const FETCH_PULL_REQUESTS = `
  query ListPullRequests($owner: String!, $repo: String!, $limit: Int!, $states: [PullRequestState!]) {
    repository(owner: $owner, name: $repo) {
      pullRequests(first: $limit, states: $states, orderBy: {field: CREATED_AT, direction: DESC}) {
        nodes {
          number
          title
          url
          createdAt
          mergedAt
          baseRefName
          headRefOid
          mergeStateStatus
          reviewDecision
          author {
            login
          }
          state
          reviewRequests(first: 100) {
            pageInfo {
              hasNextPage
            }
            nodes {
              requestedReviewer {
                __typename
                ... on User {
                  login
                }
                ... on Team {
                  slug
                  organization {
                    login
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * @summary Builds one PR-board query with direct lookups for a validated believed-open coordinate.
 *
 * The default {@link FETCH_PULL_REQUESTS} string remains the source of the board selection. Each
 * believed number receives a deterministic GraphQL alias at the repository level, so the caller
 * can classify exact current state without inferring from the bounded board connection.
 *
 * @param {Number[]} believedOpen Prevalidated unique positive pull-request numbers.
 * @returns {{query: String, lookups: Array<{alias: String, number: Number}>}}
 */
export function buildPullRequestsWithBeliefQuery(believedOpen) {
    const lookups = believedOpen.map((number, index) => ({
        alias: `believedOpen${index}`,
        number
    }));

    if (lookups.length === 0) {
        return {
            query: FETCH_PULL_REQUESTS,
            lookups
        }
    }

    const selections = lookups.map(({alias, number}) => `
      ${alias}: pullRequest(number: ${number}) {
        number
        state
        mergedAt
      }`
    ).join('');

    return {
        query: FETCH_PULL_REQUESTS.replace(
            /\n    }\n  }\n\s*$/,
            `${selections}\n    }\n  }\n`
        ),
        lookups
    }
}

/**
 * @summary Search resolved pull requests for runtime history exploration.
 *
 * The search connection provides the outer resolved-PR census while each pull request includes
 * bounded first pages of issue comments and review bodies. `totalCount` + `pageInfo` make truncation explicit;
 * callers must continue incomplete child connections with {@link FETCH_PULL_REQUEST_HISTORY_CHILDREN}
 * before treating those legs as complete. Inline review comments are a distinct GitHub collection and are
 * exhausted by `PullRequestHistoryService` through the paginated REST review-comment endpoint.
 *
 * Variables required:
 * - $query: String! - GitHub search query containing the repository, resolution, and time window
 * - $limit: Int! - Number of resolved pull requests per search page
 * - $cursor: String - Search-page cursor
 * - $childLimit: Int! - Number of comments and reviews included with each pull request
 */
export const FETCH_RESOLVED_PULL_REQUESTS_FOR_HISTORY = `
  query FetchResolvedPullRequestsForHistory(
    $query: String!
    $limit: Int!
    $cursor: String
    $childLimit: Int!
  ) {
    search(query: $query, type: ISSUE, first: $limit, after: $cursor) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          number
          title
          body
          url
          state
          createdAt
          updatedAt
          closedAt
          mergedAt
          author {
            login
          }
          comments(first: $childLimit) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              author {
                login
              }
              body
              createdAt
              updatedAt
            }
          }
          reviews(first: $childLimit) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              author {
                login
              }
              body
              createdAt
              updatedAt
              submittedAt
              state
            }
          }
        }
      }
    }
  }
`;

/**
 * @summary Revalidate a resolved-PR census without re-fetching conversation bodies.
 *
 * The history service performs a second, independent pass after exhausting the evidence-bearing search.
 * Comparing these terminal revision fields detects result-set or resolution mutation while keeping the
 * verification pass substantially cheaper than repeating every comment and review connection.
 *
 * Variables required:
 * - $query: String! - GitHub search query containing the repository and time window
 * - $limit: Int! - Number of resolved pull requests per search page
 * - $cursor: String - Search-page cursor
 */
export const FETCH_RESOLVED_PULL_REQUEST_CENSUS_REVISION = `
  query FetchResolvedPullRequestCensusRevision(
    $query: String!
    $limit: Int!
    $cursor: String
  ) {
    search(query: $query, type: ISSUE, first: $limit, after: $cursor) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          number
          updatedAt
          closedAt
          mergedAt
        }
      }
    }
  }
`;

/**
 * @summary Continue the comment and review connections for one pull request.
 *
 * The two child cursors are independent so callers can exhaust either connection without assuming
 * that comments and reviews have equal depth. The pull request's `updatedAt` value lets the caller
 * detect conversation mutation while paginating and restart rather than synthesize mixed snapshots.
 *
 * Variables required:
 * - $owner: String! - Repository owner
 * - $repo: String! - Repository name
 * - $prNumber: Int! - Pull request number
 * - $childLimit: Int! - Number of comments and reviews per child page
 * - $commentsCursor: String - Comment-page cursor
 * - $reviewsCursor: String - Review-page cursor
 */
export const FETCH_PULL_REQUEST_HISTORY_CHILDREN = `
  query FetchPullRequestHistoryChildren(
    $owner: String!
    $repo: String!
    $prNumber: Int!
    $childLimit: Int!
    $commentsCursor: String
    $reviewsCursor: String
  ) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        updatedAt
        comments(first: $childLimit, after: $commentsCursor) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            author {
              login
            }
            body
            createdAt
            updatedAt
          }
        }
        reviews(first: $childLimit, after: $reviewsCursor) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            author {
              login
            }
            body
            createdAt
            updatedAt
            submittedAt
            state
          }
        }
      }
    }
  }
`;

/**
 * @summary Fetch release cuts used to resolve release-relative history windows.
 *
 * Variables required:
 * - $owner: String! - Repository owner
 * - $repo: String! - Repository name
 * - $limit: Int! - Number of releases per page
 * - $cursor: String - Release-page cursor
 */
export const FETCH_RELEASES_FOR_HISTORY = `
  query FetchReleasesForHistory(
    $owner: String!
    $repo: String!
    $limit: Int!
    $cursor: String
  ) {
    repository(owner: $owner, name: $repo) {
      releases(first: $limit, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          tagName
          publishedAt
          createdAt
          isDraft
          isPrerelease
        }
      }
    }
  }
`;

/**
 * Query to fetch pull requests for synchronization, including reviews and comments.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $limit: Int!
 * - $cursor: String
 * - $states: [PullRequestState!]
 * - $maxComments: Int!
 * - $maxReviews: Int!
 */
export const FETCH_PULL_REQUESTS_FOR_SYNC = `
  query FetchPullRequestsForSync(
    $owner: String!
    $repo: String!
    $limit: Int!
    $cursor: String
    $states: [PullRequestState!]
    $maxComments: Int!
    $maxReviews: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      pullRequests(
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
          updatedAt
          closedAt
          mergedAt
          url
          headRefName
          baseRefName

          author {
            login
          }

          comments(first: $maxComments) {
            nodes {
              createdAt
              author {
                login
              }
              body
            }
          }

          reviews(first: $maxReviews) {
            nodes {
              createdAt
              author {
                login
              }
              body
              state
            }
          }
        }
      }
    }
  }
`;

/**
 * @summary Single-PR variant of {@link FETCH_PULL_REQUESTS_FOR_SYNC} for the force-refetch path.
 *
 * Returns the identical sync node shape (body + comments + reviews + frontmatter fields) for ONE
 * pull request by number, bypassing the bulk delta-by-`updatedAt` gating so a known-stale local
 * mirror can be force-re-rendered from current GitHub state.
 *
 * Variables required:
 * - $owner: String!
 * - $repo: String!
 * - $prNumber: Int!
 * - $maxComments: Int!
 * - $maxReviews: Int!
 */
export const FETCH_SINGLE_PULL_FOR_SYNC = `
  query FetchSinglePullForSync(
    $owner: String!
    $repo: String!
    $prNumber: Int!
    $maxComments: Int!
    $maxReviews: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        number
        title
        body
        state
        createdAt
        updatedAt
        closedAt
        mergedAt
        url
        headRefName
        baseRefName

        author {
          login
        }

        comments(first: $maxComments) {
          nodes {
            createdAt
            author {
              login
            }
            body
          }
        }

        reviews(first: $maxReviews) {
          nodes {
            createdAt
            author {
              login
            }
            body
            state
          }
        }
      }
    }
  }
`;

/**
 * Query to get the global ID of a pull request.
 *
 * Variables required:
 * - $owner: String! - Repository owner
 * - $repo: String! - Repository name
 * - $prNumber: Int! - The pull request number
 */
export const GET_PULL_REQUEST_ID = `
  query GetPullRequestId($owner: String!, $repo: String!, $prNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        id
      }
    }
  }
`;
