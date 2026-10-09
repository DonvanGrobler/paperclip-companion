/* global require, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports */
// Test-only entry point: observe the real tray callback before the bundled app loads.
// This file is never included in dist or exposed through renderer IPC.
const { app, Menu } = require('electron');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
app.setAppPath(root);
const build = Menu.buildFromTemplate;
Menu.buildFromTemplate = function (template) {
  const quit = template.find((item) => item.label === 'Quit');
  if (quit) globalThis.__paperclipTrayQuit = quit.click;
  const menu = build.call(this, template);
  if (quit) {
    globalThis.__paperclipTrayMenu = menu;
    globalThis.__paperclipTrayTemplate = template;
  }
  return menu;
};
require(path.join(root, 'dist/main/index.cjs'));
