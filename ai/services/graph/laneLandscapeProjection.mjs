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
 * @param {Boolean}  [params.degraded=false] Marks the census incomplete (e.g. a source read failed);
 *   surfaced honestly on `coverage.degraded` rather than presenting partial data as the whole picture.
 * @returns {Object} A frozen `notAuthority` landscape: `{capturedAt, goalTrajectory, dependencyPath,
 *   authorityCoverage, coverage, notAuthority}`.
 * @throws {TypeError} When `now` is not a valid Date/timestamp.
 */
export function projectLaneLandscape({items = [], edges = [], now, degraded = false} = {}) {
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

    return Object.freeze({
        capturedAt       : capturedDate.toISOString(),
        goalTrajectory   : Object.freeze(goalTrajectory.map(entry => Object.freeze({...entry, openChildren: Object.freeze(entry.openChildren)}))),
        dependencyPath   : Object.freeze(dependencyPath.map(entry => Object.freeze({...entry, blockedBy: Object.freeze(entry.blockedBy)}))),
        authorityCoverage: Object.freeze({
            assignedCount  : assignedIds.length,
            unassignedCount: unassignedIds.length,
            unassignedIds  : Object.freeze([...unassignedIds].sort())
        }),
        coverage: Object.freeze({
            totalOpenItems: openItems.length,
            edgeCount     : relEdges.length,
            degraded      : degraded === true
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
 * @param {Function} params.queryOpenIssueNodes `async () => nodeRows` — the open-work census read.
 * @param {Function} params.queryRelationEdges `async () => edgeRows` — the PARENT_OF/BLOCKS edge read.
 * @param {Date}     params.now Capture time (injected).
 * @returns {Promise<Object>} The frozen `notAuthority` landscape (degraded on read failure).
 */
export async function buildLaneLandscape({queryOpenIssueNodes, queryRelationEdges, now} = {}) {
    try {
        const [nodeRows, edgeRows] = await Promise.all([queryOpenIssueNodes(), queryRelationEdges()]);
        const {items, edges}       = normalizeLaneLandscapeCensus({nodeRows, edgeRows});

        return projectLaneLandscape({items, edges, now})
    } catch (error) {
        return projectLaneLandscape({items: [], edges: [], now, degraded: true})
    }
}

/**
 * @summary Normalizes raw Native-Edge-Graph node + edge rows into the `{items, edges}` census
 * shape {@link projectLaneLandscape} consumes. The graph stores a node's fields either flat or under
 * a `properties` object and its payload as a JSON string; this reads both shapes and drops a row it
 * cannot parse rather than fabricating a field.
 * @param {Object}   params
 * @param {Object[]} [params.nodeRows=[]] Raw node rows `{id, data}` (`data` a JSON string or object).
 * @param {Object[]} [params.edgeRows=[]] Raw edge rows `{source, target, type}`.
 * @returns {{items: Object[], edges: Object[]}}
 */
export function normalizeLaneLandscapeCensus({nodeRows = [], edgeRows = []} = {}) {
    const items = (Array.isArray(nodeRows) ? nodeRows : [])
        .map(row => {
            let data = {};
            try {
                data = typeof row?.data === 'string' ? JSON.parse(row.data) : (row?.data ?? {})
            } catch (error) {
                data = {}
            }

            const props    = data?.properties ?? data ?? {};
            const assignee = props.assignee ?? (Array.isArray(props.assignees) ? props.assignees[0] : null) ?? null;

            return {
                id      : String(row?.id ?? data?.id ?? ''),
                state   : props.state ?? data?.state ?? null,
                type    : props.type ?? data?.type ?? null,
                labels  : Array.isArray(props.labels) ? props.labels : [],
                assignee: assignee != null ? String(assignee) : null
            }
        })
        .filter(item => item.id.length > 0);

    const edges = (Array.isArray(edgeRows) ? edgeRows : [])
        .filter(edge => edge && edge.source != null && edge.target != null && edge.type)
        .map(edge => ({type: String(edge.type), source: String(edge.source), target: String(edge.target)}));

    return {items, edges}
}
