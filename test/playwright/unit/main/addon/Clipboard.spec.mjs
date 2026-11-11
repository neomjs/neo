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

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function createMockNode(id, {
    attributes       = {},
    cls              = [],
    contentEditable,
    dataset          = {},
    disabled         = false,
    isContentEditable = false,
    nodeType         = 1,
    parentNode       = null,
    tagName          = 'DIV',
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

        addEventListener(eventName, fn) {
            if (!listeners.has(eventName)) {
                listeners.set(eventName, new Set())
            }
            listeners.get(eventName).add(fn)
        },

        removeEventListener(eventName, fn) {
            listeners.get(eventName)?.delete(fn)
        },

        listenerCount(eventName) {
            return listeners.get(eventName)?.size ?? 0
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

            let current = node;

            while (current) {
                for (const fn of [...(current.listeners?.get(eventName) || [])]) {
                    fn(event)
                }
                current = current.parentNode
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
            defaultPendingTimeoutMs: 200
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

    test('register & unregister attach listeners once per target id, support shared owners, and clean up on last unregister', async () => {
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

        // Second component sharing the same target node keeps listener count at 1
        expect(await addon.register({componentId: 'cmp-b', id: 'grid-1'})).toBe(true);
        expect(root.listenerCount('copy')).toBe(1);

        expect(addon.unregister({componentId: 'cmp-a', id: 'grid-1'})).toBe(true);
        expect(root.listenerCount('copy')).toBe(1);

        expect(addon.unregister({componentId: 'cmp-b'})).toBe(true);
        expect(root.listenerCount('copy')).toBe(0);
        expect(root.listenerCount('cut')).toBe(0);
        expect(root.listenerCount('paste')).toBe(0)
    });

    test('register retries until target mounts and aborts cleanly if unregistered mid-retry', async () => {
        const delayedNode = createMockNode('late-node');
        setTimeout(() => nodeMap.set('late-node', delayedNode), 40);

        expect(await addon.register({componentId: 'late-node'})).toBe(true);
        expect(delayedNode.listenerCount('copy')).toBe(1);

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

    test('outbound copy & cut bind ClipboardItem synchronously and fulfillWrite resolves text and multi-MIME Blobs', async () => {
        const
            root = createMockNode('grid-1', {cls: ['neo-grid']}),
            row  = createMockNode('row-7',  {cls: ['neo-grid-row'], dataset: {recordId: '7'}, parentNode: root}),
            text = {nodeType: 3, parentElement: row, parentNode: row};

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

        expect(addon.fulfillWrite({
            items: {
                'text/html' : '<table><tr><td>Alpha</td></tr></table>',
                'text/plain': 'Alpha'
            },
            requestId
        })).toBe(true);

        // Duplicate or unknown requestId returns false cleanly
        expect(addon.fulfillWrite({requestId, text: 'Duplicate'})).toBe(false);
        expect(addon.fulfillWrite({requestId: 'unknown-req', text: 'Unknown'})).toBe(false);

        const plainBlob = await clipboardItem.getType('text/plain');
        const htmlBlob  = await clipboardItem.getType('text/html');

        expect(await plainBlob.text()).toBe('Alpha');
        expect(await htmlBlob.text()).toBe('<table><tr><td>Alpha</td></tr></table>');

        // Shorthand `text` fulfills text/plain on `cut`
        const cutEvent = row.dispatch('cut');
        expect(cutEvent.defaultPrevented).toBe(true);
        expect(sentMessages[1].message.eventName).toBe('cut');

        const [cutItem] = clipboardWriteCalls[1];
        const cutReqId  = sentMessages[1].message.data.requestId;

        expect(addon.fulfillWrite({requestId: cutReqId, text: 'CutRow'})).toBe(true);
        expect(await (await cutItem.getType('text/plain')).text()).toBe('CutRow');
        expect(await (await cutItem.getType('text/html')).text()).toBe('');
        expect(unhandledRejections).toEqual([])
    });

    test('cancelWrite, timeout expiry, and destroy reject pending ClipboardItem promises with zero unhandled rejections', async () => {
        const root = createMockNode('grid-1');
        nodeMap.set('grid-1', root);

        await addon.register({
            componentId     : 'grid-1',
            pendingTimeoutMs: 45
        });

        // 1. Explicit cancelWrite
        root.dispatch('copy');
        const [item1] = clipboardWriteCalls[0];
        const req1    = sentMessages[0].message.data.requestId;

        expect(addon.cancelWrite({reason: 'nothing-selected', requestId: req1})).toBe(true);
        expect(addon.cancelWrite({requestId: req1})).toBe(false);
        await expect(item1.getType('text/plain')).rejects.toThrow('nothing-selected');

        // 2. Timeout expiry
        root.dispatch('copy');
        const [item2] = clipboardWriteCalls[1];

        await wait(80);
        await expect(item2.getType('text/plain')).rejects.toThrow('timeout');

        // 3. Addon destroy while write is pending
        root.dispatch('cut');
        const [item3] = clipboardWriteCalls[2];
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

        await addon.register({
            componentId: 'grid-1',
            mimeTypes  : ['text/plain', 'text/html']
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

    test('editable target partition skips text inputs, textareas, and contenteditable unless ignoreEditableTargets is false', async () => {
        const
            root            = createMockNode('grid-1'),
            textInput       = createMockNode('editor-1',   {parentNode: root, tagName: 'INPUT', type: 'text'}),
            defaultInput    = createMockNode('editor-2',   {parentNode: root, tagName: 'INPUT'}),
            textarea        = createMockNode('editor-3',   {parentNode: root, tagName: 'TEXTAREA'}),
            editableHost    = createMockNode('rich-1',     {attributes: {contenteditable: 'true'}, parentNode: root}),
            editableChild   = createMockNode('rich-span',  {parentNode: editableHost, tagName: 'SPAN'}),
            nonEditableSub  = createMockNode('island-1',   {attributes: {contenteditable: 'false'}, parentNode: editableHost}),
            nonEditableLeaf = createMockNode('island-row', {parentNode: nonEditableSub}),
            checkboxInput   = createMockNode('check-1',    {parentNode: root, tagName: 'INPUT', type: 'checkbox'});

        nodeMap.set('grid-1', root);
        await addon.register({componentId: 'grid-1'});

        for (const editable of [textInput, defaultInput, textarea, editableChild]) {
            const copyEvt  = editable.dispatch('copy');
            const pasteEvt = editable.dispatch('paste');

            expect(copyEvt.defaultPrevented).toBe(false);
            expect(pasteEvt.defaultPrevented).toBe(false)
        }

        expect(clipboardWriteCalls.length).toBe(0);
        expect(sentMessages.length).toBe(0);

        // Non-text checkbox input and contenteditable="false" island route through the addon
        expect(checkboxInput.dispatch('copy').defaultPrevented).toBe(true);
        expect(nonEditableLeaf.dispatch('copy').defaultPrevented).toBe(true);
        expect(sentMessages.length).toBe(2);

        // Opting into ignoreEditableTargets: false captures text inputs too
        await addon.register({componentId: 'grid-1', ignoreEditableTargets: false});
        expect(textInput.dispatch('copy').defaultPrevented).toBe(true);
        expect(sentMessages.length).toBe(3)
    });

    test('Neo.manager.DomEvent treats copy, cut, and paste as pre-mounted globalDomEvents and routes delegated handlers', async () => {
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
                copy    : data => eventsReceived.push({currentTarget: data.currentTarget, requestId: data.requestId, type: 'copy'}),
                delegate: '.row-item'
            }, {
                cut : data => eventsReceived.push({requestId: data.requestId, type: 'cut'})
            }, {
                paste: data => eventsReceived.push({text: data.text, type: 'paste'})
            }],
            vdom: {
                id: 'clipboard-host-unit-1',
                cn: [{id: 'clipboard-host-row-1', cls: ['row-item']}]
            }
        });

        await component.initVnode();
        component.mounted = true;

        try {
            // globalDomEvents membership marks copy, cut, paste mounted=true without addDomListener round-trips
            for (const name of ['copy', 'cut', 'paste']) {
                expect(DomEvent.items[component.id][name][0].mounted).toBe(true)
            }

            DomEvent.mountDomListeners(component);
            expect(promiseCalls.length).toBe(0);

            const
                rootNode = createMockNode('clipboard-host-unit-1'),
                rowNode  = createMockNode('clipboard-host-row-1', {cls: ['row-item'], parentNode: rootNode});

            nodeMap.set('clipboard-host-unit-1', rootNode);

            Neo.worker.Manager.sendMessage = (dest, msg) => {
                if (dest === 'app' && msg.action === 'domEvent') {
                    DomEvent.fire(msg)
                }
            };

            await addon.register({componentId: component.id});

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
