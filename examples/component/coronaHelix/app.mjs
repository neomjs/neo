import MainContainer  from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/coronaHelix/',
    mainView: MainContainer,
    name    : 'Neo.examples.component.coronaHelix'
});

export {onStart as onStart};