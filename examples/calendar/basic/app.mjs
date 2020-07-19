import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/calendar/basic/',
        mainView: MainContainer,
        name    : 'CalendarBasic'
    });
};