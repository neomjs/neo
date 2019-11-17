import MainComponent from './MainComponent.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/todoList/version1/',
        mainView: MainComponent,
        name    : 'TodoListApp1'
    });
};