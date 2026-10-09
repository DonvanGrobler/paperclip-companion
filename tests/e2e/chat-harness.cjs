/* global require, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit test entry point, never bundled or activated by an application setting.
const { app, ipcMain } = require('electron');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
app.setAppPath(root);
globalThis.__paperclipChatFault = require('./chat-fault-control.cjs')(ipcMain);
require(path.join(root, 'dist/main/index.cjs'));
