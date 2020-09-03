import MainComponent from './MainComponent.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/todoList/version1/',
    mainView: MainComponent,
    name    : 'TodoListApp1'
});

export {onStart as onStart};