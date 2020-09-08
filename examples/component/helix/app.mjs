import HelixMainContainer  from './HelixMainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/helix/',
    mainView: HelixMainContainer,
    name    : 'TestApp'
});

export {onStart as onStart};