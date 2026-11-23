import {setup} from '../../../setup.mjs';

const appName = 'DomEventTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Component      from '../../../../../src/component/Base.mjs';
import Container      from '../../../../../src/container/Base.mjs';
import DomEvent       from '../../../../../src/manager/DomEvent.mjs';
import VdomHelper     from '../../../../../src/vdom/Helper.mjs';

test.describe('Neo.manager.DomEvent Delegation Verification', () => {

    test('an ID-only navigation path does not match an ancestor listener', () => {
        const path          = [{id: 'submenu'}],
              componentPath = ['submenu', 'root-menu'];

        expect(DomEvent.verifyDelegationPath({
            delegate: '#submenu', vnodeId: 'submenu'
        }, path, componentPath)).toBe('submenu');

        expect(DomEvent.verifyDelegationPath({
            delegate: '#root-menu', vnodeId: 'root-menu'
        }, path, componentPath)).toBe(false)
    });

    test('an ID selector cannot match a class with the same name', () => {
        const path          = [{id: 'submenu', cls: ['root-menu']}],
              componentPath = ['submenu', 'root-menu'];

        expect(DomEvent.verifyDelegationPath({
            delegate: '#root-menu', vnodeId: 'root-menu'
        }, path, componentPath)).toBe(false);

        expect(DomEvent.verifyDelegationPath({
            delegate: '.root-menu', vnodeId: 'root-menu'
        }, path, componentPath)).toBe('submenu')
    });

    test('should verify delegation via Physical Path (Phase 1)', async () => {
        const container = Neo.create(Container, {
            appName,
            autoMount: true,
            id       : 'container-1',
            items    : [{
                module: Component,
                id    : 'child-1',
                cls   : ['child-cls']
            }]
        });

        const child = container.items[0];

        const listener = {
            vnodeId: 'container-1',
            ownerId: 'container-1',
            delegate: '.child-cls'
        };

        const path = [
            { id: 'child-1', cls: ['neo-component', 'child-cls'] },
            { id: 'container-1', cls: ['neo-container'] },
            { id: 'body', cls: [] }
        ];

        const targetId = DomEvent.verifyDelegationPath(listener, path, ['child-1', 'container-1']);

        expect(targetId).toBe('child-1');

        container.destroy();
    });

    test('should verify delegation via Logical VNode Fallback (Portal/Proxy)', async () => {
        // Scenario: Component IS in parent's items (and VDOM), but physically detached.
        // This expects the VNode check to pass.

        const parent = Neo.create(Container, {
            appName,
            id: 'portal-parent',
            items: [{
                module: Component,
                id: 'portal-child',
                cls: ['target-cls']
            }]
        });
        await parent.initVnode();

        const listener = {
            vnodeId: 'portal-parent',
            ownerId: 'portal-parent',
            delegate: '.target-cls'
        };

        // Broken physical path (child -> body)
        const brokenPath = [
            { id: 'portal-child', cls: ['target-cls'] },
            { id: 'body', cls: [] }
        ];

        const componentPath = ['portal-child', 'portal-parent'];

        const targetId = DomEvent.verifyDelegationPath(listener, brokenPath, componentPath);

        expect(targetId).toBe('portal-child');

        parent.destroy();
    });

    test('should verify delegation via parentComponent (Menu)', async () => {
        // Scenario: Component is NOT in parent's items (NOT in VDOM), but linked via parentComponent.
        // This checks if we still support purely logical bubbling for things like Menus.

        const parent = Neo.create(Container, {
            appName,
            id: 'menu-parent',
            items: []
        });
        await parent.initVnode();

        const child = Neo.create(Component, {
            appName,
            id: 'menu-child',
            parentComponent: parent, // Logical link
            cls: ['menu-item']
        });
        await child.initVnode();

        const listener = {
            vnodeId: 'menu-parent',
            ownerId: 'menu-parent',
            delegate: '.menu-item'
        };

        // Broken physical path
        const path = [
            { id: 'menu-child', cls: ['menu-item'] },
            { id: 'body', cls: [] }
        ];

        const componentPath = ['menu-child', 'menu-parent'];

        const targetId = DomEvent.verifyDelegationPath(listener, path, componentPath);

        // This requires fallback to componentPath check if VNode check fails
        expect(targetId).toBe('menu-child');

        parent.destroy();
        child.destroy();
    });

    test('should fail when target is neither physically nor logically present', async () => {
        const parent = Neo.create(Container, {
            appName,
            id: 'parent-real',
            items: []
        });
        await parent.initVnode();

        const listener = {
            vnodeId: 'parent-real',
            ownerId: 'parent-real',
            delegate: '.fake-cls'
        };

        // Path has a random element not in parent
        const randomPath = [
            { id: 'random-el', cls: ['fake-cls'] },
            { id: 'body', cls: [] }
        ];

        // ComponentPath should NOT contain the random element to simulate a real failure.
        // If 'random-el' is in componentPath, Phase 3 will mistakenly accept it.
        const componentPath = ['parent-real'];

        const targetId = DomEvent.verifyDelegationPath(listener, randomPath, componentPath);

        expect(targetId).toBe(false);

        parent.destroy();
    });

    test('should verify delegation via node attributes ([data-*], [aria-*], [role], [tabindex], and compound selectors) (#5005)', () => {
        const path = [
            {
                id       : 'img-child',
                tagName  : 'IMG',
                cls      : [],
                style    : '',
                draggable: true,
                role     : null,
                tabIndex : null,
                data     : {},
                aria     : {}
            },
            {
                id      : 'action-btn',
                cls     : ['neo-button'],
                data    : {ref: 'foo', actionType: 'save-draft'},
                aria    : {label: 'Save draft', expanded: 'false'},
                role    : 'button',
                tabIndex: '0'
            },
            {
                id  : 'toolbar-1',
                cls : ['neo-toolbar'],
                data: {section: 'header'},
                role: null
            },
            {
                id  : 'container-root',
                cls : ['neo-container'],
                role: null
            }
        ];

        const componentPath = ['img-child', 'action-btn', 'toolbar-1', 'container-root'];

        // 1. Unquoted [data-ref=foo]
        expect(DomEvent.verifyDelegationPath({
            delegate: '[data-ref=foo]',
            vnodeId : 'container-root'
        }, path, componentPath)).toBe('action-btn');

        // 2. Hyphenated data-* attribute mapped to camelCase in dataset ([data-action-type="save-draft"])
        expect(DomEvent.verifyDelegationPath({
            delegate: '[data-action-type="save-draft"]',
            vnodeId : 'container-root'
        }, path, componentPath)).toBe('action-btn');

        // 3. Quoted aria-* attribute containing whitespace ([aria-label="Save draft"])
        expect(DomEvent.verifyDelegationPath({
            delegate: '.neo-toolbar [aria-label="Save draft"]',
            vnodeId : 'container-root'
        }, path, componentPath)).toBe('toolbar-1');

        // 4. Top-level serialized node attributes ([role=button], [tabindex="0"], [tabindex]) and presence-only ([data-ref])
        expect(DomEvent.verifyDelegationPath({
            delegate: '[role=button]',
            vnodeId : 'container-root'
        }, path, componentPath)).toBe('action-btn');

        expect(DomEvent.verifyDelegationPath({
            delegate: '[tabindex="0"]',
            vnodeId : 'container-root'
        }, path, componentPath)).toBe('action-btn');

        expect(DomEvent.verifyDelegationPath({
            delegate: '[tabindex]',
            vnodeId : 'container-root'
        }, path, componentPath)).toBe('action-btn');

        expect(DomEvent.verifyDelegationPath({
            delegate: '[data-ref]',
            vnodeId : 'container-root'
        }, path, componentPath)).toBe('action-btn');

        // 5. Non-matching attribute value returns false
        expect(DomEvent.verifyDelegationPath({
            delegate: '[data-ref=bar]',
            vnodeId : 'container-root'
        }, path, componentPath)).toBe(false);

        // 6. Property-backed names ([style], [draggable]) do not match nodes without those attributes
        expect(DomEvent.verifyDelegationPath({
            delegate: '[style]',
            vnodeId : 'container-root'
        }, path, componentPath)).toBe(false);

        expect(DomEvent.verifyDelegationPath({
            delegate: '[draggable]',
            vnodeId : 'container-root'
        }, path, componentPath)).toBe(false);

        expect(DomEvent.verifyDelegationPath({
            delegate: '[draggable=true]',
            vnodeId : 'container-root'
        }, path, componentPath)).toBe(false);

        // 7. [role] does not match a node whose serialized role is null
        expect(DomEvent.verifyDelegationPath({
            delegate: '[role]',
            vnodeId : 'container-root'
        }, [path[0], path[2], path[3]], ['img-child', 'toolbar-1', 'container-root'])).toBe(false);
    });

    test('should fire vnodeId: document.body listeners once across body, sibling and self targets', async () => {
        const calls = [];

        const toolbar = Neo.create(Container, {
            appName,
            id      : 'doc-body-sibling-toolbar',
            windowId: 1,
            items   : [{
                module: Component,
                id    : 'doc-body-sibling-button'
            }]
        });

        const owner = Neo.create(Container, {
            appName,
            id          : 'doc-body-owner',
            windowId    : 1,
            domListeners: [{
                keydown: data => calls.push({currentTarget: data.currentTarget, key: data.key, targetId: data.target?.id}),
                scope  : null,
                vnodeId: 'document.body'
            }],
            items       : [{
                module: Component,
                id    : 'doc-body-owner-child'
            }]
        });

        const otherWindowOwner = Neo.create(Component, {
            appName,
            id          : 'doc-body-other-window',
            windowId    : 2,
            domListeners: [{
                keydown: () => calls.push({wrongWindow: true}),
                vnodeId: 'document.body'
            }]
        });

        await Promise.all([toolbar.initVnode(), owner.initVnode(), otherWindowOwner.initVnode()]);

        // 1. Target is document.body directly (componentPath is empty)
        DomEvent.fire({
            eventName: 'keydown',
            windowId : 1,
            data     : {
                key   : '/',
                target: {id: '', tagName: 'body'},
                path  : [{id: '', cls: [], tagName: 'body'}, {id: '', cls: [], tagName: 'html'}]
            }
        });
        expect(calls).toEqual([{currentTarget: 'document.body', key: '/', targetId: ''}]);

        // 2. Target sits in a sibling container outside owner
        DomEvent.fire({
            eventName: 'keydown',
            windowId : 1,
            data     : {
                key   : '/',
                target: {id: 'doc-body-sibling-button', tagName: 'button'},
                path  : [
                    {id: 'doc-body-sibling-button', cls: ['neo-component'], tagName: 'button'},
                    {id: 'doc-body-sibling-toolbar', cls: ['neo-container'], tagName: 'div'},
                    {id: 'document.body', cls: [], tagName: 'body'}
                ]
            }
        });
        expect(calls).toHaveLength(2);
        expect(calls[1].currentTarget).toBe('document.body');

        // 3. Target sits inside owner itself: must invoke once, never double-fire
        DomEvent.fire({
            eventName: 'keydown',
            windowId : 1,
            data     : {
                key   : '/',
                target: {id: 'doc-body-owner-child', tagName: 'div'},
                path  : [
                    {id: 'doc-body-owner-child', cls: ['neo-component'], tagName: 'div'},
                    {id: 'doc-body-owner', cls: ['neo-container'], tagName: 'div'},
                    {id: '', cls: [], tagName: 'body'}
                ]
            }
        });
        expect(calls).toHaveLength(3);

        // 4. Destroy removes listeners cleanly
        owner.destroy();
        expect(DomEvent.bodyListenerOwners.get('keydown')?.has('doc-body-owner') ?? false).toBe(false);
        DomEvent.fire({
            eventName: 'keydown',
            windowId : 1,
            data     : {
                key   : '/',
                target: {id: '', tagName: 'body'},
                path  : [{id: '', cls: [], tagName: 'body'}]
            }
        });
        expect(calls).toHaveLength(3);

        toolbar.destroy();
        otherWindowOwner.destroy();
        expect(DomEvent.bodyListenerOwners.has('keydown')).toBe(false);
    });

    test('body-listener index never visits components without a body listener and removes owners on unregister()', async () => {
        const calls          = [],
              originalGetCmp = Neo.getComponent.bind(Neo);
        let bystanderItemReads  = 0,
            bystanderCmpLookups = 0;

        const bystander = Neo.create(Component, {
            appName,
            id          : 'doc-body-bystander',
            windowId    : 1,
            domListeners: [{
                click  : () => calls.push('bystander-click'),
                keydown: () => calls.push('bystander-keydown')
            }]
        });

        const owner = Neo.create(Component, {
            appName,
            id      : 'doc-body-indexed-owner',
            windowId: 1
        });

        await Promise.all([bystander.initVnode(), owner.initVnode()]);

        const bystanderMap = DomEvent.items['doc-body-bystander'];

        Object.defineProperty(DomEvent.items, 'doc-body-bystander', {
            configurable: true,
            enumerable  : true,
            get() {
                bystanderItemReads++;
                return bystanderMap
            }
        });

        Neo.getComponent = id => {
            if (id === 'doc-body-bystander') {
                bystanderCmpLookups++
            }
            return originalGetCmp(id)
        };

        try {
            expect(DomEvent.bodyListenerOwners.has('keydown')).toBe(false);

            // 1. No body listener registered: in-document events skip the body pass in O(1)
            DomEvent.fire({
                eventName: 'keydown',
                windowId : 1,
                data     : {
                    key   : '/',
                    target: {id: '', tagName: 'body'},
                    path  : [{id: '', cls: [], tagName: 'body'}]
                }
            });
            expect(bystanderItemReads).toBe(0);
            expect(bystanderCmpLookups).toBe(0);
            expect(calls).toEqual([]);

            // 2. Register a body listener on owner: bystander is still never visited by the body pass
            const registration = {
                eventName: 'keydown',
                id       : owner.id,
                opts     : data => calls.push(`owner:${data.key}`),
                ownerId  : owner.id,
                scope    : owner,
                vnodeId  : 'document.body'
            };

            expect(DomEvent.register(registration)).toBe(true);
            expect([...(DomEvent.bodyListenerOwners.get('keydown') || [])]).toEqual(['doc-body-indexed-owner']);

            DomEvent.fire({
                eventName: 'keydown',
                windowId : 1,
                data     : {
                    key   : '/',
                    target: {id: '', tagName: 'body'},
                    path  : [{id: '', cls: [], tagName: 'body'}]
                }
            });
            DomEvent.fire({
                eventName: 'click',
                windowId : 1,
                data     : {
                    target: {id: '', tagName: 'body'},
                    path  : [{id: '', cls: [], tagName: 'body'}]
                }
            });

            expect(calls).toEqual(['owner:/']);
            expect(bystanderItemReads).toBe(0);
            expect(bystanderCmpLookups).toBe(0);

            // 3. unregister() removes the owner from bodyListenerOwners and prunes the empty event set
            expect(DomEvent.unregister(registration)).toBe(true);
            expect(DomEvent.bodyListenerOwners.has('keydown')).toBe(false);
            expect(DomEvent.unregister(registration)).toBe(false);

            DomEvent.fire({
                eventName: 'keydown',
                windowId : 1,
                data     : {
                    key   : '/',
                    target: {id: '', tagName: 'body'},
                    path  : [{id: '', cls: [], tagName: 'body'}]
                }
            });
            expect(calls).toEqual(['owner:/']);
            expect(bystanderItemReads).toBe(0);
            expect(bystanderCmpLookups).toBe(0);
        } finally {
            Neo.getComponent = originalGetCmp;
            Object.defineProperty(DomEvent.items, 'doc-body-bystander', {
                configurable: true,
                enumerable  : true,
                value       : bystanderMap,
                writable    : true
            });
            bystander.destroy();
            owner.destroy()
        }
    });

    test('verifyMouseEnterLeave suppresses internal child-to-delegate and delegate-to-child crossings (#21605)', () => {
        const owner = Neo.create(Component, {
            appName,
            id  : 'mouse-boundary-owner',
            vdom: {
                id: 'mouse-boundary-owner',
                cn: [{
                    id  : 'multi-window-pill',
                    cls : ['neo-multi-window'],
                    data: {neoTooltip: 'Multi-window live example'},
                    cn  : [
                        {id: 'multi-window-icon',  tag: 'i'},
                        {id: 'multi-window-label', tag: 'span', text: 'Multi-window'}
                    ]
                }, {
                    id: 'outside-sibling'
                }]
            }
        });

        const {verifyMouseEnterLeave} = DomEvent.constructor;

        try {
            // Entering from outside -> allowed
            expect(verifyMouseEnterLeave(owner, {fromElementId: 'outside-sibling'}, 'multi-window-pill', 'mouseenter')).toBe(true);
            expect(verifyMouseEnterLeave(owner, {fromElementId: null}, 'multi-window-pill', 'mouseenter')).toBe(true);

            // Moving from delegated root into its own child -> internal, suppressed
            expect(verifyMouseEnterLeave(owner, {fromElementId: 'multi-window-pill'}, 'multi-window-pill', 'mouseenter')).toBe(false);
            // Moving between children inside delegated root -> internal, suppressed
            expect(verifyMouseEnterLeave(owner, {fromElementId: 'multi-window-icon'}, 'multi-window-pill', 'mouseenter')).toBe(false);

            // Moving from child back onto delegated root's own padding -> internal, suppressed
            expect(verifyMouseEnterLeave(owner, {toElementId: 'multi-window-pill'}, 'multi-window-pill', 'mouseleave')).toBe(false);
            // Moving between children on mouseleave -> internal, suppressed
            expect(verifyMouseEnterLeave(owner, {toElementId: 'multi-window-label'}, 'multi-window-pill', 'mouseleave')).toBe(false);

            // Leaving to outside sibling or viewport edge (null) -> allowed
            expect(verifyMouseEnterLeave(owner, {toElementId: 'outside-sibling'}, 'multi-window-pill', 'mouseleave')).toBe(true);
            expect(verifyMouseEnterLeave(owner, {toElementId: null}, 'multi-window-pill', 'mouseleave')).toBe(true)
        } finally {
            owner.destroy()
        }
    });
});
