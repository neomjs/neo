/**
 * The Fleet Cockpit's default dock layout, expressed as pure `neo.harness.dockZone.v1` data.
 *
 * @summary The SSOT §01 mission-control split under the shell's one-navigation-vocabulary model —
 * the **fleet zone** (~1.55fr: the density-ranked agent-card roster + the scale-to-a-glance health
 * bar) above the **south reading-surface tabs** (1fr: Activity · Memories · Mailbox · Catch-up —
 * the fleet-scoped continuous reading surfaces an operator returns to many times per session),
 * with the right edge reserved for selection-scoped inspection (agent detail) and invoked tools,
 * declared `autoHidden` (the input the edge-rail auto-hide contract consumes). Roster-agnostic —
 * the fleet zone is a `componentRef`, never a per-agent item list, so the document holds for any
 * fleet size.
 *
 * The region jobs follow that model: south tabs are resident reading surfaces (never
 * rail-squeezed), the rail carries the inspector plus invoked tools only. The Tasks surface joins
 * the south family when it lands.
 *
 * This is a **data leaf only**. The projection / render + resize-commit wiring is the sibling leaf;
 * nothing here reads a `DOMRect`, mounts a component, or touches the drag lifecycle. The document
 * round-trips `Neo.dashboard.DockZoneModel.validate` (empty error list) and feeds
 * `Neo.dashboard.DockLayoutAdapter` unchanged. It is intentionally a factory returning a fresh
 * object per call — never a shared mutable singleton — so consumers and the semantic operations
 * (which deep-clone) never alias one authored default.
 *
 * `componentRef` values name the `AgentOS.view.fleet.*` keeper-view surfaces; the exact
 * secondary-pane inventory tracks the FM cockpit SSOT map and may be pinned as that map lands.
 *
 * @returns {Object} a fresh `neo.harness.dockZone.v1` document
 */
export function cockpitDockDocument() {
    return {
        schema: 'neo.harness.dockZone.v1',
        root  : 'cockpit-root',
        items : {
            fleet : {componentRef: 'fleet-grid',       title: 'Fleet',        kind: 'panel'},
            stream: {componentRef: 'activity-stream',   title: 'Activity',     kind: 'panel'},
            // south reading surfaces: per-agent session-summary recall, the operator's own
            // mailbox + compose surface, and the historical Bird-View complement to the
            // bounded Activity stream — resident tabs beside it, never rail-squeezed
            memories    : {componentRef: 'memories',          title: 'Memories',     kind: 'panel'},
            // the WHAT axis of mission control: running / queued / recent work, beside the WHO grid
            tasks       : {componentRef: 'tasks',             title: 'Tasks',        kind: 'panel'},
            operator    : {componentRef: 'operator-mailbox',  title: 'Mailbox',      kind: 'panel'},
            catchUp     : {componentRef: 'catch-up',          title: 'Catch up',     kind: 'panel'},
            detail      : {componentRef: 'agent-detail',      title: 'Agent detail', kind: 'inspector', autoHidden: true},
            perspectives: {componentRef: 'perspectives',      title: 'Perspectives', kind: 'tool',      autoHidden: true},
            // S5 define-agent (design ruling on record: rail placement, invoked-not-ambient) —
            // the add-agent flow rides the same autoHidden tool chrome as perspectives
            defineAgent: {componentRef: 'define-agent',      title: 'Add agent',    kind: 'tool',      autoHidden: true},
            wakeRoutes : {componentRef: 'wakeRoutes',        title: 'Wake routes',  kind: 'tool',      autoHidden: true}
        },
        nodes: {
            // Root edge-zone: the primary split in the center, the auto-hidden chrome on the right rail.
            'cockpit-root'  : {type: 'edge-zone', zones: {center: 'primary-split', right: 'secondary-rail'}},
            // SSOT §01: fleet zone (~1.55fr) on top, the reading-surface tabs (1fr) docked at the bottom — vertical split, normalized to sum 1.
            'primary-split': {type: 'split', orientation: 'vertical', children: ['fleet-tabs', 'stream-tabs'], sizes: [0.6078, 0.3922]},
            'fleet-tabs'   : {type: 'tabs', items: ['fleet'], activeItemId: 'fleet'},
            // the south reading-surface family: Activity active by default, Tasks directly beside it.
            'stream-tabs'  : {type: 'tabs', items: ['stream', 'tasks', 'memories', 'operator', 'catchUp'], activeItemId: 'stream'},
            // Secondary panes collapse to this edge's rail (§2.7): inspector + invoked tools only; their item records carry `autoHidden`.
            'secondary-rail': {type: 'tabs', items: ['detail', 'perspectives', 'defineAgent', 'wakeRoutes'], activeItemId: 'detail'}
        }
    }
}

export default cockpitDockDocument;
