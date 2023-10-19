StartTest(t => {
    t.it('Checking if neo.mjs got started', async t => {
        if (!globalThis.Neo?.Main) {
            console.log('Starting the neo.mjs workers setup');

            await import('../../../../../src/MicroLoader.mjs');
        }

        setTimeout(() => {
            Neo.worker.App.createNeoInstance({
                ntype        : 'selectfield',
                labelPosition: 'inline',
                labelText    : 'US States',
                labelWidth   : 80,
                width        : 300,

                store : {
                    autoLoad   : true,
                    keyProperty: 'abbreviation',
                    url        : '../../resources/examples/data/us_states.json',

                    model: {
                        fields: [{
                            name: 'abbreviation',
                            type: 'string'
                        }, {
                            name: 'name',
                            type: 'string'
                        }]
                    }
                }
            })
        }, 300)
    });
});
