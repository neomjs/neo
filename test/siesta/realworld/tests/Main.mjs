import Main from '../../../../src/Main.mjs';

StartTest(t => {
    t.chain(
        next => {
            t.ok(Main, 'Main is imported as a JS module');
            next();
        },
        {
            waitForMs: 500
        },
        next => {
            t.click('.nav-link[href="#/login"]', next);
        },
        next => {
            t.is(t.query('h1')[0].innerHTML, 'Sign in');
            next();
        },
        next => {
            t.click('.nav-link[href="#/register"]', next);
        },
        {
            waitForMs: 500
        },
        next => {
            t.is(t.query('h1')[0].innerHTML, 'Sign up');
            t.done();
        }
    );
});