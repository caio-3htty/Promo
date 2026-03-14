const { app, BrowserWindow, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const isDev = !app.isPackaged;
const devUrl = process.env.WEB_DEV_SERVER_URL || "http://127.0.0.1:8080";

function resolveEmbeddedIndexPath() {
  const packagedPath = path.join(process.resourcesPath, "web-dist", "index.html");
  if (fs.existsSync(packagedPath)) {
    return packagedPath;
  }

  return path.join(__dirname, "..", "web-dist", "index.html");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(resolveEmbeddedIndexPath());
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
