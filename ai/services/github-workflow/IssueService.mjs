import aiConfig          from '../../mcp/server/github-workflow/config.mjs';
import Base              from '../../../src/core/Base.mjs';
import GraphqlService    from './GraphqlService.mjs';
import RepositoryService from './RepositoryService.mjs';
import logger            from '../../mcp/server/github-workflow/logger.mjs';
import {projectConversationTrust} from './shared/conversationTrust.mjs';
import {exec}            from 'child_process';
import {promisify}       from 'util';
import {spawn}           from 'child_process';
import {GET_ISSUE_LABEL_IDS, GET_PULL_REQUEST_LABEL_IDS, GET_ISSUE_PARENT, GET_BLOCKED_BY, GET_ISSUE_ASSIGNEES, GET_ISSUE_CONVERSATION, FETCH_ISSUES_FOR_SYNC, FETCH_ISSUES_LIST} from './queries/issueQueries.mjs';
import {GET_PULL_REQUEST_ID} from './queries/pullRequestQueries.mjs';
import {
    ADD_LABELS,
    REMOVE_LABELS,
    ADD_SUB_ISSUE,
    REMOVE_SUB_ISSUE,
    ADD_BLOCKED_BY,
    REMOVE_BLOCKED_BY,
    GET_ISSUE_ID,
    ADD_COMMENT,
    UPDATE_COMMENT,
    GET_PROJECT_V2_METADATA,
    ADD_PROJECT_V2_ITEM,
    DELETE_PROJECT_V2_ITEM,
    FIND_PROJECT_V2_ITEM_BY_CONTENT,
    UPDATE_PROJECT_V2_ITEM_SINGLE_SELECT
} from './queries/mutations.mjs';

const execAsync = promisify(exec);

const AGENT_ICONS = {
    gemini : '✦',
    claude : '❋',
    gpt    : '●',
    default: '◆'
};

/**
 * @summary Service for interacting with GitHub issues via the GraphQL API.
 *
 * This service provides a high-level abstraction for managing GitHub issues.
 * Capabilities include:
 * - Listing issues with advanced filtering (state, labels, assignees)
 * - Creating, updating, and assigning issues
 * - Managing issue labels
 * - Handling issue relationships (parent-child, blocked-by) via custom GraphQL mutations
 * - Commenting on issues
 *
 * @class Neo.ai.services.github-workflow.IssueService
 * @extends Neo.core.Base
 * @singleton
 */
