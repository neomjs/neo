import Store     from '../../../src/data/TreeStore.mjs';
import MainModel from './MainModel.mjs';

const ROLLUP_FIELDS = new Set(['budget', 'headcount', 'spent']);

/**
 * Raw 52-node hierarchy (4 departments -> 12 teams -> 36 budget line items).
 * Numeric values exist ONLY on leaf items; parent totals are computed from children.
 */
const RAW_BUDGET_NODES = [
    // 1. Core Platform
    {id: 'dept-platform', parentId: null, isLeaf: false, collapsed: false, levelKind: 'Department', name: 'Core Platform', owner: 'Linnea Lindqvist', status: 'On track'},

    {id: 'team-runtime', parentId: 'dept-platform', isLeaf: false, collapsed: true, levelKind: 'Team', name: 'Runtime Engine', owner: 'Marcus Vance', status: 'On track'},
    {id: 'item-worker-pool',    parentId: 'team-runtime', isLeaf: true, levelKind: 'Item', name: 'V8 Worker Pool',       owner: 'Marcus Vance',   status: 'On track',  headcount: 4, budget: 480000, spent: 360000},
    {id: 'item-vdom-diffing',   parentId: 'team-runtime', isLeaf: true, levelKind: 'Item', name: 'Virtual DOM Diffing',  owner: 'Amina Farouk',   status: 'On track',  headcount: 3, budget: 360000, spent: 276000},
    {id: 'item-config-effects', parentId: 'team-runtime', isLeaf: true, levelKind: 'Item', name: 'Config Reactivity',    owner: 'Jonas Lindberg', status: 'Committed', headcount: 3, budget: 340000, spent: 255000},

    {id: 'team-messaging', parentId: 'dept-platform', isLeaf: false, collapsed: true, levelKind: 'Team', name: 'Worker Messaging', owner: 'Soraia Mendes', status: 'On track'},
    {id: 'item-channel-bridge',  parentId: 'team-messaging', isLeaf: true, levelKind: 'Item', name: 'MessageChannel Bridge',  owner: 'Soraia Mendes', status: 'On track',  headcount: 3, budget: 350000, spent: 266000},
    {id: 'item-remote-registry', parentId: 'team-messaging', isLeaf: true, levelKind: 'Item', name: 'Remote Method Registry', owner: 'Tomasz Kowal',  status: 'On track',  headcount: 2, budget: 240000, spent: 180000},
    {id: 'item-shared-host',     parentId: 'team-messaging', isLeaf: true, levelKind: 'Item', name: 'SharedWorker Host',      owner: 'Noor Al-Mansoor', status: 'Committed', headcount: 2, budget: 260000, spent: 195000},

    {id: 'team-tooling', parentId: 'dept-platform', isLeaf: false, collapsed: true, levelKind: 'Team', name: 'Build & Tooling', owner: 'Henrik Lindholm', status: 'Committed'},
    {id: 'item-esm-bundler',    parentId: 'team-tooling', isLeaf: true, levelKind: 'Item', name: 'ESM Bundle Pipeline', owner: 'Henrik Lindholm', status: 'Committed', headcount: 3, budget: 330000, spent: 264000},
    {id: 'item-theme-compiler', parentId: 'team-tooling', isLeaf: true, levelKind: 'Item', name: 'Theme Compiler',      owner: 'Clara Morales',   status: 'On track',  headcount: 2, budget: 210000, spent: 154000},
    {id: 'item-test-runners',   parentId: 'team-tooling', isLeaf: true, levelKind: 'Item', name: 'Playwright Runners',  owner: 'Owen Gallagher',  status: 'On track',  headcount: 2, budget: 230000, spent: 172000},

    // 2. Data & Storage
    {id: 'dept-data', parentId: null, isLeaf: false, collapsed: false, levelKind: 'Department', name: 'Data & Storage', owner: 'Mateo Alvarez', status: 'On track'},

    {id: 'team-stores', parentId: 'dept-data', isLeaf: false, collapsed: true, levelKind: 'Team', name: 'Store & Records', owner: 'Nadia Okafor', status: 'On track'},
    {id: 'item-tree-projection', parentId: 'team-stores', isLeaf: true, levelKind: 'Item', name: 'TreeStore Projection', owner: 'Nadia Okafor',  status: 'On track',  headcount: 3, budget: 370000, spent: 281000},
    {id: 'item-soft-hydration',  parentId: 'team-stores', isLeaf: true, levelKind: 'Item', name: 'Soft Hydration Cache', owner: 'Victor Petrov', status: 'On track',  headcount: 3, budget: 350000, spent: 259000},
    {id: 'item-filter-sort',     parentId: 'team-stores', isLeaf: true, levelKind: 'Item', name: 'Filter & Sort Engine', owner: 'Mei-Hua Chen',  status: 'Committed', headcount: 2, budget: 250000, spent: 190000},

    {id: 'team-streaming', parentId: 'dept-data', isLeaf: false, collapsed: true, levelKind: 'Team', name: 'Stream Ingestion', owner: 'Kenji Takahashi', status: 'Watch'},
    {id: 'item-ndjson-parser', parentId: 'team-streaming', isLeaf: true, levelKind: 'Item', name: 'NDJSON Stream Parser', owner: 'Kenji Takahashi', status: 'On track', headcount: 2, budget: 260000, spent: 218000},
    {id: 'item-backpressure',  parentId: 'team-streaming', isLeaf: true, levelKind: 'Item', name: 'Backpressure Queue',   owner: 'Samira Haddad',   status: 'Watch',    headcount: 3, budget: 360000, spent: 324000},
    {id: 'item-socket-sync',   parentId: 'team-streaming', isLeaf: true, levelKind: 'Item', name: 'Live Socket Adapter',  owner: 'Lucas Vermeulen', status: 'Watch',    headcount: 2, budget: 240000, spent: 210000},

    {id: 'team-state', parentId: 'dept-data', isLeaf: false, collapsed: true, levelKind: 'Team', name: 'State Providers', owner: 'Elena Rostova', status: 'On track'},
    {id: 'item-hier-proxy',  parentId: 'team-state', isLeaf: true, levelKind: 'Item', name: 'Hierarchical Proxy', owner: 'Elena Rostova', status: 'On track', headcount: 2, budget: 250000, spent: 185000},
    {id: 'item-formulas',    parentId: 'team-state', isLeaf: true, levelKind: 'Item', name: 'Formula Scheduler',  owner: 'Daniel Boateng', status: 'On track', headcount: 2, budget: 230000, spent: 168000},
    {id: 'item-two-way',     parentId: 'team-state', isLeaf: true, levelKind: 'Item', name: 'Two-Way Bindings',   owner: 'Anika Kulkarni', status: 'On track', headcount: 2, budget: 220000, spent: 162000},

    // 3. UI & Design Systems
    {id: 'dept-ui', parentId: null, isLeaf: false, collapsed: false, levelKind: 'Department', name: 'UI & Design Systems', owner: 'Priya Nair', status: 'Watch'},

    {id: 'team-grids', parentId: 'dept-ui', isLeaf: false, collapsed: true, levelKind: 'Team', name: 'Grid & Table', owner: 'Devon Brooks', status: 'On track'},
    {id: 'item-row-pooling', parentId: 'team-grids', isLeaf: true, levelKind: 'Item', name: 'Row Pooling & Recycle',  owner: 'Devon Brooks',  status: 'On track',  headcount: 4, budget: 460000, spent: 358000},
    {id: 'item-pinned-cols', parentId: 'team-grids', isLeaf: true, levelKind: 'Item', name: 'Pinned Column Sync',     owner: 'Yael Ben-David', status: 'On track', headcount: 3, budget: 340000, spent: 265000},
    {id: 'item-cell-edit',   parentId: 'team-grids', isLeaf: true, levelKind: 'Item', name: 'Cell Editing & Dialogs', owner: 'Rohan Deshmukh', status: 'Committed', headcount: 3, budget: 330000, spent: 264000},

    {id: 'team-visuals', parentId: 'dept-ui', isLeaf: false, collapsed: true, levelKind: 'Team', name: 'Canvas & Charts', owner: 'Claire Dubois', status: 'Watch'},
    {id: 'item-offscreen',   parentId: 'team-visuals', isLeaf: true, levelKind: 'Item', name: 'OffscreenCanvas Worker', owner: 'Claire Dubois', status: 'Watch',    headcount: 3, budget: 380000, spent: 342000},
    {id: 'item-sparklines',  parentId: 'team-visuals', isLeaf: true, levelKind: 'Item', name: 'Sparklines & Charts',    owner: 'Elias Korhonen', status: 'On track', headcount: 2, budget: 240000, spent: 192000},
    {id: 'item-graph-scene', parentId: 'team-visuals', isLeaf: true, levelKind: 'Item', name: 'Graph Scene Renderer',   owner: 'Mina Park',      status: 'Watch',    headcount: 3, budget: 350000, spent: 315000},

    {id: 'team-a11y', parentId: 'dept-ui', isLeaf: false, collapsed: true, levelKind: 'Team', name: 'Themes & Accessibility', owner: 'Hannah Goldstein', status: 'On track'},
    {id: 'item-keynav',      parentId: 'team-a11y', isLeaf: true, levelKind: 'Item', name: 'Keyboard Navigation',  owner: 'Hannah Goldstein', status: 'On track', headcount: 2, budget: 240000, spent: 175000},
    {id: 'item-aria-roles',  parentId: 'team-a11y', isLeaf: true, levelKind: 'Item', name: 'ARIA Tree & Grid Roles', owner: 'Gabriel Silva',  status: 'On track', headcount: 2, budget: 220000, spent: 165000},
    {id: 'item-theme-packs', parentId: 'team-a11y', isLeaf: true, levelKind: 'Item', name: 'Light & Dark Tokens',  owner: 'Freja Holm',       status: 'On track', headcount: 2, budget: 210000, spent: 155000},

    // 4. Cloud & Operations
    {id: 'dept-cloud', parentId: null, isLeaf: false, collapsed: false, levelKind: 'Department', name: 'Cloud & Operations', owner: 'Tarek Mansour', status: 'On track'},

    {id: 'team-observability', parentId: 'dept-cloud', isLeaf: false, collapsed: true, levelKind: 'Team', name: 'Observability', owner: 'Liam O\'Connor', status: 'On track'},
    {id: 'item-traces',    parentId: 'team-observability', isLeaf: true, levelKind: 'Item', name: 'Trace Collector',      owner: 'Liam O\'Connor', status: 'On track', headcount: 3, budget: 330000, spent: 244000},
    {id: 'item-telemetry', parentId: 'team-observability', isLeaf: true, levelKind: 'Item', name: 'Perf Telemetry Store', owner: 'Zainab Tariq',   status: 'On track', headcount: 2, budget: 240000, spent: 178000},
    {id: 'item-alerts',    parentId: 'team-observability', isLeaf: true, levelKind: 'Item', name: 'Alert Routing',        owner: 'Noah Lindstrom', status: 'On track', headcount: 2, budget: 210000, spent: 151000},

    {id: 'team-releases', parentId: 'dept-cloud', isLeaf: false, collapsed: true, levelKind: 'Team', name: 'Edge & Releases', owner: 'Mei-Ling Zhou', status: 'Committed'},
    {id: 'item-portal-cdn', parentId: 'team-releases', isLeaf: true, levelKind: 'Item', name: 'Docs & Portal CDN',    owner: 'Mei-Ling Zhou',  status: 'Committed', headcount: 2, budget: 260000, spent: 208000},
    {id: 'item-previews',   parentId: 'team-releases', isLeaf: true, levelKind: 'Item', name: 'Preview Environments', owner: 'Andre Baptiste', status: 'On track',  headcount: 2, budget: 230000, spent: 174000},
    {id: 'item-publishing', parentId: 'team-releases', isLeaf: true, levelKind: 'Item', name: 'Package Publishing',   owner: 'Klara Novak',    status: 'On track',  headcount: 2, budget: 200000, spent: 148000},

    {id: 'team-security', parentId: 'dept-cloud', isLeaf: false, collapsed: true, levelKind: 'Team', name: 'Security & Audit', owner: 'Rafael Costa', status: 'On track'},
    {id: 'item-dep-scan',    parentId: 'team-security', isLeaf: true, levelKind: 'Item', name: 'Dependency Scanning', owner: 'Rafael Costa',  status: 'On track', headcount: 2, budget: 230000, spent: 168000},
    {id: 'item-csp-guards',  parentId: 'team-security', isLeaf: true, levelKind: 'Item', name: 'CSP & Sandbox Guards', owner: 'Ingrid Solberg', status: 'On track', headcount: 2, budget: 240000, spent: 176000},
    {id: 'item-signing',     parentId: 'team-security', isLeaf: true, levelKind: 'Item', name: 'Supply-Chain Signing', owner: 'Kwame Mensah', status: 'Committed', headcount: 2, budget: 220000, spent: 170000}
];

