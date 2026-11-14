/**
 * @module buildScripts/util/claimResponse
 * @summary Decides the automatic reply and assignment for a claim on a curated issue, which
 * `.github/workflows/claim-responder.yml` runs within a minute of the comment.
 *
 * @description Maintainers are not online around the clock, so a claim used to wait until a seat ran, and that
 * could be many hours. The responder closes that gap while bounding claim spraying:
 *
 * - **first in line:** nothing live holds the issue and the claimant holds no other open curated issue in the
 *   repository, so the workflow assigns them (clearing any lapsed >3-day silent outside assignee) and they can start
 *   now (`decideClaim` → `assign: true`).
 * - **already holding one:** the claimant is already assigned to another open curated issue in the repository, so
 *   `assign` stays `false` and the reply asks them to finish or step back from that issue first.
 * - **taken:** a live assignee, an open pull request that resolves the issue, or an earlier unwithdrawn, un-unassigned
 *   claimant holds it. The reply names the holder and points at claimable issues with the same label.
 *
 * `decideReply` preserves the `String|null` return contract for cross-repository workflows that sparse-checkout this
 * module before adopting `decideClaim`. Everything here is a pure function of data the workflow fetched, so the rules
 * are unit-tested without GitHub.
 */

/**
 * The labels that mark an issue as curated for outside contributors, in the order the reply prefers when an issue
 * carries both.
 * @member {String[]} CURATED_LABELS
 */
export const CURATED_LABELS = Object.freeze(['good first issue', 'help wanted']);

/**
 * `author_association` values that belong to the team: their comments are never claims to answer.
 * @member {String[]} TEAM_ASSOCIATIONS
 */
export const TEAM_ASSOCIATIONS = Object.freeze(['COLLABORATOR', 'MEMBER', 'OWNER']);

/**
 * How long a claim holds an issue for later claimants after its claimant's latest comment, mirroring CONTRIBUTING's
 * three days for a silent claimant. Every claim that delivered did so within eight hours, and one silent for a day has
 * never delivered; a silent claim that kept the issue for a week simply parked the work.
 * @member {Number} CLAIM_WINDOW_DAYS
 */
export const CLAIM_WINDOW_DAYS = 3;

const
    DAY_MS              = 24 * 60 * 60 * 1000,
    MARKER_PREFIX       = '<!-- claim-responder:',
    CLAIM_TARGET        = String.raw`(this|it|#\d+|the\s[^\n]{1,80}?\brow\b)`,
    WITHDRAWAL_PATTERNS = Object.freeze([
        /\bstepping\s+(back|away)\b/i,
        /\b(no\s+longer|not)\s+(able|going|planning)\s+to\s+work\b/i,
        /\b(can'?t|cannot|won'?t|will\s+not)\s+(work\s+on|take|continue|finish|proceed)\b/i,
        /\b(please\s+)?unassign\s+me\b/i,
        /\bconsider\s+it\s+available\b/i
    ]),
    CLAIM_PATTERNS      = Object.freeze([
        /\b(i'?d|i would|i'?m|i am|i)\s+(really\s+|also\s+)?(like|love|want|wish|hope|happy|keen|eager)\s+(to\s+)?(work|take|claim|pick|handle|tackle|contribute|fix|give)\b/i,
        /\binterested\s+in\s+(working|taking|claiming|fixing|contributing|picking)\b/i,
        /\b(can|could|may)\s+i\s+(please\s+)?(work|take|claim|pick|handle|tackle|have|get|be\s+assigned)\b/i,
        /\bassign(ed)?\s+(this|it)\s+to\s+me\b/i,
        /\b(please\s+)?assign\s+me\b/i,
        new RegExp(String.raw`\b(i'?ll|i will|let me)\s+(also\s+)?(take|work\s+on|pick\s+up|handle|tackle|claim)\s+${CLAIM_TARGET}`, 'i'),
        new RegExp(String.raw`\b(i'?m|i am)\s+(already\s+|also\s+)?(working\s+on|starting\s+work\s+on|taking|claiming|picking\s+up|tackling|handling)\s+${CLAIM_TARGET}`, 'i'),
        new RegExp(String.raw`(?:^|[.!?\n]\s*)(claiming|taking|picking\s+up)\s+${CLAIM_TARGET}`, 'im'),
        /^\s*\/(assign|claim|take)\b/im
    ]);

