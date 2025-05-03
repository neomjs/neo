StartTest(t => {
    let button;

    t.beforeEach(async t => {
        button && await Neo.worker.App.destroyNeoInstance(button);
    });

    t.it('Sanity', async t => {
        button = await Neo.worker.App.createNeoInstance({
            ntype  : 'button',
            iconCls: 'fa fa-home',
            text   : 'Hello Siesta'
        });
    });

    t.it('Should show isLoading UI', async t => {
        button = await Neo.worker.App.createNeoInstance({
            ntype     : 'button',
            iconCls   : 'fa fa-home',
            text      : 'Hello Siesta',
            isLoading : 'Loading...'
        });

        // Spinner and text exist
        await t.waitForSelector('button .fa-spinner.fa-spin');
        t.selectorExists('button .neo-loading-message:contains(Loading...)');

        await Neo.worker.App.setConfigs({ id: button, isLoading : true });

        // Just a spinner now, no text
        await t.waitForSelectorNotFound('button .neo-loading-message:contains(Loading...)');
        t.selectorExists('button .fa-spinner');

        await Neo.worker.App.setConfigs({ id: button, isLoading : 'New loading message' });

        await t.waitForSelector('button .neo-loading-message:contains(New loading message)');
        t.selectorExists('button .fa-spinner.fa-spin');

        await Neo.worker.App.setConfigs({ id: button, isLoading : false });

        // Not loading now
        await t.waitForSelectorNotFound('button .fa-spinner');
    });
});
