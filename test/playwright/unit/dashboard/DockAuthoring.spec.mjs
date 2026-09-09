import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'NeoDockAuthoringTest'}});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import Authoring         from '../../../../src/dashboard/dock/model/Authoring.mjs';
import WorkspaceDocument from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Persistence       from '../../../../src/dashboard/dock/model/Persistence.mjs';

test('reserves explicit IDs before generated allocation and preserves both panes', () => {
    const panes  = {a: {}, b: {}},
          zones  = {center: {orientation: 'horizontal', children: ['a', {id: 'tabs-a', items: ['b']}]}},
          input  = structuredClone({panes, zones}),
          result = Authoring.fromZones(panes, zones);

    expect(result.errors).toEqual([]);
    expect(result.document.nodes['tabs-a'].items).toEqual(['b']);
    expect(result.document.nodes['tabs-a-0'].items).toEqual(['a']);
    expect(Object.values(result.document.nodes).filter(n => n.type === 'tabs').flatMap(n => n.items)).toEqual(['a', 'b']);
    expect(WorkspaceDocument.validate(result.document)).toEqual([]);
    expect({panes, zones}).toEqual(input);

    // The old overwrite leaves a valid-looking document with both references pointing at b.
    const corrupt = structuredClone(result.document),
          split   = Object.values(corrupt.nodes).find(n => n.type === 'split');
    split.children = ['tabs-a', 'tabs-a'];
    delete corrupt.nodes['tabs-a-0'];
    expect(WorkspaceDocument.validate(WorkspaceDocument.normalizeTree(corrupt))).toEqual([]);
});

test('nested first-pane and delimiter collisions preserve every authored pane', () => {
    for (const zones of [
        {orientation: 'horizontal', children: [{orientation: 'vertical', children: ['a', 'b']}, 'c']},
        {left: {orientation: 'horizontal', children: ['a-b', 'c']}, right: {orientation: 'horizontal', children: ['a', 'b-c']}}
    ]) {
        const {document, errors} = Authoring.fromZones({'a-b': {}, c: {}, a: {}, b: {}, 'b-c': {}}, zones),
              expected           = Object.hasOwn(zones, 'left') ? ['a', 'a-b', 'b-c', 'c'] : ['a', 'b', 'c'];
        expect(errors).toEqual([]);
        expect(Object.values(document.nodes).filter(n => n.type === 'tabs').flatMap(n => n.items).sort()).toEqual(expected);
        expect(WorkspaceDocument.validate(document)).toEqual([]);
    }
});

test('runtime pane config stays outside the wire while catalog policies round-trip', () => {
    const module             = () => {}, store = new Map([['live', true]]),
          panes              = {a: {module, store, header: {text: 'A'}, kind: 'panel', locked: false, metadata: {label: 'safe'}, blueprint: {ntype: 'panel'}}},
          {document, errors} = Authoring.fromZones(panes, 'a');

    expect(errors).toEqual([]);
    // No lookup key is derived from the pane key: `a` is already the item's identity, and a
    // fabricated one would be a second name for it that the consumer then has to maintain.
    expect(document.items.a).toEqual({title: 'A', kind: 'panel', locked: false, metadata: {label: 'safe'}, blueprint: {ntype: 'panel'}});
    expect(panes.a.module).toBe(module);
    expect(panes.a.store).toBe(store);
    document.items.a.metadata.label = 'changed';
    expect(panes.a.metadata.label).toBe('safe');
    const saved = Persistence.createSavedLayout(document, {layoutId: 'authoring', title: 'Authoring'});
    expect(saved.errors).toEqual([]);
    expect(Persistence.restoreSavedLayout(saved.layout).document).toEqual(document);
});

test('uses the ordinary pane header for authoring and export, without duplicate title metadata', () => {
    const {document, errors} = Authoring.fromZones({a: {header: {text: 'Tab label'}, title: 'Component-only title'}, b: {title: 'Component config'}}, ['a', 'b']);
    expect(errors).toEqual([]);
    expect(document.items.a.title).toBe('Tab label');
    expect(document.items.b.title).toBe('b');
    const {config} = Authoring.toConfig(document);
    expect(config.panes.a.header).toEqual({text: 'Tab label'});
    expect(config.panes.a).not.toHaveProperty('title');
    expect(Authoring.fromZones(config.panes, config.zones).document).toEqual(document);
});

