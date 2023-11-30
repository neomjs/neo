const project = new Siesta.Project.Browser();

project.configure({
    title        : 'Neo Component Tests',
    isEcmaModule : true,
    preload      : [{
        type         : 'js',
        url          : '../../../../src/MicroLoader.mjs',
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
            }
        }
    })
});

project.plan(
    {
        group: 'button',
        items: [
            'files/button/Base.mjs'
        ]
    },
    {
        group: 'component',
        items: [
            'files/component/DateSelector.mjs'
        ]
    },
    {
        group: 'form',
        items: [
            {
                group: 'field',
                items: [
                    'files/form/field/Select.mjs'
                ]
            }
        ]
    }
);

project.start();
