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
    })
});
