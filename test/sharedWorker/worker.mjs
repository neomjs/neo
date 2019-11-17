import MyWorker from './foo.mjs'

console.log(MyWorker);

self.onconnect = e => {
    console.log('worker.mjs onconnect');

    let port = e.ports[0];

    port.onmessage = function(e) {
        let workerResult = 'Result: ' + (e.data[0] * e.data[1]);
        port.postMessage(workerResult);
    }
};

console.log('worker.mjs created');