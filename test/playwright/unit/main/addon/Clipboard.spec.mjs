import {setup} from '../../../setup.mjs';

setup({
    appConfig       : {name: 'MainClipboardAddonUnit'},
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {unitTestMode: true}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Component      from '../../../../../src/component/Base.mjs';
import Container      from '../../../../../src/container/Base.mjs';
import DomEvent       from '../../../../../src/manager/DomEvent.mjs';

const
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    originalClipboardItem       = globalThis.ClipboardItem,
    originalDomAccess           = Neo.main?.DomAccess,
    originalDomEvents           = Neo.main?.DomEvents,
    originalSendMessage         = Neo.worker?.Manager?.sendMessage;

const {default: ClipboardAddon} = await import('../../../../../src/main/addon/Clipboard.mjs');

class ClipboardHostComponent extends Component {
    static config = {
        className: 'Test.Unit.Main.Addon.ClipboardHostComponent'
    }
}
ClipboardHostComponent = Neo.setupClass(ClipboardHostComponent);

class ClipboardOuterContainer extends Container {
    static config = {
        className: 'Test.Unit.Main.Addon.ClipboardOuterContainer'
    }
}
ClipboardOuterContainer = Neo.setupClass(ClipboardOuterContainer);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function createMockNode(id, {
    attributes        = {},
    cls               = [],
    contentEditable,
    dataset           = {},
    disabled          = false,
    isContentEditable = false,
    nodeType          = 1,
    parentNode        = null,
    tagName           = 'DIV',
    type
} = {}) {
    const listeners = new Map();

    const node = {
        attributes   : {...attributes},
        classList    : cls,
        contentEditable,
        dataset      : {...dataset},
        disabled,
        id,
        isContentEditable,
        listeners,
        nodeType,
        parentElement: parentNode,
        parentNode,
        tagName,
        type,

        addEventListener(eventName, fn, options) {
            const capture = Boolean(typeof options === 'boolean' ? options : options?.capture);

            if (!listeners.has(eventName)) {
                listeners.set(eventName, [])
            }

            const entries = listeners.get(eventName);

            if (!entries.some(entry => entry.fn === fn && entry.capture === capture)) {
                entries.push({capture, fn})
            }
        },

        removeEventListener(eventName, fn, options) {
            const
                capture = Boolean(typeof options === 'boolean' ? options : options?.capture),
                entries = listeners.get(eventName);

            if (entries) {
                const index = entries.findIndex(entry => entry.fn === fn && entry.capture === capture);
                if (index !== -1) {
                    entries.splice(index, 1)
                }
            }
        },

        listenerCount(eventName) {
            return listeners.get(eventName)?.length ?? 0
        },

        getAttribute(name) {
            return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null
        },

        dispatch(eventName, eventOverrides = {}) {
            const event = {
                clipboardData   : null,
                defaultPrevented: false,
                target          : node,
                type            : eventName,
                preventDefault() {
                    this.defaultPrevented = true
                },
                ...eventOverrides
            };

            const chain = [];

            for (let current = node; current; current = current.parentNode) {
                chain.push(current)
            }

            // Capture phase (outermost -> target)
            for (const current of [...chain].reverse()) {
                for (const entry of [...(current.listeners?.get(eventName) || [])]) {
                    if (entry.capture) {
                        entry.fn(event)
                    }
                }
            }

            // Bubble phase (target -> outermost)
            for (const current of chain) {
                for (const entry of [...(current.listeners?.get(eventName) || [])]) {
                    if (!entry.capture) {
                        entry.fn(event)
                    }
                }
            }

            return event
        }
    };

    return node
}

class FakeClipboardItem {
    constructor(items) {
        this.items = items;
        this.types = Object.keys(items)
    }

    async getType(type) {
        if (!Object.hasOwn(this.items, type)) {
            throw new Error(`Unsupported MIME type: ${type}`)
        }
        return await this.items[type]
    }
}

test.describe('Neo.main.addon.Clipboard', () => {
    let addon,
        clipboardWriteCalls,
        clipboardReadCalls,
        nodeMap,
        sentMessages,
        unhandledRejections,
        onUnhandledRejection;

    test.beforeEach(() => {
        nodeMap             = new Map();
        sentMessages        = [];
        clipboardWriteCalls = [];
        clipboardReadCalls  = 0;
        unhandledRejections = [];

        onUnhandledRejection = reason => {
            unhandledRejections.push(reason)
        };
        process.on('unhandledRejection', onUnhandledRejection);

        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            writable    : true,
            value       : {
                clipboard: {
                    readText: async () => {
                        clipboardReadCalls++;
                        return 'forbidden'
                    },
                    write: items => {
                        clipboardWriteCalls.push(items);
                        return Promise.all(items.flatMap(item =>
                            item.types.map(type => item.getType(type))
                        ))
                    }
                }
            }
        });

        globalThis.ClipboardItem = FakeClipboardItem;

        Neo.main           = Neo.main || {};
        Neo.main.DomAccess = {
            getElement: id => nodeMap.get(id) ?? null
        };
        Neo.main.DomEvents = {
            getPathFromElement(element) {
                const path = [];
                for (let cur = element; cur; cur = cur.parentNode) {
                    path.push(cur)
                }
                return path
            },
            getTargetData(node) {
                return {
                    cls              : [...(node.classList || [])],
                    data             : {...node.dataset},
                    id               : Neo.config.useDomIds === false ? node.dataset?.neoId : node.id,
                    isContentEditable: Boolean(node.isContentEditable),
                    tagName          : node.tagName?.toLowerCase?.()
                }
            }
        };

        Neo.worker                     = Neo.worker || {};
        Neo.worker.Manager             = Neo.worker.Manager || {};
        Neo.worker.Manager.sendMessage = (destination, message) => {
            sentMessages.push({destination, message})
        };

        Neo.config.useDomIds = true;

        addon = Neo.create(ClipboardAddon, {
            defaultPendingTimeoutMs: 200,
            registerAttempts       : 2
        })
    });

    test.afterEach(() => {
        addon?.destroy?.();
        process.off('unhandledRejection', onUnhandledRejection);
        Neo.config.useDomIds = true
    });

    test.afterAll(() => {
        if (originalNavigatorDescriptor) {
            Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor)
        } else {
            delete globalThis.navigator
        }

        originalClipboardItem === undefined
            ? delete globalThis.ClipboardItem
            : (globalThis.ClipboardItem = originalClipboardItem);

        originalDomAccess === undefined
            ? delete Neo.main.DomAccess
            : (Neo.main.DomAccess = originalDomAccess);

        originalDomEvents === undefined
            ? delete Neo.main.DomEvents
            : (Neo.main.DomEvents = originalDomEvents);

        if (Neo.worker?.Manager) {
            originalSendMessage === undefined
                ? delete Neo.worker.Manager.sendMessage
                : (Neo.worker.Manager.sendMessage = originalSendMessage)
        }
    });

    test('register & unregister attach capture listeners once per target id, support node remounts & shared owners, and clean up', async () => {
        expect(await addon.register()).toBe(false);
        expect(addon.unregister()).toBe(false);

        const root = createMockNode('grid-1');
        nodeMap.set('grid-1', root);

        expect(await addon.register({componentId: 'cmp-a', id: 'grid-1'})).toBe(true);
        expect(root.listenerCount('copy')).toBe(1);
        expect(root.listenerCount('cut')).toBe(1);
        expect(root.listenerCount('paste')).toBe(1);

        // Re-registering same owner updates config without duplicating DOM listeners
        expect(await addon.register({
            componentId: 'cmp-a',
            id         : 'grid-1',
            mimeTypes  : ['text/plain', 'text/html']
        })).toBe(true);
        expect(root.listenerCount('copy')).toBe(1);

        // Remounting a fresh DOM node under the same id detaches the stale node and attaches the new one
        const replacedRoot = createMockNode('grid-1');
        nodeMap.set('grid-1', replacedRoot);

        expect(await addon.register({componentId: 'cmp-a', id: 'grid-1'})).toBe(true);
        expect(root.listenerCount('copy')).toBe(0);
        expect(replacedRoot.listenerCount('copy')).toBe(1);

        // Second component sharing the same target node keeps listener count at 1
        expect(await addon.register({componentId: 'cmp-b', id: 'grid-1'})).toBe(true);
        expect(replacedRoot.listenerCount('copy')).toBe(1);

        expect(addon.unregister({componentId: 'cmp-a', id: 'grid-1'})).toBe(true);
        expect(replacedRoot.listenerCount('copy')).toBe(1);

        expect(addon.unregister({componentId: 'cmp-b'})).toBe(true);
        expect(replacedRoot.listenerCount('copy')).toBe(0);
        expect(replacedRoot.listenerCount('cut')).toBe(0);
        expect(replacedRoot.listenerCount('paste')).toBe(0)
    });

    test('register retries until target mounts, returns false when attempts exhaust, and aborts cleanly if unregistered mid-retry', async () => {
        const delayedNode = createMockNode('late-node');
        setTimeout(() => nodeMap.set('late-node', delayedNode), 40);

        expect(await addon.register({componentId: 'late-node'})).toBe(true);
        expect(delayedNode.listenerCount('copy')).toBe(1);

        // Exhausted retries when target never mounts
        addon.registerAttempts = 1;
        expect(await addon.register({componentId: 'missing-node'})).toBe(false);

        // Race guard: unregistering while register() is awaiting retry prevents listener attachment
        const racedNode  = createMockNode('raced-node');
        const pendingReg = addon.register({componentId: 'raced-node'});

        setTimeout(() => {
            addon.unregister({componentId: 'raced-node'});
            nodeMap.set('raced-node', racedNode)
        }, 25);

        expect(await pendingReg).toBe(false);
        expect(racedNode.listenerCount('copy')).toBe(0)
    });

    test('useDomIds:false red control resolves targets via DomAccess.getElement', async () => {
        Neo.config.useDomIds = false;

        const neoNode = createMockNode('', {dataset: {neoId: 'neo-surface-1'}});
        Neo.main.DomAccess = {
            getElement: id => id === 'neo-surface-1' ? neoNode : null
        };

        expect(await addon.register({componentId: 'neo-surface-1'})).toBe(true);

        const copyEvent = neoNode.dispatch('copy');
        expect(copyEvent.defaultPrevented).toBe(true);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0].message.data.path[0].id).toBe('neo-surface-1')
    });

    test('outbound copy & cut bind ClipboardItem synchronously and fulfillWrite awaits write acceptance across strings and Blobs', async () => {
        const
            root = createMockNode('grid-1', {cls: ['neo-grid']}),
            row  = createMockNode('row-7',  {cls: ['neo-grid-row'], dataset: {recordId: '7'}, parentNode: root}),
            text = {nodeType: 3, parentNode: row};

        nodeMap.set('grid-1', root);

        await addon.register({
            componentId: 'grid-1',
            id         : 'grid-1',
            mimeTypes  : ['text/plain', 'text/html']
        });

        // Dispatch on a Text node (Safari/WebKit selection target behavior)
        const copyEvent = root.dispatch('copy', {target: text});

        expect(copyEvent.defaultPrevented).toBe(true);
        expect(clipboardWriteCalls.length).toBe(1);
        expect(sentMessages.length).toBe(1);

        const {destination, message} = sentMessages[0];
        expect(destination).toBe('app');
        expect(message.action).toBe('domEvent');
        expect(message.eventName).toBe('copy');
        expect(message.data.componentId).toBe('grid-1');
        expect(message.data.id).toBe('grid-1');
        expect(message.data.mimeTypes).toEqual(['text/plain', 'text/html']);
        expect(message.data.path.map(entry => entry.id)).toEqual(['row-7', 'grid-1']);

        const [clipboardItem] = clipboardWriteCalls[0];
        const {requestId}     = message.data;

        expect(await addon.fulfillWrite({
            items: {
                'text/html' : new Blob(['<table><tr><td>Alpha</td></tr></table>'], {type: 'text/html'}),
                'text/plain': 'Alpha'
            },
            requestId
        })).toBe(true);

        // Duplicate, missing, or unknown requestId resolves to false cleanly
        expect(await addon.fulfillWrite()).toBe(false);
        expect(await addon.fulfillWrite({requestId, text: 'Duplicate'})).toBe(false);
        expect(await addon.fulfillWrite({requestId: 'unknown-req', text: 'Unknown'})).toBe(false);

        const plainBlob = await clipboardItem.getType('text/plain');
        const htmlBlob  = await clipboardItem.getType('text/html');

        expect(await plainBlob.text()).toBe('Alpha');
        expect(await htmlBlob.text()).toBe('<table><tr><td>Alpha</td></tr></table>');

        // Single-MIME registration fulfills shorthand `text` on `cut`
        await addon.register({
            componentId     : 'grid-1',
            id              : 'grid-1',
            mimeTypes       : ['text/plain'],
            pendingTimeoutMs: 0
        });

        const cutEvent = row.dispatch('cut');
        expect(cutEvent.defaultPrevented).toBe(true);
        expect(sentMessages[1].message.eventName).toBe('cut');

        const [cutItem] = clipboardWriteCalls[1];
        const cutReqId  = sentMessages[1].message.data.requestId;

        expect(await addon.fulfillWrite({requestId: cutReqId, text: 'CutRow'})).toBe(true);
        expect(await (await cutItem.getType('text/plain')).text()).toBe('CutRow');
        expect(unhandledRejections).toEqual([])
    });

    test('fulfillWrite resolves false and aborts all MIME promises when a declared type is omitted or browser write rejects', async () => {
        const root = createMockNode('grid-1');
        nodeMap.set('grid-1', root);

        await addon.register({
            componentId: 'grid-1',
            id         : 'grid-1',
            mimeTypes  : ['text/plain', 'text/html']
        });

        // 1. Omitted `'text/html'` (worker supplies `text` only): aborts ALL representations, never resolves 0-byte text/html
        root.dispatch('copy');
        const [omittedItem] = clipboardWriteCalls[0];
        const omittedReqId  = sentMessages[0].message.data.requestId;

        expect(await addon.fulfillWrite({requestId: omittedReqId, text: 'OnlyPlain'})).toBe(false);
        await expect(omittedItem.getType('text/plain')).rejects.toThrow('Missing clipboard payload for text/html');
        await expect(omittedItem.getType('text/html')).rejects.toThrow('Missing clipboard payload for text/html');

        // 2. Empty payload (`{requestId}`) aborts cleanly and resolves false
        root.dispatch('copy');
        const [emptyItem] = clipboardWriteCalls[1];
        const emptyReqId  = sentMessages[1].message.data.requestId;

        expect(await addon.fulfillWrite({requestId: emptyReqId})).toBe(false);
        await expect(emptyItem.getType('text/plain')).rejects.toThrow('Missing clipboard payload for text/plain');

        // 3. Browser rejects `navigator.clipboard.write(...)` (e.g. unsupported `text/csv` on Chromium) -> fulfillWrite resolves false
        await addon.register({
            componentId: 'grid-1',
            id         : 'grid-1',
            mimeTypes  : ['text/plain', 'text/csv']
        });

        navigator.clipboard.write = items => {
            clipboardWriteCalls.push(items);
            return Promise.reject(new DOMException('Type text/csv not supported on write', 'NotAllowedError'))
        };

        root.dispatch('copy');
        const rejectedReqId = sentMessages[2].message.data.requestId;

        expect(await addon.fulfillWrite({
            items    : {'text/csv': 'a,b', 'text/plain': 'a\tb'},
            requestId: rejectedReqId
        })).toBe(false);

        // 4. Synchronous constructor throw inside `ClipboardItem` -> fulfillWrite resolves false
        globalThis.ClipboardItem = class ThrowingClipboardItem {
            constructor() {
                throw new DOMException('Unsupported ClipboardItem type', 'NotAllowedError')
            }
        };

        root.dispatch('copy');
        const thrownReqId = sentMessages[3].message.data.requestId;

        expect(await addon.fulfillWrite({
            items    : {'text/csv': 'a,b', 'text/plain': 'a\tb'},
            requestId: thrownReqId
        })).toBe(false);
        expect(unhandledRejections).toEqual([])
    });

    test('nested registered roots open one clipboard write and fire each listening component once per gesture', async () => {
        const
            eventsReceived = [],
            outerComp      = Neo.create(ClipboardOuterContainer, {
                id          : 'outer-clipboard-root',
                domListeners: [
                    {copy : data => eventsReceived.push({owner: 'outer', requestId: data.requestId, type: 'copy'})},
                    {paste: data => eventsReceived.push({owner: 'outer', text: data.text, type: 'paste'})}
                ],
                vdom: {
                    id: 'outer-clipboard-root',
                    cn: []
                }
            }),
            innerComp      = Neo.create(ClipboardHostComponent, {
                id          : 'inner-clipboard-root',
                parentId    : 'outer-clipboard-root',
                domListeners: [
                    {copy : data => eventsReceived.push({currentTarget: data.currentTarget, owner: 'inner', requestId: data.requestId, type: 'copy'}), delegate: '.inner-row'},
                    {paste: data => eventsReceived.push({owner: 'inner', text: data.text, type: 'paste'})}
                ],
                vdom: {
                    id: 'inner-clipboard-root',
                    cn: [{id: 'inner-row-1', cls: ['inner-row']}]
                }
            });

        await outerComp.initVnode();
        await innerComp.initVnode();
        outerComp.mounted = true;
        innerComp.mounted = true;

        try {
            const
                outerNode = createMockNode('outer-clipboard-root'),
                innerNode = createMockNode('inner-clipboard-root', {parentNode: outerNode}),
                rowNode   = createMockNode('inner-row-1',          {cls: ['inner-row'], parentNode: innerNode});

            nodeMap.set('outer-clipboard-root', outerNode);
            nodeMap.set('inner-clipboard-root', innerNode);

            await addon.register({
                componentId: outerComp.id,
                id         : outerComp.id,
                mimeTypes  : ['text/plain', 'text/html']
            });
            await addon.register({
                componentId: innerComp.id,
                id         : innerComp.id,
                mimeTypes  : ['text/plain']
            });

            Neo.worker.Manager.sendMessage = (dest, msg) => {
                sentMessages.push({destination: dest, message: msg});
                if (dest === 'app' && msg.action === 'domEvent') {
                    DomEvent.fire(msg)
                }
            };

            const copyEvent = rowNode.dispatch('copy');
            expect(copyEvent.defaultPrevented).toBe(true);
            expect(clipboardWriteCalls.length).toBe(1);
            expect(sentMessages.length).toBe(1);
            expect(sentMessages[0].message.data.componentId).toBe('inner-clipboard-root');
            expect(sentMessages[0].message.data.id).toBe('inner-clipboard-root');
            expect(sentMessages[0].message.data.mimeTypes).toEqual(['text/plain']);

            expect(eventsReceived).toEqual([
                {currentTarget: 'inner-row-1', owner: 'inner', requestId: 'clipboard-req-1', type: 'copy'},
                {owner: 'outer', requestId: 'clipboard-req-1', type: 'copy'}
            ]);

            expect(await addon.fulfillWrite({requestId: 'clipboard-req-1', text: 'NestedCopy'})).toBe(true);

            // Nested paste dispatches once and merges outer + inner requested paste MIME types
            rowNode.dispatch('paste', {
                clipboardData: {
                    getData: type => type === 'text/plain' ? 'NestedPaste' : (type === 'text/html' ? '<b>NestedPaste</b>' : '')
                }
            });

            expect(sentMessages.length).toBe(2);
            expect(sentMessages[1].message.data.items).toEqual({
                'text/html' : '<b>NestedPaste</b>',
                'text/plain': 'NestedPaste'
            });
            expect(eventsReceived.filter(entry => entry.type === 'paste')).toEqual([
                {owner: 'inner', text: 'NestedPaste', type: 'paste'},
                {owner: 'outer', text: 'NestedPaste', type: 'paste'}
            ])
        } finally {
            innerComp.destroy();
            outerComp.destroy()
        }
    });

    test('cancelWrite, owner unregister, timeout expiry, and destroy reject pending ClipboardItem promises with zero unhandled rejections', async () => {
        const
            outer = createMockNode('outer-1'),
            inner = createMockNode('inner-1', {parentNode: outer});

        nodeMap.set('outer-1', outer);
        nodeMap.set('inner-1', inner);

        await addon.register({
            componentId     : 'outer-1',
            pendingTimeoutMs: 60
        });
        await addon.register({
            componentId     : 'inner-1',
            pendingTimeoutMs: 60
        });

        // 1. Explicit cancelWrite (including default reason & unknown call)
        inner.dispatch('copy');
        const [item1] = clipboardWriteCalls[0];
        const req1    = sentMessages[0].message.data.requestId;

        expect(addon.cancelWrite()).toBe(false);
        expect(addon.cancelWrite({reason: 'nothing-selected', requestId: req1})).toBe(true);
        expect(addon.cancelWrite({requestId: req1})).toBe(false);
        await expect(item1.getType('text/plain')).rejects.toThrow('nothing-selected');

        // 2. Unregistering one nested owner keeps write pending until last active owner unregisters
        inner.dispatch('copy');
        const [itemOwner] = clipboardWriteCalls[1];

        expect(addon.unregister({componentId: 'inner-1', id: 'inner-1'})).toBe(true);
        expect(addon.unregister({componentId: 'outer-1'})).toBe(true);
        await expect(itemOwner.getType('text/plain')).rejects.toThrow('unregistered');

        // 3. Timeout expiry (with pendingTimeoutMs: 45) & pendingTimeoutMs: 0 cancel path
        await addon.register({
            componentId     : 'outer-1',
            pendingTimeoutMs: 45
        });

        outer.dispatch('copy');
        const [item2] = clipboardWriteCalls[2];

        await wait(80);
        await expect(item2.getType('text/plain')).rejects.toThrow('timeout');

        await addon.register({
            componentId     : 'outer-1',
            pendingTimeoutMs: 0
        });

        // 4. Addon destroy while write with pendingTimeoutMs: 0 is pending
        outer.dispatch('cut');
        const [item3] = clipboardWriteCalls[3];
        addon.destroy();

        await expect(item3.getType('text/plain')).rejects.toThrow('destroyed');
        await wait(20);
        expect(unhandledRejections).toEqual([])
    });

    test('inbound paste extracts clipboardData synchronously without calling navigator.clipboard.readText', async () => {
        const
            root = createMockNode('grid-1'),
            cell = createMockNode('cell-1', {parentNode: root});

        nodeMap.set('grid-1', root);

        // Non-text/plain mimeTypes still populate fallback text/plain when clipboardData provides plain text
        await addon.register({
            componentId: 'grid-1',
            mimeTypes  : ['text/html']
        });

        const pasteEvent = cell.dispatch('paste', {
            clipboardData: {
                getData(type) {
                    if (type === 'text/plain') return 'A\tB';
                    if (type === 'text/html')  return '<b>A</b>';
                    return ''
                }
            }
        });

        expect(pasteEvent.defaultPrevented).toBe(true);
        expect(clipboardReadCalls).toBe(0);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0].message).toEqual({
            action   : 'domEvent',
            eventName: 'paste',
            data     : {
                componentId: 'grid-1',
                id         : 'grid-1',
                items      : {
                    'text/html' : '<b>A</b>',
                    'text/plain': 'A\tB'
                },
                path: [
                    {cls: [], data: {}, id: 'cell-1', isContentEditable: false, tagName: 'div'},
                    {cls: [], data: {}, id: 'grid-1', isContentEditable: false, tagName: 'div'}
                ],
                text: 'A\tB'
            }
        });

        // Missing clipboardData degrades cleanly to empty payload
        const emptyPaste = cell.dispatch('paste', {clipboardData: null});
        expect(emptyPaste.defaultPrevented).toBe(true);
        expect(sentMessages[1].message.data.text).toBe('');
        expect(sentMessages[1].message.data.items).toEqual({});
        expect(clipboardReadCalls).toBe(0)
    });

    test('editable target partition, disabled controls, document root boundary, and missing ClipboardItem guard', async () => {
        const
            docRoot         = {nodeType: 9, parentNode: null},
            root            = createMockNode('grid-1',      {parentNode: docRoot}),
            textInput       = createMockNode('editor-1',    {parentNode: root, tagName: 'INPUT', type: 'text'}),
            defaultInput    = createMockNode('editor-2',    {parentNode: root, tagName: 'INPUT'}),
            disabledInput   = createMockNode('editor-dis',  {disabled: true, parentNode: root, tagName: 'INPUT', type: 'text'}),
            textarea        = createMockNode('editor-3',    {parentNode: root, tagName: 'TEXTAREA'}),
            disabledArea    = createMockNode('area-dis',    {disabled: true, parentNode: root, tagName: 'TEXTAREA'}),
            editableHost    = createMockNode('rich-1',      {attributes: {contenteditable: 'true'}, parentNode: root}),
            editableChild   = createMockNode('rich-span',   {parentNode: editableHost, tagName: 'SPAN'}),
            propEditable    = createMockNode('rich-prop',   {isContentEditable: true, parentNode: root}),
            nonEditableSub  = createMockNode('island-1',    {attributes: {contenteditable: 'false'}, parentNode: editableHost}),
            nonEditableLeaf = createMockNode('island-row',  {parentNode: nonEditableSub}),
            checkboxInput   = createMockNode('check-1',     {parentNode: root, tagName: 'INPUT', type: 'checkbox'});

        nodeMap.set('grid-1', root);
        await addon.register({componentId: 'grid-1'});

        for (const editable of [textInput, defaultInput, textarea, editableChild, propEditable]) {
            const copyEvt  = editable.dispatch('copy');
            const pasteEvt = editable.dispatch('paste');

            expect(copyEvt.defaultPrevented).toBe(false);
            expect(pasteEvt.defaultPrevented).toBe(false)
        }

        expect(clipboardWriteCalls.length).toBe(0);
        expect(sentMessages.length).toBe(0);

        // Disabled inputs/textareas, non-text checkbox input, and contenteditable="false" island route through the addon
        expect(disabledInput.dispatch('copy').defaultPrevented).toBe(true);
        expect(disabledArea.dispatch('copy').defaultPrevented).toBe(true);
        expect(checkboxInput.dispatch('copy').defaultPrevented).toBe(true);
        expect(nonEditableLeaf.dispatch('copy').defaultPrevented).toBe(true);
        expect(sentMessages.length).toBe(4);

        // Opting into ignoreEditableTargets: false captures text inputs too
        await addon.register({componentId: 'grid-1', ignoreEditableTargets: false});
        expect(textInput.dispatch('copy').defaultPrevented).toBe(true);
        expect(sentMessages.length).toBe(5);

        // Missing ClipboardItem (e.g. legacy Firefox ESR) degrades to graceful no-op and releases claimsEvent
        delete globalThis.ClipboardItem;
        expect(addon.claimsEvent({target: root, type: 'copy'})).toBe(false);
        expect(addon.claimsEvent({target: root, type: 'paste'})).toBe(true);
        expect(root.dispatch('copy').defaultPrevented).toBe(false);
        expect(sentMessages.length).toBe(5)
    });

    test('Neo.manager.DomEvent mounts local copy, cut, and paste listeners as on dev while claimsEvent prevents double-firing', async () => {
        const
            eventsReceived = [],
            promiseCalls   = [],
            originalAppPm  = Neo.worker.App.promiseMessage;

        Neo.worker.App.promiseMessage = async (...args) => {
            promiseCalls.push(args);
            return {}
        };

        const component = Neo.create(ClipboardHostComponent, {
            id          : 'clipboard-host-unit-1',
            domListeners: [{
                copy    : data => eventsReceived.push({currentTarget: data.currentTarget, requestId: data.requestId ?? null, type: 'copy'}),
                delegate: '.row-item'
            }, {
                cut : data => eventsReceived.push({requestId: data.requestId ?? null, type: 'cut'})
            }, {
                paste: data => eventsReceived.push({text: data.text ?? null, type: 'paste'})
            }],
            vdom: {
                id: 'clipboard-host-unit-1',
                cn: [{id: 'clipboard-host-row-1', cls: ['row-item']}]
            }
        });

        await component.initVnode();
        component.mounted = true;

        try {
            // Plain copy, cut, and paste stay local (mounted=false) until mountDomListeners calls addDomListener
            for (const name of ['copy', 'cut', 'paste']) {
                expect(DomEvent.items[component.id][name][0].mounted).toBe(false)
            }

            DomEvent.mountDomListeners(component);
            expect(promiseCalls.length).toBe(1);
            expect(promiseCalls[0][1].action).toBe('addDomListener');
            expect(promiseCalls[0][1].events.map(e => e.name).sort()).toEqual(['copy', 'cut', 'paste']);

            const
                unregisteredNode = createMockNode('plain-node'),
                rootNode         = createMockNode('clipboard-host-unit-1'),
                rowNode          = createMockNode('clipboard-host-row-1', {cls: ['row-item'], parentNode: rootNode}),
                editorNode       = createMockNode('clipboard-host-input', {parentNode: rootNode, tagName: 'INPUT', type: 'text'});

            expect(addon.claimsEvent(null)).toBe(false);
            expect(addon.claimsEvent({target: rootNode, type: 'click'})).toBe(false);
            expect(addon.claimsEvent({target: null, type: 'copy'})).toBe(false);
            expect(addon.claimsEvent({target: rootNode, type: 'copy'})).toBe(false);

            nodeMap.set('clipboard-host-unit-1', rootNode);
            await addon.register({componentId: component.id});

            expect(addon.claimsEvent({target: unregisteredNode, type: 'copy'})).toBe(false);
            expect(addon.claimsEvent({target: editorNode, type: 'copy'})).toBe(false);
            expect(addon.claimsEvent({currentTarget: rootNode, target: editorNode, type: 'copy'})).toBe(true);
            expect(addon.claimsEvent({target: rowNode, type: 'copy'})).toBe(true);

            // Simulate local bubble domEventListener coexisting on rootNode alongside the addon's capture listener
            const localDomEventListener = event => {
                if (addon.claimsEvent(event)) {
                    return
                }
                Neo.worker.Manager.sendMessage('app', {
                    action   : 'domEvent',
                    eventName: event.type,
                    data     : {id: event.target.id, path: addon.buildEventPath(event.target)}
                })
            };
            rootNode.addEventListener('copy',  localDomEventListener);
            rootNode.addEventListener('cut',   localDomEventListener);
            rootNode.addEventListener('paste', localDomEventListener);

            Neo.worker.Manager.sendMessage = (dest, msg) => {
                if (dest === 'app' && msg.action === 'domEvent') {
                    DomEvent.fire(msg)
                }
            };

            rowNode.dispatch('copy');
            rowNode.dispatch('cut');
            rowNode.dispatch('paste', {
                clipboardData: {
                    getData: type => type === 'text/plain' ? 'from-clipboard' : ''
                }
            });

            expect(eventsReceived).toEqual([
                {currentTarget: 'clipboard-host-row-1', requestId: 'clipboard-req-1', type: 'copy'},
                {requestId: 'clipboard-req-2', type: 'cut'},
                {text: 'from-clipboard', type: 'paste'}
            ])
        } finally {
            Neo.worker.App.promiseMessage = originalAppPm;
            component.destroy()
        }
    });
});
