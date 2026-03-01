const { app, BrowserWindow, nativeTheme } = require('electron');
const path = require('path');

// Force dark theme
nativeTheme.themeSource = 'dark';

async function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#0f172a',
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (app.isPackaged) {
        // Load the static export folder using dynamic import for ES Module
        const serve = (await import('electron-serve')).default;
        const loadURL = serve({ directory: path.join(__dirname, '../out') });
        await loadURL(mainWindow);
    } else {
        // In development, load from Next.js dev server
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    }
}


app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
