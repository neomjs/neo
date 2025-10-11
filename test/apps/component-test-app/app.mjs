import EmptyViewport from './view/EmptyViewport.mjs';

export const onStart = () => Neo.app({
    mainView: EmptyViewport,
    name    : 'ComponentTestApp'
});
