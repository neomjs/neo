import {setup} from '../../../setup.mjs';

setup({neoConfig: {useDomApiRenderer: false}, appConfig: {name: 'MainDragDropTerminalTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/vdom/util/StringFromVnode.mjs';
import VdomHelper from '../../../../../src/vdom/Helper.mjs';

const savedDocument  = globalThis.document, savedWindow = globalThis.window,
      savedDomAccess = Neo.main.DomAccess, savedDragDrop = Neo.main.addon.DragDrop,
      documentRef    = Object.assign(new EventTarget(), {body: {}, documentElement: {}}), windowRef = new EventTarget();
globalThis.document = documentRef;
globalThis.window = windowRef;
Neo.worker.Manager.on ??= () => {};
Neo.main.render ??= {};
Neo.main.render.StringBasedRenderer ??= {};
delete Neo.main.DomAccess;
delete Neo.main.addon.DragDrop;
const {default: DragDrop}     = await import('../../../../../src/main/addon/DragDrop.mjs'),
      {default: DeltaUpdates} = await import('../../../../../src/main/DeltaUpdates.mjs'),
      {default: DomAccess}    = await import('../../../../../src/main/DomAccess.mjs');
Neo.main.DomAccess = savedDomAccess;
Neo.main.addon.DragDrop = savedDragDrop;

test.beforeEach(() => {
    globalThis.document = documentRef;
    globalThis.window = windowRef;
    Neo.main.DeltaUpdates = DeltaUpdates
});

test.afterAll(() => {
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow
});

/** @summary Run the real opaque producer and the real Main listener in delivery order. */
function compose(data) {
    const result = VdomHelper.updateBatch(data);
    DragDrop.prototype.onDeltaUpdate(result);
    return result
}

/** @summary Create the previous vnode through the real Helper. */
function update(id, before, after, meta) {
    const {vnode} = VdomHelper.create({vdom: {id, tag: 'div', text: before}});
    return {vdom: {id, tag: 'div', text: after}, vnode, ...(meta ? {meta} : {})}
}

function freeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value)
    }
    return value
}

test('emitted and absorbed owner preludes all precede every ordinary diff, including the trailing sentinel', () => {
    const absorbed = {scrollTop: 40, sortZoneTerminal: [{action: 'removeNode', id: 'absorbed-placeholder'}]},
          first    = {sortZoneTerminal: [{action: 'moveNode', id: 'original', index: 2, parentId: 'owner'}]},
          last     = {sortZoneTerminal: [{action: 'removeNode', id: 'proxy'}]},
          data     = {meta: {absorbed}, updates: {
              first: update('first-root', 'before first', 'after first', first),
              last : update('last-root', 'before last', 'after last', last)
          }},
          result = compose(data);

    expect(result.deltas).toEqual([
        ...absorbed.sortZoneTerminal, ...first.sortZoneTerminal, ...last.sortZoneTerminal,
        {id: 'first-root', textContent: 'after first'},
        {id: 'last-root', textContent: 'after last'}
    ]);
    expect(result.vnodes['last'].textContent).toBe('after last');
    expect(result.meta).toEqual({absorbed, first, last});
    expect(result.meta.absorbed).toBe(absorbed);
    expect(result.meta.first).toBe(first);
    expect(result.updateVdom).toBe(true)
});

test('an unchanged ordinary tree still returns the leading work without a dummy DOM mutation', () => {
    const meta = {scrollEpoch: 4, sortZoneTerminal: [
              {action: 'moveNode', id: 'live', parentId: 'owner', index: 2},
              {action: 'removeNode', id: 'placeholder'},
              {action: 'removeNode', id: 'proxy'}
          ]},
          opts = update('unchanged-root', 'unchanged', 'unchanged', meta);
    expect(VdomHelper.update(structuredClone(opts)).deltas).toEqual([]);

    const result = compose({updates: {owner: opts}});
    expect(result.deltas).toEqual(meta.sortZoneTerminal);
    expect(result.deltas).not.toBe(meta.sortZoneTerminal);
    expect(result.vnodes.owner.textContent).toBe('unchanged');
    expect(result.meta.owner).toBe(meta)
});

test('result mutation cannot alter frozen owner metadata or its nested prelude descriptors', () => {
    const metadata = freeze({scrollEpoch: 7, sortZoneTerminal: [{
              action: 'updateNode', id: 'live', style: {left: '12px'}, attributes: {'data-owner': 'owner'}
          }]}),
          data = {meta: {absorbed: metadata}, updates: {
              owner: update('immutable-root', 'old', 'new', {otherConsumer: {token: 'retained'}})
          }},
          before = structuredClone(data),
          result = compose(data);

    expect(data).toEqual(before);
    expect(result.deltas[0]).toEqual(metadata.sortZoneTerminal[0]);
    expect(result.deltas[0]).not.toBe(metadata.sortZoneTerminal[0]);
    expect(result.deltas[0].style).not.toBe(metadata.sortZoneTerminal[0].style);
    expect(result.deltas[0].attributes).not.toBe(metadata.sortZoneTerminal[0].attributes);
    result.deltas[0].style.left = '999px';
    result.deltas[0].attributes['data-owner'] = 'different';
    result.deltas.push({action: 'removeNode', id: 'caller-only'});
    expect(data).toEqual(before);
    expect(result.meta.absorbed).toBe(metadata);
    expect(result.meta.owner).toBe(data.updates.owner.meta)
});

