const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '^/api/.*': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
