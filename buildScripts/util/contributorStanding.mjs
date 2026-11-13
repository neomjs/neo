/**
 * @module buildScripts/util/contributorStanding
 * @summary Decides the one comment a pull request from outside the team gets when it merges: its author's standing,
 * up to two open curated issues to take next, and, once the badges are served, the badge line.
 * `.github/workflows/merge-comment.yml` runs it at the merge.
 *
 * @description Standing is one count, derived when asked and never stored: the author's merged pull requests across
 * the public repositories of the `neomjs` organisation. The workflow counts the merges before the event (`merged:<`
 * its `merged_at`) and {@link decideMergeComment} adds the event itself, so the count never waits for search to index
 * the merge. "Outside" is `isOutsideHuman` of `claimResponse.mjs`; this module writes no second definition.
 *
 * The badge generator of `neomjs/pages` reads {@link RUNGS}, {@link standing}, {@link BADGES_SINCE},
 * {@link badgeFolder}, {@link badgeLine} and the outside test from here, so they are a contract across repositories:
 * a rung's slug is never renamed, removed or repurposed, and its badge art has a colour for each slug. A renamed rung
 * changes its `name`; a new rung adds an entry and its art. Each reader checks out exactly this file and
 * `claimResponse.mjs`, so this module imports nothing else.
 *
 * Everything here is a pure function of data the workflow fetched, so the words are unit-tested without GitHub.
 */

import {CURATED_LABELS, isOutsideHuman, pickAlternatives} from './claimResponse.mjs';

/**
 * The rungs of standing, lowest first. A contributor holds the highest rung whose `merges` their count reaches.
 * @member {Object[]} RUNGS
 */
export const RUNGS = Object.freeze([
    Object.freeze({slug: 'contributor', merges: 1,   name: 'Contributor'}),
    Object.freeze({slug: 'returning',   merges: 5,   name: 'Returning Contributor'}),
    Object.freeze({slug: 'bronze',      merges: 10,  name: 'Bronze Contributor'}),
    Object.freeze({slug: 'silver',      merges: 25,  name: 'Silver Contributor'}),
    Object.freeze({slug: 'gold',        merges: 50,  name: 'Gold Contributor'}),
    Object.freeze({slug: 'diamond',     merges: 100, name: 'Diamond Contributor'}),
    Object.freeze({slug: 'core',        merges: 250, name: 'Core Contributor'})
]);

/**
 * When the badges went live, as an ISO timestamp, or null while they are not served. The comment hands over the
 * badge line only once it is set.
 * @member {String|null} BADGES_SINCE
 */
export const BADGES_SINCE = null;

/**
 * The invitation a comment at a rung closes with, chosen by {@link invitation}.
 * @member {Object} INVITATIONS
 */
export const INVITATIONS = Object.freeze({
    engine: '**See it run:** the engine you changed runs live in the browser: https://neomjs.com/examples',
    skills: "**Take it with you:** the working rules this repository's agents load are public and install into any repository: https://github.com/neomjs/neo-agent-skills"
});

const
    BADGE_ROOT     = 'https://neomjs.com/badges',
    ENGINE_PATHS   = Object.freeze(['src/', 'apps/', 'examples/', 'resources/scss/']),
    GENERIC_LABELS = new Set([...CURATED_LABELS, 'ai', 'bug', 'documentation', 'enhancement']),
    MARKER_PREFIX  = '<!-- merge-comment:';

/**
 * @summary An issue's label names, whether the REST shape carries strings or `{name}` objects.
 * @param {Object} issue
 * @returns {String[]}
 * @private
 */
function labelNames(issue) {
    return (issue?.labels || []).map(label => typeof label === 'string' ? label : label.name)
}

/**
 * @summary A contributor's standing at `count` merged pull requests.
 * @param {Number} count
 * @returns {{rung: Object|null, next: Object|null, remaining: Number|null}} `rung` is null below one merge; `next` and
 * `remaining` are null at the top rung.
 */
export function standing(count) {
    const merged = Math.max(0, Math.floor(Number(count) || 0));
    let   rung   = null;

    for (const entry of RUNGS) {
        if (merged < entry.merges) {
            return {rung, next: entry, remaining: entry.merges - merged}
        }

        rung = entry
    }

    return {rung, next: null, remaining: null}
}

