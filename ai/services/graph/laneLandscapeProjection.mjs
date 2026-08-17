/**
 * @module ai/services/graph/laneLandscapeProjection
 * @summary The pure current-state projection behind the `explore_lane_landscape` Bird View.
 *
 * Given a census of open work items plus the parent/blocked-by relation edges among them, this
 * projects the three current-state dimensions a peer needs to orient — goal trajectory (open epics
 * and their still-open children), dependency path (which open items are blocked, and by which open
 * blockers), and authority coverage (which open items are owned vs. unassigned) — plus an honest
 * coverage summary. It is `notAuthority`: it describes structure, it never ranks, scores, or
 * assigns (route selection is the Golden Path's authority). Unknown stays unknown — the projection
 * reports counts it can see and never fabricates certainty about what the census did not cover.
 *
 * Pure and hermetic: the impure census/edge read (GitHub Workflow + Native Edge Graph) and the
 * on-demand synthesis wrap this function; the projection itself has no host dependency.
 */

import {hashSourceManifest, projectDrillDown} from '../memory-core/helpers/birdViewCitations.mjs';

/**
 * @summary Flattens a source list that arrives either as bare strings or as connection objects
 * (`{name}` for labels, `{login}` for people), dropping entries that carry neither.
 *
 * Both shapes are accepted because the owning source may hand back either; nothing is invented for an
 * entry that names nobody — an absent value stays absent rather than becoming a placeholder.
 *
 * @param {*} list Candidate list from the source.
 * @param {String} key Object key carrying the name (`name` / `login`).
 * @returns {String[]}
 */
function flattenSourceList(list, key) {
    return (Array.isArray(list) ? list : [])
        .map(entry => typeof entry === 'string' ? entry : entry?.[key])
        .filter(Boolean)
}

/**
 * @summary Builds the citation for one open census row — the record that supports its presence in the
 * landscape, plus the call that drills into it.
 *
 * The citation id is the landscape row id, so a caller can join a citation to the dimension entry it
 * supports; the drill-down addresses the source the way the source addresses itself (by number). A row
 * the source gave no number is still cited by id — it just cannot offer a drill-down, and saying so beats
 * inventing a target that would 404.
 *
 * @param {Object} item A normalized census row.
 * @returns {Object} `{id, type, ref, drillDown?}`.
 */
function buildLandscapeCitation(item) {
    const isPr     = item.kind === 'pr',
          citation = {
              id  : item.id,
              type: isPr ? 'pull_request' : 'issue',
              ref : item.url ?? null
          };

    if (item.number == null) {
        return citation
    }

    const drillDown = projectDrillDown({
        operation: 'get_conversation',
        arguments: isPr ? {pr_number: Number(item.number)} : {issue_number: Number(item.number)}
    });

    return drillDown ? {...citation, drillDown} : citation
}

/**
 * @summary Resolves an item's coarse open/closed state from either the flat or `properties` shape.
 * @param {Object} item
 * @returns {String} Upper-cased state, or empty string when absent.
 */
function resolveState(item) {
    const raw = item?.state ?? item?.properties?.state;
    return typeof raw === 'string' ? raw.toUpperCase() : ''
}

/**
 * @summary Resolves an item's owning assignee login, if any, from the flat or array shape.
 * @param {Object} item
 * @returns {String|null}
 */
function resolveAssignee(item) {
    if (typeof item?.assignee === 'string' && item.assignee.length > 0) {
        return item.assignee
    }
    const list = Array.isArray(item?.assignees) ? item.assignees : null;
    return list && list.length > 0 ? String(list[0]) : null
}

/**
 * @summary True when the item is an epic (by explicit type or the `epic` label).
 * @param {Object} item
 * @returns {Boolean}
 */
function isEpic(item) {
    if (String(item?.type ?? item?.properties?.type ?? '').toUpperCase() === 'EPIC') {
        return true
    }
    const labels = item?.labels ?? item?.properties?.labels;
    return Array.isArray(labels) && labels.some(label => String(label).toLowerCase() === 'epic')
}

