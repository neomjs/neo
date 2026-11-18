/**
 * @module buildScripts/util/claimResponse
 * @summary Decides the automatic reply and assignment for a claim on a curated issue, which
 * `.github/workflows/claim-responder.yml` runs within a minute of the comment.
 *
 * @description Maintainers are not online around the clock, so a claim used to wait until a seat ran, and that
 * could be many hours. The responder closes that gap while bounding claim spraying:
 *
 * - **first in line:** nothing live holds the issue and the claimant has an available curated claim in the
 *   repository, so the workflow assigns them (clearing any lapsed >3-day silent outside assignee) and they can start
 *   now (`decideClaim` → `assign: true`).
 * - **at capacity:** a claimant who has filled their slots can ask again after one opens.
 * - **taken:** a live assignee, an open pull request that resolves the issue, or an earlier unwithdrawn, un-unassigned
 *   claimant holds it. The reply names the holder and points at claimable issues with the same label.
 *
 * Pull-request lifecycle events (`decidePullRequestTarget`, `decideTargetRemoval`, `decidePullRequestRelease`) request
 * assignment under standing and three-day ownership rules (attaching authors GitHub permits — issue commenters or
 * the issue author) for outside pull requests targeting curated issues, emitting neutral
 * overlap or residual-scope notices on held or completed targets and deduplicated release notices on unmerged closes.
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
 * Repository permissions that belong to the team, as
 * `GET /repos/{owner}/{repo}/collaborators/{username}/permission` names them.
 * @member {String[]} TEAM_PERMISSIONS
 */
export const TEAM_PERMISSIONS = Object.freeze(['admin', 'maintain', 'write']);

/**
 * Repository permissions an outside account can hold.
 * @member {String[]} OUTSIDE_PERMISSIONS
 */
const OUTSIDE_PERMISSIONS = Object.freeze(['triage', 'read', 'none']);

/**
 * How long a claim holds an issue for later claimants after its claimant's latest comment, mirroring CONTRIBUTING's
 * three days for a silent claimant. Every claim that delivered did so within eight hours, and one silent for a day has
 * never delivered; a silent claim that kept the issue for a week simply parked the work.
 * @member {Number} CLAIM_WINDOW_DAYS
 */
export const CLAIM_WINDOW_DAYS = 3;

/**
 * ISO timestamp from which unmerged pull-request closes emit release notices on open curated issues, or `null` while
 * release notices remain disabled pending operational repository activation. Keeping the default `null` (and passing
 * an explicit timestamp only when enabled, e.g. via workflow variable `NEO_CLAIM_RELEASE_SINCE`) ensures merging the
 * module creates no premature notifications and historical pre-activation closes are never backfilled.
 * @member {String|null} CLAIM_RELEASE_SINCE
 */
export const CLAIM_RELEASE_SINCE = null;

