// Trigger the worker's own script policy and report whether the browser enforced it.
try {
    new Function('return 1')();
    self.postMessage('allowed')
} catch (error) {
    self.postMessage(error.name)
}