/**
 * @summary Projects the current-state lane landscape from an open-work census and relation edges.
 * @param {Object}   params
 * @param {Object[]} [params.items=[]] Open-work records `{id, type?, state?, assignee?|assignees?, labels?}`.
 * @param {Object[]} [params.edges=[]] Relation edges `{type:'PARENT_OF'|'BLOCKS', source, target}`
 *   (`PARENT_OF`: source is the epic; `BLOCKS`: source blocks target).
 * @param {Date}     params.now Capture time (injected — no hidden clock).
 * @param {Boolean}  [params.degraded=false] Marks the census incomplete (a source read failed, or the
 *   walk never proved exhaustion); surfaced honestly on `coverage.degraded` rather than presenting
 *   partial data as the whole picture.
 * @param {String[]} [params.degradedReasons=[]] Why completeness could not be claimed, carried from the
 *   census manifest. A `degraded` flag without its reason is only half-honest: the caller learns the
 *   picture is partial but not which part is missing, and cannot judge what the answer is worth.
 * @returns {Object} A frozen `notAuthority` landscape: `{capturedAt, goalTrajectory, dependencyPath,
 *   authorityCoverage, coverage, notAuthority}`.
 * @throws {TypeError} When `now` is not a valid Date/timestamp.
 */
export function projectLaneLandscape({items = [], edges = [], now, degraded = false, degradedReasons = []} = {}) {
    const capturedDate = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(capturedDate.getTime())) {
        throw new TypeError('[laneLandscapeProjection] now must be a valid Date/timestamp (inject the clock).')
    }

    const openItems = (Array.isArray(items) ? items : []).filter(item => item && resolveState(item) === 'OPEN');
    const openIds   = new Set(openItems.map(item => String(item.id)));
    const relEdges  = Array.isArray(edges) ? edges : [];

    // Authority coverage — which open items are owned vs. an unassigned gap.
    const assignedIds   = [];
    const unassignedIds = [];
    for (const item of openItems) {
        (resolveAssignee(item) ? assignedIds : unassignedIds).push(String(item.id))
    }

    // Dependency path — open items blocked by still-open blockers (a foreign/closed blocker is not
    // a live block, so it is dropped rather than reported as an open dependency).
    const blockersByBlocked = new Map();
    for (const edge of relEdges) {
        if (edge?.type === 'BLOCKS') {
            const blocked = String(edge.target);
            if (!blockersByBlocked.has(blocked)) blockersByBlocked.set(blocked, []);
            blockersByBlocked.get(blocked).push(String(edge.source))
        }
    }
    const dependencyPath = [...blockersByBlocked.entries()]
        .filter(([blocked]) => openIds.has(blocked))
        .map(([blocked, blockers]) => ({
            id       : blocked,
            blockedBy: [...new Set(blockers.filter(blocker => openIds.has(blocker)))].sort()
        }))
        .filter(entry => entry.blockedBy.length > 0)
        .sort((a, b) => a.id.localeCompare(b.id));

    // Goal trajectory — open epics and their still-open children.
    const childrenByParent = new Map();
    for (const edge of relEdges) {
        if (edge?.type === 'PARENT_OF') {
            const parent = String(edge.source);
            if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
            childrenByParent.get(parent).push(String(edge.target))
        }
    }
    const goalTrajectory = openItems
        .filter(isEpic)
        .map(epic => {
            const openChildren = [...new Set((childrenByParent.get(String(epic.id)) || []).filter(child => openIds.has(child)))].sort();
            return {id: String(epic.id), openChildCount: openChildren.length, openChildren}
        })
        .sort((a, b) => a.id.localeCompare(b.id));

    // Citations — the records supporting the rows above, joinable to them by id. Built from the open
    // items the projection actually kept, so a citation can never point at something the landscape
    // does not describe.
    const citations = openItems
        .map(buildLandscapeCitation)
        .sort((a, b) => a.id.localeCompare(b.id));

    // The manifest fingerprints exactly that member set. The census carries no per-item revision, so
    // this keys on identity — which is the honest fingerprint for a STRUCTURAL view: an edited body
    // does not change the landscape, while a state change removes the item from the census and moves
    // the hash.
    const sourceManifestHash = hashSourceManifest(citations),
          isDegraded         = degraded === true;

    return Object.freeze({
        capturedAt       : capturedDate.toISOString(),
        goalTrajectory   : Object.freeze(goalTrajectory.map(entry => Object.freeze({...entry, openChildren: Object.freeze(entry.openChildren)}))),
        dependencyPath   : Object.freeze(dependencyPath.map(entry => Object.freeze({...entry, blockedBy: Object.freeze(entry.blockedBy)}))),
        citations        : Object.freeze(citations.map(citation => Object.freeze(citation))),
        sourceManifestHash,
        authorityCoverage: Object.freeze({
            // `null` under degradation, never 0 — see the coverage block below. A count of an
            // incomplete set is not a smaller true count; it is an unknown wearing a number.
            assignedCount  : isDegraded ? null : assignedIds.length,
            unassignedCount: isDegraded ? null : unassignedIds.length,
            // The IDS stay: they are what the census DID see, which is a floor rather than a claim,
            // and dropping them would discard the only usable half of a partial read.
            unassignedIds  : Object.freeze([...unassignedIds].sort())
        }),
        coverage: Object.freeze({
            /**
             * `null` whenever the census is degraded. **A degraded census cannot report a total by
             * definition** — "total" is a completeness claim, and completeness is the exact thing
             * that failed.
             *
             * This is not pedantry; it is the defect this field carried. When the plane holds no
             * GitHub credential every page read fails, and the projection emitted
             * `totalOpenItems: 0` beside `degraded: true` — the same shape a genuinely empty
             * backlog produces. Suppressing the narrative synthesis (which this already did) only
             * covered half of it: the census numbers stayed confidently populated with zeros, so a
             * caller that read the count without branching on the flag learned "there is no work"
             * from a tool whose real answer was "I could not look". For a next-lane engine that is
             * the worse direction of error — it does not misroute a seat, it reports no lanes.
             *
             * `null` is unreadable as a quantity, so the flag can no longer be skipped by accident.
             */
            totalOpenItems: isDegraded ? null : openItems.length,
            /**
             * What the census actually saw, always truthful and always a number — a FLOOR, not a
             * total. Partial reads keep their value here rather than being flattened to `null`
             * along with the completeness claim they cannot make.
             */
            observedOpenItems: openItems.length,
            edgeCount        : relEdges.length,
            degraded         : isDegraded,
            // The provenance of the degradation: a caller must be able to see WHICH part of the
            // picture is missing, not merely that some part is.
            degradedReasons: Object.freeze(Array.isArray(degradedReasons) ? [...degradedReasons] : [])
        }),
        notAuthority: true
    })
}