/**
 * The comment text a claim is read from: quoted lines and fenced code removed, so a reply that quotes an assignment
 * ("it's yours") or a snippet is judged by its own words only.
 * @param {String} body
 * @returns {String}
 */
export function claimText(body = '') {
    return String(body)
        .replace(/```[\s\S]*?```/g, '')
        .split('\n')
        .filter(line => !line.trimStart().startsWith('>'))
        .join('\n')
}

/**
 * Whether a comment asks to work on the issue. A question, thanks or a note about something else is not a claim, and
 * gets no reply: answering every comment would amplify exactly the noise a quiet issue should not carry.
 * @param {String} body
 * @returns {Boolean}
 */
export function isClaim(body) {
    const text = claimText(body);

    return CLAIM_PATTERNS.some(pattern => pattern.test(text))
}

/**
 * Whether a comment gives a claim back ("I'm stepping back from this one"), which frees the issue for the next person.
 * @param {String} body
 * @returns {Boolean}
 */
export function isWithdrawal(body) {
    const text = claimText(body);

    return WITHDRAWAL_PATTERNS.some(pattern => pattern.test(text))
}

/**
 * Whether a comment author is outside the team and human: only their claims get an automatic reply.
 * @param {Object} comment A REST issue comment: `user.login`, `user.type`, `author_association`
 * @returns {Boolean}
 */
export function isOutsideHuman(comment) {
    return comment?.user?.type !== 'Bot' && !TEAM_ASSOCIATIONS.includes(comment?.author_association)
}

/**
 * The curated label an issue carries, preferring `good first issue`, or null when it carries none.
 * @param {Object} issue A REST issue: `labels[].name`
 * @returns {String|null}
 */
export function curatedLabel(issue) {
    const names = (issue?.labels || []).map(label => typeof label === 'string' ? label : label.name);

    return CURATED_LABELS.find(label => names.includes(label)) || null
}

/**
 * The hidden marker a reply carries, so a re-run never answers the same claimant on the same issue twice.
 * @param {String} login
 * @returns {String}
 */
export function replyMarker(login) {
    return `${MARKER_PREFIX}@${String(login).toLowerCase()} -->`
}

/**
 * Up to `count` claimable issues, rotated by the claimant's login so that two people redirected in the same hour are
 * not both sent to the same ticket, which is how the collision this reply prevents came about.
 * @param {Object} options
 * @param {Number[]} options.candidates Claimable issue numbers with the same label
 * @param {Number} options.exclude The issue being claimed
 * @param {String} options.seed The claimant's login
 * @param {Number} [options.count=3]
 * @returns {Number[]}
 */
export function pickAlternatives({candidates = [], exclude, seed = '', count = 3}) {
    const pool = [...new Set(candidates)].filter(number => number !== exclude).sort((a, b) => a - b);

    if (pool.length < 1) {
        return []
    }

    const start = [...String(seed).toLowerCase()].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7) % pool.length;

    return [...pool.slice(start), ...pool.slice(0, start)].slice(0, count)
}

/**
 * The earliest live claim by another outside contributor before `comment`: its claimant commented on the issue within
 * {@link CLAIM_WINDOW_DAYS} of it, with the claim or any later word such as a progress note, and neither withdrew the
 * claim nor was unassigned after it.
 * @param {Object} options
 * @param {String} options.claimant
 * @param {Object} options.comment The claim being answered: `id`, `created_at`
 * @param {Object[]} [options.comments=[]] Every comment on the issue, in creation order
 * @param {Object[]} [options.events=[]] Issue events (`event`, `assignee.login`, `created_at`)
 * @returns {Object|null} The earlier claim comment
 */
