import {setup} from '../../setup.mjs';

const appName = 'DeltaUpdatesChangeNodeNameTest';

setup({
    neoConfig: {
        unitTestMode     : true,
        useDomApiRenderer: true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

/**
 * Minimal fake DOM element supporting attributes, classList, style, children, and replaceChild
 * so `DeltaUpdates#changeNodeName` and `DeltaUpdates#updateNode` run against real node replacement.
 * @param {String} tagName
 * @returns {Object}
 */
function createFakeElement(tagName) {
    const attrMap   = new Map(),
          classSet  = new Set(),
          styleMap  = new Map(),
          children  = [];

    const el = {
        nodeName     : String(tagName).toUpperCase(),
        tagName      : String(tagName).toUpperCase(),
        parentNode   : null,
        scrollLeft   : 0,
        scrollTop    : 0,
        selectedIndex: undefined,
        value        : undefined,
        innerHTML    : '',
        textContent  : '',

        get firstChild() {
            return children[0] || null
        },

        get children() {
            return children
        },

        attributes: {
            get length() {
                return attrMap.size
            },
            item(index) {
                const entry = Array.from(attrMap.entries())[index];
                return entry ? {nodeName: entry[0], nodeValue: entry[1]} : null
            }
        },

        classList: {
            add(...tokens) {
                tokens.forEach(t => classSet.add(t));
                attrMap.set('class', Array.from(classSet).join(' '))
            },
            remove(...tokens) {
                tokens.forEach(t => classSet.delete(t));
                if (classSet.size > 0) {
                    attrMap.set('class', Array.from(classSet).join(' '))
                } else {
                    attrMap.delete('class')
                }
            },
            contains(token) {
                return classSet.has(token)
            }
        },

        style: {
            setProperty(name, val, important) {
                styleMap.set(name, important ? `${val} !${important}` : val)
            },
            getPropertyValue(name) {
                return styleMap.get(name) || ''
            }
        },

        setAttribute(name, val) {
            const strVal = String(val);
            attrMap.set(name, strVal);
            if (name === 'id') {
                el.id = strVal
            } else if (name === 'class') {
                classSet.clear();
                strVal.split(/\s+/).filter(Boolean).forEach(t => classSet.add(t))
            }
        },

        getAttribute(name) {
            return attrMap.get(name) ?? null
        },

        removeAttribute(name) {
            attrMap.delete(name);
            if (name === 'class') {
                classSet.clear()
            }
        },

        appendChild(child) {
            if (child.parentNode) {
                const idx = child.parentNode.children.indexOf(child);
                if (idx > -1) {
                    child.parentNode.children.splice(idx, 1)
                }
            }
            child.parentNode = el;
            children.push(child);
            return child
        },

        replaceChild(newChild, oldChild) {
            const idx = children.indexOf(oldChild);
            if (idx === -1) {
                throw new Error('oldChild not found in parentNode')
            }
            oldChild.parentNode = null;
            newChild.parentNode = el;
            children[idx] = newChild;
            return oldChild
        }
    };

    return el
}

test.describe('Neo.main.DeltaUpdates — changeNodeName & updateNode rebind', () => {
    test.describe.configure({mode: 'serial'});

    let DeltaUpdates, DomAccess, nodesById, originalDocument, replacedRemotes;

    test.beforeAll(async () => {
        originalDocument = globalThis.document;
        replacedRemotes  = {
            DeltaUpdates: Neo.main?.DeltaUpdates,
            DomAccess   : Neo.main?.DomAccess
        };

        nodesById = new Map();

        Neo.worker.Manager.on ??= () => {};
        globalThis.document = {
            addEventListener   : () => {},
            body               : createFakeElement('body'),
            createElement      : tag => createFakeElement(tag),
            getElementById     : id => nodesById.get(id) || null,
            querySelector      : () => null,
            removeEventListener: () => {}
        };

        delete Neo.main.DomAccess;
        delete Neo.main.DeltaUpdates;
        Neo.main.render ??= {};
        Neo.main.render.DomApiRenderer ??= {};
        Neo.main.render.StringBasedRenderer ??= {};

        DomAccess    = (await import('../../../../src/main/DomAccess.mjs')).default;
        DeltaUpdates = (await import('../../../../src/main/DeltaUpdates.mjs')).default;

        DomAccess.getElementOrBody = id => nodesById.get(id) || null
    });

    test.beforeEach(() => {
        nodesById.clear()
    });

    test.afterAll(() => {
        globalThis.document   = originalDocument;
        Neo.main.DomAccess    = replacedRemotes.DomAccess;
        Neo.main.DeltaUpdates = replacedRemotes.DeltaUpdates
    });

    test('changeNodeName returns the replacement element after swapping it into parentNode', () => {
        const parent = createFakeElement('div'),
              oldEl  = createFakeElement('div'),
              child  = createFakeElement('span');

        oldEl.setAttribute('id', 'target-1');
        oldEl.setAttribute('data-test', 'kept');
        oldEl.appendChild(child);
        parent.appendChild(oldEl);

        const replacement = DeltaUpdates.changeNodeName(oldEl, 'p');

        expect(replacement).toBeTruthy();
        expect(replacement).not.toBe(oldEl);
        expect(replacement.tagName).toBe('P');
        expect(replacement.getAttribute('id')).toBe('target-1');
        expect(replacement.getAttribute('data-test')).toBe('kept');
        expect(replacement.firstChild).toBe(child);
        expect(parent.children[0]).toBe(replacement);
        expect(oldEl.parentNode).toBeNull();
        expect(DeltaUpdates.changeNodeName(null, 'p')).toBeNull()
    });

    test('updateNode applies properties ordered after nodeName to the replacement element instead of the detached node', () => {
        const parent      = createFakeElement('div'),
              placeholder = createFakeElement('div');

        placeholder.setAttribute('id', 'neo-functional-component-1');
        parent.appendChild(placeholder);
        nodesById.set('neo-functional-component-1', placeholder);

        const {vnode: initialVnode} = VdomHelper.create({
            vdom: {id: 'neo-functional-component-1'}
        });
        const {deltas} = VdomHelper.update({
            vnode: initialVnode,
            vdom : {
                id        : 'neo-functional-component-1',
                tag       : 'p',
                cls       : ['greeting'],
                style     : {color: 'rgb(10, 20, 30)'},
                scrollTop : 24,
                text      : 'Hello, workspace!'
            }
        });

        expect(deltas).toHaveLength(1);
        expect(Object.keys(deltas[0])).toEqual(['cls', 'nodeName', 'scrollTop', 'style', 'textContent', 'id']);

        DeltaUpdates.updateNode(deltas[0]);

        const liveNode = parent.children[0];

        expect(liveNode).not.toBe(placeholder);
        expect(liveNode.tagName).toBe('P');
        expect(liveNode.classList.contains('greeting')).toBe(true);
        expect(liveNode.textContent).toBe('Hello, workspace!');
        expect(liveNode.style.getPropertyValue('color')).toBe('rgb(10, 20, 30)');
        expect(liveNode.scrollTop).toBe(24);
        // The detached placeholder must not have received the post-replacement textContent write
        expect(placeholder.textContent).toBe('')
    });

    test('updateNode applies keys following nodeName regardless of key order in delta', () => {
        const parent = createFakeElement('div'),
              oldEl  = createFakeElement('div');

        oldEl.setAttribute('id', 'node-order-test');
        parent.appendChild(oldEl);
        nodesById.set('node-order-test', oldEl);

        DeltaUpdates.updateNode({
            id        : 'node-order-test',
            nodeName  : 'section',
            attributes: {'data-role': 'landmark'},
            cls       : {add: ['mounted-section']},
            innerHTML : '<strong>Updated</strong>'
        });

        const liveNode = parent.children[0];

        expect(liveNode.tagName).toBe('SECTION');
        expect(liveNode.getAttribute('data-role')).toBe('landmark');
        expect(liveNode.classList.contains('mounted-section')).toBe(true);
        expect(liveNode.innerHTML).toBe('<strong>Updated</strong>');
        expect(oldEl.innerHTML).toBe('')
    });
});