const
    DAY_MS                   = 24 * 60 * 60 * 1000,
    MARKER_PREFIX            = '<!-- claim-responder:',
    NEO_CLAIM_RECORD         = /<!-- neo-claim:v(\d+) (\{[^\n]*?\}) -->/g,
    REFUSED_COMMENT          = /<!-- claim-refused:(\d+) -->/,
    REPO_PATTERN             = /^[^/\s]+\/[^/\s]+$/,
    CAPACITY_REFUSAL_START   = Object.freeze(["you're already assigned to ", 'you already hold ']),
    CLAIM_TARGET             = String.raw`(this|it|#\d+|the\s[^\n]{1,80}?\brow\b)`,
    APOSTROPHE_LOOKALIKES    = /[\u{2018}\u{2019}\u{2BC}\u{B4}]/gu,
    SLASH_WITHDRAWAL_PATTERN = /^\s*\/(unassign|unclaim)(?:[ \t]+me)?[ \t.!]*$/im,
    INLINE_QUOTE_PATTERN     = /`[^`\n]*`|"[^"\n]*"|(?:^|(?<=[\s([:;,-]))'[^'\n]+'(?=$|[\s.,!?;:)\]-])/g,
    SENTENCE_MATCH_PATTERN            = /[^.!?\n;]+[.!?\n;]?/g,
    CONDITIONAL_SENTENCE              = /\b(?:if(?!\s+(?:useful|helpful|needed)\b)|unless|whether|when|whenever|provided\s+that|in\s+case|suppos(?:e|ing)|assum(?:e|ing))\b/i,
    STRONG_CLAUSE_SPLIT_PATTERN       = /\b(?:so|therefore|thus)\s+/i,
    WEAK_CLAUSE_SPLIT_PATTERN         = /[,:\u2013\u2014]+|\s+-\s+|\band\s+(?=(?:i\b|i'|please\b|unclaim|withdraw|drop|releas|giv|step|consider))/i,
    PRIOR_NEGATION_OR_FRAME           = /\b(?:not|never|no|neither|nor|without|say|said|saying|write|wrote|written|writing|post|posted|posting|type|typed|typing|comment|commented|reply|replied|quote|quoted|mean|meant|meaning|read|reads|sound|sounds|phrase|wording|example|such\s+as|instead\s+of|rather\s+than|wrong|mistake|false|pretend|imagine)\b|n't\b/i,
    PRIOR_HARD_FRAME                  = /\b(?:say|said|saying|write|wrote|written|writing|post|posted|posting|type|typed|typing|comment|commented|reply|replied|quote|quoted|mean|meant|meaning|read|reads|sound|sounds|phrase|wording|example|such\s+as|instead\s+of|rather\s+than|wrong|mistake|false|pretend|imagine|think|thought|plan|planned|planning|intend|intended|consider|considering|want|wanted|should|would)\b/i,
    PRIOR_INABILITY_REASON            = /\b(?:work(?:\s+on)?|finish|continue|proceed|time|bandwidth|capacity|reproduce|build|compile|run|running|pass|passing|setup|set\s+up|environment|docker|windows|mac|linux|figure(?:\s+it)?\s+out|get\s+(?:it|this|the\b))\b/i,
    PRIOR_CONTRAST_RESET              = /\b(?:earlier|before|previously|yesterday)\b/i,
    PRIOR_DANGLING_TAIL               = /(?:\b(?:not|never|no|and|or|but|will|would|can|could|should|do|does|did|have|has|had|am|is|are|to)|n't)$/i,
    POLITE_LEAD                       = String.raw`(?:(?:sorry|apologies|unfortunately|hey|hi|hello)\s+)?`,
    AFFIRMATIVE_SUBJECT               = String.raw`(?:(?:i'?m|i\s+am|i'?ll|i\s+will|i'?ve|i\s+have|i'?d\s+like\s+to|i\s+(?:want|need|have)\s+to|i)\s+(?:now\s+|hereby\s+|going\s+to\s+)?)`,
    AFFIRMATIVE_WITHDRAWAL_PATTERNS   = Object.freeze([
        new RegExp(String.raw`^${POLITE_LEAD}(?:please\s+)?unassign\s+me\b`, 'i'),
        new RegExp(String.raw`^${POLITE_LEAD}(?:${AFFIRMATIVE_SUBJECT}unclaim(?:ing)?|unclaiming|unclaim\s+(?:this|it|#\d+))\b`, 'i'),
        new RegExp(String.raw`^${POLITE_LEAD}(?:${AFFIRMATIVE_SUBJECT}(?:withdraw(?:ing|n)?|withdrew)|withdrawing)\s+(?:(?:my|this|the)\s+claim|from\s+(?:this|it|#\d+))\b`, 'i'),
        new RegExp(String.raw`^${POLITE_LEAD}(?:${AFFIRMATIVE_SUBJECT}(?:drop(?:ping|ped)?|releas(?:e|ed|ing)|giv(?:e|en|ing)\s+(?:back|up))|(?:dropping|releasing|giving\s+(?:back|up)))\s+(?:(?:my|this|the)\s+)?claim\b`, 'i'),
        new RegExp(String.raw`^${POLITE_LEAD}(?:${AFFIRMATIVE_SUBJECT}step(?:ping|ped)?|stepping)\s+(?:back|away)\b`, 'i'),
        new RegExp(String.raw`^${POLITE_LEAD}(?:please\s+)?consider\s+(?:it|this)\s+available\b`, 'i'),
        new RegExp(String.raw`^${POLITE_LEAD}(?:the\s+)?(?:issue|this|it)\s+is\s+(?:now\s+)?(?:free|available)\s+for\s+(?:anyone|others|another)\b`, 'i')
    ]),
    MODAL_CLAUSE_WITHDRAWAL           = new RegExp(String.raw`^${POLITE_LEAD}(?:(?:i'?m|i\s+am)\s+(?:no\s+longer|not)\s+(?:able|going|planning)\s+to|(?:i\s+)?(?:can'?t|cannot|won'?t|will\s+not|(?:no\s+longer|not)\s+(?:able|going|planning)\s+to))\s+(?:be\s+able\s+to\s+)?(?:work(?:\s+on)?|take|continue|finish|proceed)\b(.*)$`, 'i'),
    WITHDRAWAL_TOPIC_WORD             = /\b(?:unclaim|unassign|withdraw|drop|releas|giv(?:e|en|ing)\s+(?:back|up)|step(?:ping)?\s+(?:back|away))/i,
    WITHDRAWAL_NEGATION_WORD          = /\b(?:not|never|cannot|without|no)\b|n't\b/i,
    DEFERRAL_CLAUSE_PATTERN           = /\b(?:before|by|until|till|today|tonight|tomorrow|this\s+(?:morning|afternoon|evening|week|weekend)|right\s+now|yet)\b/i,
    CONTINUATION_PATTERN      = /\b(?:(?:the\s+|a\s+)?(?:pr|pull\s+request|fix|patch|work|branch)\s+(?:comes|is\s+coming|will\s+be\s+(?:up|ready|open|opened|pushed|submitted|sent|soon|tomorrow|tonight|today|this\b|on\b|by\b)|is\s+(?:still\s+)?(?:underway|in\s+progress|ongoing|nearly\s+ready|almost\s+ready))|(?:i'?ll|i\s+will)\s+(?:push|open|submit|send|finish)|still\s+(?:working\s+on|underway|in\s+progress|on\s+it))\b/i,
    CLAIM_PATTERNS         = Object.freeze([
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
 * ("it's yours") or a snippet is judged by its own words only, and the apostrophe look-alikes that smart punctuation
 * and some keyboard layouts type (’ ‘ ʼ ´) folded to the `'` every pattern spells.
 * @param {String} body
 * @returns {String}
 */
export function claimText(body = '') {
    return String(body)
        .replace(/```[\s\S]*?```/g, '')
        .replace(APOSTROPHE_LOOKALIKES, "'")
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
 * @summary Matches prose withdrawals only on non-question, non-conditional clauses stated affirmatively by the claimant.
 * @param {String} text Stripped comment text from {@link claimText}
 * @returns {Boolean}
 * @private
 */
function hasAffirmativeProseWithdrawal(text) {
    const cleaned = text.replace(INLINE_QUOTE_PATTERN, ' ');
    for (const rawSentence of cleaned.match(SENTENCE_MATCH_PATTERN) || []) {
        const sentence = rawSentence.trim();
        if (!sentence || sentence.endsWith('?') || CONDITIONAL_SENTENCE.test(sentence)) continue;
        for (const strongClause of sentence.split(STRONG_CLAUSE_SPLIT_PATTERN)) {
            let priorBlocked = false;
            for (const rawClause of strongClause.split(WEAK_CLAUSE_SPLIT_PATTERN)) {
                const clause = rawClause.trim();
                if (!clause) continue;
                if (!priorBlocked) {
                    if (AFFIRMATIVE_WITHDRAWAL_PATTERNS.some(pattern => pattern.test(clause))) return true;
                    const modal = clause.match(MODAL_CLAUSE_WITHDRAWAL);
                    if (modal && !DEFERRAL_CLAUSE_PATTERN.test(modal[1] || '')) return true;
                }
                if (PRIOR_NEGATION_OR_FRAME.test(clause)) {
                    const allowedInability = (PRIOR_INABILITY_REASON.test(clause) || PRIOR_CONTRAST_RESET.test(clause)) &&
                        !PRIOR_HARD_FRAME.test(clause) &&
                        !PRIOR_DANGLING_TAIL.test(clause);
                    if (!allowedInability) priorBlocked = true;
                }
            }
        }
    }
    return false
}

/**
 * @summary Detects sentences explicitly denying a withdrawal so later denials supersede an older `/unclaim`.
 * @param {String} text Stripped comment text from {@link claimText}
 * @returns {Boolean}
 * @private
 */
function hasWithdrawalDenial(text) {
    return text.split(/[.!?\n]+/).some(sentence =>
        WITHDRAWAL_TOPIC_WORD.test(sentence) && WITHDRAWAL_NEGATION_WORD.test(sentence)
    )
}

/**
 * Whether a comment gives a claim back ("I'm stepping back from this one"), which frees the issue for the next person.
 * Negated statements ("I am not withdrawing my claim"), active-work continuation notes, scheduled deferrals that still
 * signal ongoing work, and comments that also claim the issue return `false`.
 * @param {String} body
 * @returns {Boolean}
 */
export function isWithdrawal(body) {
    const text = claimText(body);

    if (CLAIM_PATTERNS.some(pattern => pattern.test(text))) return false;
    if (SLASH_WITHDRAWAL_PATTERN.test(text)) return true;
    if (CONTINUATION_PATTERN.test(text)) return false;

    return hasAffirmativeProseWithdrawal(text)
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
 * Whether a repository permission belongs to the team. A caller asks it where {@link isOutsideHuman} cannot decide:
 * a pull request's `author_association` hides a membership that is not public, in a merge event's payload and for a
 * workflow's token alike, so a team account reads as `CONTRIBUTOR` there. An issue comment's payload does name it.
 * @param {String} permission `permission` of `GET /repos/{owner}/{repo}/collaborators/{username}/permission`
 * @returns {Boolean}
 * @throws {Error} When the value names no permission: an account that cannot be told apart is not an outside one
 */
export function isTeamPermission(permission) {
    if (TEAM_PERMISSIONS.includes(permission)) return true;

    if (!OUTSIDE_PERMISSIONS.includes(permission)) throw new Error(`"${permission}" names no repository permission`);

    return false
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
 * Identifies a reply to this claimant. A refusal can be reconsidered on a later explicit claim.
 * @param {String} login
 * @returns {String}
 */
export function replyMarker(login) {
    return `${MARKER_PREFIX}@${String(login).toLowerCase()} -->`
}

/**
 * @summary Identifies the bot confirmation reply for a claimant's withdrawal.
 * @param {String} login
 * @returns {String}
 */
export function withdrawalMarker(login) {
    return `${MARKER_PREFIX}withdrawn:@${String(login).toLowerCase()} -->`
}

/** @summary Orders REST comments, including comments posted in the same second. */
function follows(later, earlier) {
    return later.created_at > earlier.created_at ||
        (later.created_at === earlier.created_at && later.id > earlier.id)
}

/** @summary True when `value` is a safe positive integer. */
function isPositiveInt(value) {
    return Number.isSafeInteger(value) && value > 0
}

/** @summary Formats a grammatical human list ("a", "a and b", "a, b and c"). */
function formatList(items) {
    return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0]
}

/** @summary Shared markdown options block naming rotated claimable alternatives or the open-issues search link. */
function alternativeOptions({alternatives = [], label, repoUrl}) {
    const listUrl = `${repoUrl}/issues?q=${encodeURIComponent(`is:issue is:open label:"${label}" no:assignee -linked:pr`)}`;

    return alternatives.length > 0
        ? [`These \`${label}\` issues are open and nobody holds them:`, '', ...alternatives.map(number => `- #${number}`), '', `The [full list](${listUrl}) has the rest. Comment on one to claim it.`]
        : [`Check the [list of open \`${label}\` issues](${listUrl}) for another issue to claim.`]
}

/** @summary Sorts REST comments or events in chronological creation order (breaking timestamp ties by id). */
function sortByCreation(items = []) {
    return [...items].sort((a, b) => {
        const aTime = String(a?.created_at || ''), bTime = String(b?.created_at || '');
        if (aTime !== bTime) return aTime < bTime ? -1 : 1;
        return (a?.id || 0) - (b?.id || 0)
    })
}

/** @summary Validates pull-request author identity and timestamps so unknown identities fail visibly. */
function assertPullRequestIdentity(pullRequest, {requireClosedAt = false} = {}) {
    if (!isPositiveInt(pullRequest?.number)) {
        throw new Error(`Invalid pull request number: ${pullRequest?.number}`)
    }
    if (pullRequest?.user?.type === 'Bot') {
        throw new Error(`Pull request #${pullRequest.number} belongs to a bot account`)
    }
    if (typeof pullRequest?.user?.login !== 'string' || !pullRequest.user.login) {
        throw new Error(`Pull request #${pullRequest.number} has no author login`)
    }
    if (!isPositiveInt(pullRequest?.user?.id)) {
        throw new Error(`Pull request #${pullRequest.number} has no numeric author id`)
    }
    if (!Number.isFinite(Date.parse(pullRequest?.created_at))) {
        throw new Error(`Pull request #${pullRequest.number} has an invalid created_at timestamp`)
    }
    if (requireClosedAt && !Number.isFinite(Date.parse(pullRequest?.closed_at))) {
        throw new Error(`Pull request #${pullRequest.number} has an invalid closed_at timestamp`)
    }
}

/** @summary True when `reply` came from this repository's workflow bot account. */
function isWorkflowBotComment(reply) {
    return reply?.user?.type === 'Bot' && reply.user.login === 'github-actions[bot]'
}

/** @summary Only this workflow's bot can issue a claim receipt or own a refusal to update. */
function isClaimReply(reply, login) {
    return isWorkflowBotComment(reply) && reply.body?.includes(replyMarker(login))
}

/** @summary Only this workflow's bot can record a withdrawal release confirmation. */
function isWithdrawalReply(reply, login) {
    return isWorkflowBotComment(reply) && Boolean(reply.body?.includes(withdrawalMarker(login)))
}

/** @summary Recognises a bot refusal, including replies written before refusals had a separate marker. */
function refusedClaim(reply, login) {
    if (!isClaimReply(reply, login)) return false;

    const opening = `thanks, @${String(login).toLowerCase()}! `;
    const body    = reply.body.toLowerCase();

    return REFUSED_COMMENT.test(body) || body.startsWith(opening + "you're already assigned to ") ||
        body.startsWith(opening + 'this one is taken:')
}

/** @summary True when `reply` refused `login` solely for their own active-claim slot capacity. */
function isCapacityRefusal(reply, login) {
    if (!refusedClaim(reply, login)) return false;

    const opening = `thanks, @${String(login).toLowerCase()}! `;
    const body    = reply.body.toLowerCase();

    return CAPACITY_REFUSAL_START.some(prefix => body.startsWith(opening + prefix))
}

/** @summary Validates a decoded `neo-claim:v1` marker object against the overlap or release wire contract. */
function isValidClaimRecord(record) {
    if (!record || typeof record !== 'object') return false;

    if (record.kind === 'overlap') {
        return isPositiveInt(record.issue) && isPositiveInt(record.pr) &&
            /^(?:pr:[1-9]\d*|user:[1-9]\d*)$/.test(String(record.heldBy || ''))
    }

    if (record.kind === 'release') {
        return typeof record.repo === 'string' && REPO_PATTERN.test(record.repo) &&
            isPositiveInt(record.issue) && isPositiveInt(record.pr) &&
            isPositiveInt(record.to) && typeof record.login === 'string' && record.login.length > 0
    }

    return false
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
        before       = comments.filter(other => follows(comment, other)),
        eventsBefore = events.filter(ev => new Date(ev.created_at).getTime() <= at),
        refused      = comments.filter(reply => reply.user?.type === 'Bot'),
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
            !refused.some(reply => {
                if (!refusedClaim(reply, login)) return false;
                // A serialized run can refuse this claim after the next claimant has already commented.
                // New replies name the exact triggering comment. Older replies only identify the claimant.
                const through = reply.body.match(REFUSED_COMMENT);
                return through ? other.id <= Number(through[1]) : follows(comment, reply) && follows(reply, other)
            }) &&
            at - lastWord(login) <= CLAIM_WINDOW_DAYS * DAY_MS &&
            !before.some(later =>
                String(later.user?.login).toLowerCase() === login &&
                follows(later, other) &&
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
 * @summary Whether `login` is an outside assignee whose latest comment withdrew their claim without a later assignment.
 * @param {String} login Lowercased login
 * @param {Object} options
 * @param {Object[]} [options.comments=[]] Comments up to the evaluation boundary
 * @param {Object[]} [options.events=[]] Issue events up to the evaluation boundary
 * @param {Object} [options.issue]
 * @returns {Boolean}
 * @private
 */
function isWithdrawnOutsideAssignee(login, {comments = [], events = [], issue}) {
    if (!isOutsideAssignee(login, {comments, issue})) {
        return false
    }

    const ownComments = sortByCreation(comments.filter(other => String(other.user?.login).toLowerCase() === login));

    if (ownComments.length < 1) {
        return false
    }

    const lastComment = ownComments.at(-1);

    if (!isWithdrawal(lastComment.body)) {
        return false
    }

    const withdrawnAt = Date.parse(lastComment.created_at);

    return !events.some(ev =>
        ev.event === 'assigned' &&
        String(ev.assignee?.login).toLowerCase() === login &&
        Date.parse(ev.created_at) > withdrawnAt
    )
}

/**
 * Outside-contributor assignees on `issue` whose {@link CLAIM_WINDOW_DAYS} window has elapsed without a comment, recent
 * `assigned` event, or open pull request into `repository`, or whose latest own comment withdrew their claim. Team
 * assignees never lapse.
 * @param {Object} options
 * @param {Object} options.comment The claim being evaluated (`id`, `created_at`)
 * @param {Object[]} [options.comments=[]]
 * @param {Object[]} [options.events=[]]
 * @param {Object} [options.issue]
 * @param {Object[]} [options.openPullRequests=[]]
 * @param {String} options.repository `owner/name`
 * @returns {String[]} Original-case logins of lapsed or withdrawn outside-contributor assignees
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

        if (!isOutsideAssignee(login, {comments: before, issue})) continue;
        if (openPullRequests.some(pr => String(pr.repository).toLowerCase() === repoLower && String(pr.author).toLowerCase() === login)) continue;
        if (isWithdrawnOutsideAssignee(login, {comments: before, events: eventsBefore, issue})) {
            stale.push(assignee.login);
            continue
        }

        const timestamps = [
            ...before.filter(other => String(other.user?.login).toLowerCase() === login && !isWithdrawal(other.body)).map(other => new Date(other.created_at).getTime()),
            ...eventsBefore.filter(ev => ev.event === 'assigned' && String(ev.assignee?.login).toLowerCase() === login).map(ev => new Date(ev.created_at).getTime()),
            ...(String(issue?.user?.login).toLowerCase() === login && issue?.created_at ? [new Date(issue.created_at).getTime()] : [])
        ].filter(Number.isFinite);

        if (timestamps.length > 0 && at - Math.max(...timestamps) > CLAIM_WINDOW_DAYS * DAY_MS) stale.push(assignee.login);
    }

    return stale
}

/**
 * What holds the issue for everyone except `claimant`: a live assignee (team assignees unconditionally; outside
 * assignees within {@link CLAIM_WINDOW_DAYS} or with an open pull request, unless withdrawn), an open pull request into
 * `repository` that resolves it, or a live earlier claim. Each person is named once, and the claimant's own pull
 * request holds nothing against them. A pull request inside a fork, whose base is the fork, holds nothing either: it
 * only mentions the issue. Empty when the claimant is first in line.
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
        self         = String(claimant).toLowerCase(),
        at           = new Date(comment.created_at).getTime(),
        before       = comments.filter(other => other.id !== comment.id && new Date(other.created_at).getTime() <= at),
        eventsBefore = events.filter(ev => new Date(ev.created_at).getTime() <= at),
        lapsed       = new Set(staleAssignees({comment, comments, events, issue, openPullRequests, repository}).map(login => login.toLowerCase())),
        named        = new Set(),
        result       = [],
        earlier      = earlierClaim({claimant, comment, comments, events});

    for (const assignee of issue?.assignees || []) {
        const login = assignee.login.toLowerCase();

        if (lapsed.has(login) || isWithdrawnOutsideAssignee(login, {comments: before, events: eventsBefore, issue})) continue;

        named.add(login);
        result.push({kind: 'assignee', login: assignee.login, ...(isPositiveInt(assignee.id) ? {id: assignee.id} : {})})
    }

    for (const pullRequest of openPullRequests) {
        if (String(pullRequest.repository).toLowerCase() === String(repository).toLowerCase() &&
            String(pullRequest.author).toLowerCase() !== self) {
            named.add(String(pullRequest.author).toLowerCase());
            result.push({kind: 'pull-request', number: pullRequest.number, login: pullRequest.author})
        }
    }

    if (earlier && !named.has(earlier.user.login.toLowerCase())) {
        result.push({kind: 'earlier-claim', login: earlier.user.login, ...(isPositiveInt(earlier.user?.id) ? {id: earlier.user.id} : {})})
    }

    return result
}

/**
 * The reply text for a claim, carrying its marker.
 * @param {Object} options
 * @param {Boolean} [options.assigned=false] True when the workflow verified `addAssignees` succeeded
 * @param {String} options.claimant
 * @param {Number[]} [options.heldByClaimant=[]] Other open curated issue numbers already assigned to `claimant`
 * @param {Number} [options.claimLimit] Engine standing allowance. Legacy callers keep the single-claim reply.
 * @param {Number} [options.commentId] Triggering claim's REST comment ID, used to identify a refusal on replay.
 * @param {Object[]} [options.holders=[]] From {@link holders}
 * @param {Number[]} [options.alternatives=[]] From {@link pickAlternatives}
 * @param {String} options.label The curated label the alternatives share
 * @param {String} options.repoUrl e.g. `https://github.com/neomjs/neo`
 * @param {Boolean} [options.welcomeBack=false] True when the claimant has a merged pull request across the organisation
 * @returns {String}
 */
export function renderReply({assigned = false, claimant, claimLimit, commentId, heldByClaimant = [], holders: held = [], alternatives = [], label, repoUrl, welcomeBack = false}) {
    const
        contributing = `${repoUrl}/blob/dev/CONTRIBUTING.md`,
        footer       = `<sub>An automatic reply. [How claims work](${contributing})</sub>\n${replyMarker(claimant)}`,
        refusal      = Number.isSafeInteger(commentId) ? `${footer}\n<!-- claim-refused:${commentId} -->` : footer;

    if (held.length < 1) {
        if (heldByClaimant.length > 0) {
            const list = formatList(heldByClaimant.map(number => `#${number}`));

            return [
                claimLimit === undefined
                    ? `Thanks, @${claimant}! You're already assigned to ${list} — please finish or step back from that issue before claiming another curated one, so other contributors get a turn too.`
                    : `Thanks, @${claimant}! You already hold ${list}.${claimLimit === 2 ? '' : ' From five merged pull requests you can hold two at once.'} Please claim this again once a slot opens.`,
                '',
                refusal
            ].join('\n')
        }

        if (assigned) {
            return [
                `Thanks for claiming this, @${claimant}, and ${welcomeBack === true ? 'welcome back' : 'welcome'}! Assigned to you — you can start now.`,
                '',
                `Your claim reserves this issue for ${CLAIM_WINDOW_DAYS} days (any comment here resets the clock; we still merge the first approve-worthy PR if another lands first or a claim goes quiet).`,
                '',
                footer
            ].join('\n')
        }

        return [
            `Thanks for claiming this, @${claimant}, and ${welcomeBack === true ? 'welcome back' : 'welcome'}! You're first in line, so you can start now.`,
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
        options = alternativeOptions({alternatives, label, repoUrl});

    return [
        `Thanks, @${claimant}! This one is taken: ${formatList(reasons)}.`,
        '',
        ...options,
        '',
        refusal
    ].join('\n')
}

/**
 * Decides both assignment eligibility and reply text for `comment`, or null when it gets no reply.
 *
 * No reply for: an issue without a curated label, a pull request, a team or bot author, the issue's assignee, a
 * comment that is not a claim, or a replay. Only a fresh claim after a refusal can reopen the decision.
 * @param {Object} options
 * @param {Object} options.comment The new comment (REST shape)
 * @param {Object} options.issue The issue (REST shape)
 * @param {Object[]} [options.comments=[]] Every comment on the issue, including `comment`
 * @param {Object[]} [options.events=[]] Issue events (`event`, `assignee.login`, `created_at`)
 * @param {Object[]} [options.openPullRequests=[]] `{number, author, repository}` of open pull requests that resolve
 * the issue, `repository` being each one's base
 * @param {Number[]} [options.candidates=[]] Claimable issue numbers with the issue's curated label
 * @param {Number[]} [options.heldByClaimant=[]] Open curated issue numbers already assigned to `claimant`
 * @param {Number} [options.claimLimit] One by default, or two when the workflow verifies returning standing.
 * @param {String} options.repoUrl
 * @param {Boolean} [options.welcomeBack=false] True when the workflow verified a merged pull request across the
 * organisation (`standing(count).rung` is not null). The greetings then say "welcome back".
 * @returns {{assign: Boolean, assignedBody?: String, body: String, unassign?: String[], updateCommentId?: Number}|null}
 * A still-blocked retry updates the workflow's existing refusal and the comment ID it covers.
 */
export function decideClaim({comment, issue, comments = [], events = [], openPullRequests = [], candidates = [], heldByClaimant = [], claimLimit, repoUrl, welcomeBack = false}) {
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

    const reply       = comments.findLast(other => isClaimReply(other, self));
    let   activeReply = reply;
    if (reply) {
        const
            covered       = reply.body.match(REFUSED_COMMENT),
            releasedAfter = !refusedClaim(reply, self) && follows(comment, reply) && (
                comments.some(later =>
                    String(later.user?.login || '').toLowerCase() === self &&
                    isOutsideHuman(later) &&
                    follows(later, reply) &&
                    follows(comment, later) &&
                    isWithdrawal(later.body)
                ) ||
                events.some(ev =>
                    ev.event === 'unassigned' &&
                    String(ev.assignee?.login || '').toLowerCase() === self &&
                    Date.parse(ev.created_at) > Date.parse(reply.created_at) &&
                    Date.parse(ev.created_at) <= Date.parse(comment.created_at)
                )
            );

        if (releasedAfter) {
            activeReply = null
        } else if (!refusedClaim(reply, self) || (covered ? comment.id <= Number(covered[1]) : !follows(comment, reply))) {
            return null
        }
    }

    const
        repository = new URL(repoUrl).pathname.slice(1),
        held       = holders({claimant, comment, comments, events, issue, openPullRequests, repository}),
        otherHeld  = [...new Set(heldByClaimant)].filter(number => number !== issue.number).sort((a, b) => a - b);

    if (held.length || otherHeld.length >= (claimLimit === 2 ? 2 : 1)) {
        const body = renderReply({
            claimant, claimLimit, commentId: comment.id, heldByClaimant: otherHeld, holders: held, label, repoUrl,
            alternatives: held.length ? pickAlternatives({candidates, exclude: issue.number, seed: claimant}) : []
        });
        return activeReply ? {assign: false, body, updateCommentId: activeReply.id} : {assign: false, body}
    }

    return {
        assign      : true,
        assignedBody: renderReply({assigned: true, claimant, label, repoUrl, welcomeBack}),
        body        : renderReply({assigned: false, claimant, label, repoUrl, welcomeBack}),
        unassign    : staleAssignees({comment, comments, events, issue, openPullRequests, repository})
    }
}

/**
 * @summary Renders the automatic reply confirming unassignment on an outside claimant's withdrawal.
 * @param {Object} options
 * @param {String} options.claimant Withdrawing assignee's login
 * @param {Object[]} [options.openPullRequests=[]] Author's still-open pull requests targeting this issue
 * @param {String} options.repoUrl Repository URL (`https://github.com/owner/repo`)
 * @returns {String}
 */
export function renderWithdrawalReply({claimant, openPullRequests = [], repoUrl}) {
    const
        contributing = `${repoUrl}/blob/dev/CONTRIBUTING.md`,
        footer       = `<sub>An automatic reply. [How claims work](${contributing})</sub>\n${withdrawalMarker(claimant)}`;

    if (openPullRequests.length > 0) {
        const
            prList = formatList(openPullRequests.map(pr => `#${pr.number}`)),
            verb   = openPullRequests.length > 1 ? 'are still open and keep holding' : 'is still open and keeps holding';

        return [
            `Thanks for letting us know, @${claimant}! Unassigned you, though ${prList} ${verb} this issue while open. Once closed, anyone (including you) can comment \`/claim\` to take it.`,
            '',
            footer
        ].join('\n')
    }

    return [
        `Thanks for letting us know, @${claimant}! Unassigned you — this issue is free again. Anyone (including you) can comment \`/claim\` to take it.`,
        '',
        footer
    ].join('\n')
}

/**
 * @summary Decides whether an issue comment by an assigned outside contributor should release their assignment and
 * post a one-time confirmation reply on the open curated issue, or `null` when ineligible, already processed, or
 * superseded by a newer claim, continuing-work negation, bot reply, or assignment transition on the thread.
 * @param {Object} options
 * @param {Object} options.comment The triggering comment (REST shape)
 * @param {Object} options.issue The issue (REST shape)
 * @param {Object[]} [options.comments=[]] Issue comments
 * @param {Object[]} [options.events=[]] Issue events
 * @param {Object[]} [options.openPullRequests=[]] Open pull requests targeting `issue`
 * @param {String} options.repoUrl Repository URL (`https://github.com/owner/repo`)
 * @returns {{unassign: String, body: String}|null}
 */
export function decideWithdrawal({comment, issue, comments = [], events = [], openPullRequests = [], repoUrl}) {
    const
        author    = comment?.user?.login,
        commentAt = Date.parse(comment?.created_at),
        label     = curatedLabel(issue);

    if (!author || !Number.isFinite(commentAt) || !issue || issue.pull_request || issue.state !== 'open' || !label || !isOutsideHuman(comment) || !isWithdrawal(comment.body)) {
        return null
    }

    const
        self            = author.toLowerCase(),
        matchedAssignee = (issue.assignees || []).find(assignee => String(assignee?.login || '').toLowerCase() === self);

    if (!matchedAssignee || !isOutsideAssignee(self, {comments, issue})) return null;

    const
        sortedComments = sortByCreation(comments),
        sortedEvents   = sortByCreation(events),
        superseded     = sortedComments.some(other => {
            if (!follows(other, comment)) return false;
            if (isWithdrawalReply(other, self) || (isClaimReply(other, self) && !refusedClaim(other, self))) return true;
            if (String(other.user?.login || '').toLowerCase() !== self || !isOutsideHuman(other)) return false;
            const otherText = claimText(other.body);
            return isClaim(other.body) || hasWithdrawalDenial(otherText) || CONTINUATION_PATTERN.test(otherText)
        }) || sortedEvents.some(ev =>
            (ev.event === 'assigned' || ev.event === 'unassigned') &&
            String(ev.assignee?.login || '').toLowerCase() === self &&
            Date.parse(ev.created_at) > commentAt
        );

    if (superseded) return null;

    const lastBotWithdrawal = sortedComments.findLast(other => follows(comment, other) && isWithdrawalReply(other, self));

    if (lastBotWithdrawal) {
        const
            lastBotAt   = Date.parse(lastBotWithdrawal.created_at),
            hasNewClaim = sortedComments.some(other =>
                String(other.user?.login || '').toLowerCase() === self && isOutsideHuman(other) &&
                isClaim(other.body) && follows(other, lastBotWithdrawal) && follows(comment, other)
            ),
            hasNewAssign = sortedEvents.some(ev =>
                ev.event === 'assigned' && String(ev.assignee?.login || '').toLowerCase() === self &&
                Date.parse(ev.created_at) > lastBotAt && Date.parse(ev.created_at) <= commentAt
            );

        if (!hasNewClaim && !hasNewAssign) return null;
    }

    const
        repoLower  = new URL(repoUrl).pathname.slice(1).toLowerCase(),
        ownOpenPrs = openPullRequests.filter(pr => String(pr.repository).toLowerCase() === repoLower && String(pr.author).toLowerCase() === self);

    return {unassign: matchedAssignee.login, body: renderWithdrawalReply({claimant: author, openPullRequests: ownOpenPrs, repoUrl})}
}

/**
 * @summary Builds the versioned overlap marker appended to a pull-request overlap or residual-review notice.
 * @param {Object} options
 * @param {Number} options.issue Target curated issue number
 * @param {Number} options.pr Pull request number receiving the notice
 * @param {String} options.heldBy Holder identity (`pr:<number>` or `user:<account id>`)
 * @returns {String}
 */
export function overlapMarker({issue, pr, heldBy}) {
    if (!isPositiveInt(issue)) throw new Error(`Invalid issue number: ${issue}`);
    if (!isPositiveInt(pr)) throw new Error(`Invalid pull request number: ${pr}`);
    if (!/^(?:pr:[1-9]\d*|user:[1-9]\d*)$/.test(String(heldBy || ''))) {
        throw new Error(`Invalid overlap holder: ${heldBy}`)
    }

    return `<!-- neo-claim:v1 ${JSON.stringify({kind: 'overlap', issue, pr, heldBy})} -->`
}

/**
 * @summary Builds the versioned release marker appended to an issue release notice after an unmerged close.
 * @param {Object} options
 * @param {String} options.repo Repository `owner/name`
 * @param {Number} options.issue Curated issue number
 * @param {Number} options.pr Unmerged closed pull request number
 * @param {Number} options.to Notified claimant's numeric GitHub account id
 * @param {String} options.login Notified claimant's display login
 * @returns {String}
 */
export function releaseMarker({repo, issue, pr, to, login}) {
    if (typeof repo !== 'string' || !REPO_PATTERN.test(repo)) throw new Error(`Invalid repository: ${repo}`);
    if (!isPositiveInt(issue)) throw new Error(`Invalid issue number: ${issue}`);
    if (!isPositiveInt(pr)) throw new Error(`Invalid pull request number: ${pr}`);
    if (!isPositiveInt(to)) throw new Error(`Invalid claimant account id: ${to}`);
    if (typeof login !== 'string' || !login) throw new Error(`Invalid claimant login: ${login}`);

    return `<!-- neo-claim:v1 ${JSON.stringify({kind: 'release', repo, issue, pr, to, login})} -->`
}

/**
 * @summary Parses versioned `neo-claim:v1` records written by `github-actions[bot]`, ignoring contributor copies,
 * unknown versions and malformed payloads.
 * @param {Object[]} [comments=[]] REST issue or pull-request comments
 * @returns {Object[]} Validated record payloads with `commentId`
 */
export function claimRecords(comments = []) {
    const records = [];

    for (const comment of comments) {
        if (!isWorkflowBotComment(comment) || typeof comment.body !== 'string') {
            continue
        }

        for (const match of comment.body.matchAll(NEO_CLAIM_RECORD)) {
            if (match[1] !== '1') {
                continue
            }

            try {
                const parsed = JSON.parse(match[2]);
                if (isValidClaimRecord(parsed)) {
                    records.push({...parsed, commentId: comment.id})
                }
            } catch {
                // Malformed markers are ignored so partial/edited comments never block parsing.
            }
        }
    }

    return records
}

/**
 * @summary Strips fenced code blocks, blockquoted lines, HTML comments, and single-line inline code spans in one linear
 * pass so close-target extraction avoids multi-character regex sanitization and catastrophic backtracking.
 * @param {String} [body='']
 * @returns {String}
 */
function stripIgnoredMarkdown(body = '') {
    const
        source = String(body),
        len    = source.length,
        chunks = [];

    let
        i           = 0,
        atLineStart = true,
        fenceChar   = '',
        fenceLen    = 0;

    while (i < len) {
        if (fenceChar) {
            const
                nl   = source.indexOf('\n', i),
                end  = nl === -1 ? len : nl,
                line = source.slice(i, end).trim();

            if (line.length >= fenceLen) {
                let matches = true;
                for (let k = 0; k < line.length; k++) {
                    if (line[k] !== fenceChar) {
                        matches = false;
                        break
                    }
                }
                if (matches) {
                    fenceChar = '';
                    fenceLen  = 0
                }
            }

            chunks.push('\n');
            i           = nl === -1 ? len : nl + 1;
            atLineStart = true;
            continue
        }

        if (atLineStart) {
            let ws = i;
            while (ws < len && (source[ws] === ' ' || source[ws] === '\t')) ws++;

            if (source[ws] === '>') {
                const nl = source.indexOf('\n', ws);
                chunks.push('\n');
                i           = nl === -1 ? len : nl + 1;
                atLineStart = true;
                continue
            }

            const marker = source[ws];
            if ((ws - i) <= 3 && (marker === '`' || marker === '~')) {
                let run = ws;
                while (run < len && source[run] === marker) run++;
                const runLen = run - ws;
                if (runLen >= 3) {
                    const nl      = source.indexOf('\n', run);
                    const restEnd = nl === -1 ? len : nl;
                    if (marker === '~' || !source.slice(run, restEnd).includes('`')) {
                        fenceChar   = marker;
                        fenceLen    = runLen;
                        chunks.push('\n');
                        i           = nl === -1 ? len : nl + 1;
                        atLineStart = true;
                        continue
                    }
                }
            }
        }

        if (source.startsWith('<!--', i)) {
            const close = source.indexOf('-->', i + 4);
            chunks.push(' ');
            if (close === -1) {
                break
            }
            i           = close + 3;
            atLineStart = false;
            continue
        }

        if (source[i] === '`') {
            let run = i;
            while (run < len && source[run] === '`') run++;
            const tickLen = run - i;
            const nl      = source.indexOf('\n', run);
            const lineEnd = nl === -1 ? len : nl;

            let search = run;
            let closed = -1;
            while (search < lineEnd) {
                const hit = source.indexOf('`', search);
                if (hit === -1 || hit >= lineEnd) break;
                let hitEnd = hit;
                while (hitEnd < lineEnd && source[hitEnd] === '`') hitEnd++;
                if (hitEnd - hit === tickLen) {
                    closed = hitEnd;
                    break
                }
                search = hitEnd
            }

            if (closed !== -1) {
                chunks.push(' ');
                i           = closed;
                atLineStart = false;
                continue
            }

            chunks.push(source.slice(i, run));
            i           = run;
            atLineStart = false;
            continue
        }

        const ch = source[i];
        chunks.push(ch);
        i++;
        atLineStart = ch === '\n'
    }

    return chunks.join('')
}

/**
 * @summary Extracts positive issue numbers referenced by GitHub closing keywords (`Resolves`, `Closes`, `Fixes`) in a
 * pull request body, ignoring comments, code spans/blocks, quotes and targets in other repositories.
 * @param {String} [body='']
 * @param {String} [repository=''] `owner/name` of the repository receiving the pull request
 * @returns {Number[]} Deduplicated issue numbers in order of first appearance
 */
export function closeTargets(body = '', repository = '') {
    const
        stripped  = stripIgnoredMarkdown(body),
        repoLower = String(repository).toLowerCase(),
        pattern   = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b(?::\s*|\s+(?::\s*)?)(?:(#([1-9]\d*))|([A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100})#([1-9]\d*)|https?:\/\/github\.com\/([A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100})\/issues\/([1-9]\d*))(?!\w)/gi,
        targets   = [],
        seen      = new Set();

    for (const match of stripped.matchAll(pattern)) {
        const
            qualifiedRepo = match[3] || match[5],
            issueNumber   = Number(match[2] || match[4] || match[6]);

        if (qualifiedRepo && repoLower && qualifiedRepo.toLowerCase() !== repoLower) {
            continue
        }
        if (isPositiveInt(issueNumber) && !seen.has(issueNumber)) {
            seen.add(issueNumber);
            targets.push(issueNumber)
        }
    }

    return targets
}

/**
 * @summary Computes close targets added or removed by a pull request lifecycle event. On `edited`, only a body edit
 * produces deltas so title, checklist/prose or base-branch changes never re-claim.
 * @param {Object} options
 * @param {String} options.action Event action (`opened`, `reopened`, `edited`, ...)
 * @param {Object} options.pullRequest REST pull request payload
 * @param {Object} [options.changes] Webhook `changes` object (`changes.body.from`)
 * @param {String} [options.repository=''] `owner/name`
 * @returns {{added: Number[], removed: Number[]}}
 */
export function changedCloseTargets({action, pullRequest, changes, repository = ''}) {
    if (action === 'opened' || action === 'reopened') {
        return {added: closeTargets(pullRequest?.body, repository), removed: []}
    }

    if (action === 'edited' && changes?.body && (typeof changes.body.from === 'string' || changes.body.from === null)) {
        const
            before = closeTargets(changes.body.from ?? '', repository),
            after  = closeTargets(pullRequest?.body, repository);

        return {
            added  : after.filter(number => !before.includes(number)),
            removed: before.filter(number => !after.includes(number))
        }
    }

    return {added: [], removed: []}
}

/**
 * @summary Renders the neutral overlap notice or completed-issue residual-scope review notice posted on a pull request,
 * appending the machine-readable {@link overlapMarker}. Never uses "taken", closes nothing and picks no winner.
 * @param {Object} options
 * @param {String} options.author Pull request author login
 * @param {Number} options.issueNumber Target curated issue number
 * @param {Number} options.prNumber Pull request number receiving the notice
 * @param {Object[]} [options.holders=[]] Active holders from {@link holders}
 * @param {Object[]} [options.mergedPullRequests=[]] Merged pull requests referencing `issueNumber`
 * @param {Number[]} [options.alternatives=[]] Rotated claimable issue numbers
 * @param {String} options.label Curated label shared with alternatives
 * @param {String} options.repoUrl Repository URL (`https://github.com/owner/repo`)
 * @returns {String}
 */
export function renderOverlapNotice({author, issueNumber, prNumber, holders: held = [], mergedPullRequests = [], alternatives = [], label, repoUrl}) {
    const
        contributing = `${repoUrl}/blob/dev/CONTRIBUTING.md`,
        options      = alternativeOptions({alternatives, label, repoUrl});

    if (mergedPullRequests.length > 0) {
        const
            mergedRefs = formatList(mergedPullRequests.map(pr => `#${pr.number}`)),
            marker     = overlapMarker({issue: issueNumber, pr: prNumber, heldBy: `pr:${mergedPullRequests[0].number}`});

        return [
            `Thanks for opening this pull request, @${author}! Note for maintainers and @${author}: #${issueNumber} was already completed by merged work (${mergedRefs}).`,
            '',
            'Please run a residual-scope review against current `dev` rather than treating the issue as open: if distinct work remains, propose a focused residual issue or retarget this pull request with your agreement; otherwise pick another open issue below.',
            '',
            ...options,
            '',
            `<sub>An automatic notice. [How claims work](${contributing})</sub>`,
            marker
        ].join('\n')
    }

    const
        prHolder   = held.find(holder => holder.kind === 'pull-request'),
        userHolder = held.find(holder => holder.kind !== 'pull-request');

    let heldBy;
    if (prHolder) {
        heldBy = `pr:${prHolder.number}`
    } else {
        if (!isPositiveInt(userHolder?.id)) {
            throw new Error(`Cannot identify active holder id on #${issueNumber}`)
        }
        heldBy = `user:${userHolder.id}`
    }

    const
        person       = login => `[${login}](https://github.com/${login})`,
        descriptions = held.map(holder =>
            holder.kind === 'assignee'     ? `${person(holder.login)} is currently assigned` :
            holder.kind === 'pull-request' ? `#${holder.number} is already open for it` :
                                             `${person(holder.login)} asked earlier`
        ),
        marker       = overlapMarker({issue: issueNumber, pr: prNumber, heldBy});

    return [
        `Thanks for opening this pull request, @${author}! Note on #${issueNumber}: ${formatList(descriptions)}.`,
        '',
        'Referencing the same issue indicates possible overlap, not proof of identical scope — this workflow neither closes pull requests nor chooses between them, and maintainers will review open work against `dev`. If you would like an unclaimed issue to start on instead:',
        '',
        ...options,
        '',
        `<sub>An automatic notice. [How claims work](${contributing})</sub>`,
        marker
    ].join('\n')
}

/**
 * @summary Evaluates one newly targeted curated issue for a pull request: requests assignment under standing and
 * expiry rules (which GitHub attaches only when the author has commented on or authored the issue), or emits a
 * neutral overlap or residual-scope notice on the pull request, with zero fabricated issue comments.
 * @param {Object} options
 * @param {Object} options.pullRequest REST pull request payload (`number`, `user`, `created_at`)
 * @param {Object} options.issue Target REST issue payload
 * @param {Object[]} [options.comments=[]] Target issue comments
 * @param {Object[]} [options.events=[]] Target issue events
 * @param {Object[]} [options.prComments=[]] Pull request comments (used for overlap notice dedup)
 * @param {Object[]} [options.openPullRequests=[]] Open pull requests closing `issue`
 * @param {Object[]} [options.mergedPullRequests=[]] Merged pull requests closing `issue`
 * @param {Number[]} [options.candidates=[]] Claimable curated alternatives
 * @param {Number[]} [options.heldByAuthor=[]] Other open curated issue numbers assigned to `pullRequest.user.login`
 * @param {Number} [options.claimLimit=1] One by default, two from returning standing
 * @param {String} options.repoUrl Repository URL (`https://github.com/owner/repo`)
 * @returns {{assign: Boolean, prNotice: (String|undefined), unassign: (String[]|undefined)}|null}
 */
export function decidePullRequestTarget({
    pullRequest, issue, comments = [], events = [], prComments = [], openPullRequests = [], mergedPullRequests = [],
    candidates = [], heldByAuthor = [], claimLimit, repoUrl
}) {
    assertPullRequestIdentity(pullRequest);

    const label = curatedLabel(issue);
    if (!issue || issue.pull_request || !label) {
        return null
    }

    const
        repository   = new URL(repoUrl).pathname.slice(1),
        repoLower    = repository.toLowerCase(),
        author       = pullRequest.user.login,
        authorLower  = author.toLowerCase(),
        mergedOthers = mergedPullRequests.filter(pr =>
            pr.number !== pullRequest.number && String(pr.repository).toLowerCase() === repoLower
        ),
        hasOverlap         = () => claimRecords(prComments).some(record =>
            record.kind === 'overlap' && record.issue === issue.number && record.pr === pullRequest.number
        ),
        hasCompletedNotice = mergedPrNumber => prComments.some(comment =>
            typeof comment?.body === 'string' &&
            comment.body.includes('residual-scope review') &&
            claimRecords([comment]).some(record =>
                record.kind === 'overlap' &&
                record.issue === issue.number &&
                record.pr === pullRequest.number &&
                record.heldBy === `pr:${mergedPrNumber}`
            )
        );

    if (issue.state !== 'open') {
        if (mergedOthers.length < 1 || hasCompletedNotice(mergedOthers[0].number)) {
            return null
        }

        return {
            assign  : false,
            prNotice: renderOverlapNotice({
                author,
                issueNumber       : issue.number,
                prNumber          : pullRequest.number,
                mergedPullRequests: mergedOthers,
                alternatives      : pickAlternatives({candidates, exclude: issue.number, seed: author}),
                label,
                repoUrl
            })
        }
    }

    // Redelivery, reopen or an author who already holds the issue makes no second assignment or notice.
    if ((issue.assignees || []).some(assignee => String(assignee.login).toLowerCase() === authorLower)) {
        return null
    }

    const
        boundary = {id: Number.MAX_SAFE_INTEGER, created_at: pullRequest.created_at},
        held     = holders({claimant: author, comment: boundary, comments, events, issue, openPullRequests, repository});

    if (held.length > 0) {
        if (hasOverlap()) {
            return null
        }

        return {
            assign  : false,
            prNotice: renderOverlapNotice({
                author,
                issueNumber : issue.number,
                prNumber    : pullRequest.number,
                holders     : held,
                alternatives: pickAlternatives({candidates, exclude: issue.number, seed: author}),
                label,
                repoUrl
            })
        }
    }

    const otherHeld = [...new Set(heldByAuthor)].filter(number => number !== issue.number);

    if (otherHeld.length >= (claimLimit === 2 ? 2 : 1)) {
        return {assign: false}
    }

    return {
        assign  : true,
        unassign: staleAssignees({comment: boundary, comments, events, issue, openPullRequests, repository})
    }
}

/**
 * @summary Reconciles removal of a close target from a pull request body on `edited`. Releases ONLY assignments
 * demonstrably created by this workflow bot at or after the pull request opened when no independent claim comment or
 * sibling open pull request keeps ownership; throws visibly on uncertain provenance before any writes occur.
 * @param {Object} options
 * @param {Object} options.pullRequest REST pull request payload
 * @param {Object} options.issue Target REST issue payload
 * @param {Object[]} [options.comments=[]] Target issue comments
 * @param {Object[]} [options.events=[]] Target issue events (`assigned`, `unassigned`, `actor`, `created_at`)
 * @param {Object[]} [options.openPullRequests=[]] Open pull requests closing `issue`
 * @param {String} options.repository `owner/name`
 * @returns {{unassign: Boolean, assignee: (String|undefined)}}
 */
export function decideTargetRemoval({pullRequest, issue, comments = [], events = [], openPullRequests = [], repository}) {
    assertPullRequestIdentity(pullRequest);

    if (!issue || issue.pull_request || !curatedLabel(issue)) {
        return {unassign: false}
    }

    const
        author      = pullRequest.user.login,
        authorLower = author.toLowerCase(),
        repoLower   = String(repository).toLowerCase();

    if (!(issue.assignees || []).some(assignee => String(assignee.login).toLowerCase() === authorLower)) {
        return {unassign: false}
    }

    const sortedEvents   = sortByCreation(events);
    const assignedEvents = sortedEvents.filter(ev =>
        ev.event === 'assigned' && String(ev.assignee?.login || '').toLowerCase() === authorLower
    );

    if (assignedEvents.length < 1) {
        throw new Error(`Uncertain assignment provenance for @${author} on #${issue.number}: no assigned event found`)
    }

    const latestAssigned = assignedEvents.at(-1);
    const actorType      = latestAssigned.actor?.type;
    const actorLogin     = latestAssigned.actor?.login;

    if (!actorType || !actorLogin) {
        throw new Error(`Uncertain assignment provenance for @${author} on #${issue.number}: assigned actor missing`)
    }

    if (actorType === 'User') {
        return {unassign: false}
    }

    if (actorType !== 'Bot' || actorLogin !== 'github-actions[bot]') {
        throw new Error(`Uncertain assignment provenance for @${author} on #${issue.number}: unexpected actor ${actorLogin}`)
    }

    if (openPullRequests.some(pr =>
        pr.number !== pullRequest.number &&
        String(pr.repository).toLowerCase() === repoLower &&
        String(pr.author).toLowerCase() === authorLower
    )) {
        return {unassign: false}
    }

    const
        sortedComments = sortByCreation(comments),
        botComments    = sortedComments.filter(isWorkflowBotComment);

    // Preserve independent live comment claims (explicit unrefused/unwithdrawn outside claim or bot acceptance).
    const ownClaims = sortedComments.filter(comment =>
        String(comment.user?.login || '').toLowerCase() === authorLower &&
        isOutsideHuman(comment) &&
        isClaim(comment.body)
    );
    const hasLiveCommentClaim = ownClaims.some(claim => {
        const claimTime = Date.parse(claim.created_at);
        const refused   = botComments.some(reply => {
            if (!refusedClaim(reply, authorLower)) return false;
            const through = reply.body.match(REFUSED_COMMENT);
            return through ? claim.id <= Number(through[1]) : follows(reply, claim)
        });
        const withdrawn = sortedComments.some(later =>
            String(later.user?.login || '').toLowerCase() === authorLower &&
            follows(later, claim) &&
            isWithdrawal(later.body)
        );
        const unassigned = sortedEvents.some(ev =>
            ev.event === 'unassigned' &&
            String(ev.assignee?.login || '').toLowerCase() === authorLower &&
            Date.parse(ev.created_at) > claimTime
        );
        return !refused && !withdrawn && !unassigned
    });
    const hasAcceptedClaimReply = botComments.some(reply =>
        isClaimReply(reply, authorLower) && !refusedClaim(reply, authorLower)
    );

    if (hasLiveCommentClaim || hasAcceptedClaimReply) {
        return {unassign: false}
    }

    const assignedAt  = Date.parse(latestAssigned.created_at);
    const prCreatedAt = Date.parse(pullRequest.created_at);

    if (!Number.isFinite(assignedAt) || assignedAt < prCreatedAt) {
        throw new Error(`Uncertain assignment provenance for @${author} on #${issue.number}: bot assignment predates PR #${pullRequest.number}`)
    }

    return {unassign: true, assignee: author}
}

/**
 * @summary Decides whether closing a pull request unmerged should notify prior outside claimants on the open curated
 * issue. Respects {@link CLAIM_RELEASE_SINCE}, checks live holders excluding the closing pull request, validates every
 * notified claimant's numeric account id, preserves first-claim order, and deduplicates by numeric id across close /
 * reopen cycles and login renames.
 * @param {Object} options
 * @param {Object} options.pullRequest REST pull request payload (`number`, `user`, `merged`, `closed_at`, `created_at`)
 * @param {Object} options.issue Target REST issue payload
 * @param {Object[]} [options.comments=[]] Target issue comments
 * @param {Object[]} [options.events=[]] Target issue events
 * @param {Object[]} [options.openPullRequests=[]] Open pull requests closing `issue`
 * @param {String} options.repoUrl Repository URL (`https://github.com/owner/repo`)
 * @param {String|null} [options.releaseSince=CLAIM_RELEASE_SINCE] ISO activation boundary, or `null` when disabled
 * @returns {{body: String, notified: Object[]}|null}
 */
export function decidePullRequestRelease({
    pullRequest, issue, comments = [], events = [], openPullRequests = [], repoUrl, releaseSince = CLAIM_RELEASE_SINCE
}) {
    assertPullRequestIdentity(pullRequest, {requireClosedAt: true});

    if (releaseSince === null) {
        return null
    }

    const sinceAt = typeof releaseSince === 'string' ? Date.parse(releaseSince) : NaN;
    if (!Number.isFinite(sinceAt)) {
        throw new Error(`Invalid release activation boundary: ${releaseSince}`)
    }

    const closedAt = Date.parse(pullRequest.closed_at);
    if (pullRequest.merged === true || closedAt < sinceAt) {
        return null
    }

    const label = curatedLabel(issue);
    if (!issue || issue.pull_request || issue.state !== 'open' || !label) {
        return null
    }

    const
        repository = new URL(repoUrl).pathname.slice(1),
        repoLower  = repository.toLowerCase(),
        otherOpen  = openPullRequests.filter(pr => pr.number !== pullRequest.number),
        boundary   = {id: Number.MAX_SAFE_INTEGER, created_at: pullRequest.closed_at},
        held       = holders({claimant: '', comment: boundary, comments, events, issue, openPullRequests: otherOpen, repository});

    if (held.length > 0) {
        return null
    }

    const
        sortedComments = sortByCreation(comments).filter(comment => Date.parse(comment.created_at) <= closedAt),
        sortedEvents   = sortByCreation(events).filter(ev => Date.parse(ev.created_at) <= closedAt),
        botComments    = sortedComments.filter(isWorkflowBotComment),
        claimantsById  = new Map();

    // Update display logins chronologically per numeric user id so account renames show current login on dedup/ping.
    const latestLoginById = new Map();
    for (const comment of sortedComments) {
        if (isPositiveInt(comment.user?.id) && comment.user?.login) {
            latestLoginById.set(comment.user.id, comment.user.login)
        }
    }

    for (const comment of sortedComments) {
        if (!isOutsideHuman(comment) || !isClaim(comment.body)) {
            continue
        }

        const login = comment.user?.login;
        if (!login) continue;

        const loginLower = login.toLowerCase();
        if (loginLower === pullRequest.user.login.toLowerCase() || comment.user?.id === pullRequest.user.id) {
            continue
        }

        const claimAt   = Date.parse(comment.created_at);
        const withdrawn = sortedComments.some(later =>
            String(later.user?.login || '').toLowerCase() === loginLower &&
            follows(later, comment) &&
            isWithdrawal(later.body)
        );
        const unassigned = sortedEvents.some(ev =>
            ev.event === 'unassigned' &&
            String(ev.assignee?.login || '').toLowerCase() === loginLower &&
            Date.parse(ev.created_at) > claimAt
        );
        const capacityRefusal = botComments.some(reply => {
            if (!isCapacityRefusal(reply, loginLower)) return false;
            const through = reply.body.match(REFUSED_COMMENT);
            return through ? comment.id <= Number(through[1]) : follows(reply, comment)
        });

        if (withdrawn || unassigned || capacityRefusal) {
            continue
        }

        if (!isPositiveInt(comment.user?.id)) {
            throw new Error(`Incomplete claimant identity on #${issue.number}: missing numeric user id for @${login}`)
        }

        if (!claimantsById.has(comment.user.id)) {
            claimantsById.set(comment.user.id, {
                id   : comment.user.id,
                login: latestLoginById.get(comment.user.id) || login
            })
        }
    }

    const existingNotifiedIds = new Set(
        claimRecords(comments)
            .filter(record =>
                record.kind === 'release' &&
                record.repo.toLowerCase() === repoLower &&
                record.issue === issue.number &&
                record.pr === pullRequest.number
            )
            .map(record => record.to)
    );

    const unnotified = [...claimantsById.values()].filter(claimant => !existingNotifiedIds.has(claimant.id));
    if (unnotified.length < 1) {
        return null
    }

    const
        contributing = `${repoUrl}/blob/dev/CONTRIBUTING.md`,
        mentions     = unnotified.map(claimant => `@${claimant.login}`).join(' '),
        markers      = unnotified.map(claimant =>
            releaseMarker({repo: repository, issue: issue.number, pr: pullRequest.number, to: claimant.id, login: claimant.login})
        ).join('\n');

    return {
        notified: unnotified,
        body    : [
            `#${pullRequest.number} closed without merging. Earlier claim check from ${mentions}:`,
            '',
            `If you are still interested in #${issue.number}, please post a new claim comment here so the ordinary claim check can verify current state and standing. This notice grants no priority and does not guarantee the issue is still available.`,
            '',
            `<sub>An automatic notice. [How claims work](${contributing})</sub>`,
            markers
        ].join('\n')
    }
}

/**
 * Legacy `String|null` entry preserved for cross-repository callers (`neo-agent-brain`, `neo-agent-institution`) that
 * sparse-checkout this module from `neomjs/neo@dev`.
 * @param {Object} options See {@link decideClaim}
 * @returns {String|null}
 */
export function decideReply(options) {
    // Reply-only consumers cannot record a retry by editing the earlier refusal.
    if (options.comments?.some(reply => isClaimReply(reply, options.comment?.user?.login))) return null;
    return decideClaim(options)?.body || null
}

export {REPO_PATTERN, isPositiveInt, isWorkflowBotComment};
