const project = new Siesta.Project.Browser();

project.configure({
    title       : 'Neo Component Tests',
    isEcmaModule: true
});

project.plan(
    'files/button/Base.mjs',
    'files/component/DateSelector.mjs'
);

project.start();
