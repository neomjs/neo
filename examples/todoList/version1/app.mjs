import MainComponent from './MainComponent.mjs';

export const onStart = () => Neo.app({
    mainView: MainComponent,
    name    : 'Neo.examples.todoList.version1'
});
