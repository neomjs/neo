import Overwrites    from './Overwrites.mjs';
import MainContainer from './view/MainContainer.mjs';

export const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Website'
})
