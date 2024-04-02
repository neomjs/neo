StartTest(t => {
    t.it('Checking colliding vdom updates', async t => {
        Neo.worker.App.createNeoInstance({
            ntype : 'container',
            height: 250,
            style : {backgroundColor: 'red'},
            width : 300
        });


        await t.waitForSelector('.neo-container');
        t.diag('Container got rendered.')
    });
});
