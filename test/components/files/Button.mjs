StartTest(t => {
    t.it('Checking if neo.mjs got started', async t => {
        if (!globalThis.Neo?.Main) {
            console.log('neo.mjs not started yet');

            await import('../../../src/MicroLoader.mjs');

            setTimeout(() => {
                Neo.worker.App.createNeoInstance({
                    ntype     : 'button',
                    autoMount : true,
                    autoRender: true,
                    iconCls   : 'fa fa-home',
                    text      : 'Hello Siesta'
                })
            }, 200)
        }
    });
});