const invalid = [
    ['duplicate explicit', {center: {children: [{id: 'x', items: ['a']}, {id: 'x', items: ['b']}], orientation: 'horizontal'}}, 'zones.center.children[1].id'],
    ['implicit root collision', {center: {id: 'root', items: ['a']}}, 'zones.center.id'],
    ['blank explicit', {id: '', items: ['a']}, 'zones.id'],
    ['unknown pane', {center: ['missing']}, 'zones.center[0]'],
    ['duplicate pane', {left: 'a', center: 'a'}, 'zones.center'],
    ['ambiguous node', {items: ['a'], children: ['b']}, 'zones.children'],
    ['unknown field', {center: {items: ['a'], itemz: []}}, 'zones.center.itemz'],
    ['missing discriminator', {}, 'zones'],
    ['bad orientation', {children: ['a', 'b'], orientation: 'diagonal'}, 'zones.orientation'],
    ['bad sizes', {children: ['a', 'b'], orientation: 'horizontal', sizes: [1]}, 'zones.sizes'],
    ['null sizes', {children: ['a', 'b'], orientation: 'horizontal', sizes: null}, 'zones.sizes'],
    ['bad active pane', {items: ['a'], activeItemId: 'b'}, 'zones.activeItemId'],
    ['bad extent', {left: {items: ['a'], extent: 2}}, 'zones.left.extent'],
    ['bad resizable', {left: {items: ['a'], resizable: 'yes'}}, 'zones.left.resizable'],
    ['empty tabs root', [], 'zones']
];

for (const [name, zones, path] of invalid) {
    test(`rejects ${name} at its authored path without partial output`, () => {
        const input = structuredClone(zones), result = Authoring.fromZones({a: {}, b: {}}, zones);
        expect(result.document).toBeNull();
        expect(result.errors.join('\n')).toContain(path);
        expect(zones).toEqual(input);
    });
}

test('explicit root and independent explicit names are legal controls', () => {
    expect(Authoring.fromZones({a: {}}, {id: 'root', items: ['a']}).errors).toEqual([]);
    expect(Authoring.fromZones({a: {}}, {id: 'shell', center: {id: 'root', items: ['a']}}).errors).toEqual([]);
});

test('rejects invalid pane records and non-JSON catalog paths', () => {
    for (const [pane, path] of [[null, 'panes.a'], [{metadata: {fn: () => {}}}, 'panes.a.metadata.fn'], [{header: {text: () => {}}}, 'panes.a.header.text'], [{pinned: true, autoHidden: true}, 'panes.a'], [{metadata: {pointerX: 4}}, 'panes.a']]) {
        const result = Authoring.fromZones({a: pane}, 'a');
        expect(result.document).toBeNull();
        expect(result.errors.join('\n')).toContain(path);
    }
});

test('rejects cyclic authoring input and a cyclic wire graph without recursion failure', () => {
    const zones = {type: 'edge-zone'};
    zones.center = zones;
    expect(Authoring.fromZones({}, zones).errors.join()).toContain('zones.center');
    const document = {schema: WorkspaceDocument.SCHEMA, root: 'root', items: {}, nodes: {root: {type: 'edge-zone', zones: {center: {nodeId: 'root'}}}}};
    const result   = Authoring.toConfig(document);
    expect(result.config).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
});

test('refuses prototype-setter keys that the existing document clone would silently lose', () => {
    const panes    = JSON.parse('{"__proto__": {}}'),
          catalog  = Authoring.fromZones(panes, '__proto__'),
          metadata = Authoring.fromZones({a: {metadata: JSON.parse('{"__proto__": {"label": "keep"}}')}}, 'a'),
          explicit = Authoring.fromZones({a: {}}, {id: '__proto__', items: ['a']});
    for (const result of [catalog, metadata, explicit]) {
        expect(result.document).toBeNull();
        expect(result.errors.join()).toContain('__proto__');
    }
    const wire = {schema: WorkspaceDocument.SCHEMA, root: 'root', items: panes, nodes: {root: {type: 'edge-zone', zones: {}}}};
    expect(Authoring.toConfig(wire).config).toBeNull();
    expect(Authoring.fromZones({constructor: {}, toString: {}}, ['constructor', 'toString']).errors).toEqual([]);
});

test('export refuses split fields that cannot return through the authoring grammar', () => {
    const source = Authoring.fromZones({a: {}, b: {}}, {orientation: 'horizontal', children: ['a', 'b']}).document;
    for (const [field, value] of [['orientation', 'diagonal'], ['orientation', undefined], ['sizes', [2, -1]]]) {
        const document = structuredClone(source);
        if (value === undefined) delete document.nodes.root[field];
        else document.nodes.root[field] = value;
        // Existing wire validation is permissive here; export must not promise a broken inverse.
        expect(WorkspaceDocument.validate(document)).toEqual([]);
        expect(Persistence.createSavedLayout(document).errors).toEqual([]);
        const result = Authoring.toConfig(document);
        expect(result.config).toBeNull();
        expect(result.errors.join()).toContain(`document.nodes.root.${field}`);
    }
    const exported = Authoring.toConfig(source);
    expect(exported.errors).toEqual([]);
    expect(Authoring.fromZones(exported.config.panes, exported.config.zones).document).toEqual(source);
});

test('export names malformed options and unsupported node types without throwing', () => {
    const source = Authoring.fromZones({a: {}}, 'a').document;
    expect(Authoring.toConfig(source, {keepIds: undefined})).toEqual(Authoring.toConfig(source));
    expect(Authoring.toConfig(source, {keepIds: null}).errors.join()).toContain('options.keepIds');
    expect(Authoring.toConfig(source, null).errors.join()).toContain('options');
    expect(Authoring.toConfig(source, {keepIds: 'yes'}).errors.join()).toContain('options.keepIds');
    source.nodes.root.type = 'constructor';
    const result = Authoring.toConfig(source);
    expect(result.config).toBeNull();
    expect(result.errors.join()).toContain('document.nodes.root.type');
});

