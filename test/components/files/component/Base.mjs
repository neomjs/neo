StartTest(t => {
    t.it('Checking colliding vdom updates', async t => {
        const containerId = await Neo.worker.App.createNeoInstance({
            ntype : 'container',
            height: 250,
            style : {backgroundColor: 'red'},
            width : 300
        });

        t.is(containerId, 'neo-container-1');

        await t.waitForSelector('.neo-container');
        t.diag('Container got rendered.');

        const componentId = await Neo.worker.App.createNeoInstance({
            ntype   : 'component',
            height  : 150,
            parentId: containerId,
            style   : {backgroundColor: 'blue'},
            width   : 150
        });

        t.is(componentId, 'neo-component-1');
        t.diag('Component got rendered.');

        t.diag('Child update before parent update');
        Neo.worker.App.setConfigs({id: componentId, style: {backgroundColor: 'green'}});
        Neo.worker.App.setConfigs({id: containerId, style: {backgroundColor: 'orange'}});

        await t.waitFor(100);

        t.is(document.getElementById(componentId).style.backgroundColor, 'green');
        t.is(document.getElementById(containerId).style.backgroundColor, 'orange');

        t.diag('Parent update before child update');
        Neo.worker.App.setConfigs({id: containerId, style: {backgroundColor: 'pink'}});
        Neo.worker.App.setConfigs({id: componentId, style: {backgroundColor: 'purple'}});

        await t.waitFor(100);

        t.is(document.getElementById(containerId).style.backgroundColor, 'pink');
        t.is(document.getElementById(componentId).style.backgroundColor, 'purple');
    });
});
