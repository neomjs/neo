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
            "//code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css",
            //"//fonts.googleapis.com/css?family=Titillium+Web:700|Source+Serif+Pro:400,700|Merriweather+Sans:400,700|Source+Sans+Pro:400,300,600,700,300italic,400italic,600italic,700italic",
            "//demo.productionready.io/main.css",
            {
                text: [
                    "Neo = self.Neo || {};",
                    "Neo.config = Neo.config || {};",
                    "Object.assign(Neo.config, {",
                        "appPath         : 'apps/realworld/app.mjs',",
                        "basePath        : '../../../',",
                        "environment     : 'development',",
                        "isExperimental  : true,",
                        "isInsideSiesta  : true,",
                        "mainThreadAddons: ['LocalStorage', 'Markdown'],",
                        "themes          : [],",
                        "useFontAwesome  : false,",
                        "workerBasePath  : '../../../src/worker/'",
                    "});"
                ].join("")
            }
        ]
    }
);

project.start();