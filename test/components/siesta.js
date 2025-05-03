const project = new Siesta.Project.Browser();

project.configure({
    title        : 'Neo Component Tests',
    isEcmaModule : true,
    preload      : [{
        type         : 'js',
        url          : '../../src/MicroLoader.mjs',
        isEcmaModule : true
    }],
    testClass   : Class('My.Test.Class', {
        isa      : Siesta.Test.Browser,
        override : {
            setup(callback, errback) {
                this.SUPER(function() {
                    // We need to call the startup callback only when we know we are
                    // ready to start testing.
                    const
                        { global }   = this,
                        startupTimer = setInterval(() => {
                            if (global.Neo?.worker?.App && global.Neo.worker.Manager && global.Neo.Main) {
                                clearInterval(startupTimer);

                                // TODO: Find what we actually need to wait for
                                setTimeout(callback, 300);
                            }
                        }, 100);
                }, errback);
            },
            async beforeEach() {
                this.SUPER(...arguments);
                this.SUPER(t => t.waitFor(50));
            }
        },

        methods : {
            async waitForSelectorCount(selector, root, count) {
                if (typeof root === 'number') {
                    count = root;
                    root = undefined;
                }
                return this.waitFor(() => this.query(selector, root).length === count);
            },

            async waitForDomMutation(root = this.global.document.body) {
                root = this.normalizeElement(root);

                if (root) {
                    return new Promise(resolve => {
                        const m = new MutationObserver(() => {
                            m.disconnect();
                            resolve();
                        });
                        m.observe(root, {
                            subtree       : true,
                            childList     : true,
                            attributes    : true,
                            characterData : true
                        });
                        setTimeout(() => {
                            m.disconnect();
                        }, this.timeout)
                    });
                }
            }
        }
    })
});

project.plan({
    group: 'button',
    items: [
        'files/button/Base.mjs'
    ]
}, {
    group: 'component',
    items: [
        'files/component/Base.mjs',
        'files/component/DateSelector.mjs'
    ]
}, {
    group: 'form',
    items: [{
        group: 'field',
        items: [
            'files/form/field/ComboBox.mjs',
            'files/form/field/Text.mjs'
        ]
    }]
}, {
    group: 'list',
    items: [
        'files/list/Chip.mjs'
    ]
});

project.start();
