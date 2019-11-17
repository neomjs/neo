const Siesta  = require('siesta-lite');
const project = new Siesta.Project.NodeJS();

/**
 * Neo is using "self" which does not seem to work in a node env.
 * Might need to add a node mode and switch to this inside that context.
 *
 * This example does not work yet!
 */

/**
 * package.json:
 * "test": "/usr/local/bin/node ./test/siesta/siesta-node.js"
 */

project.configure({
    title       : 'Neo NodeJS test suite',
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
    './tests/CollectionBase.mjs',
    './tests/VdomHelper.mjs'
);

project.start();