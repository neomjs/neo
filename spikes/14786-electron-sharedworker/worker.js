// SharedWorker under test: counts distinct port connections.
// If two pages report counts 1 and 2, they reached the SAME worker instance.
// If both report 1, each page got its own instance (no sharing).
let connections = 0;

onconnect = e => {
    connections++;
    const port = e.ports[0];
    port.postMessage({connections});
};
