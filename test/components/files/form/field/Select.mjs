StartTest(t => {
    t.it('Sanity', async t => {
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
        });
    });
});