test('lowering reports independent catalog, node and sibling errors in one refusal', () => {
    const panes = {a: {locked: 'yes'}, b: null, c: {locked: 'yes', metadata: {first: () => {}, second: () => {}}}},
          zones = {left: {items: ['missing'], extent: 2, resizable: 'yes'},
              center: {orientation: 'diagonal', sizes: [1], children: ['a', {items: ['b'], activeItemId: 'other'}]}},
          result = Authoring.fromZones(panes, zones);

    expect(result.document).toBeNull();
    for (const path of ['panes.a', 'panes.b', 'panes.c.metadata.first', 'panes.c.metadata.second',
        'zones.left.items[0]', 'zones.left.extent', 'zones.left.resizable',
        'zones.center.orientation', 'zones.center.sizes', 'zones.center.children[1].activeItemId']) {
        expect(result.errors.join('\n'), path).toContain(path)
    }
    expect(result.errors.join('\n')).not.toContain('unknown pane "b"');
    expect(result.errors.join('\n')).toContain('panes.c: item "c" locked must be a boolean');
});

test('lowering stops a cyclic or malformed branch while checking its independent siblings', () => {
    const zones = {type: 'edge-zone', left: null, right: {items: ['missing']}};
    zones.center = zones;
    const result = Authoring.fromZones({a: {pinned: true, autoHidden: true}}, zones);

    expect(result.document).toBeNull();
    for (const path of ['panes.a', 'zones.left', 'zones.right.items[0]', 'zones.center']) {
        expect(result.errors.join('\n'), path).toContain(path)
    }
    expect(result.errors.join('\n')).toContain('cyclic');
    expect(result.errors.join('\n')).not.toMatch(/call stack|zones\.center\./);
});

test('lowering retains JSON admission for symbols, hidden properties and non-JSON array members', () => {
    const hidden = () => {}, key = Symbol('hidden'),
          zones  = {left: ['a'], right: {items: ['b']}, center: [hidden]};
    zones.left[key] = hidden;
    Object.defineProperty(zones.right, 'opaque', {value: hidden});
    const result = Authoring.fromZones({a: {}, b: {}}, zones);

    expect(result.document).toBeNull();
    for (const path of ['zones.left[Symbol(hidden)]', 'zones.right.opaque', 'zones.center[0]']) {
        expect(result.errors.join('\n'), path).toContain(path)
    }
    expect(zones.left[key]).toBe(hidden);
    expect(Object.getOwnPropertyDescriptor(zones.right, 'opaque').value).toBe(hidden);
});

test('export reports catalog and sibling node failures even when another node is malformed', () => {
    const document = {schema: WorkspaceDocument.SCHEMA, root: 'root', items: {a: {locked: 'yes'}, b: null}, nodes: {
        root    : {type: 'split', orientation: 'diagonal', sizes: [1], children: ['broken', 'tabs']},
        broken  : null,
        tabs    : {type: 'tabs', items: ['a'], activeItemId: 'other'},
        badSplit: {type: 'split', orientation: 'vertical', children: {}, sizes: {}},
        badTabs : {type: 'tabs', items: {a: true}}
    }}, before = structuredClone(document), result = Authoring.toConfig(document, {keepIds: 'yes'});

    expect(result.config).toBeNull();
    for (const path of ['options.keepIds', 'item "a" locked', 'document.items.b',
        'document.nodes.root.orientation', 'document.nodes.root.sizes', 'document.nodes.broken',
        'tabs "tabs" activeItemId', 'split "badSplit" children', 'split "badSplit" sizes', 'tabs "badTabs" items']) {
        expect(result.errors.join('\n'), path).toContain(path)
    }
    expect(result.errors.join('\n')).not.toContain('document.nodes.broken.');
    expect(document).toEqual(before);
    const canonicalErrors = WorkspaceDocument.validate(document).join('\n');
    for (const message of ['node "broken"', 'split "badSplit" children', 'split "badSplit" sizes', 'tabs "badTabs" items', 'tabs "tabs" activeItemId']) {
        expect(canonicalErrors).toContain(message)
    }
});

test('export detects a graph cycle without hiding independent catalog and node errors', () => {
    const document = {schema: WorkspaceDocument.SCHEMA, root: 'root', items: {a: {locked: 'yes'}}, nodes: {
        root: {type: 'edge-zone', zones: {left: {nodeId: 'root'}, center: {nodeId: 'tabs'}}},
        tabs: {type: 'tabs', items: ['a'], activeItemId: 'missing'}
    }}, result = Authoring.toConfig(document);

    expect(result.config).toBeNull();
    expect(result.errors.join('\n')).toContain('item "a" locked');
    expect(result.errors.join('\n')).toContain('tabs "tabs" activeItemId');
    expect(result.errors.join('\n')).toContain('cycle');
    expect(result.errors.join('\n')).not.toContain('call stack');
});
