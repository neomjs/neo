import MainComponent from './MainComponent.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/todoList/version1/',
    mainView: MainComponent,
    name    : 'Neo.examples.todoList.version1'
});

export {onStart as onStart};