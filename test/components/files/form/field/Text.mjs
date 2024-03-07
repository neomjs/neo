StartTest(t => {
    let testId, inputField;

    async function setup(config = {}) {
        testId = await Neo.worker.App.createNeoInstance(Neo.merge({
            ntype     : 'textfield',
            labelText : 'My label',
            labelWidth: 80,
            width     : 300
        }, config))

        // Wait for input element to be present
        await t.waitForSelector(`#${testId} input.neo-textfield-input:not(.neo-typeahead-input)`);

        // Grab input element
        inputField = t.query(`#${testId} input.neo-textfield-input:not(.neo-typeahead-input)`)[0]

        return testId;
    }

    // Clear the way for each test
    t.beforeEach(async t => {
        if (testId) {
            await Neo.worker.App.destroyNeoInstance(testId);
            testId = null;
        }
    });

    t.it('Add & remove value', async t => {
        console.log('starting: Add & remove value');
    });
});