/**
 * @summary Collects the live lane-landscape by running the injected census reads, normalizing them,
 * and projecting the current state. The impure Native-Edge-Graph / GitHub-Workflow reads are passed
 * in (bound at the MCP registration boundary), keeping this composition testable. Fail-closed: if a
 * source read throws, it returns an honest degraded landscape (`coverage.degraded: true`) rather than
 * a partial picture presented as complete — never a thrown pass.
 * @param {Object}   params
 * @param {Function} params.queryOpenWorkCensus `async () => {items, manifest}` — the source-owned census
 *   walk. Its `manifest.exhausted` is what `degraded` derives from: a census is complete only when the
 *   source reported no next page, never because the read happened not to throw.
 * @param {Function} params.queryRelationEdges `async () => {edges, manifest}` — the RLS-safe
 *   PARENT_OF/BLOCKS read, reporting its own completeness on the same terms.
 * @param {Date}     params.now Capture time (injected).
 * @returns {Promise<Object>} The frozen `notAuthority` landscape (degraded on an unproven census).
 */
export async function buildLaneLandscape({queryOpenWorkCensus, queryRelationEdges, now} = {}) {
    try {
        const [census, relations] = await Promise.all([queryOpenWorkCensus(), queryRelationEdges()]);
        const {items, edges}      = normalizeLaneLandscapeCensus({censusItems: census?.items, edgeRows: relations?.edges});

        // Truncation is degradation even when nothing threw: a read the source never confirmed as
        // exhausted describes an unknown fraction of the landscape, and saying so — with the reason —
        // is the contract. Both legs must prove themselves: a complete item census over a clipped
        // relation set still yields a dependency path that is missing links it cannot name.
        const censusExhausted   = census?.manifest?.exhausted === true,
              relationExhausted = relations?.manifest?.exhausted === true,
              exhausted         = censusExhausted && relationExhausted,
              reasons           = [
                  ...(censusExhausted   ? [] : (census?.manifest?.reasons    ?? ['census exhaustion was not proven'])),
                  ...(relationExhausted ? [] : (relations?.manifest?.reasons ?? ['relation-read exhaustion was not proven']))
              ];

        return projectLaneLandscape({
            items,
            edges,
            now,
            degraded       : !exhausted,
            degradedReasons: reasons
        })
    } catch (error) {
        return projectLaneLandscape({
            items          : [],
            edges          : [],
            now,
            degraded       : true,
            degradedReasons: [`census read failed: ${error instanceof Error ? error.message : String(error)}`]
        })
    }
}

