import Main from '../../../../src/Main.mjs';
console.log(Main);
StartTest(t => {
    t.it("Sanity", t => {
        t.ok(Main, 'Main is imported as a JS module');
    });
});