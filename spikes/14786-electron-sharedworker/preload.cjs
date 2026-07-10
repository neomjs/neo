const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('spike', {
    report: payload => ipcRenderer.send('spike-report', payload)
});
