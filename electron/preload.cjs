const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  configureModel: (config) => ipcRenderer.invoke('model:configure', config),
  testModel: (config) => ipcRenderer.invoke('model:test', config),
  requestModel: (data) => ipcRenderer.invoke('model:request', data),
  requestRobot: (data) => ipcRenderer.invoke('robot:request', data),
  reportResult: (data) => ipcRenderer.invoke('robot:result', data),
  resetBridge: (actors) => ipcRenderer.invoke('robot:reset', actors),
  sessionMode: () => ipcRenderer.invoke('robot:session-mode'),
  cancelModel: (id) => ipcRenderer.invoke('model:cancel', id),
  getVoices: () => ipcRenderer.invoke('speech:voices'),
  getVoiceStatus: () => ipcRenderer.invoke('speech:status'),
  installVoices: () => ipcRenderer.invoke('speech:install'),
  synthesize: (data) => ipcRenderer.invoke('speech:synthesize', data),
  stopSpeech: () => ipcRenderer.invoke('speech:stop'),
  exportRecord: (record) => ipcRenderer.invoke('file:export', record),
});
