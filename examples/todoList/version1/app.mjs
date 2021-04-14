import MainComponent from './MainComponent.mjs';

const onStart = () => Neo.app({
    mainView: MainComponent,
    name    : 'Neo.examples.todoList.version1'
});

export {onStart as onStart};