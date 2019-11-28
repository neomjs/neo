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
            '../../../node_modules/highlightjs-line-numbers.js/dist/highlightjs-line-numbers.min.js',
            {
                text: [
                    "Neo = self.Neo || {};",
                    "Neo.config = Neo.config || {};",
                    "Object.assign(Neo.config, {",
                        "appPath       : 'docs/app.mjs',",
                        "basePath      : '../../../',",
                        "environment   : 'development',",
                        "isExperimental: true,",
                        "isInsideSiesta: true,",
                        "workerBasePath: '../../../src/worker/'",
                    "});"
                ].join("")
            }
        ]
    }
);

project.start();