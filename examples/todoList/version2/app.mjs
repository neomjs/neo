import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/todoList/version2/',
    mainView: MainContainer,
    name    : 'Neo.examples.todoList.version2'
});

export {onStart as onStart};