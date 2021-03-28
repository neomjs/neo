import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/helix/',
    mainView: MainContainer,
    name    : 'Neo.examples.component.helix'
});

export {onStart as onStart};