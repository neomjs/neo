StartTest('Neo.mixin.VdomLifecycle meta-only update', function(t) {
    t.it('Drives an update with empty deltas and non-empty meta through the path with useVdomWorker: false and sees Neo.applyDeltas receive the meta', async function(t) {
        const oldValue = Neo.config.useVdomWorker;
        Neo.config.useVdomWorker = false;

        let receivedMeta = null;
        const originalApplyDeltas = Neo.applyDeltas;
        Neo.applyDeltas = (windowId, deltas, meta) => {
            receivedMeta = meta;
            return originalApplyDeltas(windowId, deltas, meta);
        };

        const component = Neo.create({
            id        : 'test-meta-cmp',
            className : 'Test.MetaComponent',
            ntype     : 'component',
            vdom      : {tag: 'div', id: 'test-meta-cmp'},
            getVdomUpdateMeta() {
                return {correction: 100}
            }
        });

        component.vnodeInitialized = true;
        component.mounted = true;
        component.vnode = {id: 'test-meta-cmp', tag: 'div'};

        // no vdom change => empty deltas, but meta present
        component.vdom = {tag: 'div', id: 'test-meta-cmp'};

        await component.update();

        t.isnt(receivedMeta, null, 'applyDeltas received meta');
        t.is(receivedMeta['test-meta-cmp']?.correction, 100, 'meta is keyed by component id');

        Neo.applyDeltas = originalApplyDeltas;
        Neo.config.useVdomWorker = oldValue;
        component.destroy();
    });
});
