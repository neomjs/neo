import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/circle/',
    mainView: MainContainer,
    name    : 'Neo.examples.component.circle'
});

export {onStart as onStart};