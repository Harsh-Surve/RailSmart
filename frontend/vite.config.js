import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        navigateFallback: '/offline.html',
      },
      manifest: {
        name: 'RailSmart',
        short_name: 'RailSmart',
        description: 'Intelligent Railway Ticket Booking & Live Tracking',
        theme_color: '#1d4ed8',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/RS-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/RS-icon.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})