/**
 * @summary The folder of an account's badge: the login in lowercase, then GitHub's numeric account id, which decides,
 * because a changed login is free for anyone to claim.
 * @param {String} login
 * @param {Number|String} id
 * @returns {String}
 * @throws {TypeError} For a login GitHub would not issue or an id that is not a number, so no line ever points at a
 * folder the badge generator refuses to write
 */
export function badgeFolder(login, id) {
    if (!/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(String(login)) || !/^\d+$/.test(String(id))) {
        throw new TypeError(`no badge folder for login ${login} and id ${id}`)
    }

    return `${String(login).toLowerCase()}-${id}`
}

/**
 * @summary The line a contributor pastes to show their badge. It never changes while the rung does: the image shows the
 * current rung, the link leads to the account's record, and the alt text names no rung.
 * @param {String} login
 * @param {Number|String} id
 * @param {String} [form='card'] `card`, `plate` or `medal`
 * @returns {String}
 */
export function badgeLine(login, id, form = 'card') {
    const url = `${BADGE_ROOT}/${badgeFolder(login, id)}/`;

    return `<a href="${url}"><img src="${url}${form}.svg" alt="Neo.mjs contributor"></a>`
}

/**
 * @summary The accounts that asked for no badge, from the text of `badges/optout.json` in `neomjs/pages`: a JSON array
 * of numeric account ids, for which the badge generator writes no folder.
 * @param {String} text
 * @returns {Number[]|null} null for anything else, which {@link decideMergeComment} reads as unknown
 */
export function parseOptOut(text) {
    try {
        const ids = JSON.parse(text);

        return Array.isArray(ids) && ids.every(Number.isInteger) ? ids : null
    } catch {
        return null
    }
}

/**
 * @summary Up to two open curated issues to suggest after a merge. An issue that shares a label with the merged work
 * comes first, and that label is its reason; the curated, type and `ai` labels say nothing about the work and never
 * count. The order is rotated by `seed`, so two contributors merged in the same hour are not sent to one issue.
 * @param {Object} options
 * @param {String[]} [options.closedLabels=[]] The labels of the issues the pull request closed
 * @param {Object[]} [options.candidates=[]] Open, unassigned curated issues: `number`, `labels`
 * @param {String} [options.seed=''] The author's login
 * @returns {{number: Number, reason: String|null}[]}
 */
export function nextIssues({closedLabels = [], candidates = [], seed = ''}) {
    const
        shared  = new Set(closedLabels.filter(label => !GENERIC_LABELS.has(label))),
        reasons = new Map(candidates.map(issue => [issue.number, labelNames(issue).find(label => shared.has(label)) || null])),
        rotated = pickAlternatives({candidates: [...reasons.keys()], seed, count: reasons.size});

    return [...rotated.filter(number => reasons.get(number)), ...rotated.filter(number => !reasons.get(number))]
        .slice(0, 2)
        .map(number => ({number, reason: reasons.get(number)}))
}

/**
 * @summary The invitation for a pull request that changed `paths`: engine paths invite its author to see the engine
 * run, anything else to take the agents' working rules along.
 * @param {String[]} [paths=[]]
 * @returns {String}
 */
export function invitation(paths = []) {
    return paths.some(file => ENGINE_PATHS.some(prefix => String(file).startsWith(prefix))) ? INVITATIONS.engine : INVITATIONS.skills
}

/**
 * @summary The hidden marker a merge comment carries, so a re-run never comments on the same pull request twice.
 * @param {Number} number
 * @returns {String}
 */
export function mergeMarker(number) {
    return `${MARKER_PREFIX}#${number} -->`
}

/**
 * @summary The "Next" paragraph: one or two issues, each with its reason, and the full curated list.
 * @param {{number: Number, reason: String|null}[]} issues From {@link nextIssues}
 * @param {String} repoUrl
 * @returns {String}
 * @private
 */
