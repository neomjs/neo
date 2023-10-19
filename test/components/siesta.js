const project = new Siesta.Project.Browser();

project.configure({
    title       : 'Neo Component Tests',
    isEcmaModule: true
});

project.plan(
    {
        group: 'button',
        items: [
            'files/button/Base.mjs'
        ]
    },
    {
        group: 'component',
        items: [
            'files/component/DateSelector.mjs'
        ]
    },
    {
        group: 'form',
        items: [
            {
                group: 'field',
                items: [
                    'files/form/field/Select.mjs'
                ]
            }
        ]
    }
);

project.start();
