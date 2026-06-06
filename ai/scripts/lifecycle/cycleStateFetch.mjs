/**
 * @summary Maps raw GitHub query output into the `computeCycleState()` input shape — the impure
 * fetch-and-map layer feeding the shared cycle-state discriminator. The daemon runs the GitHub queries
 * (it can afford the latency; the sync Stop hook reads the cached verdict instead), then maps the JSON
 * here so the derivation (CI-green, changes-requested, review-requested) stays pure + unit-testable.
 *
 * **Increment scope:** the mappers for all four cycle steps (own PRs + review requests = steps 1-3;
 * backlog = step 4) PLUS the impure `fetchExternalState` orchestrator that runs the queries + maps them.
 * The query-runner is injectable so the orchestration stays unit-testable; gathering the backlog
 * flag-context (issue relations + lane-claim A2As) is delegated to an injectable `gatherContext` whose
 * concrete implementation is the follow-up increment.
 *
 * @see ai/scripts/lifecycle/cycleState.mjs      — the discriminator these feed
 * @see ai/scripts/lifecycle/cycleStateCache.mjs — where the daemon caches the computed verdict
 */

import {execFile}  from 'child_process';
import {promisify} from 'util';

const execFileAsync = promisify(execFile);

/**
 * Is a PR's CI green? Pure over a `gh pr view --json statusCheckRollup` rollup array.
 *
 * Green = every check has settled successfully (no FAILURE / ERROR, and nothing still PENDING /
 * IN_PROGRESS / QUEUED). An empty rollup (no checks configured) counts as green — there is nothing
 * failing to block a review request. Handles both `CheckRun` (`conclusion`) and legacy `StatusContext`
 * (`state`) rollup shapes.
 *
 * @param {Object[]} rollup The `statusCheckRollup` array from `gh pr ... --json statusCheckRollup`.
 * @returns {Boolean}
 */
export function isCiGreen(rollup) {
    if (!Array.isArray(rollup) || rollup.length === 0) return true;
    return rollup.every(check => {
        const outcome = check?.conclusion || check?.state; // CheckRun.conclusion | StatusContext.state
        return outcome === 'SUCCESS' || outcome === 'NEUTRAL' || outcome === 'SKIPPED'
    })
}

/**
 * Maps `gh pr list --author @me --json number,statusCheckRollup,reviewDecision,reviewRequests` output
 * into the discriminator's `ownPRs` shape.
 * @param {Object[]} prListJson
 * @returns {{ref:String, ciGreen:Boolean, reviewRequested:Boolean, changesRequested:Boolean}[]}
 */
export function mapOwnPRs(prListJson) {
    return (Array.isArray(prListJson) ? prListJson : []).map(pr => ({
        ref             : `#${pr.number}`,
        ciGreen         : isCiGreen(pr.statusCheckRollup),
        // A reviewer is currently requested on the PR (so a fresh request is NOT needed).
        reviewRequested : Array.isArray(pr.reviewRequests) && pr.reviewRequests.length > 0,
        changesRequested: pr.reviewDecision === 'CHANGES_REQUESTED'
    }))
}

/**
 * Maps `gh pr list --search "review-requested:@me" --json number` output into the discriminator's
 * `reviewRequests` shape (PRs where a review is designated to this agent).
 * @param {Object[]} prListJson
 * @returns {{ref:String}[]}
 */
export function mapReviewRequests(prListJson) {
    return (Array.isArray(prListJson) ? prListJson : []).map(pr => ({ref: `#${pr.number}`}))
}

/**
 * Maps candidate backlog issues into the discriminator's `backlog` shape, deriving the claimable-now
 * exclusion flags from cross-source context the caller gathers. Pure over (issue list + context sets) so
 * the flag logic is unit-testable; the impure caller builds the sets from issue relations + lane-claim A2As.
 *
 * The three flags are exactly the discriminator's claimable-now exclusions (a flagged item is NOT a next
 * step → a backlog of only-flagged items is a legitimately-empty cycle the hook must not fire on).
 *
 * @param {Object[]} issueListJson `gh issue list --assignee @me --json number` output.
 * @param {Object} [context]
 * @param {Set<String>}        [context.blockedRefs]    Refs with unresolved blocked-by dependencies.
 * @param {Set<String>}        [context.gatedRefs]      Refs decision-/architecture-gated (e.g. an open design dependency).
 * @param {Map<String,String>} [context.claimedByOther] ref → another agent's identity holding an active lane-claim.
 * @returns {{ref:String, blocked:Boolean, gated:Boolean, claimedByOther:(String|undefined)}[]}
 */
