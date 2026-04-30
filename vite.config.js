const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '^/api/.*': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        timeout: 0,          // SSE için timeout yok — backtest saatler sürebilir
        proxyTimeout: 0,     // upstream timeout da kaldır
        // SSE buffer'lamayı devre dışı bırak
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const ct = proxyRes.headers['content-type'] || '';
            if (ct.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
          proxy.on('error', (err, req, res) => {
            console.warn('[Vite Proxy Error]', err.message);
          });
        },
      }
    }
  }
});
