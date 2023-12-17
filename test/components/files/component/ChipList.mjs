StartTest(t => {
    let testId;

    async function setup(config = {}) {
        testId = await Neo.worker.App.createNeoInstance(Neo.merge({
            ntype        : 'chip-list',
            displayField : 'firstname',
            width        : 300,
            role         : 'listbox',
            itemRole     : 'option',
            store : {
                keyProperty: 'githubId',
                model: {
                    fields: [{
                        name: 'country',
                        type: 'String'
                    }, {
                        name: 'firstname',
                        type: 'String'
                    }, {
                        name: 'githubId',
                        type: 'String'
                    }, {
                        name: 'lastname',
                        type: 'String'
                    }]
                },

                data: [{
                    country  : 'Germany',
                    firstname: 'Tobias',
                    githubId : 'tobiu',
                    lastname : 'Uhlig'
                }, {
                    country  : 'USA',
                    firstname: 'Rich',
                    githubId : 'rwaters',
                    lastname : 'Waters'
                }, {
                    country  : 'Germany',
                    firstname: 'Nils',
                    githubId : 'mrsunshine',
                    lastname : 'Dehl'
                }, {
                    country  : 'USA',
                    firstname: 'Gerard',
                    githubId : 'camtnbikerrwc',
                    lastname : 'Horan'
                }, {
                    country  : 'Slovakia',
                    firstname: 'Jozef',
                    githubId : 'jsakalos',
                    lastname : 'Sakalos'
                }, {
                    country  : 'Germany',
                    firstname: 'Bastian',
                    githubId : 'bhaustein',
                    lastname : 'Haustein'
                }]
            }
        }, config));
        

        return testId;
    }

    // Clear the eway for each test
    t.beforeEach(async t => {
        if (testId) {
            await Neo.worker.App.destroyNeoInstance(testId);
            testId = null;
        }
    });

    t.it('Sanity', async t => {
        await setup({ });

        // Click on the *item*, *not* the focusable chip.
        // We are testing that the Navigator directs focus to the focusable heart of the
        // item - the Chip - which will then recieve focus and cause item activation.
        await t.click('.neo-list-item', null, null, null, ['100%-1', 1]);

        // That should select and activate the clicked item.
        // And focus the chip inside it.
        await t.waitForSelector('.neo-list-item.neo-navigator-active-item.neo-selected:nth-child(1) .neo-chip:focus');

        await t.type(null, '[END]');

        // That should select and activate the last item.
        // And focus the chip inside it.
        await t.waitForSelector('.neo-list-item.neo-navigator-active-item:not(.neo-selected):nth-child(6) .neo-chip:focus');

        // Item 1 is still the only one selected, and it's not focused
        t.selectorExists('.neo-list-item.neo-selected:nth-child(1) .neo-chip:not(:focus)');
        t.selectorCountIs('.neo-list-item.neo-selected', 1);

        await t.type(null, '[ENTER]');

        // Item 6 is now the only one selected
        await t.waitForSelector('.neo-list-item.neo-navigator-active-item.neo-selected:nth-child(6) .neo-chip:focus');
        t.selectorCountIs('.neo-list-item.neo-selected', 1);
    });

});