export function earlierClaim({claimant, comment, comments = [], events = []}) {
    const
        self         = String(claimant).toLowerCase(),
        at           = new Date(comment.created_at).getTime(),
        before       = comments.filter(other => other.id !== comment.id && new Date(other.created_at).getTime() <= at),
        eventsBefore = events.filter(ev => new Date(ev.created_at).getTime() <= at),
        lastWord     = login => Math.max(...before
            .filter(other => String(other.user?.login).toLowerCase() === login)
            .map(other => new Date(other.created_at).getTime()));

    return before.find(other => {
        const
            login   = String(other.user?.login).toLowerCase(),
            claimed = new Date(other.created_at).getTime();

        return login !== self &&
            isOutsideHuman(other) &&
            isClaim(other.body) &&
            at - lastWord(login) <= CLAIM_WINDOW_DAYS * DAY_MS &&
            !before.some(later =>
                String(later.user?.login).toLowerCase() === login &&
                new Date(later.created_at).getTime() > claimed &&
                isWithdrawal(later.body)
            ) &&
            !eventsBefore.some(ev =>
                ev.event === 'unassigned' &&
                String(ev.assignee?.login).toLowerCase() === login &&
                new Date(ev.created_at).getTime() > claimed
            )
    }) || null
}

/**
 * Whether `login` is an outside contributor on `issue` rather than a team assignee.
 * @param {String} login Lowercased login
 * @param {Object} options
 * @param {Object[]} [options.comments=[]]
 * @param {Object} [options.issue]
 * @returns {Boolean}
 * @private
 */
function isOutsideAssignee(login, {comments = [], issue}) {
    const ownComments = comments.filter(other => String(other.user?.login).toLowerCase() === login);

    if (ownComments.some(other => !isOutsideHuman(other))) {
        return false
    }

    if (ownComments.length > 0) {
        return true
    }

    return String(issue?.user?.login).toLowerCase() === login &&
        issue?.user?.type !== 'Bot' &&
        !TEAM_ASSOCIATIONS.includes(issue?.author_association)
}

/**
 * Outside-contributor assignees on `issue` whose {@link CLAIM_WINDOW_DAYS} window has elapsed without a comment, recent
 * `assigned` event, or open pull request into `repository`. Team assignees never lapse.
 * @param {Object} options
 * @param {Object} options.comment The claim being evaluated (`id`, `created_at`)
 * @param {Object[]} [options.comments=[]]
 * @param {Object[]} [options.events=[]]
 * @param {Object} [options.issue]
 * @param {Object[]} [options.openPullRequests=[]]
 * @param {String} options.repository `owner/name`
 * @returns {String[]} Original-case logins of lapsed outside-contributor assignees
 */
export function staleAssignees({comment, comments = [], events = [], issue, openPullRequests = [], repository}) {
    const
        at           = new Date(comment.created_at).getTime(),
        before       = comments.filter(other => other.id !== comment.id && new Date(other.created_at).getTime() <= at),
        eventsBefore = events.filter(ev => new Date(ev.created_at).getTime() <= at),
        repoLower    = String(repository).toLowerCase(),
        stale        = [];

    for (const assignee of issue?.assignees || []) {
        const login = String(assignee.login).toLowerCase();

        if (!isOutsideAssignee(login, {comments: before, issue})) {
            continue
        }

        if (openPullRequests.some(pr =>
            String(pr.repository).toLowerCase() === repoLower &&
            String(pr.author).toLowerCase() === login
        )) {
            continue
        }

        const timestamps = [
            ...before
                .filter(other => String(other.user?.login).toLowerCase() === login)
                .map(other => new Date(other.created_at).getTime()),
            ...eventsBefore
                .filter(ev => ev.event === 'assigned' && String(ev.assignee?.login).toLowerCase() === login)
                .map(ev => new Date(ev.created_at).getTime()),
            ...(String(issue?.user?.login).toLowerCase() === login && issue?.created_at
                ? [new Date(issue.created_at).getTime()]
                : [])
        ].filter(Number.isFinite);

        if (timestamps.length > 0 && at - Math.max(...timestamps) > CLAIM_WINDOW_DAYS * DAY_MS) {
            stale.push(assignee.login)
        }
    }

    return stale
}

