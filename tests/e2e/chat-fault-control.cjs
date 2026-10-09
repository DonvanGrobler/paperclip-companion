/* global module */
// Test-only observation/fault layer around the real production handlers.
// The real handler runs first, including all sender checks and provider work.
// Rejected/null results pass through untouched. No production entry imports this.
module.exports = function installChatFaultControl(ipcMain) {
  const state = { code: null, chunks: 0, starts: 0, injected: 0 };
  const handle = ipcMain.handle;
  ipcMain.handle = function (channel, listener) {
    if (channel === 'companion:chat-start') {
      return handle.call(this, channel, async (...args) => {
        const result = await listener(...args);
        if (result === true) state.starts++;
        return result;
      });
    }
    if (channel === 'companion:chat-next') {
      return handle.call(this, channel, async (...args) => {
        const result = await listener(...args);
        if (result?.type === 'chunk' && state.code !== null) {
          // Keep the first real chunk; replace the second with one controlled fault.
          if (state.chunks++ > 0) {
            const code = state.code;
            state.code = null;
            state.injected++;
            return { type: 'error', code };
          }
        }
        return result;
      });
    }
    return handle.call(this, channel, listener);
  };
  return state;
};
