const project = new Siesta.Project.Browser();

project.configure({
    title       : 'Neo test suite',
    isEcmaModule: true,

    preload: [{
        text: [
            "Neo = self.Neo || {};",
            "Neo.config = Neo.config || {};",
            "Object.assign(Neo.config, {",
                "isExperimental: true,",
                "unitTestMode: true",
            "});"
        ].join("")
    }]
});

project.plan(
    'tests/CollectionBase.mjs',
    'tests/VdomHelper.mjs'
);

project.start();