/**
 * What holds the issue for everyone except `claimant`: a live assignee (team assignees unconditionally; outside
 * assignees within {@link CLAIM_WINDOW_DAYS} or with an open pull request), an open pull request into `repository` that
 * resolves it, or a live earlier claim. Each person is named once, and the claimant's own pull request holds nothing
 * against them. A pull request inside a fork, whose base is the fork, holds nothing either: it only mentions the issue.
 * Empty when the claimant is first in line.
 * @param {Object} options
 * @param {String} options.claimant
 * @param {Object} options.comment The claim itself: `id`, `created_at`
 * @param {Object[]} [options.comments=[]] Every comment on the issue, including the claim
 * @param {Object[]} [options.events=[]] Issue events (`event`, `assignee.login`, `created_at`)
 * @param {Object} options.issue `assignees[].login`
 * @param {Object[]} [options.openPullRequests=[]] `number`, `author`, `repository` (its base) of open pull requests that
 * resolve the issue
 * @param {String} options.repository The repository the issue belongs to, `owner/name`
 * @returns {Object[]} Each `{kind: 'assignee'|'pull-request'|'earlier-claim', login?, number?}`
 */
export function holders({claimant, comment, comments = [], events = [], issue, openPullRequests = [], repository}) {
    const
        self    = String(claimant).toLowerCase(),
        lapsed  = new Set(staleAssignees({comment, comments, events, issue, openPullRequests, repository}).map(login => login.toLowerCase())),
        named   = new Set(),
        result  = [],
        earlier = earlierClaim({claimant, comment, comments, events});

    for (const assignee of issue?.assignees || []) {
        const login = assignee.login.toLowerCase();

        if (lapsed.has(login)) {
            continue
        }

        named.add(login);
        result.push({kind: 'assignee', login: assignee.login})
    }

    for (const pullRequest of openPullRequests) {
        if (String(pullRequest.repository).toLowerCase() === String(repository).toLowerCase() &&
            String(pullRequest.author).toLowerCase() !== self) {
            named.add(String(pullRequest.author).toLowerCase());
            result.push({kind: 'pull-request', number: pullRequest.number, login: pullRequest.author})
        }
    }

    if (earlier && !named.has(earlier.user.login.toLowerCase())) {
        result.push({kind: 'earlier-claim', login: earlier.user.login})
    }

    return result
}

/**
 * The reply text for a claim, carrying its marker.
 * @param {Object} options
 * @param {Boolean} [options.assigned=false] True when the workflow verified `addAssignees` succeeded
 * @param {String} options.claimant
 * @param {Number[]} [options.heldByClaimant=[]] Other open curated issue numbers already assigned to `claimant`
 * @param {Object[]} [options.holders=[]] From {@link holders}
 * @param {Number[]} [options.alternatives=[]] From {@link pickAlternatives}
 * @param {String} options.label The curated label the alternatives share
 * @param {String} options.repoUrl e.g. `https://github.com/neomjs/neo`
 * @returns {String}
 */
export function renderReply({assigned = false, claimant, heldByClaimant = [], holders: held = [], alternatives = [], label, repoUrl}) {
    const
        contributing = `${repoUrl}/blob/dev/CONTRIBUTING.md`,
        listUrl      = `${repoUrl}/issues?q=${encodeURIComponent(`is:issue is:open label:"${label}" no:assignee -linked:pr`)}`,
        footer       = `<sub>An automatic reply. [How claims work](${contributing})</sub>\n${replyMarker(claimant)}`;

    if (held.length < 1) {
        if (heldByClaimant.length > 0) {
            const
                refs = heldByClaimant.map(number => `#${number}`),
                list = refs.length > 1 ? `${refs.slice(0, -1).join(', ')} and ${refs.at(-1)}` : refs[0];

            return [
                `Thanks, @${claimant}! You're already assigned to ${list} — please finish or step back from that issue before claiming another curated one, so other contributors get a turn too.`,
                '',
                footer
            ].join('\n')
        }

        if (assigned) {
            return [
                `Thanks for claiming this, @${claimant}, and welcome! Assigned to you — you can start now.`,
                '',
                `Your claim reserves this issue for ${CLAIM_WINDOW_DAYS} days (any comment here resets the clock; we still merge the first approve-worthy PR if another lands first or a claim goes quiet).`,
                '',
                footer
            ].join('\n')
        }

        return [
            `Thanks for claiming this, @${claimant}, and welcome! You're first in line, so you can start now.`,
            '',
            'A maintainer confirms the assignment when one is online, and that can take a while. You don\'t need to wait for it.',
            '',
            `<sub>An automatic reply. A maintainer follows up. [How claims work](${contributing})</sub>\n${replyMarker(claimant)}`
        ].join('\n')
    }

    // Holders are linked, not mentioned: an assignee should not be notified each time someone else is redirected.
    const
        person  = login => `[${login}](https://github.com/${login})`,
        reasons = held.map(holder =>
            holder.kind === 'assignee'     ? `it's assigned to ${person(holder.login)}` :
            holder.kind === 'pull-request' ? `#${holder.number} is open for it` :
                                             `${person(holder.login)} asked first`
        ),
        options = alternatives.length > 0
            ? [`These \`${label}\` issues are open and nobody holds them:`, '', ...alternatives.map(number => `- #${number}`), '', `The [full list](${listUrl}) has the rest. Comment on one to claim it.`]
            : [`No other \`${label}\` issue is free right now. The [list](${listUrl}) shows new ones as they open.`];

    return [
        `Thanks, @${claimant}! This one is taken: ${reasons.length > 1 ? `${reasons.slice(0, -1).join(', ')} and ${reasons.at(-1)}` : reasons[0]}.`,
        '',
        ...options,
        '',
        footer
    ].join('\n')
}

