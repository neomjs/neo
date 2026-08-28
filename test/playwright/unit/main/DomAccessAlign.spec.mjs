import {setup} from '../../setup.mjs';

const appName = 'DomAccessAlignTest';

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

const
    classSet    = new Set(),
    observed    = [],
    unobserved  = [],
    hiddenCalls = [],
    elements    = new Map();

const defaultView = {
    getComputedStyle() {
        return {
            getPropertyValue() {
                return '0px'
            }
        }
    }
};

function createElement(id, {height, width, x, y}, offsetParent=null) {
    return {
        id,
        connected    : true,
        nodeType     : 1,
        offsetParent,
        parentElement: null,
        style        : {},
        classList    : {
            add(value) {
                classSet.add(value)
            },
            remove(value) {
                classSet.delete(value)
            }
        },
        getBoundingClientRect() {
            return new DOMRect(x, y, width, height)
        }
    }
}

const
    body    = createElement('body',    {height: 400, width: 500, x: 0,   y: 0}),
    subject = createElement('subject', {height: 80,  width: 100, x: 0,   y: 0}),
    target  = createElement('target',  {height: 50,  width: 50,  x: 200, y: 100});

globalThis.document = {
    body,
    documentElement: {id: 'document-element'},
    addEventListener() {},
    contains(node) {
        return Boolean(node?.connected)
    },
    getElementById(id) {
        return elements.get(id) || null
    },
    querySelector(selector) {
        return elements.get(selector.match(/'([^']+)'/)?.[1]) || null
    }
};

body.ownerDocument = subject.ownerDocument = target.ownerDocument = {
    defaultView
};

elements.set('body', body);
elements.set('subject', subject);
elements.set('target', target);

globalThis.ResizeObserver = class ResizeObserver {
    constructor(callback) {
        this.callback = callback
    }

    observe(node) {
        if (!node) {
            throw new TypeError('ResizeObserver.observe target is required')
        }

        observed.push(node.id)
    }

    unobserve(node) {
        if (!node) {
            throw new TypeError('ResizeObserver.unobserve target is required')
        }

        unobserved.push(node.id)
    }
};

globalThis.MutationObserver = class MutationObserver {
    constructor(callback) {
        this.callback = callback
    }

    observe() {}
};

// A previously-run spec may leave setup()'s plain DomAccess mock in this reused worker. Remove only
// that mock before loading the production singleton; an already-registered real singleton is retained.
if (Neo.main?.DomAccess && Neo.main.DomAccess.className !== 'Neo.main.DomAccess') {
    delete Neo.main.DomAccess
}

const {default: DomAccess} = await import('../../../../src/main/DomAccess.mjs');

setup({
    appConfig: {
        name: appName
    },
    neoConfig: {
        unitTestMode: true,
        useDomIds   : true
    }
});

Neo.worker.App.setConfigs = data => {
    hiddenCalls.push(data)
};

/**
 * @summary Aligns the shared subject with the complete component-originated dimension envelope.
 * @param {Object} [config]
 * @returns {Promise<void>}
 */
function alignSubject(config={}) {
    return DomAccess.align({
        id                 : 'subject',
        edgeAlign          : 't0-b0',
        configuredFlex     : null,
        configuredHeight   : null,
        configuredMaxHeight: null,
        configuredMaxWidth : null,
        configuredMinHeight: null,
        configuredMinWidth : null,
        configuredWidth    : null,
        ...config
    })
}

test.beforeEach(() => {
    classSet.clear();
    observed.length = 0;
    unobserved.length = 0;
    hiddenCalls.length = 0;
    body.connected = subject.connected = target.connected = true;
    DomAccess._aligns?.clear()
});

test.describe('Neo.main.DomAccess alignment targets', () => {
    test('aligns to serialized viewport geometry and observes only real elements', async () => {
        await alignSubject({
            axisLock   : true,
            constrainTo: 'body',
            target     : {x: 450, y: 380, width: 0, height: 0}
        });

        expect(subject.style.transform).toBe('translate(400px,300px)');
        expect(classSet.has('neo-aligned-top')).toBe(true);
        expect(new Set(observed)).toEqual(new Set(['subject', 'body']));
        expect(DomAccess._aligns.get('subject').targetElement).toBe(null)
    });

    test('preserves element-backed target alignment and observation', async () => {
        await alignSubject({
            constrainTo: 'body',
            target     : 'target'
        });

        expect(subject.style.transform).toBe('translate(200px,150px)');
        expect(new Set(observed)).toEqual(new Set(['subject', 'target', 'body']));
        expect(DomAccess._aligns.get('subject').targetElement).toBe(target)
    });

    test('keeps point-target subjects inside every viewport edge', async () => {
        const cases = [{
            point   : {x: 250, y: 200, width: 0, height: 0},
            expected: 'translate(250px,200px)',
            position: 'bottom'
        }, {
            point   : {x: 450, y: 380, width: 0, height: 0},
            expected: 'translate(400px,300px)',
            position: 'top'
        }, {
            point   : {x: 10, y: 380, width: 0, height: 0},
            expected: 'translate(10px,300px)',
            position: 'top'
        }, {
            point   : {x: 490, y: 10, width: 0, height: 0},
            expected: 'translate(400px,10px)',
            position: 'bottom'
        }, {
            point   : {x: 10, y: 10, width: 0, height: 0},
            expected: 'translate(10px,10px)',
            position: 'bottom'
        }];

        for (const {expected, point, position} of cases) {
            await alignSubject({
                axisLock   : true,
                constrainTo: 'body',
                target     : point
            });

            expect(subject.style.transform).toBe(expected);
            expect(classSet.has(`neo-aligned-${position}`)).toBe(true)
        }
    });

    test('cleans a coordinate-target alignment without hiding or unobserving null', async () => {
        await alignSubject({
            constrainTo: 'body',
            target     : {x: 250, y: 200, width: 0, height: 0}
        });

        subject.connected = false;
        DomAccess.syncAligns();

        expect(hiddenCalls).toEqual([]);
        expect(new Set(unobserved)).toEqual(new Set(['subject', 'body']));
        expect(DomAccess._aligns.has('subject')).toBe(false)
    });

    test('keeps the existing missing-element target failure posture', async () => {
        await alignSubject({target: 'target'});

        target.connected = false;
        DomAccess.syncAligns();

        expect(hiddenCalls).toEqual([{id: 'subject', hidden: true}]);
        expect(DomAccess._aligns.has('subject')).toBe(false)
    });

    test('rejects malformed serialized geometry through the hidden-target posture', async () => {
        await alignSubject({target: {x: 10, y: 20}});

        expect(hiddenCalls).toEqual([{id: 'subject', hidden: true}]);
        expect(DomAccess._aligns?.has('subject') || false).toBe(false)
    })
});