export function mapBacklog(issueListJson, {blockedRefs = new Set(), gatedRefs = new Set(), claimedByOther = new Map()} = {}) {
    return (Array.isArray(issueListJson) ? issueListJson : []).map(issue => {
        const ref = `#${issue.number}`;
        return {ref, blocked: blockedRefs.has(ref), gated: gatedRefs.has(ref), claimedByOther: claimedByOther.get(ref)}
    })
}

/**
 * Maps recent A2A lane-claim messages into the backlog `claimedByOther` context — `ref` → the OTHER
 * agent's identity holding an active claim. Self-claims are excluded (claiming your own lane is not a
 * collision). Pure; the impure caller fetches the lane-claim messages (graph) + passes them. One source
 * of `gatherContext`; issue blocked-by relations + gated labels are the other sources (follow-ups).
 *
 * @param {Object[]} messages       Recent messages, each `{subject, from}`.
 * @param {String}   selfIdentity   This agent's identity (its own claims are not collisions).
 * @returns {Map<String,String>} `ref` (`#N`) → claiming agent identity.
 */
export function mapLaneClaims(messages, selfIdentity) {
    const map = new Map();
    for (const msg of Array.isArray(messages) ? messages : []) {
        if (!msg || msg.from === selfIdentity || typeof msg.subject !== 'string') continue;
        // "[lane-claim] taking #N …" / "[lane-claim] #N …" — the first #N after the tag is the claimed lane.
        const match = /\[lane-claim\][^#]*#(\d+)/.exec(msg.subject);
        if (match) map.set(`#${match[1]}`, msg.from)
    }
    return map
}

/**
 * Default query-runner: spawns `gh` with the given args and parses the JSON stdout. Impure; injected by
 * {@link fetchExternalState} so the orchestration is testable without `gh`.
 * @param {String[]} args
 * @returns {Promise<Object[]>}
 */
async function defaultGhQuery(args) {
    const {stdout} = await execFileAsync('gh', args, {maxBuffer: 8 * 1024 * 1024});
    return JSON.parse(stdout || '[]')
}

/**
 * Fetches + maps the external lifecycle state for one identity into the `computeCycleState()` input. The
 * three GitHub queries run in parallel; the (pure, tested) mappers shape the results. Impure only in the
 * query-runner, which is injectable.
 *
 * @param {String} identity The agent identity (a leading `@` is stripped for the `gh` search field).
 * @param {Object} [opts]
 * @param {Function} [opts.runQuery=defaultGhQuery] `async (args[]) => parsed JSON` — injected for testing.
 * @param {Function} [opts.gatherContext] `async (identity) => {blockedRefs, gatedRefs, claimedByOther}` for
 * the backlog flags; defaults to empty context (every backlog item claimable-now) until the follow-up lands.
 * @returns {Promise<{ownPRs:Object[], reviewRequests:Object[], backlog:Object[], openOwnPrCount:Number}>}
 */
export async function fetchExternalState(identity, {runQuery = defaultGhQuery, gatherContext = async () => ({})} = {}) {
    const id = String(identity || '').replace(/^@/, '');
    const [ownPRsJson, reviewReqJson, backlogJson] = await Promise.all([
        runQuery(['pr', 'list', '--author', id, '--json', 'number,statusCheckRollup,reviewDecision,reviewRequests']),
        runQuery(['pr', 'list', '--search', `review-requested:${id}`, '--json', 'number']),
        runQuery(['issue', 'list', '--assignee', id, '--json', 'number'])
    ]);
    const ownPRs = mapOwnPRs(ownPRsJson);
    return {
        ownPRs,
        reviewRequests: mapReviewRequests(reviewReqJson),
        backlog       : mapBacklog(backlogJson, await gatherContext(identity)),
        openOwnPrCount: ownPRs.length
    }
}
