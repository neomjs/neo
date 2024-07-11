import { Project } from "@bryntum/siesta/index.js"

const project = Project.new({
    title       : 'Neo test suite',
});

// no "planDir/planGlob" for isomorphic projects
project.plan(
    {
        url       : 'tests',

        items       : [
            {
                url       : 'vdom',

                items       : [
                    {
                        url       : 'layout',

                        items       : [
                            'Cube.t.mjs',
                        ]
                    },
                    {
                        url       : 'table',

                        items       : [
                            'Container.t.mjs',
                        ]
                    },
                    'Advanced.t.mjs',
                ]
            },
            'ClassConfigsAndFields.t.mjs',
        ]
    }
)

project.start();
