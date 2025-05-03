const project = new Siesta.Project.Browser();

project.configure({
    title       : 'Neo test suite',
    isEcmaModule: true,

    preload: [{
        text: [
            "Neo = self.Neo || {};",
            "Neo.config = Neo.config || {};",
            "Object.assign(Neo.config, {",
                "environment : 'development',",
                "unitTestMode: true",
            "});"
        ].join("")
    }]
});

project.plan(
    'tests/ClassConfigsAndFields.mjs',
    'tests/ClassSystem.mjs',
    'tests/CollectionBase.mjs',
    'tests/ManagerInstance.mjs',
    'tests/Rectangle.mjs',
    'tests/VdomHelper.mjs',
    'tests/VdomCalendar.mjs',
    {
        group: 'vdom',
        items: [{
            group: 'layout',
            items: [
                'tests/vdom/layout/Cube.mjs'
            ]
        }, {
            group: 'table',
            items: [
                'tests/vdom/table/Container.mjs'
            ]
        },
        'tests/vdom/Advanced.mjs']
    }
);

project.start();
