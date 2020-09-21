const project = new Siesta.Project.Browser({
    scaleToFit: false
});

project.configure({
    title         : 'Neo test suite',
    isEcmaModule  : true,
    sandbox       : false,
    scaleToFit    : false,
    viewportHeight: 1500,
    viewportWidth : 1500
});

project.plan(
    {
        url    : 'tests/Main.mjs',
        preload: [
            {
                text: [
                    "Neo = self.Neo || {};",
                    "Neo.config = Neo.config || {};",
                    "Object.assign(Neo.config, {",
                        "appPath         : 'docs/app.mjs',",
                        "basePath        : '../../../',",
                        "environment     : 'development',",
                        "isInsideSiesta  : true,",
                        "mainThreadAddons: ['HighlightJS', 'Stylesheet'],",
                        "workerBasePath  : '../../../src/worker/'",
                    "});"
                ].join("")
            }
        ]
    }
);

project.start();