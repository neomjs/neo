import { Project } from "@bryntum/siesta/nodejs.js"

const project = Project.new({
    title       : 'Neo test suite',
    isEcmaModule: true,

    preload: [{
        code: [
            "let Neo = globalThis.Neo || {};",
            "Neo.config = Neo.config || {};",
            "Object.assign(Neo.config, {",
                "environment : 'development',",
                "unitTestMode: true",
            "});"
        ].join("")
    }]
});

project.planGlob('tests/**/*.t.mjs');

project.start();