test('ordinary batching and metadata without the reserved key keep the existing Helper result', () => {
    const data = {meta: {absorbed: {scrollTop: 12}}, updates: {
              owner: update('ordinary-root', 'old', 'ordinary sentinel', {otherConsumer: {enabled: true}})
          }},
          actual = compose(data);

    expect(actual.deltas).toEqual([{id: 'ordinary-root', textContent: 'ordinary sentinel'}]);
    expect(actual.vnodes.owner).toMatchObject({id: 'ordinary-root', textContent: 'ordinary sentinel'});
    expect(actual.meta).toEqual({absorbed: {scrollTop: 12}, owner: {otherConsumer: {enabled: true}}});
    expect(actual.updateVdom).toBe(true);
    const empty = compose({updates: {owner: update('empty-root', 'same', 'same')}});
    expect(empty.deltas).toEqual([]);
    expect(Object.hasOwn(empty, 'meta')).toBe(false)
});

test('a present malformed prelude rejects rather than silently dropping owned work', () => {
    for (const invalid of [null, {}, 'not-an-array', false]) {
        const metadata = {sortZoneTerminal: invalid}, data = {updates: {
            owner: update('invalid-prelude-root', 'unchanged', 'unchanged', metadata)
        }};
        expect(() => compose(data)).toThrow('SortZone terminal metadata for "owner" must be an array');
        expect(metadata.sortZoneTerminal).toBe(invalid)
    }
});

test('an empty prelude array preserves ordinary behavior and its metadata', () => {
    const metadata = freeze({sortZoneTerminal: [], otherConsumer: 3}),
          data     = {updates: {owner: update('empty-prelude-root', 'before', 'after', metadata)}},
          actual   = compose(data);
    expect(actual.deltas).toEqual([{id: 'empty-prelude-root', textContent: 'after'}]);
    expect(actual.vnodes.owner).toMatchObject({id: 'empty-prelude-root', textContent: 'after'});
    expect(actual.updateVdom).toBe(true);
    expect(actual.meta.owner).toBe(metadata);
    expect(metadata.sortZoneTerminal).toEqual([])
});

test('the update event dispatches every composed descriptor and the ordinary tail, then unbinds on destruction', () => {
    const addon = Neo.create(DragDrop, {addGlobalEventListeners() {}}),
          calls = [], tail = {id: 'tail', textContent: 'ordinary'},
          meta  = {owner: {sortZoneTerminal: [
              {action: 'moveNode', id: 'original', parentId: 'owner', index: 1},
              {action: 'removeNode', id: 'proxy'}
          ]}},
          target = {
              checkRendererAvailability() {}, flushLayoutHeals() {},
              fire      : (...args) => DeltaUpdates.fire(...args),
              moveNode  : delta => calls.push(delta), removeNode: delta => calls.push(delta),
              updateNode: delta => calls.push(delta)
          };
    try {
        DeltaUpdates.update.call(target, {deltas: [tail], meta});
        expect(calls).toEqual([...meta.owner.sortZoneTerminal, tail]);
        calls.length = 0;
        DeltaUpdates.update.call(target, {deltas: [], meta});
        expect(calls).toEqual(meta.owner.sortZoneTerminal);
        addon.destroy();
        calls.length = 0;
        DeltaUpdates.update.call(target, {deltas: [tail], meta});
        expect(calls).toEqual([tail])
    } finally {
        if (!addon.isDestroyed) addon.destroy()
    }
});

for (const mode of ['first', 'repeated', 'distinct', 'unchanged', 'fallback']) {
    test(`terminal native moves: ${mode} performs only the necessary intermediate layout read`, () => {
        const reads       = [], moved = [], parent = {childNodes: [], isConnected: false},
              source      = {childNodes: [], isConnected: false}, nodes = {parent, source},
              originalGet = DomAccess.getElement, state = {nativeMoveBefore: mode !== 'fallback'};
        for (const id of ['a', 'b', 'c']) {
            const node = nodes[id] = {
                id, nodeType: 1, parentNode: source,
                get nextSibling() {return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null},
                getBoundingClientRect() {reads.push(id)}, contains() {return false}
            };
            source.childNodes.push(node)
        }
        // Model native reparenting only. Production moveNode owns index and no-op decisions.
        const place = (node, sibling) => {
            moved.push(node.id);
            node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
            parent.childNodes.splice(sibling ? parent.childNodes.indexOf(sibling) : parent.childNodes.length, 0, node);
            node.parentNode = parent
        };
        parent.moveBefore = place;
        parent.insertBefore = place;
        DomAccess.getElement = id => nodes[id];
        const move = (id, index) => DeltaUpdates.moveNode.call(state, {id, index, parentId: 'parent'});
        try {
            move('a', 0);
            if (mode === 'repeated' || mode === 'fallback') {
                move('b', 0);
                move('a', 0)
            } else if (mode === 'distinct') move('b', 1);
            else if (mode === 'unchanged') move('a', 1);
            expect(reads).toEqual(mode === 'repeated' ? ['a'] : []);
            expect(moved).toEqual(mode === 'repeated' || mode === 'fallback' ? ['a', 'b', 'a'] :
                mode === 'distinct' ? ['a', 'b'] : ['a']);
            DeltaUpdates.flushLayoutHeals.call(state);
            expect(state.pendingNativeMoves).toBeNull();
            expect(state.pendingLayoutHeals ?? null).toBeNull()
        } finally {
            DomAccess.getElement = originalGet
        }
    })
}
