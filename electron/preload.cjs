const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  chooseOutputDir: () => ipcRenderer.invoke('output:choose'),
  writeFile: (relPath, data) => ipcRenderer.invoke('output:write', relPath, data),
  hasFfmpeg: true,
  getPathForFile: (file) => webUtils.getPathForFile(file),
  videoRun: (id, inputPath, relOut, options, watermark) => ipcRenderer.invoke('video:run', { id, inputPath, relOut, options, watermark }),
  videoCancel: (id) => ipcRenderer.invoke('video:cancel', id),
  onVideoProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('video:progress', handler);
    return () => ipcRenderer.removeListener('video:progress', handler);
  },
  openOutput: () => ipcRenderer.invoke('output:open'),
});
