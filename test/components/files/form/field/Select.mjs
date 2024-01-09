StartTest(t => {
    let testId, inputField;

    async function setup(config = {}) {
        testId = await Neo.worker.App.createNeoInstance(Neo.merge({
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
        }, config))

        // Wait for input element to be present
        await t.waitForSelector(`#${testId} input.neo-textfield-input:not(.neo-typeahead-input)`);

        // Grab input element
        inputField = t.query(`#${testId} input.neo-textfield-input:not(.neo-typeahead-input)`)[0]

        return testId;
    }

    // Clear the eway for each test
    t.beforeEach(async t => {
        if (testId) {
            await Neo.worker.App.destroyNeoInstance(testId);
            testId = null;
        }
    });

    t.it('Editable', async t => {
        await setup({
            editable : false
        });
        const blurEl = document.createElement('input');
        document.body.appendChild(blurEl);

        await t.waitFor(() => inputField.getAttribute('readonly'));

        let blurCount = 0;
        inputField.addEventListener('blur', () => blurCount++);

        t.hasAttributeValue(inputField, 'role', 'combobox');
        t.hasAttributeValue(inputField, 'aria-haspopup', 'listbox');
        t.hasAttributeValue(inputField, 'aria-expanded', 'false');

        await t.click(inputField);

        await t.waitForSelector('.neo-picker-container');

        t.hasAttributeValue(inputField, 'aria-expanded', 'true');

        // Roles correct
        t.hasAttributeValue('.neo-picker-container .neo-list', 'role', 'listbox');
        t.selectorCountIs('.neo-picker-container .neo-list .neo-list-item[role="option"]', 59);

        // Nothing selected
        t.hasAttributeValue(inputField, 'aria-activedescendant', '');

        // Should activate the first list item. editable : false means we can still be focused
        // and select values, just that the filter input is read-only.
        await t.type(null, '[DOWN]');

        await t.waitForSelector('input.neo-textfield-input:not(:disabled)[aria-activedescendant="neo-list-1__AL"]');

        t.hasAttributeValue(inputField, 'aria-activedescendant', 'neo-list-1__AL');

        // Select that first item.
        await t.type(null, '[ENTER]');

        await t.waitForSelectorNotFound('.neo-picker-container:visible');

        t.is(inputField.value, 'Alabama');

        // Focus nebver leaves the input field
        t.is(blurCount, 0);

        await t.type(null, '[TAB]');

        // Value still correct after blur
        t.is(inputField.value, 'Alabama');
        blurEl.remove();

        // Now focus has left
        t.is(blurCount, 1);
    });

    t.iit('Keyboard navigation', async t => {
        await setup();
        const blurEl = document.createElement('input');
        document.body.appendChild(blurEl);

        await t.click(inputField);
        await t.type(null, '[DOWN]');

        // Picker Must show with Alabama activated
        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:contains("Alabama")');

        await t.type(null, '[END]');

        // Picker should go to end
        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:contains("Wyoming")');

        await t.type(null, '[UP]');

        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:contains("Wisconsin")');

        await t.type(null, '[DOWN]');

        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:contains("Wyoming")');

        await t.type(null, '[ENTER]');

        await t.waitForSelectorNotFound('.neo-picker-container:visible');

        t.is(inputField.value, 'Wyoming');

        await t.type(null, '[DOWN]');

        // Picker Must show with Wyoming activated
        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:contains("Wyoming")');

        await t.type(null, '[UP]');

        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:contains("Wisconsin")');

        await t.type(null, '[ENTER]');

        await t.waitForSelectorNotFound('.neo-picker-container:visible');

        t.is(inputField.value, 'Wisconsin');

        await t.type(null, '[DOWN]');

        // Picker Must show with Wisconsin activated
        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:contains("Wisconsin")');

        // We're single select, so only one list item must be selected
        t.selectorCountIs('[aria-selected="true"]', 1);

        await t.type(null, '[TAB]');

        // Value still correct after blur
        t.is(inputField.value, 'Wisconsin');
        blurEl.remove();
    });

    t.it('Type to filter', async t => {
        await setup();
        const blurEl = document.createElement('input');
        document.body.appendChild(blurEl);

        await t.click(inputField);

        await t.type(null, 'Mar');

        // Picker Must show with Marshall Islands activated
        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:contains("Marshall Islands")');

        // Matches three states
        t.selectorCountIs('.neo-picker-container .neo-list-item', 3);

        // Only one is selected
        t.selectorCountIs('.neo-list-item.neo-navigator-active-item', 1);

        await t.type(null, '[DOWN]');

        // Picker Must show with Maryland activated
        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:contains("Maryland")');

        // Matches three states
        t.selectorCountIs('.neo-picker-container .neo-list-item', 3);

        // Only one is selected
        t.selectorCountIs('.neo-list-item.neo-navigator-active-item', 1);

        // Blur without selecting a value
        await t.type(null, '[TAB]');

        await t.waitFor(100)

        // Inputs must have been cleared. Both typeahead and filter.
        t.isDeeply(t.query(`#${testId} input`).map(i => i.value), ['', '']);

        blurEl.remove();
    });
});
