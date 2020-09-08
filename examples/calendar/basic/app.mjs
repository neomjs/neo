import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/calendar/basic/',
    mainView: MainContainer,
    name    : 'CalendarBasic'
});

export {onStart as onStart};