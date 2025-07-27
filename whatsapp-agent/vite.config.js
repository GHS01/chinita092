import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'WhatsApp Sales Agent',
        short_name: 'WSA',
        description: 'Agente de ventas inteligente con WhatsApp y Gemini AI',
        theme_color: '#25D366',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    port: 3000,
    host: true,
    fs: {
      strict: false
    }
  },
  // 🌐 CONFIGURACIÓN PARA PRODUCCIÓN
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  // Optimizaciones para Windows/OneDrive y Producción
  optimizeDeps: {
    force: true,
    include: ['react', 'react-dom', 'socket.io-client', 'lucide-react']
  },
  cacheDir: process.env.NODE_ENV === 'production' ? '.vite' : 'C:/temp/vite-cache-wsa',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