/**
 * @summary Normalizes the source-owned census rows + graph relation edges into the `{items, edges}`
 * shape {@link projectLaneLandscape} consumes.
 *
 * The rows come from the source that OWNS the facts, so ownership is read from real assignee/author
 * evidence: an item is unassigned only when the source says nobody owns it, never because a local
 * store forgot to record it.
 *
 * Id and kind are both explicit. `kind` discriminates a first-class PR row from an issue row, and the
 * id is namespaced (`issue-N` / `pr-N`) to match the graph's relation-edge vocabulary so edges resolve
 * against the census. A row the source gives no identity is dropped rather than fabricated.
 *
 * @param {Object}   params
 * @param {Object[]} [params.censusItems=[]] Source rows `{number|id, kind, state, labels, assignees, url}`.
 *   `labels`/`assignees` are accepted as bare strings or `{name}`/`{login}` objects; neither is invented.
 * @param {Object[]} [params.edgeRows=[]] Raw graph edge rows `{source, target, type}`.
 * @returns {{items: Object[], edges: Object[]}}
 */
export function normalizeLaneLandscapeCensus({censusItems = [], edgeRows = []} = {}) {
    const items = (Array.isArray(censusItems) ? censusItems : [])
        .map(row => {
            const kind      = row?.kind === 'pr' ? 'pr' : 'issue',
                  number    = row?.number ?? row?.id,
                  labels    = flattenSourceList(row?.labels, 'name'),
                  assignees = flattenSourceList(row?.assignees, 'login');

            return {
                id   : number != null && String(number).length > 0 ? `${kind}-${number}` : '',
                kind,
                // Retained so a citation can name the drill-down target: the namespaced id is the join
                // key for relation edges, but the source addresses its own records by number.
                number,
                state: row?.state ?? null,
                type : kind === 'pr' ? 'PULL_REQUEST' : 'ISSUE',
                labels,
                assignees,
                url  : row?.url ?? null
            }
        })
        .filter(item => item.id.length > 0);

    const edges = (Array.isArray(edgeRows) ? edgeRows : [])
        .filter(edge => edge && edge.source != null && edge.target != null && edge.type)
        .map(edge => ({type: String(edge.type), source: String(edge.source), target: String(edge.target)}));

    return {items, edges}
}
