const project = new Siesta.Project.Browser();

project.configure({
    title       : 'Neo Component Tests',
    isEcmaModule: true
});

project.plan(
    'files/Button.mjs'
);

project.start();
