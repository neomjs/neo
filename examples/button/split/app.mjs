import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'examples/button/split/',
    mainView: MainContainer,
    name    : 'ExampleSplitButton'
});