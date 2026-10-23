const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  chooseOutputDir: () => ipcRenderer.invoke('output:choose'),
  writeFile: (relPath, data) => ipcRenderer.invoke('output:write', relPath, data),
  openOutput: () => ipcRenderer.invoke('output:open'),
});
