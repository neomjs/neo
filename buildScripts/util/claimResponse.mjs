/**
 * @module buildScripts/util/claimResponse
 * @summary Decides the automatic reply to a claim on a curated issue, which `.github/workflows/claim-responder.yml`
 * posts within a minute of the comment.
 *
 * @description Maintainers are not online around the clock, so a claim used to wait until a seat ran, and that
 * could be many hours. The reply closes that gap without deciding anything a maintainer owns:
 *
 * - **first in line:** nothing holds the issue, so the claimant can start now. A maintainer confirms the
 *   assignment when one is online, and the reply promises no time for that.
 * - **taken:** an assignee, an open pull request that resolves the issue, or an earlier claimant holds it. The reply
 *   names the holder and points at claimable issues with the same label.
 *
 * The reply never assigns. Assignment stays with a maintainer, and that confirmation step is what screens out
 * accounts that spray claim templates across repositories. Everything here is a pure function of data the workflow
 * fetched, so the rules are unit-tested without GitHub.
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
 * How long an unassigned claim holds an issue for later claimants, mirroring CONTRIBUTING's seven days for a silent
 * assignee.
 * @member {Number} CLAIM_WINDOW_DAYS
 */
export const CLAIM_WINDOW_DAYS = 7;

const
    DAY_MS              = 24 * 60 * 60 * 1000,
    MARKER_PREFIX       = '<!-- claim-responder:',
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
        /\b(i'?ll|i will|let me)\s+(take|work\s+on|pick\s+up|handle|tackle|claim)\s+(this|it)\b/i,
        /\bi'?m\s+(already\s+)?working\s+on\s+(this|it)\b/i,
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
 * The earliest live claim by another outside contributor before `comment`: made within {@link CLAIM_WINDOW_DAYS} of
 * it, and not given back by a later withdrawal from the same person.
 * @param {Object} options
 * @param {String} options.claimant
 * @param {Object} options.comment The claim being answered: `id`, `created_at`
 * @param {Object[]} options.comments Every comment on the issue, in creation order
 * @returns {Object|null} The earlier claim comment
 */
export function earlierClaim({claimant, comment, comments = []}) {
    const
        self   = String(claimant).toLowerCase(),
        at     = new Date(comment.created_at).getTime(),
        before = comments.filter(other => other.id !== comment.id && new Date(other.created_at).getTime() <= at);

    return before.find(other => {
        const login = String(other.user?.login).toLowerCase();

        return login !== self &&
            isOutsideHuman(other) &&
            at - new Date(other.created_at).getTime() <= CLAIM_WINDOW_DAYS * DAY_MS &&
            isClaim(other.body) &&
            !before.some(later =>
                String(later.user?.login).toLowerCase() === login &&
                new Date(later.created_at) > new Date(other.created_at) &&
                isWithdrawal(later.body)
            )
    }) || null
}

/**
 * What holds the issue for everyone except `claimant`: its assignee, an open pull request that resolves it, or a
 * live earlier claim. Each person is named once, and the claimant's own pull request holds nothing against them.
 * Empty when the claimant is first in line.
 * @param {Object} options
 * @param {String} options.claimant
 * @param {Object} options.comment The claim itself: `id`, `created_at`
 * @param {Object[]} options.comments Every comment on the issue, including the claim
 * @param {Object} options.issue `assignees[].login`
 * @param {Object[]} options.openPullRequests `number`, `author` of open pull requests that resolve the issue
 * @returns {Object[]} Each `{kind: 'assignee'|'pull-request'|'earlier-claim', login?, number?}`
 */
export function holders({claimant, comment, comments = [], issue, openPullRequests = []}) {
    const
        self    = String(claimant).toLowerCase(),
        named   = new Set(),
        result  = [],
        earlier = earlierClaim({claimant, comment, comments});

    for (const assignee of issue?.assignees || []) {
        named.add(assignee.login.toLowerCase());
        result.push({kind: 'assignee', login: assignee.login})
    }

    for (const pullRequest of openPullRequests) {
        if (String(pullRequest.author).toLowerCase() !== self) {
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
 * @param {String} options.claimant
 * @param {Object[]} options.holders From {@link holders}
 * @param {Number[]} options.alternatives From {@link pickAlternatives}
 * @param {String} options.label The curated label the alternatives share
 * @param {String} options.repoUrl e.g. `https://github.com/neomjs/neo`
 * @returns {String}
 */
export function renderReply({claimant, holders: held = [], alternatives = [], label, repoUrl}) {
    const
        contributing = `${repoUrl}/blob/dev/CONTRIBUTING.md`,
        listUrl      = `${repoUrl}/issues?q=${encodeURIComponent(`is:issue is:open label:"${label}" no:assignee -linked:pr`)}`,
        footer       = `<sub>An automatic reply. A maintainer follows up. [How claims work](${contributing})</sub>\n${replyMarker(claimant)}`;

    if (held.length < 1) {
        return [
            `Thanks for claiming this, @${claimant}, and welcome! You're first in line, so you can start now.`,
            '',
            'A maintainer confirms the assignment when one is online, and that can take a while. You don\'t need to wait for it.',
            '',
            footer
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
 * The one entry the workflow calls: the reply to post for `comment`, or null when it gets none.
 *
 * No reply for: an issue without a curated label, a pull request, a team or bot author, the issue's assignee, a
 * comment that is not a claim, or a claimant this responder already answered on this issue.
 * @param {Object} options
 * @param {Object} options.comment The new comment (REST shape)
 * @param {Object} options.issue The issue (REST shape)
 * @param {Object[]} [options.comments=[]] Every comment on the issue, including `comment`
 * @param {Object[]} [options.openPullRequests=[]] `{number, author}` of open pull requests that resolve the issue
 * @param {Number[]} [options.candidates=[]] Claimable issue numbers with the issue's curated label
 * @param {String} options.repoUrl
 * @returns {String|null}
 */
export function decideReply({comment, issue, comments = [], openPullRequests = [], candidates = [], repoUrl}) {
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

    const held = holders({claimant, comment, comments, issue, openPullRequests});

    return renderReply({
        alternatives: held.length > 0 ? pickAlternatives({candidates, exclude: issue.number, seed: claimant}) : [],
        claimant,
        holders     : held,
        label,
        repoUrl
    })
}
