import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'NeoDashboardDockAuthoringRoundTripTest'}});

import {test, expect}                   from '@playwright/test';
import Neo                              from '../../../../src/Neo.mjs';
import * as core                        from '../../../../src/core/_export.mjs';
import Authoring                        from '../../../../src/dashboard/dock/model/Authoring.mjs';
import Operations                       from '../../../../src/dashboard/dock/model/Operations.mjs';
import Persistence                      from '../../../../src/dashboard/dock/model/Persistence.mjs';
import WorkspaceDocument                from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import {initialDocument as demoA}       from '../../../../examples/dashboard/choreography/demoADockChoreography.mjs';
import {initialDocument as demoB}       from '../../../../examples/dashboard/crossWindow/demoBPerspectives.mjs';
import {initialDocument as workstation} from '../../../../apps/workstation/tour/denseWorkstation.mjs';

const EDGES = ['top', 'right', 'bottom', 'left', 'center'];

/**
 * @summary The standalone dock example's non-exported initial document, without importing its UI.
 * @type {Object}
 */
const example = {
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        strategy : {componentRef: 'Strategy',  title: 'Strategy',  kind: 'panel'},
        swarm    : {componentRef: 'Swarm',     title: 'Swarm',     kind: 'panel'},
        terminal : {componentRef: 'Terminal',  title: 'Terminal',  kind: 'terminal'},
        logs     : {componentRef: 'Logs',      title: 'Logs',      kind: 'panel'},
        inspector: {componentRef: 'Inspector', title: 'Inspector', kind: 'panel'},
        metrics  : {componentRef: 'Metrics',   title: 'Metrics',   kind: 'panel'},
        timeline : {componentRef: 'Timeline',  title: 'Timeline',  kind: 'panel'},
        agents   : {componentRef: 'Agents',    title: 'Agents',    kind: 'panel'},
        alerts   : {componentRef: 'Alerts',    title: 'Alerts',    kind: 'panel'},
        history  : {componentRef: 'History',   title: 'History',   kind: 'panel'}
    },
    nodes: {
        root            : {type: 'edge-zone', zones: {center: {nodeId: 'root-split'}, right: {nodeId: 'inspector-tabs', extent: 0.25, resizable: true}}},
        'root-split'    : {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-split'], sizes: [0.65, 0.35]},
        'main-tabs'     : {type: 'tabs', items: ['strategy', 'swarm', 'metrics', 'timeline', 'agents', 'alerts', 'history'], activeItemId: 'strategy'},
        'side-split'    : {type: 'split', orientation: 'vertical', children: ['terminal-tabs', 'logs-tabs'], sizes: [0.6, 0.4]},
        'terminal-tabs' : {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'},
        'logs-tabs'     : {type: 'tabs', items: ['logs'], activeItemId: 'logs'},
        'inspector-tabs': {type: 'tabs', items: ['inspector'], activeItemId: 'inspector'}
    }
};

/**
 * @summary The comparison contract: normalize structure, then default only catalog title/reference.
 * @param {Object} document
 * @returns {Object}
 */
function expectedDocument(document) {
    const result = WorkspaceDocument.normalizeTree(document);

    for (const [key, item] of Object.entries(result.items)) {
        result.items[key] = {...item, componentRef: item.componentRef ?? key, title: item.title ?? key}
    }

    return result
}

/**
 * @summary Removes structural naming from the oracle through ordered DFS renaming; catalog stays exact.
 * @param {Object} document A normalized tree.
 * @returns {Object}
 */
function canonical(document) {
    const ids = new Map(), nodes = {};

    const visit = oldId => {
        const id = `n${ids.size}`, node = structuredClone(document.nodes[oldId]);
        ids.set(oldId, id);
        nodes[id] = node;

        if (node.type === 'split') node.children = node.children.map(visit);
        if (node.type === 'edge-zone') {
            for (const edge of EDGES) {
                if (node.zones[edge]) node.zones[edge].nodeId = visit(node.zones[edge].nodeId)
            }
        }

        return id
    };

    return {schema: document.schema, root: visit(document.root), items: document.items, nodes}
}

/**
 * @summary Checks both export modes against the model oracle and checks all inputs remain unchanged.
 * @param {Object} document
 * @param {String} label
 * @returns {void}
 */
function assertRoundTrip(document, label) {
    const before = structuredClone(document), expected = expectedDocument(document);

    expect(WorkspaceDocument.validate(expected), `${label}: valid source`).toEqual([]);
    expect(Persistence.createSavedLayout(expected).errors, `${label}: persistable source`).toEqual([]);

    for (const keepIds of [true, false]) {
        const exported = keepIds ? Authoring.toConfig(document) : Authoring.toConfig(document, {keepIds});
        expect(exported.errors, `${label}: export keepIds=${keepIds}`).toEqual([]);
        expect(exported.config, `${label}: exported config`).not.toBeNull();

        const configBefore = structuredClone(exported.config),
              lowered      = Authoring.fromZones(exported.config.panes, exported.config.zones);

        expect(lowered.errors, `${label}: lower keepIds=${keepIds}`).toEqual([]);
        expect(lowered.document, `${label}: lowered document`).not.toBeNull();
        expect(WorkspaceDocument.validate(lowered.document), `${label}: valid result`).toEqual([]);
        expect(Persistence.createSavedLayout(lowered.document).errors, `${label}: persistable result`).toEqual([]);
        expect(keepIds ? lowered.document : canonical(lowered.document), `${label}: round trip keepIds=${keepIds}`)
            .toEqual(keepIds ? expected : canonical(expected));
        expect(Authoring.fromZones(exported.config.panes, exported.config.zones), `${label}: deterministic lowering`).toEqual(lowered);
        expect(exported.config, `${label}: untouched authored input`).toEqual(configBefore)
    }

    expect(document, `${label}: untouched wire input`).toEqual(before)
}

/**
 * @summary Generates bounded JSON trees, not arbitrary valid documents: depth <= 3, all root types,
 * empty edge zones, one-to-three-item tabs, two/three-child splits, policy flags and catalog-only items.
 * @param {Number} seed
 * @returns {Object}
 */
function randomDocument(seed) {
    let   state   = seed >>> 0, nodeIndex = 0, itemIndex = 0;
    const items   = {}, nodes = {};
    const random  = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
    const integer = max => Math.floor(random() * max);

    const item = () => {
        const id = `pane-${seed}-${itemIndex++}`, record = {}, autoHidden = random() < 0.25;
        if (random() < 0.7) record.componentRef = `component-${id}`;
        if (random() < 0.7) record.title = `Pane ${id}`;
        if (random() < 0.5) record.kind = 'panel';
        Object.assign(record, {autoHidden, pinned: !autoHidden && random() < 0.3,
            closable: random() < 0.8, pinnable: random() < 0.8, lockable: random() < 0.8,
            locked  : random() < 0.3, movable: random() < 0.8});
        if (random() < 0.5) record.metadata = {sample: seed, labels: ['generated', null, true]};
        if (random() < 0.3) record.blueprint = {ntype: 'component', text: id, data: {sample: seed}};
        items[id] = record;
        return id
    };

    const tree = (depth, forced) => {
        const id = `node-${nodeIndex++}`, type = forced ?? (depth >= 3 ? 0 : integer(3));
        if (type === 0) {
            const members = Array.from({length: 1 + integer(3)}, item);
            nodes[id] = {type: 'tabs', items: members};
            if (random() < 0.8) nodes[id].activeItemId = random() < 0.2 ? null : members[integer(members.length)]
        } else if (type === 1) {
            const children = Array.from({length: 2 + integer(2)}, () => tree(depth + 1));
            nodes[id] = {type: 'split', orientation: random() < 0.5 ? 'horizontal' : 'vertical',
                children, sizes: children.map(() => 1 / children.length)}
        } else {
            const zones = {};
            for (const edge of EDGES) {
                if (random() < 0.35) {
                    zones[edge] = {nodeId: tree(depth + 1)};
                    if (random() < 0.7) zones[edge].extent = (1 + integer(4)) / 10;
                    if (random() < 0.7) zones[edge].resizable = random() < 0.5
                }
            }
            nodes[id] = {type: 'edge-zone', zones}
        }
        return id
    };

    const root = tree(0, seed % 3);
    for (let i = integer(3); i > 0; i--) item();

    return WorkspaceDocument.normalizeTree({schema: WorkspaceDocument.SCHEMA, root, items, nodes})
}

test.describe('Neo.dashboard.dock.model.Authoring round trips', () => {
    for (const [name, document] of Object.entries({example, demoA, demoB, workstation})) {
        test(`preserves the representative ${name} document in both export modes`, () => {
            assertRoundTrip(document, name)
        })
    }

    test('preserves every catalog field and defaults minimal records without losing catalog-only items', () => {
        const document = {
            schema: WorkspaceDocument.SCHEMA, root: 'main',
            items : {
                a: {componentRef: 'OtherFactory', title: 'Full pane', kind: 'panel', closable: false,
                    pinnable : true, pinned: true, autoHidden: false, lockable: true, locked: true, movable: false,
                    metadata : {label: 'catalog', values: [1, null, false]},
                    blueprint: {ntype: 'component', text: 'Recovery', data: {record: 7}}},
                b: {}, c: {title: 'Catalog only'}
            },
            nodes: {main: {type: 'tabs', items: ['a', 'b'], activeItemId: null}}
        };

        assertRoundTrip(document, 'complete and minimal catalog');
        const {config} = Authoring.toConfig(document);
        expect(Object.keys(config.panes).sort()).toEqual(['a', 'b', 'c'])
    });

    test('keeps detached and closed catalogs distinct even when their normalized trees are equal', () => {
        const detached = Operations.detachItem(example, {itemId: 'inspector'}),
              closed   = Operations.closeItem(example, {itemId: 'inspector'});

        expect(detached.errors).toEqual([]);
        expect(closed.errors).toEqual([]);
        expect(detached.document.nodes).toEqual(closed.document.nodes);
        expect(detached.document.items.inspector).toBeDefined();
        expect(closed.document.items.inspector).toBeUndefined();
        assertRoundTrip(detached.document, 'detached');
        assertRoundTrip(closed.document, 'closed')
    });

    test('preserves empty nested edges and normalizes an emptied tabs child without deleting its catalog', () => {
        assertRoundTrip({schema: WorkspaceDocument.SCHEMA, root: 'shell', items: {a: {}}, nodes: {
            shell       : {type: 'edge-zone', zones: {left: {nodeId: 'empty-edge'}, center: {nodeId: 'empty-tabs'}}},
            'empty-edge': {type: 'edge-zone', zones: {}},
            'empty-tabs': {type: 'tabs', items: []}
        }}, 'empty nested edge and pruned tabs');
        assertRoundTrip({schema: WorkspaceDocument.SCHEMA, root: 'empty', items: {},
            nodes: {empty: {type: 'edge-zone', zones: {}}}}, 'empty root')
    });

    test('accepts a split root without adding an edge wrapper', () => {
        assertRoundTrip({schema: WorkspaceDocument.SCHEMA, root: 'split-root', items: {a: {}, b: {}}, nodes: {
            'split-root': {type: 'split', orientation: 'vertical', children: ['left', 'right'], sizes: [0.3, 0.7]},
            left        : {type: 'tabs', items: ['a'], activeItemId: 'a'},
            right       : {type: 'tabs', items: ['b'], activeItemId: 'b'}
        }}, 'split root')
    });

    test('round-trips 400 seeded bounded trees with explicit domain-coverage controls', () => {
        const rootTypes   = new Set();
        let   catalogOnly = 0, nestedEdges = 0, autoHidden = 0, missingFields = 0, blueprints = 0;

        for (let seed = 1; seed <= 400; seed++) {
            const document = randomDocument(seed), placed = new Set();
            rootTypes.add(document.nodes[document.root].type);
            for (const [id, node] of Object.entries(document.nodes)) {
                if (node.type === 'tabs') node.items.forEach(itemId => placed.add(itemId));
                if (node.type === 'edge-zone' && id !== document.root) nestedEdges++
            }
            catalogOnly += Object.keys(document.items).filter(id => !placed.has(id)).length;
            for (const item of Object.values(document.items)) {
                if (item.autoHidden) autoHidden++;
                if (item.title === undefined || item.componentRef === undefined) missingFields++;
                if (item.blueprint) blueprints++
            }
            assertRoundTrip(document, `seed ${seed}`)
        }

        expect([...rootTypes].sort()).toEqual(['edge-zone', 'split', 'tabs']);
        for (const [dimension, count] of Object.entries({catalogOnly, nestedEdges, autoHidden, missingFields, blueprints})) {
            expect(count, `generator actually exercises ${dimension}`).toBeGreaterThan(0)
        }
    });
});
