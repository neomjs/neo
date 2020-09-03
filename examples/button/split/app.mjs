import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/button/split/',
    mainView: MainContainer,
    name    : 'ExampleSplitButton'
});

export {onStart as onStart};