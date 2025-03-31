import Viewport from 'apps/email/view/Viewport.mjs';

export const onStart = () => Neo.app({
    mainView: Viewport,
    name    : 'Email'
});
