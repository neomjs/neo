// Class-only implementation. The Orchestrator imports this service and drives `runCycle()`; the
// orchestrator's own entry-point bootstrap populates `globalThis.Neo` (used by `Neo.setupClass(...)`
// at file bottom) before this module loads. This lane has NO standalone daemon — the orchestrator owns
// its cadence, dispatch, and heavy-maintenance lease.
import AiConfig                                                                     from '../../config.mjs';
import Base                                                                         from '../../../src/core/Base.mjs';
import {getTemporalSummaryLevel, UNIFIED_PARTITION}                                 from '../../graph/temporalSummarySchema.mjs';
import {Memory_GraphService as GraphService, Memory_StorageRouter as StorageRouter} from '../../services.mjs';
import {
    composeAgentRecord,
    composeUnifiedRecord,
    DEFAULT_RETAINED_VERSIONS,
    planDailyWindows,
    planSessionWindows,
    resolvePartitionKeys,
    versionsToPrune
} from '../../services/memory-core/helpers/temporalSummaryAggregationEngine.mjs';
import {execSync}           from 'node:child_process';
import {parse as parseYaml} from 'yaml';
import fs                   from 'node:fs';
import path                 from 'node:path';

/**
 * @summary Default trailing daily-window batch per cycle — the bounded, most-recent-first cap the lane
 * re-aggregates each cycle (recent days are re-folded as their sources settle; older days are frozen).
 * @type {Number}
 */
const DEFAULT_DAILY_WINDOW_COUNT = 7;

/**
 * @summary Default trailing session-window batch per cycle — 24 hour-aligned L1 windows, a day's worth. Each
 * hourly window nests within one L2 day, so the two durable tiers stay coherent; recent hours are re-folded as
 * their sources settle.
 * @type {Number}
 */
const DEFAULT_SESSION_WINDOW_COUNT = 24;

/**
 * @summary The temporal-pyramid L1/L2 durable aggregation service — the deterministic lane that writes the
 * durable session/daily temporal-summary records + their velocity fields.
 *
 * **Ownership** — the Orchestrator owns this lane's cadence, dispatch, and heavy-maintenance lease: it is
 * registered in the orchestrator task registry (heavy / exclusive-heavy) and dispatched as a supervised
 * one-shot child under the shared lease. This service holds NO poll loop and NO lease of its own — a second scheduler beside
 * the orchestrator is exactly the anti-pattern this lane forbids. It exposes one entry point the orchestrator
 * drives: `runCycle()`.
 *
 * **Split** — the *pure* aggregation (velocity fold + record composition) lives in
 * `temporalSummaryAggregationEngine.mjs` and is unit-tested in isolation; this class owns only the I/O: the
 * window/source reads and the Chroma + graph upsert. The read + upsert seams (`collectPendingWindows` /
 * `persistTemporalRecord`) are overridable so the cycle tests hermetically.
 *
 * @class Neo.ai.daemons.TemporalSummaryAggregationService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/services/memory-core/helpers/temporalSummaryAggregationEngine.mjs — the pure aggregation engine.
 */
