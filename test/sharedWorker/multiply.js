let first   = document.querySelector('#number1'),
    second  = document.querySelector('#number2'),
    result1 = document.querySelector('.result1');

if (!!window.SharedWorker) {
    let myWorker = new SharedWorker("worker.js");

    first.onchange = function() {
        myWorker.port.postMessage([first.value, second.value]);
        console.log('Message posted to worker');
    };

    second.onchange = function() {
        myWorker.port.postMessage([first.value, second.value]);
        console.log('Message posted to worker');
    };

    myWorker.port.onmessage = function(e) {
        result1.textContent = e.data;
        console.log('Message received from worker');
        console.log(e);
    };

    const foo = new SharedWorker("worker.mjs", {type: 'module'});

    console.log(foo);

    foo.port.onmessage = function(e) {
        console.log('Message received from foo');
        console.log(e);
    };

    foo.port.postMessage([5, 7]);
    console.log('Message posted to foo');

    const bar = new Worker("worker.mjs", {type: 'module'});

    console.log(bar);

    bar.onmessage = function(e) {
        console.log('Message received from bar');
        console.log(e);
    };

    bar.postMessage([5, 7]);
    console.log('Message posted to bar');
}