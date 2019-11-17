import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/todoList/version2/',
        mainView: MainContainer,
        name    : 'TodoListApp2'
    });
};