/**
 * Decides both assignment eligibility and reply text for `comment`, or null when it gets no reply.
 *
 * No reply for: an issue without a curated label, a pull request, a team or bot author, the issue's assignee, a
 * comment that is not a claim, or a claimant this responder already answered on this issue.
 * @param {Object} options
 * @param {Object} options.comment The new comment (REST shape)
 * @param {Object} options.issue The issue (REST shape)
 * @param {Object[]} [options.comments=[]] Every comment on the issue, including `comment`
 * @param {Object[]} [options.events=[]] Issue events (`event`, `assignee.login`, `created_at`)
 * @param {Object[]} [options.openPullRequests=[]] `{number, author, repository}` of open pull requests that resolve
 * the issue, `repository` being each one's base
 * @param {Number[]} [options.candidates=[]] Claimable issue numbers with the issue's curated label
 * @param {Number[]} [options.heldByClaimant=[]] Open curated issue numbers already assigned to `claimant`
 * @param {String} options.repoUrl
 * @returns {{assign: Boolean, assignedBody?: String, body: String, unassign?: String[]}|null}
 */
export function decideClaim({comment, issue, comments = [], events = [], openPullRequests = [], candidates = [], heldByClaimant = [], repoUrl}) {
    const
        claimant = comment?.user?.login,
        label    = curatedLabel(issue);

    if (!claimant || !label || issue?.pull_request || !isOutsideHuman(comment)) {
        return null
    }

    const self = claimant.toLowerCase();

    if ((issue.assignees || []).some(assignee => assignee.login.toLowerCase() === self) || !isClaim(comment.body)) {
        return null
    }

    // Only a bot-authored marker counts: anyone can paste the text, and a pasted one must not silence a reply.
    if (comments.some(other => other.user?.type === 'Bot' && String(other.body || '').includes(replyMarker(claimant)))) {
        return null
    }

    const
        repository = new URL(repoUrl).pathname.slice(1),
        held       = holders({claimant, comment, comments, events, issue, openPullRequests, repository}),
        otherHeld  = [...new Set(heldByClaimant)].filter(number => number !== issue.number).sort((a, b) => a - b);

    if (held.length > 0) {
        return {
            assign: false,
            body  : renderReply({
                alternatives: pickAlternatives({candidates, exclude: issue.number, seed: claimant}),
                claimant,
                holders     : held,
                label,
                repoUrl
            })
        }
    }

    if (otherHeld.length > 0) {
        return {
            assign: false,
            body  : renderReply({claimant, heldByClaimant: otherHeld, label, repoUrl})
        }
    }

    return {
        assign      : true,
        assignedBody: renderReply({assigned: true, claimant, label, repoUrl}),
        body        : renderReply({assigned: false, claimant, label, repoUrl}),
        unassign    : staleAssignees({comment, comments, events, issue, openPullRequests, repository})
    }
}

/**
 * Legacy `String|null` entry preserved for cross-repository callers (`neo-agent-brain`, `neo-agent-institution`) that
 * sparse-checkout this module from `neomjs/neo@dev`.
 * @param {Object} options See {@link decideClaim}
 * @returns {String|null}
 */
export function decideReply(options) {
    return decideClaim(options)?.body || null
}