class TemporalSummaryAggregationService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.TemporalSummaryAggregationService'
         * @protected
         */
        className: 'Neo.ai.daemons.TemporalSummaryAggregationService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary One bounded aggregation cycle: read the pending windows (most-recent-first, bounded), then for
     * each window persist the unified-track record plus one record per agent seen in it. The unified track
     * carries the window facts; each per-agent track carries only what is attributable to that agent.
     * @returns {Promise<void>}
     * @protected
     */
    async runCycle() {
        const windows = await this.collectPendingWindows();

        for (const window of windows) {
            for (const partition of this.resolveWindowPartitions(window)) {
                await this.persistTemporalRecord(partition === UNIFIED_PARTITION
                    ? composeUnifiedRecord(window)
                    : composeAgentRecord({...window, partition}))
            }
        }
    }

    /**
     * @summary The partition tracks one window aggregates into: the unified track, plus one per distinct agent
     * observed in the window's session rows. A window whose session source is absent yields the unified track
     * alone — the lane writes no per-agent record it cannot attribute.
     * @param {Object} window
     * @param {Object} [window.sources={}] The window's fetched source rows.
     * @returns {String[]}
     * @protected
     */
    resolveWindowPartitions({sources = {}}) {
        return resolvePartitionKeys((sources.sessions || []).flatMap(session => session?.agentIdentities || []))
    }

    /**
     * @summary Reads the most-recent-first, bounded batch of windows still needing aggregation across BOTH
     * durable tiers — the trailing L1 session (hourly) windows and the trailing L2 daily windows — each tagged
     * with its `level` so {@link runCycle} mints the matching `SUMMARY_SESSION` / `SUMMARY_DAILY` records, and
     * each carrying its fetched source rows (the {@link composeUnifiedRecord} input shape). Both tiers re-fold
     * their recent windows every cycle; the idempotent doc id makes the re-aggregation an in-place overwrite.
     * @returns {Promise<Array<{level:String, windowStart:String, windowEnd:String, sources:Object}>>}
     * @protected
     */
    async collectPendingWindows() {
        const
            anchor = this.resolveAggregationAnchor(),
            plan   = [
                ...planSessionWindows({anchor, hourCount: this.sessionWindowCount()}).map(window => ({level: 'session', window})),
                ...planDailyWindows({anchor, dayCount: this.dailyWindowCount()}).map(window => ({level: 'daily', window}))
            ];

        return Promise.all(plan.map(async ({level, window}) => ({
            level,
            windowStart: window.windowStart,
            windowEnd  : window.windowEnd,
            sources    : await this.fetchWindowSources(window)
        })))
    }

    /**
     * @summary The instant the daily-window plan anchors on (the most-recent target day). Overridable seam
     * so the window plan is deterministic under test.
     * @returns {String} ISO 8601 UTC.
     * @protected
     */
    resolveAggregationAnchor() {
        return new Date().toISOString()
    }

    /**
     * @summary The trailing daily-window batch size per pulse. Overridable seam.
     * @returns {Number}
     * @protected
     */
    dailyWindowCount() {
        return DEFAULT_DAILY_WINDOW_COUNT
    }

    /**
     * @summary The trailing session (hourly) L1 window batch size per pulse. Overridable seam.
     * @returns {Number}
     * @protected
     */
    sessionWindowCount() {
        return DEFAULT_SESSION_WINDOW_COUNT
    }

    /**
     * @summary Fetches one window's source rows (the `deriveVelocityFields` shape) from the six named
     * substrates — merged PRs, dev commits, sessions, high-impact sessions, decision records, graduations.
     * The per-substrate reads (`gh` / `git` / Memory Core) land next; the default empty map keeps the lane
     * honest (it persists true zero-count records) until they do.
     * @param {{windowStart:String, windowEnd:String}} window
     * @returns {Promise<Object>}
     * @protected
     */
    async fetchWindowSources(window) {
        return {
            mergedPrs         : await this.fetchMergedPrs(window),
            devCommits        : await this.fetchDevCommits(window),
            adrsLanded        : await this.fetchAdrsLanded(window),
            sandboxesGraduated: await this.fetchSandboxesGraduated(window),
            sessions          : await this.fetchSessions(window)
        }
    }

    /**
     * @summary Reads every synced content record of one type (`'pulls'`, `'discussions'`) from the repo-tracked
     * GitHub sync under `resources/content/<type>/chunk-*`. The corpus is **complete**: a durable metric is
     * never derived from a truncated live API page, because a confidently-wrong count is worse than none. The
     * repo-relative root derives from the Tier-1 `projectRoot` leaf at the use site — the sync is fixed repo
     * substrate, so it needs no config leaf of its own. A missing root is a broken checkout, not an empty
     * window, and fails loud rather than silently reporting zero.
     * @param {String} type The content type directory name.
     * @returns {Array<{frontmatter:Object, body:String}>}
     * @protected
     */
    readContentRecords(type) {
        const root = path.resolve(AiConfig.projectRoot, 'resources', 'content', type);

        if (!fs.existsSync(root)) {
            throw new Error(`readContentRecords: missing synced content root ${root} — a broken checkout would otherwise report an honest-looking zero.`)
        }

        return fs.readdirSync(root, {withFileTypes: true})
            .filter(entry => entry.isDirectory() && entry.name.startsWith('chunk-'))
            .flatMap(chunk => fs.readdirSync(path.join(root, chunk.name))
                .filter(name => name.endsWith('.md'))
                .map(name => fs.readFileSync(path.join(root, chunk.name, name), 'utf8')))
            .map(raw => {
                const match = raw.match(/^---\n([\s\S]*?)\n---/);

                return {frontmatter: match ? parseYaml(match[1]) : {}, body: raw}
            })
    }

    /**
     * @summary Binds `mergedPrs` to its named source — the merged pull requests in the repo-tracked GitHub PR
     * sync, filtered by `mergedAt` into the half-open window. `state` and `mergedAt` are structured frontmatter
     * facts, so this count is exact rather than inferred from prose.
     * @param {{windowStart:String, windowEnd:String}} window
     * @returns {Promise<Array<{number:Number, mergedAt:String}>>}
     * @protected
     */
    async fetchMergedPrs({windowStart, windowEnd}) {
        const
            startMs = Date.parse(windowStart),
            endMs   = Date.parse(windowEnd);

        return this.readContentRecords('pulls')
            .map(record => record.frontmatter)
            .filter(frontmatter => frontmatter.state === 'MERGED' && frontmatter.mergedAt)
            .filter(frontmatter => {
                const mergedMs = Date.parse(String(frontmatter.mergedAt));

                return mergedMs >= startMs && mergedMs < endMs
            })
            .map(frontmatter => ({number: frontmatter.number, mergedAt: String(frontmatter.mergedAt)}))
    }

    /**
     * @summary Binds `sessionsPerAgent` + `highImpactSessions` to their named source — the Memory Core session
     * summaries, window-filtered on the numeric `timestamp` metadata (session last-activity in ms). The
     * half-open `[start, end)` bound is pushed into the store query, so this is a bounded window read, never a
     * full-history scan. A session is multi-agent, so the row keeps ALL of its identities: the engine credits
     * each participant while still counting the session once toward `highImpactSessions`.
     *
     * Attribution reads `sourceAgentIdentities` — the canonical, auth-bound `agentIdentity` set of the
     * session's source memories. It deliberately does NOT read `participatingAgents`, which is a caller-
     * declared display field carrying free-text like `'Gemini 3.1 Pro (Antigravity)'` or an unprefixed
     * `'neo-gemini-pro'` alongside a canonical `'@neo-gemini-pro'`. Partitioning on that would credit one
     * agent under several spellings and silently drop the rest — a durable record must never derive a metric
     * from self-declared prose. A session whose sources carry no identity yields no per-agent track and still
     * counts, once, on the unified one.
     * @param {{windowStart:String, windowEnd:String}} window
     * @returns {Promise<Array<{sessionId:String, impact:Number, agentIdentities:String[]}>>}
     * @protected
     */
    async fetchSessions({windowStart, windowEnd}) {
        const
            collection = await StorageRouter.getSummaryCollection(),
            result     = await collection.get({
                where: {$and: [
                    {timestamp: {$gte: Date.parse(windowStart)}},
                    {timestamp: {$lt : Date.parse(windowEnd)}}
                ]}
            });

        return (result?.metadatas || []).map(metadata => ({
            sessionId      : metadata.sessionId,
            impact         : Number(metadata.impact) || 0,
            agentIdentities: String(metadata.sourceAgentIdentities || '').split(',').map(entry => entry.trim()).filter(Boolean)
        }))
    }

    /**
     * @summary Binds `adrsLanded` to its named source — the ADR decision records added to
     * `learn/agentos/decisions/` within the window (the AdrIngestor's file source), via the git add-log.
     * `git --since/--until` are inclusive on BOTH ends, so a commit exactly at a window boundary would land in
     * two adjacent windows; each commit emits its `%cI` date and the half-open `[start, end)` filter on that
     * date is authoritative (the `--since/--until` bounds only coarse-scope the scan), so a boundary ADR add is
     * counted in exactly one window.
     * @param {{windowStart:String, windowEnd:String}} window
     * @returns {Promise<Array<{path:String}>>}
     * @protected
     */
    async fetchAdrsLanded({windowStart, windowEnd}) {
        const
            startMs = Date.parse(windowStart),
            endMs   = Date.parse(windowEnd),
            raw     = this.execCommand(`git log --first-parent origin/dev --since="${windowStart}" --until="${windowEnd}" --diff-filter=A --name-only --format=%cI -- learn/agentos/decisions/`),
            adrs    = new Set();

        // walk the log: each commit emits its `%cI` date line, then --name-only lists its added files; ADR paths
        // are collected only while the current commit's date falls in the half-open window
        let inWindow = false;

        for (const line of (raw || '').split('\n')) {
            const commitMs = /^\d{4}-\d{2}-\d{2}T/.test(line) ? Date.parse(line) : NaN;

            if (Number.isFinite(commitMs)) {
                inWindow = commitMs >= startMs && commitMs < endMs;
                continue
            }
            if (inWindow && /^learn\/agentos\/decisions\/\d{4}-.+\.md$/.test(line)) {
                adrs.add(line)
            }
        }

        return [...adrs].map(path => ({path}))
    }

    /**
     * @summary Binds `devCommits` to its named source — the `dev` first-parent commit log over the window.
     * `git --since/--until` are inclusive on BOTH ends, so a commit exactly at a window boundary would land in
     * two adjacent windows; each commit emits its `%cI` date and the half-open `[start, end)` filter on that
     * date is authoritative (`--since/--until` only coarse-scope the scan), so a boundary commit is counted once.
     * @param {{windowStart:String, windowEnd:String}} window
     * @returns {Promise<Array<{sha:String}>>}
     * @protected
     */
    async fetchDevCommits({windowStart, windowEnd}) {
        const
            startMs = Date.parse(windowStart),
            endMs   = Date.parse(windowEnd),
            raw     = this.execCommand(`git log --first-parent origin/dev --since="${windowStart}" --until="${windowEnd}" --format=%cI%x09%H`);

        return (raw || '').split('\n').filter(Boolean)
            .map(line => { const [at, sha] = line.split('\t'); return {sha, at} })
            .filter(({at}) => { const commitMs = Date.parse(at); return commitMs >= startMs && commitMs < endMs })
            .map(({sha}) => ({sha}))
    }

    /**
     * @summary Binds `sandboxesGraduated` to its named source — exact `[GRADUATED_TO_TICKET: #N]` author-action
     * markers, window-filtered by each marker's EVENT timestamp, read from the **complete** repo-tracked
     * Discussions sync. The graduation event is the author posting the marker (naming the ticket it graduated
     * to), NOT the discussion close: a discussion may close long after — or never — while the graduation happened
     * in a dated comment, so `closedAt` is the wrong clock and is never used here.
     *
     * Every artifact must carry producer-owned `conversationComplete: true`; one incomplete or legacy-unknown
     * mirror rejects the whole source before counting. A proven-complete artifact preserves the per-comment
     * `### `@author` commented on <ISO>` boundaries, so a marker's event time is its enclosing dated comment's
     * timestamp; a marker outside any dated comment (e.g. the original post) fails closed, never proxied. Only the
     * exact ticket-naming bracket counts: a bare `[GRADUATED_TO_TICKET]` mentioned in prose is the marker being
     * DISCUSSED, not an author-action, and is rejected; a marker whose event time cannot be resolved fails closed
     * (uncounted) rather than borrow the close time.
     * @param {{windowStart:String, windowEnd:String}} window
     * @returns {Promise<Array<{ref:String, ticket:String, at:String}>>}
     * @protected
     */
    async fetchSandboxesGraduated({windowStart, windowEnd}) {
        const
            startMs = Date.parse(windowStart),
            endMs   = Date.parse(windowEnd),
            records = this.readContentRecords('discussions'),
            unknown = records
                .filter(({frontmatter}) => frontmatter.conversationComplete !== true)
                .map(({frontmatter}) => frontmatter.number ?? 'unknown');

        if (unknown.length > 0) {
            throw new Error(
                `Discussion mirror completeness is unknown/incomplete for: ${unknown.map(number => `#${number}`).join(', ')}. ` +
                'Re-sync the corpus before temporal-summary aggregation; incompleteness is never a numeric zero.'
            )
        }

        return records.flatMap(({frontmatter, body}) =>
            this.extractGraduationActions({frontmatter, body}).filter(action => {
                const eventMs = Date.parse(action.at);

                return Number.isFinite(eventMs) && eventMs >= startMs && eventMs < endMs
            })
        )
    }

    /**
     * @summary Extracts the exact `[GRADUATED_TO_TICKET: #N]` (or `Epic #N`) author-ACTION graduations from one
     * synced Discussion, each stamped with its event timestamp. An action is a marker that LEADS its line after
     * only allowed wrappers — heading `#`s, bold `**`, backticks — matching how graduations are actually posted
     * (`## [GRADUATED_TO_TICKET: #N] …`, `` **`[GRADUATED_TO_TICKET: Epic #N]`** ``). A ticket-bearing marker
     * inline in prose, inside a blockquote (`>`), or in a fenced/indented code block is the marker being
     * DISCUSSED or quoted — never an action — and is rejected. Graduations are de-duped per discussion+ticket on
     * the earliest evidenced action, so a later quote of the same graduation never re-counts.
     *
     * The event time is the enclosing dated boundary — a top-level `### `@author` commented on <ISO>` comment OR
     * a nested `#### Reply depth=N by `@author` on <ISO>` reply (a reply marker binds to the reply's own time, not
     * the parent comment's). A marker outside any dated boundary (e.g. the original post) has no event timestamp —
     * `createdAt` is the creation time, not the edit time the marker was added — so it FAILS CLOSED (uncounted)
     * rather than proxy the wrong clock. Both ``` and ~~~ fenced blocks (and blockquotes / indented code) are
     * examples, never actions.
     * @param {Object} params
     * @param {Object} params.frontmatter The Discussion frontmatter (`number`).
     * @param {String} params.body        The full synced Discussion body (original post + dated comment blocks).
     * @returns {Array<{ref:String, ticket:String, at:String}>}
     * @protected
     */
    extractGraduationActions({frontmatter, body}) {
        const
            commentPattern = /^### `@[^`]+` commented on (\S+)\s*$/,
            // a reply carries its OWN dated boundary — a marker inside a reply binds to the reply's event time,
            // not the enclosing comment's
            replyPattern   = /^#### Reply depth=\d+ by `@[^`]+` on (\S+)\s*$/,
            // author-ACTION line: the ticket-naming marker LEADS the line after only allowed wrappers
            actionPattern  = /^(?:#{1,6}\s+|\*{1,2}|`)*\[GRADUATED_TO_TICKET:\s*(?:Epic\s+)?#(\d+)\]/,
            seen           = new Set(),
            actions        = [];

        let currentAt = null, fence = null;

        for (const line of body.split('\n')) {
            const
                fenceStart = /^\s*(`{3,}|~{3,})/.exec(line),
                fenceClose = /^\s*(`{3,}|~{3,})\s*$/.exec(line);

            if (!fence && fenceStart) {
                fence = {delimiter: fenceStart[1][0], length: fenceStart[1].length};
                continue
            }
            if (fence) {
                if (
                    fenceClose && fenceClose[1][0] === fence.delimiter &&
                    fenceClose[1].length >= fence.length
                ) {
                    fence = null
                }
                continue
            }

            const boundary = commentPattern.exec(line) || replyPattern.exec(line);

            if (boundary) {
                currentAt = boundary[1];
                continue
            }

            // blockquotes + indented code are quotes / examples, never an author action
            if (/^\s*>/.test(line) || /^(?: {4}|\t)/.test(line)) {
                continue
            }

            const action = actionPattern.exec(line);

            // fail closed on a marker outside a dated comment: no event timestamp to stand on
            if (!action || currentAt === null) {
                continue
            }

            const
                ticket = `#${action[1]}`,
                key    = `${frontmatter.number}:${ticket}`;

            // dedupe per discussion+ticket on the earliest evidenced action (document order is chronological)
            if (seen.has(key)) {
                continue
            }

            seen.add(key);
            actions.push({ref: `discussion #${frontmatter.number}`, ticket, at: currentAt})
        }

        return actions
    }

    /**
     * @summary Runs a read-only shell command + returns stdout. The injectable seam behind every source
     * fetch, so tests drive the fetches with no `gh` / `git` process.
     * @param {String} command
     * @returns {String}
     * @protected
     */
    execCommand(command) {
        return execSync(command, {encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore']})
    }

    /**
     * @summary Persists one composed temporal-summary record to BOTH sides of the unified store: the Chroma
     * upsert into the `temporal-summary` collection (five-field metadata = the query contract, velocity payload =
     * the document body) AND the per-level `SUMMARY_SESSION` / `SUMMARY_DAILY` graph node, keyed by the same
     * deterministic doc id so a re-aggregation of the same window+track+version overwrites in place on both. This
     * deterministic lane is the SOLE writer of those labels (never the semantic extractor); the graph node's
     * `semanticVectorId` links it back to the Chroma row. The durable/dynamic boundary is enforced BEFORE any
     * store write: only durable tiers (L1/L2) reach either store — a non-durable level (L3–L5, synthesis-only)
     * produces ZERO Chroma writes AND zero graph writes, never breaching the durable/dynamic boundary.
     * @param {{id:String, metadata:Object, velocityFields:Object}} record
     * @returns {Promise<void>}
     * @protected
     */
    async persistTemporalRecord(record) {
        const level = getTemporalSummaryLevel(record.metadata.level);

        // durable/dynamic boundary FIRST: L3–L5 are synthesis-only reserved labels that must never reach a
        // durable store, so a non-durable level is a complete no-op — no Chroma upsert, no graph node
        if (!level?.durable) {
            return
        }

        const collection = await StorageRouter.getTemporalSummaryCollection();

        await collection.upsert({
            ids      : [record.id],
            documents: [JSON.stringify(record.velocityFields)],
            metadatas: [record.metadata]
        });

        GraphService.upsertNode({
            id              : record.id,
            type            : level.label,
            name            : record.id,
            semanticVectorId: record.id,
            properties      : record.metadata
        });

        await this.pruneOldVersions(record.metadata)
    }

    /**
     * @summary Bounded-retention prune for ONE window+track: keeps the newest {@link DEFAULT_RETAINED_VERSIONS}
     * contract-versions and deletes the older overflow from BOTH stores — the Chroma docs and the `SUMMARY_*`
     * graph nodes, by the same doc ids. Guarded: it only queries when the record's version could exceed the
     * retained bound, so re-folds at the steady-state contract version pay nothing. Append-only history stays
     * bounded. Overridable seam.
     * @param {Object} metadata The just-persisted record's five-field metadata.
     * @returns {Promise<void>}
     * @protected
     */
    async pruneOldVersions(metadata) {
        // overflow is impossible until the contract version passes the retained bound — skip the query entirely
        if (metadata.version <= DEFAULT_RETAINED_VERSIONS) {
            return
        }

        const
            collection = await StorageRouter.getTemporalSummaryCollection(),
            existing   = await collection.get({where: {$and: [
                {level      : metadata.level},
                {partition  : metadata.partition},
                {windowStart: metadata.windowStart}
            ]}}),
            metadatas  = existing?.metadatas || [],
            ids        = existing?.ids || [],
            pruneSet   = new Set(versionsToPrune({existingVersions: metadatas.map(entry => entry.version)})),
            pruneIds   = ids.filter((id, index) => pruneSet.has(metadatas[index]?.version));

        if (pruneIds.length === 0) {
            return
        }

        // graph first, THEN Chroma: the Chroma doc is the "still needs pruning" signal, so deleting it LAST keeps
        // the prune retry-safe — any failure before the Chroma delete leaves the version visible to re-prune next
        // cycle, never a Chroma-gone / graph-orphaned record.
        GraphService.removeNodes(pruneIds);
        await collection.delete({ids: pruneIds})
    }
}

export default Neo.setupClass(TemporalSummaryAggregationService);