function renderNext(issues, repoUrl) {
    const
        query = `is:issue is:open no:assignee -linked:pr label:${CURATED_LABELS.map(label => `"${label}"`).join(',')}`,
        list  = `[The full list](${repoUrl}/issues?q=${encodeURIComponent(query)})`,
        refs  = issues.map(({number, reason}) => `#${number}${reason ? ` (also \`${reason}\`)` : ''}`);

    return refs.length > 1
        ? `**Next, if you want one:** ${refs[0]} and ${refs[1]} are open and unclaimed; a comment on either claims it. ${list} has more if both are taken by then.`
        : `**Next, if you want one:** ${refs[0]} is open and unclaimed; a comment on it claims it. ${list} has more if it is taken by then.`
}

/**
 * @summary The comment for a merged pull request, or null when it gets none: not merged, a bot or team author, or a
 * bot-authored marker already on it.
 *
 * The first merge and each new rung get the full form: thanks, standing, next issues, an invitation and a star. A
 * merge between rungs gets standing and next issues. While `badgesSince` is null no form mentions the badge. Once it
 * is set, the account's first merge since then hands over the badge line, whichever form it gets, and a later new
 * rung says that the badge shows it. An account on the Pages opt-out list has no folder, so its comment names no
 * badge, and neither does any comment while that list is unknown.
 * @param {Object} options
 * @param {Object} options.pullRequest REST shape: `number`, `merged`, `merged_at`, `author_association`, `user.login`,
 * `user.id`, `user.type`
 * @param {Number} options.mergedBefore The author's merged pull requests before this one
 * @param {Number} [options.mergedSinceLaunchBefore=0] Of those, the ones merged since `badgesSince`
 * @param {Object[]} [options.comments=[]] The pull request's comments
 * @param {Object[]} [options.candidates=[]] See {@link nextIssues}
 * @param {String[]} [options.closedLabels=[]] See {@link nextIssues}
 * @param {String[]} [options.paths=[]] The files the pull request changed
 * @param {String} options.repoUrl e.g. `https://github.com/neomjs/neo`
 * @param {String|null} [options.badgesSince=BADGES_SINCE]
 * @param {Number[]|null} [options.optOut=null] The ids on the Pages opt-out list (see {@link parseOptOut}), or null
 * while it is unread
 * @returns {{body: String}|null}
 * @throws {TypeError} When `mergedBefore` is not a count, so the workflow warns instead of posting a wrong standing
 */
export function decideMergeComment({pullRequest, mergedBefore, mergedSinceLaunchBefore = 0, comments = [], candidates = [], closedLabels = [], paths = [], repoUrl, badgesSince = BADGES_SINCE, optOut = null}) {
    if (!pullRequest?.merged || !isOutsideHuman(pullRequest)) {
        return null
    }

    const marker = mergeMarker(pullRequest.number);

    // Only a bot-authored marker counts: anyone can paste the text, and a pasted one must not silence the comment.
    if (comments.some(comment => comment.user?.type === 'Bot' && String(comment.body || '').includes(marker))) {
        return null
    }

    if (!Number.isInteger(mergedBefore) || mergedBefore < 0) {
        throw new TypeError(`mergedBefore must be a count, got ${mergedBefore}`)
    }

    const
        {login, id}             = pullRequest.user,
        count                   = mergedBefore + 1,
        {rung, next, remaining} = standing(count),
        atRung                  = RUNGS.some(entry => entry.merges === count),
        suggested               = nextIssues({closedLabels, candidates, seed: login}),
        standingLine            = `**Standing:** ${rung.name} (${count} merged).${next ? ` ${remaining} more reach ${next.name}.` : ''}`,
        // The generator writes a folder only for a merge since the launch, so an earlier one, re-run, names no badge,
        // and none for an account on the opt-out list, which an unread list may hold
        hasFolder               = Boolean(badgesSince) && Date.parse(pullRequest.merged_at) >= Date.parse(badgesSince) &&
                                  Array.isArray(optOut) && !optOut.includes(Number(id)),
        badgeOffer              = hasFolder && mergedSinceLaunchBefore === 0
            ? `**Your badge**, if you would like to show it, exists within the hour at ${BADGE_ROOT}/${badgeFolder(login, id)}/ with three forms to choose from. The card's line:\n\`${badgeLine(login, id)}\``
            : null,
        badge                   = badgeOffer || (hasFolder && atRung ? 'Your badge shows it within the hour.' : null),
        nextLine                = suggested.length > 0 ? renderNext(suggested, repoUrl) : null;

    const paragraphs = atRung ? [
        count === 1
            ? 'Merged. Thank you: this is your first merged pull request in Neo.mjs.'
            : `Merged. Thank you: that makes ${count} merged pull requests of yours in Neo.mjs.`,
        standingLine,
        badge,
        nextLine,
        invitation(paths),
        'A star helps others find the project.'
    ] : [
        `Merged. ${standingLine}`,
        badgeOffer,
        nextLine
    ];

    return {body: [...paragraphs.filter(Boolean), marker].join('\n\n')}
}
