const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  app: "prumo-windows-client",
});
