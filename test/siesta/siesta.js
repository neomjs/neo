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
    {
        group: 'neo',
        items: [
            'tests/neo/MixinStaticConfig.mjs'
        ]
    },
    'tests/ClassConfigsAndFields.mjs',
    'tests/ClassSystem.mjs',
    {
        group: 'core',
        items: [
            'tests/core/Effect.mjs'
        ]
    },
    {
        group: 'config',
        items: [
            'tests/config/Basic.mjs',
            'tests/config/Hierarchy.mjs',
            'tests/config/MultiLevelHierarchy.mjs',
            'tests/config/CustomFunctions.mjs',
            'tests/config/AfterSetConfig.mjs',
            'tests/config/MemoryLeak.mjs',
            'tests/config/CircularDependencies.mjs',
            'tests/core/EffectBatching.mjs'
        ]
    },
    {
        group: 'state',
        items: [
            'tests/state/createHierarchicalDataProxy.mjs',
            'tests/state/Provider.mjs',
            'tests/state/ProviderNestedDataConfigs.mjs'
        ]
    },
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
            'tests/vdom/Advanced.mjs',
            'tests/vdom/VdomAsymmetricUpdates.mjs',
            'tests/vdom/VdomRealWorldUpdates.mjs']
    },
    {
        group: 'functional',
        items: [
            'tests/functional/Button.mjs'
        ]
    },
    {
        group: 'classic',
        items: [
            'tests/classic/Button.mjs'
        ]
    }
);

project.start();
