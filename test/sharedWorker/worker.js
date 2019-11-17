onconnect = function(e) {
    console.log('worker onconnect');

    var port = e.ports[0];

    port.onmessage = function(e) {
        console.log('worker onmessage');

        var workerResult = 'Result: ' + (e.data[0] * e.data[1]);
        port.postMessage(workerResult);
    }
}