import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/calendar/basic/',
    mainView: MainContainer,
    name    : 'Neo.examples.calendar.basic'
});

export {onStart as onStart};