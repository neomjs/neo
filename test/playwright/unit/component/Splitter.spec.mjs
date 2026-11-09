import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ComponentSplitterLiveResizeTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Splitter       from '../../../../src/component/Splitter.mjs';
import Container      from '../../../../src/container/Base.mjs';
import '../../../../src/manager/Instance.mjs';

class WrappedComponent extends Component {
    static config = {
        className: 'Test.component.Splitter.WrappedComponent',
        _vdom    : {cn: [{cls: ['wrapped-root']}]}
    }

    getVdomRoot() {
        return this.vdom.cn[0]
    }
}

WrappedComponent = Neo.setupClass(WrappedComponent);

test.describe('Neo.component.Splitter live-resize ownership', () => {
    let addon, originalRegister, originalSetConfigs, originalUnregister,
        parent, registered, testRun = 0, unregistered;

    test.beforeEach(() => {
        addon              = Neo.main.addon.DragDrop;
        originalRegister   = addon.registerZone;
        originalSetConfigs = addon.setConfigs;
        originalUnregister = addon.unregisterZone;
        registered         = [];
        unregistered       = [];

        addon.registerZone   = data => registered.push(data);
        addon.setConfigs     = async () => ({boundaryContainerRect: null});
        addon.unregisterZone = data => unregistered.push(data)
    });

    test.afterEach(() => {
        parent && !parent.isDestroyed && parent.destroy();
        parent = null;

        addon.registerZone   = originalRegister;
        addon.setConfigs     = originalSetConfigs;
        addon.unregisterZone = originalUnregister
    });

    const createTree = ({direction='vertical', liveResize=true, resizeTarget='next', wrappedTarget=false}={}) => {
        const suffix = ++testRun;

        parent = Neo.create(Container, {
            appName: 'ComponentSplitterLiveResizeTest',
            id     : `component-splitter-parent-${suffix}`,
            items  : [{
                module      : Component,
                id          : `component-splitter-previous-${suffix}`,
                wrapperStyle: {flex: '1 1 0%'}
            }, {
                module: Splitter,
                direction,
                id    : `component-splitter-${suffix}`,
                liveResize,
                resizeTarget
            }, {
                module      : wrappedTarget ? WrappedComponent : Component,
                id          : `component-splitter-next-${suffix}`,
                wrapperStyle: {flex: '1 1 0%'}
            }]
        });

        const [previous, splitter, next] = parent.items;

        // Splitter integration is under test; DragZone's proxy/no-proxy construction has its own
        // focused spec. Keep this harness on the gesture-controller boundary.
        splitter.dragZone.dragStart = async () => {};
        splitter.dragZone.dragEnd   = () => {};
        splitter.refreshDragZone();

        return {next, parent, previous, splitter}
    };

    const start = splitter => splitter.onDragStart({
        clientX   : 300,
        clientY   : 200,
        path      : [{id: splitter.id, rect: {height: 400, left: 295, top: 0, width: 10}}],
        targetPath: []
    });

    const end = (splitter, resizeSize) => {
        const {axis, targetId: resizeTargetId} = splitter.getResizeConfig();

        splitter.onDragEnd({clientX: 380, clientY: 200, resizeAxis: axis, resizeSize, resizeTargetId})
    };

    test('constructs and main-thread-registers its DragZone before the first gesture', () => {
        const {splitter} = createTree();

        const registration = [...registered].reverse().find(item => item.resizeConfig);

        expect(splitter.dragZone, 'the zone must exist before drag:start').toBeTruthy();
        expect(splitter.dragZone.owner).toBe(splitter);
        expect(splitter.dragZone.useProxy, 'live resize uses no cloned proxy').toBe(false);
        expect(registration, 'the complete sibling set refreshes the eager registration').toMatchObject({
            dragElementRootId: splitter.id,
            dragZoneId       : splitter.dragZone.id,
            resizeConfig     : {
                axis      : 'width',
                preview   : true,
                resizeNext: true,
                targetId  : splitter.parent.items[2].id
            }
        })
    });

    test('live mode keeps transient frames out of worker state and commits one terminal size', async () => {
        const {next, parent: owner, previous, splitter} = createTree();

        await start(splitter);

        expect(owner.disabled, 'live mode keeps the real subtree fully painted').toBe(false);
        expect(next.wrapperStyle).toEqual({flex: '1 1 0%'});
        expect(previous.wrapperStyle).toEqual({flex: '1 1 0%'});

        end(splitter, 215);

        expect(next.wrapperStyle).toMatchObject({flex: 'none', width: '215px'})
    });

    test('registers and commits the outer layout wrapper when the target has a distinct VDOM root', async () => {
        const {next, splitter} = createTree({wrappedTarget: true});

        expect(next.vdom.id).not.toBe(next.id);
        expect(next.getVdomRoot().id).toBe(next.id);
        expect(splitter.getResizeConfig().targetId).toBe(next.vdom.id);

        await start(splitter);
        end(splitter, 215);

        expect(next.wrapperStyle).toMatchObject({flex: 'none', width: '215px'});
        expect(next.vdom.style.width).toBe('215px');
        expect(next.getVdomRoot().style?.width).toBeUndefined()
    });

    test('main-thread descriptors cover previous targets and horizontal splitters', () => {
        let tree = createTree({resizeTarget: 'previous'});

        expect(tree.splitter.getResizeConfig()).toMatchObject({
            axis      : 'width',
            resizeNext: false,
            targetId  : tree.previous.id
        });

        parent.destroy();
        parent = null;

        tree = createTree({direction: 'horizontal'});

        expect(tree.splitter.getResizeConfig()).toMatchObject({
            axis      : 'height',
            resizeNext: true,
            targetId  : tree.next.id
        })
    });

    test('terminal gesture identity wins over reactive target changes during the drag', async () => {
        const {next, previous, splitter} = createTree(),
              captured                   = splitter.getResizeConfig();

        await start(splitter);
        splitter.resizeTarget = 'previous';
        splitter.onDragEnd({
            clientX       : 380,
            clientY       : 200,
            resizeAxis    : captured.axis,
            resizeSize    : 215,
            resizeTargetId: captured.targetId
        });

        expect(next.wrapperStyle).toMatchObject({flex: 'none', width: '215px'});
        expect(previous.wrapperStyle).toEqual({flex: '1 1 0%'})
    });

    test('Escape leaves durable sibling state untouched and clears worker presentation', async () => {
        const {next, parent: owner, splitter} = createTree();

        next.wrapperStyle = {flex: '1 1 0%', minWidth: '120px'};

        await start(splitter);
        splitter.dragZone.fire('dragCancel', {cancelled: true});

        expect(next.wrapperStyle).toEqual({flex: '1 1 0%', minWidth: '120px'});
        expect(owner.disabled).toBe(false)
    });

    test('a terminal event invalidates a DragZone start which resolves after the gesture', async () => {
        const {parent: owner, splitter} = createTree({liveResize: false});

        let releaseStart;

        splitter.dragZone.dragStart = () => new Promise(resolve => { releaseStart = resolve });
        const startPromise = start(splitter);

        await expect.poll(() => typeof releaseStart).toBe('function');

        end(splitter, 295);
        releaseStart();

        await startPromise;

        expect(owner.disabled).toBe(false);
        expect(splitter.style.opacity).toBe(1)
    });

    test('deferred mode retains its proxy presentation and commits only on end', async () => {
        const {next, parent: owner, splitter} = createTree({liveResize: false});

        await start(splitter);

        expect(splitter.dragZone.useProxy).toBe(true);
        expect(owner.disabled).toBe(true);
        expect(splitter.style.opacity).toBe(0.5);

        expect(next.wrapperStyle).toEqual({flex: '1 1 0%'});

        end(splitter, 215);

        expect(next.wrapperStyle).toMatchObject({flex: 'none', width: '215px'});
        expect(owner.disabled).toBe(false);
        expect(splitter.style.opacity).toBe(1)
    });

    test('destroying the Splitter unregisters and destroys its owned DragZone', () => {
        const {splitter} = createTree(),
              zone       = splitter.dragZone;

        splitter.destroy();

        expect(zone.isDestroyed).toBe(true);
        expect(unregistered).toHaveLength(1);
        expect(unregistered[0]).toMatchObject({dragZoneId: zone.id})
    });

    test('forwards sibling minWidth / minHeight and opposite sibling bounds into resizeConfig', () => {
        let tree = createTree({direction: 'vertical', resizeTarget: 'next'});

        tree.previous.minWidth = 110;
        tree.next.minWidth     = 140;

        expect(tree.splitter.getResizeConfig()).toMatchObject({
            axis           : 'width',
            minSize        : 140,
            oppositeId     : tree.previous.id,
            oppositeMinSize: 110,
            resizeNext     : true,
            targetId       : tree.next.id
        });

        tree.splitter.resizeTarget = 'previous';

        expect(tree.splitter.getResizeConfig()).toMatchObject({
            axis           : 'width',
            minSize        : 110,
            oppositeId     : tree.next.id,
            oppositeMinSize: 140,
            resizeNext     : false,
            targetId       : tree.previous.id
        });

        tree.previous.minWidth = '25%';

        expect(tree.splitter.getResizeConfig().minSize).toBeUndefined();

        parent.destroy();
        parent = null;

        tree = createTree({direction: 'horizontal', resizeTarget: 'next'});

        tree.previous.wrapperStyle = {flex: '1 1 0%', minHeight: '75px'};
        tree.next.style            = {minHeight: '90px'};

        expect(tree.splitter.getResizeConfig()).toMatchObject({
            axis           : 'height',
            minSize        : 90,
            oppositeId     : tree.previous.id,
            oppositeMinSize: 75,
            resizeNext     : true,
            targetId       : tree.next.id
        })
    });

    test('clamps terminal applyResize against the target sibling configured minWidth or minHeight', async () => {
        const {next, splitter} = createTree();

        next.minWidth = 150;

        await start(splitter);
        end(splitter, 80);

        expect(next.wrapperStyle).toMatchObject({flex: 'none', width: '150px'})
    });

    test('aggregates effective minSize across perpendicular (Math.max), parallel (sum + splitters), and card containers while ignoring 0px flex-shrink resets', async () => {
        const suffix = ++testRun;

        parent = Neo.create(Container, {
            appName: 'ComponentSplitterLiveResizeTest',
            id     : `component-splitter-nested-parent-${suffix}`,
            layout : {ntype: 'hbox'},
            items  : [{
                module: Container,
                id    : `component-splitter-vbox-column-${suffix}`,
                layout: {ntype: 'vbox'},
                style : {minHeight: 0, minWidth: 0},
                items : [{
                    module  : Component,
                    id      : `component-splitter-vbox-top-${suffix}`,
                    minWidth: 130
                }, {
                    module   : Splitter,
                    direction: 'horizontal',
                    id       : `component-splitter-vbox-inner-splitter-${suffix}`,
                    size     : 6
                }, {
                    module      : Component,
                    id          : `component-splitter-vbox-bottom-${suffix}`,
                    wrapperStyle: {minWidth: '210px'}
                }]
            }, {
                module      : Splitter,
                direction   : 'vertical',
                id          : `component-splitter-main-${suffix}`,
                liveResize  : true,
                resizeTarget: 'previous'
            }, {
                module: Container,
                id    : `component-splitter-hbox-row-${suffix}`,
                layout: {ntype: 'hbox'},
                style : {minHeight: '0px', minWidth: '0px'},
                items : [{
                    module  : Component,
                    id      : `component-splitter-hbox-left-${suffix}`,
                    minWidth: 120
                }, {
                    module   : Splitter,
                    direction: 'vertical',
                    id       : `component-splitter-hbox-inner-splitter-${suffix}`,
                    size     : 8
                }, {
                    module: Container,
                    id    : `component-splitter-card-host-${suffix}`,
                    layout: {activeIndex: 1, ntype: 'card'},
                    items : [{
                        module  : Component,
                        id      : `component-splitter-card-0-${suffix}`,
                        minWidth: 90
                    }, {
                        module  : Component,
                        id      : `component-splitter-card-1-${suffix}`,
                        minWidth: 160
                    }]
                }]
            }]
        });

        const [vboxColumn, splitter, hboxRow] = parent.items;

        splitter.dragZone.dragStart = async () => {};
        splitter.dragZone.dragEnd   = () => {};
        splitter.refreshDragZone();

        expect(splitter.getSiblingMinSize(vboxColumn, 'width'),
            'perpendicular vbox column touching a vertical splitter resolves Math.max(130, 210) and ignores minWidth: 0'
        ).toBe(210);

        expect(splitter.getSiblingMinSize(hboxRow, 'width'),
            'parallel hbox row resolves sum(120, activeCard=160) + internal splitter (8) = 288'
        ).toBe(288);

        expect(splitter.getResizeConfig()).toMatchObject({
            axis           : 'width',
            minSize        : 210,
            oppositeId     : hboxRow.id,
            oppositeMinSize: 288,
            resizeNext     : false,
            targetId       : vboxColumn.id
        });

        await start(splitter);
        end(splitter, 120);

        expect(vboxColumn.wrapperStyle).toMatchObject({flex: 'none', width: '210px'})
    });

    test('preserves oppositeId for non-numeric CSS minima (var(), calc()) so main-thread Resize clamps against computed floor while ignoring 0px resets', async () => {
        const originalDocument  = globalThis.document,
              originalDomAccess = Neo.main.DomAccess,
              originalWindow    = globalThis.window;

        globalThis.document = new EventTarget();
        globalThis.window   = new EventTarget();
        delete Neo.main.DomAccess;

        const {default: DomAccess} = await import('../../../../src/main/DomAccess.mjs'),
              {default: Resize}    = await import('../../../../src/main/draggable/Resize.mjs');

        const createStyle = initial => {
            const values = new Map(Object.entries(initial));

            return {
                getPropertyPriority: () => '',
                getPropertyValue   : key => values.get(key) || '',
                removeProperty     : key => values.delete(key),
                setProperty        : (key, value) => values.set(key, value)
            }
        };

        const originalGetElement       = DomAccess.getElement,
              originalGetLayoutRect    = DomAccess.getLayoutRect,
              originalGetComputedStyle = globalThis.getComputedStyle;

        try {
            const {next, parent: owner, previous, splitter} = createTree({direction: 'vertical', resizeTarget: 'previous'});

            next.style = {minWidth: '0px'};
            expect(splitter.hasSiblingMinSize(next, 'width'), 'zero flex-shrink reset does not register an opposite bound').toBe(false);
            expect(splitter.getResizeConfig().oppositeId).toBeUndefined();

            for (const cssExpr of ['var(--pane-floor)', 'calc(100px + 32px)']) {
                next.style = {minWidth: cssExpr};

                const descriptor = splitter.getResizeConfig();

                expect(splitter.getSiblingMinSize(next, 'width')).toBeNaN();
                expect(splitter.hasSiblingMinSize(next, 'width'), `${cssExpr} must be discovered for main-thread resolution`).toBe(true);
                expect(descriptor.oppositeId).toBe(next.id);
                expect(descriptor.oppositeMinSize).toBeUndefined();

                const parentEl   = {},
                      targetEl   = {style: createStyle({flex: '1 1 0%'})},
                      oppositeEl = {style: createStyle({flex: '1 1 0%'})};

                DomAccess.getElement = id => ({
                    [owner.id]   : parentEl,
                    [previous.id]: targetEl,
                    [next.id]    : oppositeEl
                })[id] || null;

                DomAccess.getLayoutRect = el => el === parentEl
                    ? {height: 400, width: 606}
                    : {height: 400, width: 300};

                globalThis.getComputedStyle = el => ({
                    getPropertyValue: key => el === oppositeEl && key === 'min-width' ? '132px' : 'none'
                });

                const resize = new Resize(),
                      state  = resize.createState({...descriptor, splitterSize: 6}, {clientX: 300});

                resize.state = state;

                expect(state.maxSize, `${cssExpr} computed to 132px clamps target ceiling to 600 - 132 = 468px`).toBe(468);
                expect(resize.apply({clientX: 550, clientY: 0})).toBe(468);
            }
        } finally {
            DomAccess.getElement    = originalGetElement;
            DomAccess.getLayoutRect = originalGetLayoutRect;
            originalDomAccess === undefined
                ? delete Neo.main.DomAccess
                : Neo.main.DomAccess = originalDomAccess;
            originalDocument === undefined
                ? delete globalThis.document
                : globalThis.document = originalDocument;
            originalWindow === undefined
                ? delete globalThis.window
                : globalThis.window = originalWindow;
            originalGetComputedStyle === undefined
                ? delete globalThis.getComputedStyle
                : globalThis.getComputedStyle = originalGetComputedStyle
        }
    })
});
