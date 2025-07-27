// 🌐 CONFIGURACIÓN DE API PARA PRODUCCIÓN Y DESARROLLO
const isDevelopment = import.meta.env.DEV
const isProduction = import.meta.env.PROD

// 🎯 URLs DINÁMICAS BASADAS EN EL ENTORNO
export const API_CONFIG = {
  // En desarrollo: localhost
  // En producción: misma URL que el frontend (fullstack)
  BASE_URL: isDevelopment 
    ? 'http://localhost:3001' 
    : window.location.origin,
    
  SOCKET_URL: isDevelopment 
    ? 'http://localhost:3001' 
    : window.location.origin,
    
  // Endpoints de API
  ENDPOINTS: {
    STATS: '/api/stats',
    HEALTH: '/api/health',
    SOCKET_PATH: '/socket.io/'
  }
}

// 🔧 FUNCIÓN HELPER PARA CONSTRUIR URLs
export const buildApiUrl = (endpoint) => {
  return `${API_CONFIG.BASE_URL}${endpoint}`
}

console.log('🌐 API Config:', {
  environment: isDevelopment ? 'development' : 'production',
  baseUrl: API_CONFIG.BASE_URL,
  socketUrl: API_CONFIG.SOCKET_URL
})
