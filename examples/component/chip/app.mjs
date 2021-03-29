import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/chip/',
    mainView: MainContainer,
    name    : 'Neo.examples.component.chip'
});

export {onStart as onStart};