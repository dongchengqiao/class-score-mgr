// ============================================================
// 桌面版 preload：向页面暴露最小化的桌面能力
//   仅在「模式选择页」和主页面使用，不接管任何业务逻辑
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Desktop', {
  /** 是否运行在桌面版 App 内 */
  isAvailable: true,

  /** 读取当前配置 / 版本 / 平台 / 数据目录 */
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),

  /** 启动离线模式（内置服务 + 本机数据） */
  startOffline: () => ipcRenderer.invoke('desktop:start-offline'),

  /** 连接已有服务器 */
  connectRemote: (serverUrl) => ipcRenderer.invoke('desktop:connect-remote', serverUrl),

  /** 重新打开模式选择页 */
  switchMode: () => ipcRenderer.invoke('desktop:switch-mode'),

  /** 检查更新（打包版有效） */
  checkUpdate: () => ipcRenderer.invoke('desktop:check-update'),

  /** 安装已下载的更新 */
  installUpdate: () => ipcRenderer.invoke('desktop:install-update')
});
