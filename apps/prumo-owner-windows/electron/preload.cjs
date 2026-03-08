const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  app: "prumo-owner-windows",
});