class IssueService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.IssueService'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.IssueService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String[]} writePermissions=['ADMIN', 'MAINTAIN', 'WRITE']
         * @protected
         */
        writePermissions: ['ADMIN', 'MAINTAIN', 'WRITE']
    }

    /**
     * Fetches the conversation (title, body, author, comments) for an issue.
     *
     * Issue-side twin of `PullRequestService.getConversation`. `get_conversation`
     * is a single dual-purpose tool; `toolService` routes here when the caller supplies
     * `issue_number`. The selector contract (`comment_id` > `since_comment_id` > `last_n` >
     * full) is identical to the PR path; only the GraphQL resource type differs.
     *
     * @param {Object} options
     * @param {Number} options.issue_number       The issue number (required).
     * @param {String} [options.comment_id]       Return only the matching comment; others elided. Issue title/body still returned.
     * @param {String} [options.since_comment_id] Return comments strictly after the matching comment (by createdAt order). Unknown id → empty comments.
     * @param {Number} [options.last_n]           Return only the last N comments (by createdAt order).
     * @returns {Promise<Object>} Conversation data (optionally filtered) or a structured error. Payloads
     *          are trust-projected: authored nodes carry `authorTrust`, untrusted-author bodies arrive
     *          defanged, and the root carries a `contentTrust` summary (see `shared/conversationTrust.mjs`).
     */
    async getConversation(options) {
        const {issue_number, comment_id, since_comment_id, last_n} = options || {};

        if (!issue_number) {
            return {
                error  : 'Bad Request',
                message: "Missing required argument: 'issue_number' is required.",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        const variables = {
            owner      : aiConfig.owner,
            repo       : aiConfig.repo,
            issueNumber: issue_number,
            // get_conversation is one dual-purpose tool; the issue path shares the PR
            // conversation comment cap rather than adding a separate config key.
            maxComments: aiConfig.pullRequest.maxCommentsPerPullRequest
        };

        try {
            const data = await GraphqlService.query(GET_ISSUE_CONVERSATION, variables);
            // Trust-project at the read boundary: every authored node gains `authorTrust`,
            // untrusted-author bodies are defanged, the root carries a `contentTrust` summary.
            // Applied before selector filtering so all return paths inherit projected nodes.
            const issue       = projectConversationTrust(data.repository.issue);
            const allComments = issue.comments?.nodes || [];

            // Selector precedence: comment_id > since_comment_id > last_n > full.
            let filtered;

            if (comment_id) {
                filtered = allComments.filter(c => c.id === comment_id);
            } else if (since_comment_id) {
                const anchorIdx = allComments.findIndex(c => c.id === since_comment_id);
                // Anchor not found → empty result set (mirrors the PR path).
                filtered = anchorIdx === -1 ? [] : allComments.slice(anchorIdx + 1);
            } else if (typeof last_n === 'number' && last_n > 0) {
                filtered = allComments.slice(-last_n);
            } else {
                // No selector — return the full conversation shape unchanged.
                return issue;
            }

            // Filtered paths preserve issue title/body/author; only comments are narrowed.
            return {
                ...issue,
                comments: {
                    ...issue.comments,
                    nodes: filtered
                }
            };
        } catch (error) {
            logger.error(`Error getting conversation for issue #${issue_number} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Adds labels to an issue or pull request.
     * @param {number}   issueNumber The number of the issue or PR.
     * @param {string[]} labels      An array of labels to add.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async addLabels(issueNumber, labels) {
        try {
            const { labelableId, labelIds } = await this.#getIds(issueNumber, labels);

            await GraphqlService.query(ADD_LABELS, { labelableId, labelIds });
            return { message: `Successfully added labels to issue #${issueNumber}` };
        } catch (error) {
            logger.error(`Error adding labels to issue #${issueNumber} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * @summary Assigns one or more users to a GitHub issue, or clears all assignees.
     *
     * Implements the precondition + post-verify gate for assignment changes. The
     * "single guarded MCP operation" semantics — one MCP call performs
     * fetch-current → enforce gate → mutate → re-fetch (post-verify) → return the verified
     * state. Internally chains multiple GitHub API calls; consumers see one response with
     * honest race-window semantics (NOT strict CAS across concurrent MCP server instances).
     *
     * **Gate behavior (add mode, non-empty assignees):**
     * - `requireUnassigned: true` (default) — if issue already has assignees, return
     *   `ASSIGNEE_CONFLICT` unless `acknowledgedReassign: '<reason>'` is provided.
     * - `acknowledgedReassign: '<reason>'` — strict-replacement override. Clears existing
     *   assignees, assigns the new set, posts an audit-trail comment on the issue
     *   capturing the reason in a GitHub-visible artifact.
     * - `requireUnassigned: false` — compatibility blind-add (no precondition gate). Provided
     *   for backward-compat; new callers should not rely on this.
     *
     * **Co-owner-add deferral:** V1 supports only
     * strict-replacement override; co-owner-add (`acknowledgedCoOwner`) deferred to V2.
     * Rationale: simultaneous co-authorship is virtually nonexistent in our swarm topology
     * due to git-conflict chaos; cross-family corrective-authorship is always a handoff,
     * never simultaneous co-ownership.
     *
     * **Clear mode (empty assignees):** unchanged — clearing is always safe (no
     * precondition needed); proceeds via `gh issue edit --remove-assignee ""`.
     *
     * @param {object}   options                       The options object
     * @param {number}   options.issue_number          The number of the issue to modify.
     * @param {string[]} options.assignees             Array of GitHub logins to assign, or empty array to clear all.
     * @param {boolean}  [options.requireUnassigned=true] Precondition gate — reject add if non-empty without `acknowledgedReassign`.
     * @param {string}   [options.acknowledgedReassign] Reason-bearing override for strict replacement; required when assignees are non-empty and `requireUnassigned: true`.
     * @returns {Promise<object>} Success message + `verifiedAssignees` (post-verify state), or structured error (e.g., `ASSIGNEE_CONFLICT` with `currentAssignees` + `attemptedAssignees` for caller introspection).
     */
    async assignIssue({issue_number, assignees, requireUnassigned = true, acknowledgedReassign}) {
        if (!await this.hasWritePermission()) {
            const message = [
                `Permission denied. Viewer has '${RepositoryService.viewerPermission}' permission, `,
                `but one of [${this.writePermissions.join(', ')}] is required to assign issues.`
            ].join('');

            logger.warn(message);
            return {
                error: 'Permission Denied',
                message,
                code : 'FORBIDDEN'
            };
        }

        try {
            // CLEAR MODE: empty assignees — no precondition needed; proceeds directly.
            if (!assignees || assignees.length === 0) {
                logger.info(`Attempting to unassign all users from issue #${issue_number}`);
                // Passing an empty string to --remove-assignee has been experimentally verified to clear all assignees.
                const command  = `gh issue edit ${issue_number} --remove-assignee "" --repo ${aiConfig.owner}/${aiConfig.repo}`;
                await execAsync(command);
                const message  = `Successfully unassigned all users from issue #${issue_number}`;
                logger.info(message);
                return {message};
            }

            // ADD MODE: precondition + post-verify gate.
            // Step 1 — precondition fetch: who is currently assigned?
            const currentAssignees = await this.#fetchCurrentAssignees(issue_number);

            // Step 2 — conflict gate: reject blind-add to occupied issue unless explicit override.
            if (currentAssignees.length > 0 && requireUnassigned && !acknowledgedReassign) {
                const conflictMessage = [
                    `Issue #${issue_number} is already assigned to [${currentAssignees.join(', ')}]. `,
                    `Default precondition (\`requireUnassigned: true\`) rejects blind-add. `,
                    `To override with strict replacement: pass \`acknowledgedReassign: '<reason>'\` (the reason will be persisted as an audit-trail comment on the issue per #11537 AC8). `,
                    `Co-owner-add (preserving existing assignees) is deferred to V2 per Discussion #11536 OQ3 resolution.`
                ].join('');
                logger.warn(`ASSIGNEE_CONFLICT on #${issue_number}: current=[${currentAssignees.join(',')}], attempted=[${assignees.join(',')}]`);
                return {
                    error             : 'Assignee Conflict',
                    message           : conflictMessage,
                    code              : 'ASSIGNEE_CONFLICT',
                    currentAssignees,
                    attemptedAssignees: assignees
                };
            }

            // Step 3 — strict-replacement override: clear existing first.
            const isOverride = currentAssignees.length > 0 && acknowledgedReassign;
            if (isOverride) {
                logger.info(`Strict-replacement override on #${issue_number} (reason: "${acknowledgedReassign}"): clearing existing [${currentAssignees.join(',')}] before assigning [${assignees.join(',')}]`);
                const clearCommand = `gh issue edit ${issue_number} --remove-assignee "" --repo ${aiConfig.owner}/${aiConfig.repo}`;
                await execAsync(clearCommand);
            }

            // Step 4 — mutate: add the new assignees.
            logger.info(`Attempting to assign issue #${issue_number} to: ${assignees.join(', ')}`);
            const assigneeFlags = assignees.map(a => `--add-assignee "${a}"`).join(' ');
            const command       = `gh issue edit ${issue_number} ${assigneeFlags} --repo ${aiConfig.owner}/${aiConfig.repo}`;
            await execAsync(command);

            // Step 5 — post-verify: re-fetch and confirm the resulting assignee state.
            const verifiedAssignees = await this.#fetchCurrentAssignees(issue_number);

            // Step 6 — audit-trail comment for overrides.
            // Persists the reason as a GitHub-visible artifact (issue comment); reason must NOT be lost.
            if (isOverride) {
                await this.#createReassignAuditComment(issue_number, currentAssignees, assignees, acknowledgedReassign);
            }

            const successMessage = isOverride
                ? `Successfully reassigned issue #${issue_number} to ${assignees.join(', ')} (strict-replacement override; previous: [${currentAssignees.join(', ')}])`
                : `Successfully assigned issue #${issue_number} to ${assignees.join(', ')}`;
            logger.info(successMessage);

            const result = {
                message: successMessage,
                verifiedAssignees
            };
            if (isOverride) {
                result.acknowledgedReassign = acknowledgedReassign;
                result.previousAssignees    = currentAssignees;
            }
            return result;

        } catch (error) {
            logger.error(`Error updating assignees for issue #${issue_number}:`, error);
            return {
                error  : 'GitHub CLI command failed',
                message: error.message,
                code   : 'GH_CLI_ERROR'
            };
        }
    }

    /**
     * @summary Fetches current assignee logins for the precondition + post-verify gate.
     * Narrow GraphQL query (vs `FETCH_SINGLE_ISSUE`'s heavy nested fetch).
     * @param {number} issueNumber
     * @returns {Promise<string[]>} Array of assignee logins (empty array if no assignees or issue missing).
     * @private
     */
    async #fetchCurrentAssignees(issueNumber) {
        const data = await GraphqlService.query(GET_ISSUE_ASSIGNEES, {
            owner       : aiConfig.owner,
            repo        : aiConfig.repo,
            number      : issueNumber,
            maxAssignees: aiConfig.issueSync.maxAssigneesPerIssue
        });
        return (data?.repository?.issue?.assignees?.nodes || []).map(n => n.login);
    }

    /**
     * @summary Persists an `acknowledgedReassign` reason as a GitHub-visible audit-trail comment.
     *
     * The reason must be persisted in a GitHub-visible artifact (issue comment),
     * not only transient event metadata. The comment becomes
     * graph-readable provenance via the Native Edge Graph + Retrospective daemon's
     * comment-ingestion path.
     *
     * Posts the comment via raw `ADD_COMMENT` (not via `createComment`) to avoid the
     * agent-attribution header (`**Input from <agent>:**`); the audit comment is system-
     * generated, not agent-authored.
     *
     * Comment failure does NOT roll back the assignee mutation — graceful degradation,
     * mirroring `createIssue`'s projectAttach partial-failure pattern. Audit-trail tests
     * verify both happy path + degradation path.
     *
     * @param {number}   issueNumber
     * @param {string[]} previousAssignees
     * @param {string[]} newAssignees
     * @param {string}   reason
     * @private
     */
    async #createReassignAuditComment(issueNumber, previousAssignees, newAssignees, reason) {
        const body = [
            `**\`[lane-override]\` reassignment audit-trail** (#11537 §AC8)`,
            ``,
            `**Previous assignees:** ${previousAssignees.map(u => `\`@${u}\``).join(', ')}`,
            `**New assignees:** ${newAssignees.map(u => `\`${u}\``).join(', ')}`,
            `**Reason:** ${reason}`,
            ``,
            `*Audit-trail per AGENTS.md §6.5 — \`acknowledgedReassign\` reason persistence. Graph-ingested via Retrospective daemon comment-scan path.*`
        ].join('\n');

        try {
            const issueNodeId = await this.getIssueNodeId(issueNumber);
            if (!issueNodeId) {
                logger.warn(`Could not resolve node ID for #${issueNumber}; audit-trail comment skipped.`);
                return;
            }
            await GraphqlService.query(ADD_COMMENT, {subjectId: issueNodeId, body});
            logger.info(`Posted reassign audit-trail comment on #${issueNumber}`);
        } catch (error) {
            logger.error(`Error posting reassign audit-trail comment on #${issueNumber} — assignee mutation already succeeded:`, error);
            // Graceful degradation: do not roll back the assignee mutation.
        }
    }

    /**
     * Creates a comment on a specific issue or pull request.
     * @param {object} options                The options object
     * @param {number} [options.issue_number] The number of the issue.
     * @param {number} [options.pr_number]    The number of the pull request.
     * @param {string} options.body           The raw content of the comment.
     * @param {string} options.agent          The identity of the calling agent.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async createComment({issue_number, pr_number, body, agent}) {
        // Input Validation
        if (issue_number && pr_number) {
            return {
                error: "Bad Request",
                message: "Please provide either 'pr_number' or 'issue_number', not both.",
                code: "INVALID_ARGUMENTS"
            };
        }
        if (!issue_number && !pr_number) {
            return {
                error: "Bad Request",
                message: "Missing required argument: Please provide 'pr_number' or 'issue_number'.",
                code: "MISSING_ARGUMENTS"
            };
        }

        const isPR = !!pr_number;
        const number = isPR ? pr_number : issue_number;
        const idVariables = {
            owner : aiConfig.owner,
            repo  : aiConfig.repo,
            // The PR query uses 'prNumber', the Issue query uses 'number'
            [isPR ? 'prNumber' : 'number']: number
        };

        // Agent Header Formatting
        const header       = `**Input from ${agent}:**\n\n`;
        const agentIcon    = AGENT_ICONS[this.getAgentType(agent)];
        const headingMatch = body.match(/^(#+\s*)(.*)$/);
        let processedBody;

        if (headingMatch) {
            const headingMarkers = headingMatch[1];
            const headingContent = headingMatch[2];
            processedBody = `${headingMarkers}${agentIcon} ${headingContent}\n${body.substring(headingMatch[0].length)}`;
        } else {
            processedBody = `${agentIcon} ${body}`;
        }

        const finalBody = `${header}${processedBody.split('\n').map(line => `> ${line}`).join('\n')}`;

        try {
            // Divergent ID Lookup
            const query = isPR ? GET_PULL_REQUEST_ID : GET_ISSUE_ID;
            const idData = await GraphqlService.query(query, idVariables);

            const subjectId = isPR
                ? idData.repository.pullRequest.id
                : idData.repository.issue.id;

            // Shared Mutation — capture response so we can surface the canonical comment
            // identifier. Enables the A2A propagation pattern: posting
            // a review comment returns the commentId, which the reviewer can then relay
            // via mailbox DM to the author; the author fetches just-this-comment via
            // `get_conversation({comment_id: ...})` instead of re-walking the whole thread.
            // Symmetric with `updateComment`'s existing `{commentId, url, updatedAt}` shape.
            const result = await GraphqlService.query(ADD_COMMENT, { subjectId, body: finalBody });
            const node   = result.addComment.commentEdge.node;

            return {
                message  : `Successfully created comment on ${isPR ? 'PR' : 'issue'} #${number}`,
                commentId: node.id,
                url      : node.url,
                createdAt: node.createdAt
            };

        } catch (error) {
            logger.error(`Error creating comment on ${isPR ? 'PR' : 'issue'} #${number} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Creates a new GitHub issue using the `gh` CLI, then optionally attaches it to ProjectV2 boards.
     *
     * **ProjectV2 membership atomicity:** When `projects` is non-empty, the issue is first created
     * via the CLI; on success, the issue's GraphQL node ID is fetched and each ProjectV2 attach
     * is chained via the `addProjectV2ItemById` mutation. Project-attach failures are surfaced
     * in the return payload as `projectAttachWarnings` but do NOT roll back the issue creation —
     * the issue exists on GitHub and partial-attach is the failure mode (graceful degradation
     * rather than orphaned creation rollback).
     *
     * This is the substrate-correct primitive that replaces the deprecated `release:v*`
     * label-as-project-proxy pattern. Labels and projects are independent first-class
     * GitHub primitives; the proxy pattern produces structural drift between them.
     *
     * @param {object}   options                       The options for creating the issue.
     * @param {string}   options.title                 The title of the issue.
     * @param {string}   [options.body='']             The Markdown body of the issue.
     * @param {string[]} [options.labels=[]]           An array of labels to add to the issue.
     * @param {string[]} [options.assignees=[]]        An array of user logins to assign. Use `@me`
     *     to assign the authenticated GitHub user.
     * @param {Array<{projectNumber: number}>} [options.projects=[]] An array of ProjectV2 memberships
     *     to attach atomically after issue creation. Each entry specifies the org-level project number.
     * @returns {Promise<object>} A promise that resolves to the new issue's data or a structured error.
     *     On success: `{ issueNumber, url, projectAttachments?: Array<{projectNumber, projectId, itemId}>, projectAttachWarnings?: Array<{projectNumber, error}> }`.
     */
    async createIssue({title, body='', labels=[], assignees=[], projects=[]}) {
        logger.info(`Attempting to create GitHub issue: "${title}"`);

        // Permission check is only required if we are trying to assign users.
        if (assignees && assignees.length > 0) {
            if (!await this.hasWritePermission()) {
                const message = [
                    `Permission denied. Viewer has '${RepositoryService.viewerPermission}' permission, `,
                    `but one of [${this.writePermissions.join(', ')}] is required to assign issues.`
                ].join('');

                logger.warn(message);
                return {
                    error: 'Permission Denied',
                    message,
                    code : 'FORBIDDEN'
                };
            }
        }

        const ghArgs = [
            'issue', 'create',
            '--title', title,
            '--body', body || 'No additional details provided.',
            '--repo', `${aiConfig.owner}/${aiConfig.repo}`
        ];

        if (labels && labels.length > 0) {
            labels.forEach(label => {
                ghArgs.push('--label', label);
            });
        }

        if (assignees && assignees.length > 0) {
            assignees.forEach(assignee => {
                ghArgs.push('--assignee', assignee);
            });
        }

        try {
            const ghProcess = spawn('gh', ghArgs);

            let stdout = '';
            let stderr = '';

            for await (const chunk of ghProcess.stdout) {
                stdout += chunk;
            }
            for await (const chunk of ghProcess.stderr) {
                stderr += chunk;
            }

            const exitCode = await new Promise(resolve => {
                ghProcess.on('close', resolve);
            });

            if (exitCode !== 0) {
                throw new Error(stderr || 'Failed to create GitHub issue.');
            }

            const issueUrl = stdout.trim();
            const issueNumber = parseInt(issueUrl.split('/').pop(), 10);

            if (!issueNumber) {
                throw new Error('Could not parse issue number from gh CLI output.');
            }

            logger.info(`Successfully created GitHub issue #${issueNumber}: ${issueUrl}`);

            const result = { issueNumber, url: issueUrl };

            // ProjectV2 attach (atomic for each project — partial-attach is acceptable failure mode)
            if (projects && projects.length > 0) {
                const attachResult = await this.attachIssueToProjects(issueNumber, projects);
                if (attachResult.attachments.length > 0) {
                    result.projectAttachments = attachResult.attachments;
                }
                if (attachResult.warnings.length > 0) {
                    result.projectAttachWarnings = attachResult.warnings;
                }
            }

            return result;

        } catch (error) {
            logger.error('Error creating GitHub issue:', error);
            return {
                error  : 'GitHub CLI command failed',
                message: error.message,
                code   : 'GH_CLI_ERROR'
            };
        }
    }

    /**
     * Resolves a project number to its GraphQL node ID + field metadata.
     *
     * GitHub Projects v2 mutations require opaque node IDs (`PVT_*`); the user-facing project
     * number is only valid for lookup queries. This helper caches per-call (no cross-call
     * caching — each invocation is one round-trip; if calling repeatedly for the same project
     * within a single high-level operation, prefer batching at the caller level).
     *
     * @param {number} projectNumber The org-level project number.
     * @returns {Promise<{projectId: string, title: string, fields: object[]}|{error, message, code}>}
     */
    async getProjectV2Metadata(projectNumber) {
        try {
            const result = await GraphqlService.query(GET_PROJECT_V2_METADATA, {
                owner : aiConfig.owner,
                number: projectNumber
            });

            const project = result.organization?.projectV2;
            if (!project) {
                return {
                    error  : 'Not Found',
                    message: `ProjectV2 #${projectNumber} not found under owner '${aiConfig.owner}'.`,
                    code   : 'PROJECT_NOT_FOUND'
                };
            }

            return {
                projectId: project.id,
                title    : project.title,
                fields   : project.fields?.nodes || []
            };
        } catch (error) {
            logger.error(`Error fetching ProjectV2 #${projectNumber} metadata:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Resolves an issue number to its GraphQL node ID.
     *
     * Used as a precursor to mutations requiring the global node ID (ProjectV2 attach,
     * sub-issue relationships, etc.). Mirrors the GET_ISSUE_ID two-step pattern used
     * elsewhere in this service.
     *
     * @param {number} issueNumber The issue number.
     * @returns {Promise<string|null>} The issue's GraphQL node ID, or `null` if not found.
     */
    async getIssueNodeId(issueNumber) {
        try {
            const result = await GraphqlService.query(GET_ISSUE_ID, {
                owner : aiConfig.owner,
                repo  : aiConfig.repo,
                number: issueNumber
            });
            return result.repository?.issue?.id || null;
        } catch (error) {
            logger.error(`Error fetching issue #${issueNumber} node ID:`, error);
            return null;
        }
    }

    /**
     * Attaches an issue to one or more ProjectV2 boards.
     *
     * Best-effort: each project attach is independent; failures are collected as warnings
     * rather than aborting the whole batch. This matches the createIssue contract that
     * partial-attach is acceptable (the issue exists; orphan-rollback is worse than
     * partial-attach for agent workflows).
     *
     * @param {number} issueNumber The issue to attach.
     * @param {Array<{projectNumber: number}>} projects The projects to attach to.
     * @returns {Promise<{attachments: Array<object>, warnings: Array<object>}>}
     */
    async attachIssueToProjects(issueNumber, projects) {
        const attachments = [];
        const warnings    = [];

        const contentId = await this.getIssueNodeId(issueNumber);
        if (!contentId) {
            warnings.push({
                projectNumber: null,
                error        : `Could not resolve GraphQL node ID for issue #${issueNumber}; skipping project attach.`
            });
            return { attachments, warnings };
        }

        for (const {projectNumber} of projects) {
            const metadata = await this.getProjectV2Metadata(projectNumber);
            if (metadata.error) {
                warnings.push({projectNumber, error: metadata.message});
                continue;
            }

            try {
                const result = await GraphqlService.query(ADD_PROJECT_V2_ITEM, {
                    projectId: metadata.projectId,
                    contentId
                });
                attachments.push({
                    projectNumber,
                    projectId: metadata.projectId,
                    itemId   : result.addProjectV2ItemById.item.id
                });
            } catch (error) {
                logger.error(`Error attaching issue #${issueNumber} to ProjectV2 #${projectNumber}:`, error);
                warnings.push({projectNumber, error: error.message});
            }
        }

        return { attachments, warnings };
    }

    /**
     * Unified entry point for adding/removing/updating an issue's ProjectV2 memberships.
     *
     * Mirror-shape of `manageIssueLabels` for the project-membership substrate. The substrate-correct
     * replacement for the deprecated `release:v*` label-as-project-membership-proxy pattern.
     *
     * **Action: 'add'** — Attaches the issue to one or more ProjectV2 boards.
     *   Requires `projectNumbers: number[]`.
     *
     * **Action: 'remove'** — Removes the issue from one or more ProjectV2 boards.
     *   Requires `projectNumbers: number[]`.
     *
     * **Action: 'update_field'** — Updates a single-select field value on the issue's project item.
     *   Requires `projectNumber: number`, `fieldName: string`, `value: string` (the option name).
     *
     * @param {object}   options                   The options object.
     * @param {number}   options.issue_number      The issue number to manage.
     * @param {string}   options.action            The action: 'add' | 'remove' | 'update_field'.
     * @param {number[]} [options.projectNumbers]  Required for 'add'/'remove'.
     * @param {number}   [options.projectNumber]   Required for 'update_field'.
     * @param {string}   [options.fieldName]       Required for 'update_field' (the field name, e.g., 'Status').
     * @param {string}   [options.value]           Required for 'update_field' (the single-select option name).
     * @returns {Promise<object>} Success message + per-project details, or structured error.
     */
    async manageIssueProjects({issue_number, action, projectNumbers, projectNumber, fieldName, value}) {
        if (!['add', 'remove', 'update_field'].includes(action)) {
            return {
                error  : 'Bad Request',
                message: "Invalid action. Must be 'add', 'remove', or 'update_field'.",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        if (action === 'add') {
            if (!Array.isArray(projectNumbers) || projectNumbers.length === 0) {
                return {
                    error  : 'Bad Request',
                    message: "Action 'add' requires non-empty `projectNumbers` array.",
                    code   : 'INVALID_ARGUMENTS'
                };
            }
            const projects = projectNumbers.map(n => ({projectNumber: n}));
            const result   = await this.attachIssueToProjects(issue_number, projects);
            return {
                message    : `Attempted to attach issue #${issue_number} to ${projects.length} project(s).`,
                attachments: result.attachments,
                warnings   : result.warnings
            };
        }

        if (action === 'remove') {
            if (!Array.isArray(projectNumbers) || projectNumbers.length === 0) {
                return {
                    error  : 'Bad Request',
                    message: "Action 'remove' requires non-empty `projectNumbers` array.",
                    code   : 'INVALID_ARGUMENTS'
                };
            }
            return this.detachIssueFromProjects(issue_number, projectNumbers);
        }

        // action === 'update_field'
        if (typeof projectNumber !== 'number' || !fieldName || !value) {
            return {
                error  : 'Bad Request',
                message: "Action 'update_field' requires `projectNumber` (integer), `fieldName` (string), and `value` (string).",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        return this.updateProjectV2ItemSingleSelect(issue_number, projectNumber, fieldName, value);
    }

    /**
     * Detaches an issue from one or more ProjectV2 boards.
     *
     * For each project, resolves projectId + itemId (the project-item ID, distinct from the
     * issue node ID), then calls `deleteProjectV2Item`. Per-project failures are collected as
     * warnings; the function returns the aggregate result.
     *
     * @param {number}   issueNumber    The issue to detach.
     * @param {number[]} projectNumbers The project numbers to detach from.
     * @returns {Promise<object>} Aggregate result with `removed` + `warnings` arrays.
     */
    async detachIssueFromProjects(issueNumber, projectNumbers) {
        const removed  = [];
        const warnings = [];

        const contentId = await this.getIssueNodeId(issueNumber);
        if (!contentId) {
            return {
                error  : 'Not Found',
                message: `Could not resolve GraphQL node ID for issue #${issueNumber}.`,
                code   : 'ISSUE_NOT_FOUND'
            };
        }

        for (const projectNumber of projectNumbers) {
            const metadata = await this.getProjectV2Metadata(projectNumber);
            if (metadata.error) {
                warnings.push({projectNumber, error: metadata.message});
                continue;
            }

            const itemId = await this.findProjectV2ItemId(metadata.projectId, contentId);
            if (!itemId) {
                warnings.push({
                    projectNumber,
                    error: `Issue #${issueNumber} is not currently a member of ProjectV2 #${projectNumber}.`
                });
                continue;
            }

            try {
                await GraphqlService.query(DELETE_PROJECT_V2_ITEM, {
                    projectId: metadata.projectId,
                    itemId
                });
                removed.push({projectNumber, itemId});
            } catch (error) {
                logger.error(`Error removing issue #${issueNumber} from ProjectV2 #${projectNumber}:`, error);
                warnings.push({projectNumber, error: error.message});
            }
        }

        return {
            message: `Attempted to remove issue #${issueNumber} from ${projectNumbers.length} project(s).`,
            removed,
            warnings
        };
    }

    /**
     * Updates a single-select field on the issue's ProjectV2 item.
     *
     * Resolves field/option IDs from the project's field schema (already fetched via metadata),
     * then calls `updateProjectV2ItemFieldValue` with the single-select option ID.
     *
     * @param {number} issueNumber   The issue.
     * @param {number} projectNumber The project number containing the item.
     * @param {string} fieldName     The single-select field name (e.g., 'Status').
     * @param {string} value         The option name (e.g., 'In Progress').
     * @returns {Promise<object>} Success or structured error.
     */
    async updateProjectV2ItemSingleSelect(issueNumber, projectNumber, fieldName, value) {
        const contentId = await this.getIssueNodeId(issueNumber);
        if (!contentId) {
            return {
                error  : 'Not Found',
                message: `Could not resolve GraphQL node ID for issue #${issueNumber}.`,
                code   : 'ISSUE_NOT_FOUND'
            };
        }

        const metadata = await this.getProjectV2Metadata(projectNumber);
        if (metadata.error) {
            return metadata;
        }

        const field = metadata.fields.find(f => f?.name === fieldName);
        if (!field) {
            return {
                error  : 'Not Found',
                message: `Field '${fieldName}' not found on ProjectV2 #${projectNumber}.`,
                code   : 'FIELD_NOT_FOUND'
            };
        }

        if (!Array.isArray(field.options)) {
            return {
                error  : 'Bad Request',
                message: `Field '${fieldName}' on ProjectV2 #${projectNumber} is not a single-select field; update_field only supports single-select fields in this revision.`,
                code   : 'UNSUPPORTED_FIELD_TYPE'
            };
        }

        const option = field.options.find(o => o.name === value);
        if (!option) {
            return {
                error  : 'Not Found',
                message: `Option '${value}' not found on field '${fieldName}' of ProjectV2 #${projectNumber}. Available: [${field.options.map(o => o.name).join(', ')}].`,
                code   : 'OPTION_NOT_FOUND'
            };
        }

        const itemId = await this.findProjectV2ItemId(metadata.projectId, contentId);
        if (!itemId) {
            return {
                error  : 'Not Found',
                message: `Issue #${issueNumber} is not currently a member of ProjectV2 #${projectNumber}; add it first via action:'add'.`,
                code   : 'ITEM_NOT_FOUND'
            };
        }

        try {
            await GraphqlService.query(UPDATE_PROJECT_V2_ITEM_SINGLE_SELECT, {
                projectId: metadata.projectId,
                itemId,
                fieldId  : field.id,
                optionId : option.id
            });
            return {
                message: `Set field '${fieldName}' to '${value}' for issue #${issueNumber} on ProjectV2 #${projectNumber}.`,
                projectId: metadata.projectId,
                itemId,
                fieldId  : field.id,
                optionId : option.id
            };
        } catch (error) {
            logger.error(`Error updating field on ProjectV2 #${projectNumber} item:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Finds the project-item ID (PVTI_*) for an issue's membership in a ProjectV2 board.
     *
     * Paginated forward-search through project items, matching by content node ID. The cost
     * is bounded by the project's item count and is amortized in practice because most agents
     * resolve a small number of memberships per turn.
     *
     * @param {string} projectId The project node ID (PVT_*).
     * @param {string} contentId The issue/PR node ID (`getIssueNodeId` result).
     * @returns {Promise<string|null>} The project-item ID, or `null` if not a member.
     */
    async findProjectV2ItemId(projectId, contentId) {
        let after = null;
        do {
            try {
                const result = await GraphqlService.query(FIND_PROJECT_V2_ITEM_BY_CONTENT, {
                    projectId,
                    after
                });
                const page = result.node?.items;
                if (!page) {
                    return null;
                }
                const hit = page.nodes.find(n => n.content?.id === contentId);
                if (hit) {
                    return hit.id;
                }
                if (!page.pageInfo.hasNextPage) {
                    return null;
                }
                after = page.pageInfo.endCursor;
            } catch (error) {
                logger.error(`Error scanning ProjectV2 items for content match:`, error);
                return null;
            }
        } while (after);
        return null;
    }

    /**
     * Extracts the agent type from the agent string for icon selection.
     * @param {string} agent The full agent identifier
     * @returns {string} The agent type key for AGENT_ICONS lookup
     */
    getAgentType(agent) {
        const agentLower = agent.toLowerCase();

        if (agentLower.includes('gemini')) return 'gemini';
        if (agentLower.includes('claude')) return 'claude';
        if (agentLower.includes('gpt'))    return 'gpt';

        return 'default';
    }

    /**
     * Convenience shortcut
     * @returns {Promise<Boolean>}
     */
    async hasWritePermission() {
        const {permission} = await RepositoryService.getViewerPermission();
        return this.writePermissions.includes(permission);
    }

    /**
     * @summary Consolidates assignee management into a single method.
     *
     * For `action: 'add'`, delegates to `assignIssue` which enforces the precondition
     * + post-verify gate: `requireUnassigned: true` default + reason-bearing
     * `acknowledgedReassign` override + audit-trail comment persistence.
     *
     * @param {object}   options                       The options object
     * @param {number}   options.issue_number          The number of the issue to modify.
     * @param {string[]} options.assignees             An array of GitHub user logins to assign/unassign.
     * @param {string}   options.action                The action to perform: 'add' or 'remove'.
     * @param {boolean}  [options.requireUnassigned=true] Precondition gate for `action: 'add'` — reject if non-empty without `acknowledgedReassign`.
     * @param {string}   [options.acknowledgedReassign] Reason-bearing override for `action: 'add'`; strict-replacement.
     * @returns {Promise<object>}
     */
    async manageIssueAssignees({issue_number, assignees, action, requireUnassigned, acknowledgedReassign}) {
        if (!['add', 'remove'].includes(action)) {
            return {
                error: 'Bad Request',
                message: "Invalid action. Must be 'add' or 'remove'.",
                code: 'INVALID_ARGUMENTS'
            };
        }

        if (action === 'add') {
            return this.assignIssue({issue_number, assignees, requireUnassigned, acknowledgedReassign});
        } else {
            return this.unassignIssue({issue_number, assignees});
        }
    }

    /**
     * Consolidates comment management into a single method.
     * @param {object} options                The options object
     * @param {number} [options.issue_number] The number of the issue (required for create).
     * @param {number} [options.pr_number]    The number of the pull request (required for create if issue_number omitted).
     * @param {string} [options.comment_id]   The global node ID of the comment (required for update).
     * @param {string} options.body           The content of the comment.
     * @param {string} [options.agent]        The identity of the calling agent (required for create).
     * @param {string} options.action         The action to perform: 'create' or 'update'.
     * @returns {Promise<object>}
     */
    async manageIssueComment({issue_number, pr_number, comment_id, body, agent, action}) {
        if (!['create', 'update'].includes(action)) {
            return {
                error: 'Bad Request',
                message: "Invalid action. Must be 'create' or 'update'.",
                code: 'INVALID_ARGUMENTS'
            };
        }

        if (action === 'create') {
            if (!agent) {
                return {
                    error: 'Bad Request',
                    message: "Missing required argument: 'agent' is required for creating comments.",
                    code: 'MISSING_ARGUMENTS'
                };
            }
            return this.createComment({issue_number, pr_number, body, agent});
        } else {
            if (!comment_id) {
                return {
                    error: 'Bad Request',
                    message: "Missing required argument: 'comment_id' is required for updating comments.",
                    code: 'MISSING_ARGUMENTS'
                };
            }
            return this.updateComment(comment_id, body);
        }
    }

    /**
     * Consolidates label management into a single method.
     * @param {object}   options              The options object
     * @param {number}   options.issue_number The number of the issue or PR.
     * @param {string[]} options.labels       An array of labels to add or remove.
     * @param {string}   options.action       The action to perform: 'add' or 'remove'.
     * @returns {Promise<object>}
     */
    async manageIssueLabels({issue_number, labels, action}) {
        if (!['add', 'remove'].includes(action)) {
            return {
                error: 'Bad Request',
                message: "Invalid action. Must be 'add' or 'remove'.",
                code: 'INVALID_ARGUMENTS'
            };
        }

        if (action === 'add') {
            return this.addLabels(issue_number, labels);
        } else {
            return this.removeLabels(issue_number, labels);
        }
    }

    /**
     * Removes one or more specified assignees from a GitHub issue.
     * This method first verifies that the user has the required permissions (`WRITE`, `MAINTAIN`, or `ADMIN`)
     * before attempting to modify the issue.
     * @param {object}   options              The options object
     * @param {number}   options.issue_number The number of the issue to modify.
     * @param {string[]} options.assignees    An array of GitHub user logins to unassign.
     * @returns {Promise<object>}
     */
    async unassignIssue({issue_number, assignees}) {
        if (!await this.hasWritePermission()) {
            const message = [
                `Permission denied. Viewer has '${RepositoryService.viewerPermission}' permission, `,
                `but one of [${this.writePermissions.join(', ')}] is required to unassign issues.`
            ].join('');

            logger.warn(message);
            return {
                error  : 'Permission Denied',
                message,
                code   : 'FORBIDDEN'
            };
        }

        if (!assignees || assignees.length === 0) {
            return {
                error  : 'Bad Request',
                message: 'The `assignees` array cannot be empty for an unassign operation.',
                code   : 'BAD_REQUEST'
            };
        }

        logger.info(`Attempting to unassign issue #${issue_number} from: ${assignees.join(', ')}`);

        try {
            const assigneeFlags = assignees.map(a => `--remove-assignee "${a}"`).join(' ');
            const command       = `gh issue edit ${issue_number} ${assigneeFlags} --repo ${aiConfig.owner}/${aiConfig.repo}`;

            await execAsync(command);

            const message = `Successfully unassigned ${assignees.join(', ')} from issue #${issue_number}`;
            logger.info(message);
            return { message };

        } catch (error) {
            logger.error(`Error unassigning from issue #${issue_number}:`, error);
            return {
                error  : 'GitHub CLI command failed',
                message: error.message,
                code   : 'GH_CLI_ERROR'
            };
        }
    }

    /**
     * Updates an existing comment on a pull request or issue.
     * @param {string} comment_id The global node ID of the comment to update
     * @param {string} body       The new body content for the comment
     * @returns {Promise<object>} A promise that resolves to a success message or a structured error.
     */
    async updateComment(comment_id, body) {
        try {
            const result = await GraphqlService.query(UPDATE_COMMENT, {
                commentId: comment_id,
                body
            });

            return {
                message  : `Successfully updated comment ${comment_id}`,
                commentId: result.updateIssueComment.issueComment.id,
                url      : result.updateIssueComment.issueComment.url,
                updatedAt: result.updateIssueComment.issueComment.updatedAt
            };
        } catch (error) {
            logger.error(`Error updating comment ${comment_id} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * @summary Detects GitHub's missing-number GraphQL error for one labelable branch.
     * @param {Error}  error       GraphQL failure.
     * @param {String} type        GitHub type name (`Issue` or `PullRequest`).
     * @param {Number} issueNumber Repository issue/PR number.
     * @returns {Boolean}
     * @private
     */
    #isMissingLabelableError(error, type, issueNumber) {
        return new RegExp(`Could not resolve to an? ${type} with the number of ${issueNumber}`).test(error?.message || '');
    }

    /**
     * @summary Fetches one labelable branch while converting "missing target" to null.
     * @param {String} query       GraphQL query to execute.
     * @param {Number} issueNumber Repository issue/PR number.
     * @param {String} type        GitHub type name (`Issue` or `PullRequest`).
     * @returns {Promise<Object|null>}
     * @private
     */
    async #queryLabelableIds(query, issueNumber, type) {
        const variables = {
            owner      : aiConfig.owner,
            repo       : aiConfig.repo,
            issueNumber,
            maxLabels  : aiConfig.issueSync.maxRepoLabels
        };

        try {
            return await GraphqlService.query(query, variables);
        } catch (error) {
            if (this.#isMissingLabelableError(error, type, issueNumber)) {
                return null;
            }
            throw error;
        }
    }

    /**
     * @summary Resolves repository label names into GraphQL IDs.
     * @param {Object}   data        GraphQL repository payload.
     * @param {String[]} labelNames  Requested labels.
     * @param {Number}   issueNumber Repository issue/PR number.
     * @returns {String[]}
     * @private
     */
    #resolveLabelIds(data, labelNames, issueNumber) {
        const
            repoLabels = data?.repository?.labels?.nodes || [],
            labelIds   = labelNames.map(name => {
                const label = repoLabels.find(l => l.name === name);
                return label ? label.id : null;
            }).filter(Boolean);

        if (labelIds.length !== labelNames.length) {
            throw new Error(`Could not find issue or pull request #${issueNumber} or one of the labels: ${labelNames.join(', ')}`);
        }

        return labelIds;
    }

    /**
     * Fetches the GraphQL node IDs for an issue or pull request and a set of labels.
     * @param {number}   issueNumber The number of the issue or PR.
     * @param {string[]} labelNames  An array of label names.
     * @returns {Promise<{labelableId: string, labelIds: string[]}>} The node IDs.
     * @private
     */
    async #getIds(issueNumber, labelNames) {
        let
            data        = await this.#queryLabelableIds(GET_ISSUE_LABEL_IDS, issueNumber, 'Issue'),
            labelableId = data?.repository?.issue?.id;

        if (!labelableId) {
            data        = await this.#queryLabelableIds(GET_PULL_REQUEST_LABEL_IDS, issueNumber, 'PullRequest');
            labelableId = data?.repository?.pullRequest?.id;
        }

        if (!labelableId) {
            throw new Error(`Could not find issue or pull request #${issueNumber} or one of the labels: ${labelNames.join(', ')}`);
        }

        const labelIds = this.#resolveLabelIds(data, labelNames, issueNumber);

        return { labelableId, labelIds };
    }

    /**
     * Handles "blocked by" relationships between issues.
     * @param {number}      blockedIssue   The issue number being blocked
     * @param {string}      blockedIssueId The GraphQL ID of the blocked issue
     * @param {number|null} blockingIssue  The issue number doing the blocking (null to remove)
     * @returns {Promise<object>} Result with updated relationship information
     * @private
     */
    async #handleBlockedByRelationship(blockedIssue, blockedIssueId, blockingIssue) {
        // If blockingIssue is null, we're removing a blocked-by relationship
        if (!blockingIssue) {
            // Fetch current blockedBy relationships
            const blockedData = await GraphqlService.query(GET_BLOCKED_BY, {
                owner : aiConfig.owner,
                repo  : aiConfig.repo,
                number: blockedIssue
            }, true); // Enable sub-issues feature for blocked-by access

            const currentBlockers = blockedData.repository.issue.blockedBy.nodes;

            if (currentBlockers.length === 0) {
                logger.info(`Issue #${blockedIssue} has no blocking relationships to remove`);
                return {
                    message     : `Issue #${blockedIssue} has no blocked-by relationships to remove`,
                    blockedIssue,
                    blockingIssue: null
                };
            }

            // Remove all blockedBy relationships
            const removals = [];
            for (const blocker of currentBlockers) {
                const result = await GraphqlService.query(REMOVE_BLOCKED_BY, {
                    issueId        : blockedIssueId,
                    blockingIssueId: blocker.id
                }, true);
                removals.push(blocker.number);
            }

            logger.info(`Successfully removed blocked-by relationships from #${blockedIssue}: ${removals.join(', ')}`);

            return {
                message       : `Successfully removed all blocked-by relationships from issue #${blockedIssue}`,
                blockedIssue,
                blockingIssue : null,
                removedBlockers: removals
            };
        }

        // Adding a blocked-by relationship
        const blockingIdData = await GraphqlService.query(GET_ISSUE_ID, {
            owner : aiConfig.owner,
            repo  : aiConfig.repo,
            number: blockingIssue
        });

        const blockingIssueId = blockingIdData.repository.issue.id;

        // Add the blocked-by relationship
        const result = await GraphqlService.query(ADD_BLOCKED_BY, {
            issueId        : blockedIssueId,
            blockingIssueId: blockingIssueId
        }, true); // Enable sub-issues feature

        logger.info(`Successfully added blocked-by relationship: #${blockedIssue} is now blocked by #${blockingIssue}`);

        return {
            message      : `Successfully set #${blockingIssue} as blocking #${blockedIssue}`,
            blockedIssue,
            blockingIssue: blockingIssue
        };
    }

    /**
     * Lists issues from the repository using the GraphQL API.
     * Supports basic pagination and state filtering. Label and assignee
     * filters are applied client-side to keep the GraphQL query simple and
     * compatible with the existing sync query.
     * @param {object}          options                The options object
     * @param {number}          [options.limit=30]     The maximum number of issues to return
     * @param {string}          [options.state='open'] Filter issues by state (open, closed)
     * @param {string[]|string} [options.labels]       Comma separated list of labels to filter by
     * @param {string}          [options.assignee]          Filter issues by a single assignee login
     * @param {'full'|'summary'|'title'|'title_only'} [options.projection='full'] Response shape projection
     * @param {string}          [options.cursor]            Cursor for pagination
     * @returns {Promise<object>}
     */
    async listIssues({limit=30, state='open', labels=null, assignee=null, projection='full', cursor=null} = {}) {
        const normalizedProjection = this.normalizeIssueListProjection(projection);

        if (!normalizedProjection) {
            return {
                error  : 'Bad Request',
                message: `Invalid projection '${projection}'. Expected one of: full, summary, title, title_only.`,
                code   : 'INVALID_PROJECTION'
            };
        }

        // normalize state to uppercase array (GraphQL expects IssueState enum values)
        const states = state ? (Array.isArray(state) ? state.map(s => s.toUpperCase()) : [state.toUpperCase()]) : undefined;

        const variables = {
            owner           : aiConfig.owner,
            repo            : aiConfig.repo,
            limit,
            cursor,
            states,
            maxLabels       : aiConfig.issueSync.maxLabelsPerIssue,
            maxAssignees    : aiConfig.issueSync.maxAssigneesPerIssue
        };

        try {
            const data = await GraphqlService.query(FETCH_ISSUES_LIST, variables);
            let issues = data.repository.issues.nodes || [];

            // client-side label filtering if requested
            if (labels) {
                const labelList = Array.isArray(labels) ? labels : String(labels).split(',').map(s => s.trim()).filter(Boolean);
                issues = issues.filter(issue => {
                    const issueLabels = (issue.labels && issue.labels.nodes || []).map(l => l.name);
                    return labelList.every(l => issueLabels.includes(l));
                });
            }

            // client-side assignee filtering if requested
            if (assignee) {
                issues = issues.filter(issue => {
                    const assignees = (issue.assignees && issue.assignees.nodes || []).map(a => a.login);
                    return assignees.includes(assignee);
                });
            }

            // Transform in-place to match OpenAPI schema
            for (const issue of issues) {
                issue.labels    = issue.labels?.nodes    || [];
                issue.assignees = issue.assignees?.nodes || [];
            }
            issues = issues.map(issue => this.projectListedIssue(issue, normalizedProjection));

            return {
                count: issues.length,
                issues
            };
        } catch (error) {
            logger.error('Error fetching issues via GraphQL:', error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * @summary Normalizes the issue-list response projection.
     *
     * `title_only` is accepted as an alias for `title` because it is the phrase agents naturally
     * use when asking for backlog scans, while the canonical enum value stays compact.
     *
     * @param {String} projection Requested projection.
     * @returns {'full'|'summary'|'title'|null} Normalized projection or null when invalid.
     */
    normalizeIssueListProjection(projection = 'full') {
        const normalized = String(projection || 'full').toLowerCase();

        if (normalized === 'title_only') {
            return 'title';
        }

        return ['full', 'summary', 'title'].includes(normalized) ? normalized : null;
    }

    /**
     * @summary Applies the requested payload projection to a listed issue.
     *
     * Projection happens after GraphQL retrieval and client-side filters, preserving the existing
     * query/filter path while letting queue scans omit heavy bodies.
     *
     * @param {Object} issue Flattened issue record.
     * @param {'full'|'summary'|'title'} projection Normalized projection.
     * @returns {Object} Projected issue record.
     */
    projectListedIssue(issue, projection) {
        if (projection === 'full') {
            return issue;
        }

        const base = {
            number   : issue.number,
            title    : issue.title,
            state    : issue.state,
            url      : issue.url,
            labels   : issue.labels,
            assignees: issue.assignees
        };

        if (projection === 'title') {
            return base;
        }

        return {
            ...base,
            author   : issue.author,
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt
        };
    }

    /**
     * Removes labels from an issue or pull request.
     * @param {number}   issueNumber The number of the issue or PR.
     * @param {string[]} labels      An array of labels to remove.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async removeLabels(issueNumber, labels) {
        try {
            const { labelableId, labelIds } = await this.#getIds(issueNumber, labels);

            await GraphqlService.query(REMOVE_LABELS, { labelableId, labelIds });
            return { message: `Successfully removed labels from issue #${issueNumber}` };
        } catch (error) {
            logger.error(`Error removing labels from issue #${issueNumber} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Manages relationships between GitHub issues including parent-child and blocked-by relationships.
     * This method allows setting or unsetting relationships between issues on GitHub.
     * @param {object}  options                                    The options object
     * @param {string}  [options.relationship_type='parent_child'] Type of relationship: 'parent_child' or 'blocked_by'
     * @param {number}  options.child_issue                        The issue number of the child/blocked issue
     * @param {number}  [options.parent_issue]                     The issue number of the parent/blocking issue (omit to unset relationship)
     * @param {boolean} [options.replace_parent=false]             If true, replaces existing parent relationship (parent_child only)
     * @returns {Promise<object>} Result with updated relationship information or error
     */
    async updateIssueRelationship({relationship_type='parent_child', child_issue, parent_issue=null, replace_parent=false}) {
        try {
            // Validate relationship type
            const validTypes = ['parent_child', 'blocked_by'];
            if (!validTypes.includes(relationship_type)) {
                return {
                    error  : 'Invalid relationship_type',
                    message: `relationship_type must be one of: ${validTypes.join(', ')}`,
                    code   : 'INVALID_RELATIONSHIP_TYPE'
                };
            }

            // Get GraphQL IDs for both issues
            const childIdData = await GraphqlService.query(GET_ISSUE_ID, {
                owner : aiConfig.owner,
                repo  : aiConfig.repo,
                number: child_issue
            });

            const childIssueId = childIdData.repository.issue.id;

            // Handle blocked_by relationship type
            if (relationship_type === 'blocked_by') {
                return await this.#handleBlockedByRelationship(child_issue, childIssueId, parent_issue);
            }

            // Handle parent_child relationship type (original logic)
            // If parent_issue is null or undefined, we're removing the relationship
            if (!parent_issue) {
                // To remove a parent, we need the current parent's ID
                // First, fetch the child issue's current parent
                const childData = await GraphqlService.query(GET_ISSUE_PARENT, {
                    owner : aiConfig.owner,
                    repo  : aiConfig.repo,
                    number: child_issue
                });

                const currentParent = childData.repository.issue.parent;

                if (!currentParent) {
                    logger.info(`Issue #${child_issue} has no parent to remove`);
                    return {
                        message: `Issue #${child_issue} has no parent relationship to remove`,
                        childIssue: child_issue,
                        parentIssue: null
                    };
                }

                // Remove the sub-issue relationship
                const result = await GraphqlService.query(REMOVE_SUB_ISSUE, {
                    issueId   : currentParent.id,
                    subIssueId: childIssueId
                }, true); // Enable sub-issues feature

                logger.info(`Successfully removed parent relationship: #${child_issue} is no longer a sub-issue of #${currentParent.number}`);

                return {
                    message    : `Successfully removed parent relationship from issue #${child_issue}`,
                    childIssue : child_issue,
                    parentIssue: null,
                    oldParent  : currentParent.number
                };
            }

            // Adding or replacing a parent relationship
            const parentIdData = await GraphqlService.query(GET_ISSUE_ID, {
                owner : aiConfig.owner,
                repo  : aiConfig.repo,
                number: parent_issue
            });

            const parentIssueId = parentIdData.repository.issue.id;

            // Add the sub-issue relationship
            const result = await GraphqlService.query(ADD_SUB_ISSUE, {
                issueId      : parentIssueId,
                subIssueId   : childIssueId,
                replaceParent: replace_parent
            }, true); // Enable sub-issues feature

            logger.info(`Successfully set parent relationship: #${child_issue} is now a sub-issue of #${parent_issue}`);

            return {
                message           : `Successfully set #${parent_issue} as parent of #${child_issue}`,
                childIssue        : child_issue,
                parentIssue       : parent_issue,
                replaceParentApplied: replace_parent
            };

        } catch (error) {
            logger.error(`Error updating issue relationship for #${child_issue}:`, error);

            // Provide helpful error messages for common scenarios
            let errorMessage = error.message;
            if (error.message?.includes('already has a parent')) {
                errorMessage = `Issue #${child_issue} already has a parent. Use replace_parent=true to replace the existing relationship.`;
            } else if (error.message?.includes('not found')) {
                errorMessage = `One or both issues not found. Verify issue numbers are correct.`;
            }

            return {
                error  : 'GraphQL API request failed',
                message: errorMessage,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }
}

export default Neo.setupClass(IssueService);
