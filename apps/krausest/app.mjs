import MainContainer from './view/MainContainer.mjs';

const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Krausest'
});

export {onStart as onStart};