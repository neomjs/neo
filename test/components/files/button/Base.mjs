StartTest(t => {
    t.it('Checking if neo.mjs got started', async t => {
        if (!globalThis.Neo?.Main) {
            console.log('Starting the neo.mjs workers setup');

            await import('../../../../src/MicroLoader.mjs');
        }

        setTimeout(() => {
            Neo.worker.App.createNeoInstance({
                ntype  : 'button',
                iconCls: 'fa fa-home',
                text   : 'Hello Siesta'
            })
        }, 300)
    });
});
