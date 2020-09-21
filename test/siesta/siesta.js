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
    'tests/ClassSystem.mjs',
    'tests/CollectionBase.mjs',
    'tests/VdomHelper.mjs',
    'tests/VdomCalendar.mjs'
);

project.start();