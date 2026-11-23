/**
 * @module buildScripts/util/claimGuidance
 * @summary Decides non-reserving claiming hints using the claim responder's existing identity and holder rules.
 */
import {REPO_PATTERN, curatedLabel, holders, isClaim, isOutsideHuman, isPositiveInt, isWithdrawal, isWorkflowBotComment} from './claimResponse.mjs';

/**
 * @summary Offers claiming instructions once per account on an open, genuinely unclaimed curated issue.
 * Guidance has its own bot receipt: it neither reserves an issue nor deduplicates a later claim.
 * @param {Object} options
 * @param {Object} options.comment Triggering REST comment
 * @param {Object} options.issue Current REST issue
 * @param {Object[]} options.comments Complete current issue comments
 * @param {Object[]} options.events Complete current issue events
 * @param {Object[]} options.openPullRequests Resolving open pull requests
 * @param {String} options.repoUrl Repository URL
 * @param {String} options.now Current observation time, rather than the queued event's timestamp
 * @returns {String|null} Guidance text, or no reply
 */
export function decideClaimHint({comment, issue, comments, events, openPullRequests, repoUrl, now}) {
    if (!comment?.user?.login || comment.user.type !== 'User' || !isPositiveInt(comment.user.id) ||
        !isPositiveInt(comment.id) || !isOutsideHuman(comment) || isClaim(comment.body) || isWithdrawal(comment.body) ||
        issue?.state !== 'open' || issue.pull_request || !isPositiveInt(issue.number) || !curatedLabel(issue) ||
        !Array.isArray(issue.assignees) || issue.assignees.length > 0 ||
        !Array.isArray(comments) || !Array.isArray(events) || !Array.isArray(openPullRequests) ||
        typeof now !== 'string' || !Number.isFinite(Date.parse(now)) ||
        !Number.isFinite(Date.parse(comment.created_at)) || Date.parse(now) < Date.parse(comment.created_at)) {
        return null
    }

    const repository = new URL(repoUrl).pathname.slice(1).toLowerCase();
    if (!REPO_PATTERN.test(repository)) return null;

    const marker = `<!-- claim-guidance:v1 ${JSON.stringify({repo: repository, issue: issue.number, to: comment.user.id})} -->`;
    if (comments.some(reply => isWorkflowBotComment(reply) &&
        reply.body?.split('\n').some(line => line.trim() === marker))) return null;

    // A neutral observer includes the author's own claims/PRs, including claims newer than the event.
    const boundary = {id: Number.MAX_SAFE_INTEGER, created_at: now};
    if (holders({claimant: '', comment: boundary, comments, events, issue, openPullRequests, repository}).length) return null;

    return [
        `@${comment.user.login}, if you'd like to work on this issue, comment \`/claim\`. The bot will check availability and confirm the result.`,
        '',
        `[How claims work](${repoUrl}/blob/dev/CONTRIBUTING.md)`,
        marker
    ].join('\n')
}
