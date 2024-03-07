StartTest(t => {
    let fieldComponent, inputField, testId;

    async function setup(config = {}) {
        testId = await Neo.worker.App.createNeoInstance(Neo.merge({
            ntype     : 'textfield',
            labelText : 'My label',
            labelWidth: 80,
            width     : 300
        }, config))

        // Wait for input element to be present
        await t.waitForSelector(`#${testId} input.neo-textfield-input`);

        // Grab input element
        inputField = t.query(`#${testId} input.neo-textfield-input`)[0];

        fieldComponent = document.getElementById(testId);

        return testId;
    }

    // Clear the way for each test
    t.beforeEach(async t => {
        if (testId) {
            await Neo.worker.App.destroyNeoInstance(testId);
            fieldComponent = testId = null;
        }
    });

    t.it('Check isTouched on focusLeave', async t => {
        await setup({
            value: 'Hello World!'
        });

        t.is(inputField.value, 'Hello World!');

        t.hasNotCls(fieldComponent, 'neo-is-touched');

        t.click(inputField);

        t.diag('Clicked into the input field');

        const blurEl = document.createElement('input');
        document.body.appendChild(blurEl);

        await t.waitFor(50);

        await t.click(blurEl);

        t.diag('Clicked into the blur element');

        await t.waitForSelector('.neo-is-touched');

        t.hasCls(fieldComponent, 'neo-is-touched');

        blurEl.remove();
    });

    t.it('Check isTouched on focusEnter', async t => {
        await setup({
            isTouchedEvent: 'focusEnter',
            value         : 'Hello World!'
        });

        t.is(inputField.value, 'Hello World!');

        t.hasNotCls(fieldComponent, 'neo-is-touched');

        await t.click(inputField);

        t.diag('Clicked into the input field');

        t.hasCls(fieldComponent, 'neo-is-touched');
    });

    t.it('Check isTouched set initially', async t => {
        await setup({
            isTouched: true,
            value    : 'Hello World!'
        });

        t.is(inputField.value, 'Hello World!');

        t.hasCls(fieldComponent, 'neo-is-touched');
    });
});
