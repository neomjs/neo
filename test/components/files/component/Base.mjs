StartTest(t => {
    t.it('Checking colliding style updates', async t => {
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

        await Neo.worker.App.destroyNeoInstance(containerId)
    });

    t.it('Checking colliding vdom updates', async t => {
        const toolbarId = await Neo.worker.App.createNeoInstance({
            ntype : 'toolbar',
            height: 200,
            width : 300
        });

        t.is(toolbarId, 'neo-toolbar-1');

        await t.waitForSelector('.neo-toolbar');
        t.diag('Toolbar got rendered.');

        const buttonId = await Neo.worker.App.createNeoInstance({
            ntype   : 'button',
            parentId: toolbarId,
            text    : 'hello'
        });

        t.is(buttonId, 'neo-button-1');

        await t.waitForSelector('.neo-button');
        t.diag('Button got rendered.');

        t.diag('Child update before parent update');
        Neo.worker.App.setConfigs({id: buttonId,  text  : 'world'});
        Neo.worker.App.setConfigs({id: toolbarId, height: 300});

        await t.waitFor(100);

        t.is(document.getElementById(toolbarId).style.height, '300px');
        t.is(document.getElementById(buttonId).firstChild.innerHTML, 'world');

        t.diag('Parent update before child update');
        Neo.worker.App.setConfigs({id: toolbarId, height: 200});
        Neo.worker.App.setConfigs({id: buttonId,  text  : 'hello'});

        await t.waitFor(100);

        t.is(document.getElementById(toolbarId).style.height, '200px');
        t.is(document.getElementById(buttonId).firstChild.innerHTML, 'hello');
    });
});
