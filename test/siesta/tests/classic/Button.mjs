import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Button             from '../../../../src/button/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

// IMPORTANT: This test file uses real components and expects them to render.
// We need to enable unitTestMode for isolation, but also allow VDOM updates.
Neo.config.unitTestMode = true;
Neo.config.allowVdomUpdatesInTests = true;
// This ensures that the VdomHelper uses the correct renderer for the assertions.
Neo.config.useDomApiRenderer = true;

// Create a mock application context, as the component lifecycle requires it for updates.
const appName = 'ClassicButtonTest';
Neo.apps = Neo.apps || {};
Neo.apps[appName] = {
    name             : appName,
    fire             : Neo.emptyFn,
    isMounted        : () => true,
    vnodeInitialising: false
};

StartTest(t => {
    let button, vnode;
    let testRun = 0;

    t.beforeEach(async t => {
        testRun++;

        button = Neo.create(Button, {
            appName,
            id     : 'my-button-' + testRun,
            iconCls: 'fa fa-home',
            text   : 'Click me'
        });

        ({vnode} = await button.initVnode());
        button.mounted = true; // Manually mount to enable updates in the test env
    });

    t.afterEach(t => {
        button?.destroy();
        button = null;
        vnode  = null;
    });

    t.it('should create initial vnode correctly', async t => {
        t.expect(vnode.nodeName).toBe('button');
        t.expect(vnode.className).toEqual(['neo-button', 'icon-left']);
        t.expect(vnode.childNodes.length).toBe(2); // icon & text. badge & ripple have removeDom:true

        const iconNode = vnode.childNodes[0];
        t.expect(iconNode.className).toEqual(['neo-button-glyph', 'fa', 'fa-home']);

        const textNode = vnode.childNodes[1];
        t.expect(textNode.className).toEqual(['neo-button-text']);
        t.expect(textNode.textContent).toBe('Click me');
    });

    t.it('should update vnode and create delta for a single config change', async t => {
        const textNodeId = vnode.childNodes[1].id;
        const {deltas} = await button.set({text: 'New Text'});

        t.is(deltas.length, 1, 'Should generate exactly one delta');
        const delta = deltas[0];

        t.is(delta.id, textNodeId, 'Delta should target the text node');
        t.is(delta.textContent, 'New Text', 'Delta textContent is correct');
    });

    t.it('should update vnode and create delta for multiple config changes', async t => {
        const iconNodeId = vnode.childNodes[0].id;
        const textNodeId = vnode.childNodes[1].id;

        const {deltas} = await button.set({
            iconCls: 'fa fa-user',
            text   : 'Submit'
        });

        t.is(deltas.length, 2, 'Should generate exactly two deltas');

        const iconDelta = deltas.find(d => d.id === iconNodeId);
        const textDelta = deltas.find(d => d.id === textNodeId);

        t.ok(iconDelta, 'Should have a delta for the icon node');
        t.isDeeply(iconDelta.cls.remove, ['fa-home'], 'Icon delta should remove old class');
        t.isDeeply(iconDelta.cls.add, ['fa-user'], 'Icon delta should add new class');

        t.ok(textDelta, 'Should have a delta for the text node');
        t.is(textDelta.textContent, 'Submit', 'Text delta is correct');
    });

    t.it('should handle pressed state change', async t => {
        t.notOk(vnode.className.includes('pressed'), 'Initial vnode should not have "pressed" class');

        let updateData = await button.set({pressed: true});

        t.is(updateData.deltas.length, 1, 'Should generate one delta for pressed: true');
        let delta = updateData.deltas[0];
        t.is(delta.id, button.id, 'Delta should target the button component root');
        t.isDeeply(delta.cls.add, ['pressed'], 'Delta should add "pressed" class');
        t.ok(updateData.vnode.className.includes('pressed'), 'Vnode should have "pressed" class');

        updateData = await button.set({pressed: false});

        t.is(updateData.deltas.length, 1, 'Should generate one delta for pressed: false');
        delta = updateData.deltas[0];
        t.is(delta.id, button.id, 'Delta should target the button component root');
        t.isDeeply(delta.cls.remove, ['pressed'], 'Delta should remove "pressed" class');
        t.notOk(updateData.vnode.className.includes('pressed'), 'Vnode should not have "pressed" class');
    });
});
