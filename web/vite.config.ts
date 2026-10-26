import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Settings come from web/.env.local (copy .env.example). Nothing is hard-coded.
//
//   VITE_HOST=true   listen on the LAN so a phone on the same Wi-Fi can connect
//   VITE_HTTPS=true  serve HTTPS with an auto-generated self-signed certificate.
//                    REQUIRED for the camera on a phone: browsers only expose
//                    getUserMedia on https:// pages (or http://localhost).
//   BACKEND_URL      where the Go server listens (default http://127.0.0.1:8080)
//
// The phone talks ONLY to this Vite server. Vite forwards /api/* to Go on the
// laptop's loopback, and Go forwards to Python on loopback. Neither Go nor
// Python is ever exposed to the network.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const lan = env.VITE_HOST === 'true';
  const https = env.VITE_HTTPS === 'true';
  return {
    plugins: [react(), ...(https ? [basicSsl()] : [])],
    server: {
      host: lan ? '0.0.0.0' : 'localhost',
      port: Number(env.VITE_PORT) || 5173,
      proxy: {
        '/api': { target: env.BACKEND_URL || 'http://127.0.0.1:8080', changeOrigin: true },
      },
    },
  };
});
