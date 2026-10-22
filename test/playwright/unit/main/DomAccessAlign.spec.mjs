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

const defaultStyleValues = {
    'backdrop-filter': 'none',
    contain          : 'none',
    filter           : 'none',
    overflow         : 'visible',
    perspective      : 'none',
    position         : 'static',
    transform        : 'none',
    'will-change'    : 'auto'
};

const defaultView = {
    getComputedStyle(node) {
        return {
            getPropertyValue(prop) {
                return node?.computedStyle?.[prop] ?? defaultStyleValues[prop] ?? '0px'
            }
        }
    }
};

function createElement(id, {height, width, x, y}, offsetParent=null, computedStyle=null) {
    return {
        id,
        computedStyle,
        connected    : true,
        nodeType     : 1,
        offsetParent,
        ownerDocument: {defaultView, documentElement: {id: 'document-element'}},
        parentElement: offsetParent,
        style        : {},
        // Backed by one Set, so the three methods agree with each other. `contains` is not decoration:
        // `align()` reads it to decide whether the resolved zone class is already on the subject, and a
        // double that answered only `add`/`remove` made a real production read look like a missing API.
        classList    : {
            add(value) {
                classSet.add(value)
            },
            contains(value) {
                return classSet.has(value)
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
    defaultView,
    documentElement: globalThis.document.documentElement
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
    });

    test('getClippedRect returns the fixed-container-clipped rect for a target under position:fixed outside static overflow:hidden ancestors', async () => {
        const
            staticSplit   = createElement('dock-split',     {x: 233,  y: 80, width: 955,  height: 604}, body,          {overflow: 'hidden',  position: 'static'}),
            maximizedPane = createElement('maximized-pane', {x: 0,    y: 0,  width: 1440, height: 900}, null,          {overflow: 'hidden',  position: 'fixed'}),
            headerToolbar = createElement('header-toolbar', {x: 0,    y: 0,  width: 1440, height: 36},  maximizedPane, {overflow: 'visible', position: 'relative'}),
            overflowBtn   = createElement('overflow-btn',   {x: 1288, y: 6,  width: 24,   height: 24},  headerToolbar, {overflow: 'visible', position: 'relative'});

        maximizedPane.parentElement = staticSplit;
        elements.set('overflow-btn', overflowBtn);

        const clipped = DomAccess.getClippedRect({id: overflowBtn});

        expect(clipped && {x: clipped.x, y: clipped.y, width: clipped.width, height: clipped.height})
            .toEqual({x: 1288, y: 6, width: 24, height: 24});

        await alignSubject({
            constrainTo: 'body',
            target     : 'overflow-btn'
        });

        expect(hiddenCalls).toEqual([]);
        expect(DomAccess._aligns.has('subject')).toBe(true);

        // When a descendant overhangs the fixed container's own overflow:hidden bounds, getClippedRect clips to the fixed container.
        const overhangingBtn = createElement('overhanging-btn', {x: 1420, y: 6, width: 40, height: 24}, headerToolbar, {overflow: 'visible', position: 'relative'});

        const fixedClipped = DomAccess.getClippedRect({id: overhangingBtn});
        expect(fixedClipped && {x: fixedClipped.x, y: fixedClipped.y, width: fixedClipped.width, height: fixedClipped.height})
            .toEqual({x: 1420, y: 6, width: 20, height: 24})
    });

    test('getClippedRect clips a target under position:fixed by its own scroll container and by a transformed fixed-containing ancestor', () => {
        const
            fixedPane       = createElement('fixed-pane',   {x: 0,   y: 0,   width: 1440, height: 900}, null,      {overflow: 'hidden', position: 'fixed'}),
            scrollContainer = createElement('scroller',     {x: 100, y: 100, width: 300,  height: 200}, fixedPane, {overflow: 'auto',   position: 'static'}),
            partialTarget   = createElement('partial-item', {x: 350, y: 120, width: 100,  height: 40},  fixedPane, {overflow: 'visible', position: 'static'}),
            hiddenTarget    = createElement('hidden-item',  {x: 450, y: 120, width: 80,   height: 40},  fixedPane, {overflow: 'visible', position: 'static'});

        fixedPane.parentElement     = body;
        partialTarget.parentElement = scrollContainer;
        hiddenTarget.parentElement  = scrollContainer;

        const partialRect = DomAccess.getClippedRect({id: partialTarget});
        expect(partialRect && {x: partialRect.x, y: partialRect.y, width: partialRect.width, height: partialRect.height})
            .toEqual({x: 350, y: 120, width: 50, height: 40});

        expect(DomAccess.getClippedRect({id: hiddenTarget})).toBe(false);

        // If an ancestor above position:fixed establishes a fixed containing block (e.g. transform), its overflow clips.
        const transformedHost = createElement('transformed-host', {x: 200, y: 50, width: 600, height: 400}, body, {
            overflow : 'hidden',
            position : 'static',
            transform: 'translate3d(0px, 0px, 0px)'
        });
        fixedPane.parentElement = transformedHost;

        const outsideTransformed = createElement('outside-transformed', {x: 900, y: 60, width: 30, height: 30}, fixedPane, {overflow: 'visible', position: 'static'});

        expect(DomAccess.getClippedRect({id: outsideTransformed})).toBe(false)
    });

    test('getClippedRect skips intermediate static overflow:hidden boxes for position:absolute targets and clips at the positioned ancestor', () => {
        const
            positionedHost = createElement('positioned-host', {x: 100, y: 50,  width: 400, height: 300}, body,           {overflow: 'hidden',  position: 'relative'}),
            staticClip     = createElement('static-clip',     {x: 100, y: 50,  width: 120, height: 80},  positionedHost, {overflow: 'hidden',  position: 'static'}),
            absTarget      = createElement('abs-target',      {x: 450, y: 200, width: 100, height: 40},  positionedHost, {overflow: 'visible', position: 'absolute'});

        absTarget.parentElement = staticClip;

        const clipped = DomAccess.getClippedRect({id: absTarget});
        expect(clipped && {x: clipped.x, y: clipped.y, width: clipped.width, height: clipped.height})
            .toEqual({x: 450, y: 200, width: 50, height: 40})
    });

    test('getClippedRect handles display:none subtrees and zero-dimension clipping ancestors without boolean intersection coercion', () => {
        const
            zeroOuter    = createElement('zero-outer',  {x: 0,  y: 0,  width: 0, height: 0}, body,      {overflow: 'hidden',  position: 'static'}),
            zeroInner    = createElement('zero-inner',  {x: 0,  y: 0,  width: 0, height: 0}, zeroOuter, {overflow: 'hidden',  position: 'static'}),
            unlaidTarget = createElement('unlaid-node', {x: 0,  y: 0,  width: 0, height: 0}, null,      {overflow: 'visible', position: 'static'}),
            zeroClipHost = createElement('zero-clip',   {x: 50, y: 50, width: 0, height: 0}, body,      {overflow: 'hidden',  position: 'relative'}),
            liveChild    = createElement('live-child',  {x: 40, y: 40, width: 30, height: 30}, zeroClipHost, {overflow: 'visible', position: 'static'});

        unlaidTarget.parentElement = zeroInner;

        const unlaidRect = DomAccess.getClippedRect({id: unlaidTarget});
        expect(unlaidRect && {x: unlaidRect.x, y: unlaidRect.y, width: unlaidRect.width, height: unlaidRect.height})
            .toEqual({x: 0, y: 0, width: 0, height: 0});

        expect(DomAccess.getClippedRect({id: liveChild})).toBe(false)
    })
});