/**
 * @summary Clones the raw hierarchy and computes every parent's `headcount`, `budget`, and `spent`
 * bottom-up from its direct children (`utilization` derives per-record via `MainModel#fields`).
 * @param {Object[]} rawNodes
 * @returns {Object[]}
 */
export function buildRollupData(rawNodes = RAW_BUDGET_NODES) {
    const clones           = rawNodes.map(node => ({...node})),
          childrenByParent = new Map();

    for (const node of clones) {
        const key = node.parentId ?? 'root';

        if (!childrenByParent.has(key)) {
            childrenByParent.set(key, [])
        }

        childrenByParent.get(key).push(node)
    }

    const computeNode = node => {
        const children = childrenByParent.get(node.id);

        if (!children?.length) {
            return node
        }

        let budget    = 0,
            headcount = 0,
            spent     = 0;

        for (const child of children) {
            computeNode(child);
            budget    += child.budget;
            headcount += child.headcount;
            spent     += child.spent
        }

        node.budget    = budget;
        node.headcount = headcount;
        node.spent     = spent;

        return node
    };

    for (const rootNode of childrenByParent.get('root') || []) {
        computeNode(rootNode)
    }

    return clones
}

/**
 * @summary Three-level operating budget `TreeStore` whose parent rows compute their values from their children.
 *
 * Leaf rows own the raw `headcount`, `budget`, and `spent` numbers; `buildRollupData()` computes initial
 * roll-ups on load and `onRecordChange()` propagates any runtime leaf edit up through its team and department.
 *
 * @class Neo.examples.grid.tree.MainStore
 * @extends Neo.data.TreeStore
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.tree.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.tree.MainStore',
        /**
         * @member {Neo.data.Model} model=MainModel
         */
        model: MainModel,
        /**
         * @member {Object[]} data
         */
        data: buildRollupData()
    }

    /**
     * Guards against recursive rollup loops while ancestor totals are updated.
     * @member {Boolean} #rollingUp=false
     * @private
     */
    #rollingUp = false

    /**
     * @summary Propagates leaf/child `budget`, `spent`, and `headcount` edits up to ancestor rows.
     * @param {Object} data
     */
    onRecordChange(data) {
        super.onRecordChange(data);

        if (this.#rollingUp || !data?.fields?.some(field => ROLLUP_FIELDS.has(field.name))) {
            return
        }

        let parentId = data.record?.parentId;

        if (!parentId) {
            return
        }

        this.#rollingUp = true;

        try {
            while (parentId) {
                const parent   = this.get(parentId),
                      children = this.getChildren(parentId);

                if (!parent || !children.length) {
                    break
                }

                let budget    = 0,
                    headcount = 0,
                    spent     = 0;

                for (const child of children) {
                    budget    += child.budget    || 0;
                    headcount += child.headcount || 0;
                    spent     += child.spent     || 0
                }

                parent.set({
                    budget,
                    headcount,
                    spent
                });

                parentId = parent.parentId
            }
        } finally {
            this.#rollingUp = false
        }
    }

    /**
     * @summary Restores the store's initial 52-node hierarchy, clear sorters, and first-level-expanded state.
     */
    resetHierarchy() {
        this.sorters = [];
        this.data    = buildRollupData()
    }
}

export default Neo.setupClass(MainStore);
