import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/dateSelector/',
    mainView: MainContainer,
    name    : 'Neo.examples.component.dateSelector'
});

export {onStart as onStart};