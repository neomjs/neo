StartTest(t => {
    t.it('Checking if neo.mjs got started', async t => {
        if (!globalThis.Neo?.Main) {
            console.log('Starting the neo.mjs workers setup');

            await import('../../../../src/MicroLoader.mjs');
        }

        setTimeout(() => {
            Neo.worker.App.createNeoInstance({
                ntype : 'dateselector',
                height: 250,
                value : '2023-10-15',
                width : 300
            })
        }, 300)
    });
});
