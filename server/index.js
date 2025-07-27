import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import WhatsAppService from './services/whatsapp.js'
import { GeminiService } from './services/gemini.js'
import { DatabaseService } from './services/database.js'
import { InventoryService } from './services/inventory.js'
import { OrderService } from './services/orders.js'
import { SalesService } from './services/sales.js'
import { GoogleOAuthService } from './auth/google-oauth.js'
import { GoogleDriveService } from './services/googledrive.js'
import { errorHandler, notFoundHandler, requestLogger } from './middleware/errorHandler.js'

const app = express()
const server = createServer(app)
// 🌐 CONFIGURACIÓN CORS PARA PRODUCCIÓN
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ["http://localhost:3000"]

const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
})

// Middleware
app.use(requestLogger) // 🌐 Logging para producción
app.use(cors({
  origin: corsOrigins,
  credentials: true
}))
app.use(express.json())
app.use(express.static('public'))

// Rutas OAuth para Google Drive
app.get('/auth/google', (req, res) => {
  try {
    if (!googleAuth.isConfigured()) {
      return res.status(500).json({
        error: 'OAuth no configurado. Falta archivo credentials.json'
      })
    }

    const authUrl = googleAuth.getAuthUrl()
    res.redirect(authUrl)
  } catch (error) {
    console.error('❌ Error generando URL de auth:', error.message)
    res.status(500).json({ error: 'Error en configuración OAuth' })
  }
})

app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query

    if (error) {
      console.log('⚠️ Usuario canceló autenticación OAuth')
      return res.send(`
        <script>
          window.opener.postMessage({type: 'auth-cancelled'}, '*');
          window.close();
        </script>
      `)
    }

    if (!code) {
      return res.status(400).send('Código de autorización no recibido')
    }

    // Intercambiar código por tokens
    const tokens = await googleAuth.getTokens(code)

    // Obtener información del usuario
    const userInfo = await googleAuth.getUserInfo(tokens)

    // Configurar Google Drive con las credenciales
    await googleDrive.setCredentials(tokens, userInfo)

    console.log(`✅ Usuario autenticado: ${userInfo.email}`)

    res.send(`
      <script>
        window.opener.postMessage({
          type: 'auth-success',
          userInfo: ${JSON.stringify(userInfo)}
        }, '*');
        window.close();
      </script>
    `)
  } catch (error) {
    console.error('❌ Error en callback OAuth:', error.message)
    res.send(`
      <script>
        window.opener.postMessage({
          type: 'auth-error',
          error: '${error.message}'
        }, '*');
        window.close();
      </script>
    `)
  }
})

// Inicializar servicios
const db = new DatabaseService()
const gemini = new GeminiService(db)
const inventory = new InventoryService(db)
const sales = new SalesService(db)
const orders = new OrderService(db, sales)
const whatsapp = new WhatsAppService(io, gemini, inventory, orders, db, sales)
const googleAuth = new GoogleOAuthService()
const googleDrive = new GoogleDriveService(db)

// Establecer referencia circular para SalesService en OrderService
orders.setSalesService(sales)

// Establecer referencia de GoogleDrive en OrderService
orders.setGoogleDriveService(googleDrive)

// Establecer referencia de GoogleDrive en WhatsAppService
whatsapp.setGoogleDriveService(googleDrive)

// Inicializar base de datos
await db.initialize()

// Inicializar Google Drive
await googleDrive.initialize()

// Verificar integridad del sistema
await verificarIntegridadSistema()

// Socket.IO eventos
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id} [${new Date().toLocaleTimeString()}]`)

  // ENVIAR ESTADO ACTUAL DE WHATSAPP AL NUEVO CLIENTE
  if (whatsapp.isConnected) {
    socket.emit('whatsapp-status', 'connected')
    console.log(`📱 Estado WhatsApp enviado a nuevo cliente: connected`)
  } else if (whatsapp.qr) {
    socket.emit('whatsapp-status', 'connecting')
    socket.emit('qr-code', whatsapp.qr)
    console.log(`📱 Estado WhatsApp enviado a nuevo cliente: connecting (con QR)`)
  } else {
    socket.emit('whatsapp-status', 'disconnected')
    console.log(`📱 Estado WhatsApp enviado a nuevo cliente: disconnected`)
  }

  // Eventos de WhatsApp
  socket.on('connect-whatsapp', async () => {
    try {
      // PREVENIR CONEXIONES DUPLICADAS
      if (whatsapp.isConnected) {
        console.log('⚠️ WhatsApp ya está conectado, ignorando solicitud de conexión duplicada')
        socket.emit('whatsapp-status', 'connected')
        return
      }

      if (whatsapp.isReconnecting) {
        console.log('⚠️ WhatsApp está en proceso de reconexión, ignorando solicitud')
        socket.emit('whatsapp-status', 'reconnecting')
        return
      }

      await whatsapp.connect()
    } catch (error) {
      console.error('Error conectando WhatsApp:', error)
      socket.emit('whatsapp-error', error.message)
    }
  })

  socket.on('disconnect-whatsapp', async () => {
    try {
      await whatsapp.disconnect()
    } catch (error) {
      console.error('Error desconectando WhatsApp:', error)
    }
  })

  // Eventos del Smart Session Manager
  socket.on('clear-whatsapp-session', async () => {
    try {
      console.log('🧹 Solicitud de limpieza de sesión recibida')
      const result = await whatsapp.clearSession()
      socket.emit('session-cleared', result)
    } catch (error) {
      console.error('Error limpiando sesión:', error)
      socket.emit('session-clear-error', { error: error.message })
    }
  })

  socket.on('force-whatsapp-reconnect', async () => {
    try {
      console.log('🔄 Solicitud de reconexión forzada recibida')
      const result = await whatsapp.forceReconnect()
      socket.emit('reconnect-success', result)
    } catch (error) {
      console.error('Error en reconexión forzada:', error)
      socket.emit('reconnect-error', { error: error.message })
    }
  })

  socket.on('get-whatsapp-status', () => {
    const status = whatsapp.getConnectionStatus()
    socket.emit('whatsapp-status', status)
  })

  // Eventos de inventario
  socket.on('get-inventory', async () => {
    try {
      const products = await inventory.getAllProducts()
      socket.emit('inventory-data', products)
    } catch (error) {
      socket.emit('inventory-error', error.message)
    }
  })

  socket.on('add-product', async (productData) => {
    try {
      const product = await inventory.addProduct(productData)
      socket.emit('product-added', product)
      // Notificar a todos los clientes
      io.emit('inventory-updated')

      // 🔄 SINCRONIZACIÓN AUTOMÁTICA CON GOOGLE DRIVE
      if (googleDrive.isAuthenticated && googleDrive.syncEnabled) {
        googleDrive.queueSync('inventory_add', { productId: product.id, productName: product.nombre })
      }
    } catch (error) {
      socket.emit('inventory-error', error.message)
    }
  })

  socket.on('update-product', async (id, productData) => {
    try {
      const product = await inventory.updateProduct(id, productData)
      socket.emit('product-updated', product)
      io.emit('inventory-updated')

      // 🔄 SINCRONIZACIÓN AUTOMÁTICA CON GOOGLE DRIVE
      if (googleDrive.isAuthenticated && googleDrive.syncEnabled) {
        googleDrive.queueSync('inventory_update', { productId: id, productName: product.nombre })
      }
    } catch (error) {
      socket.emit('inventory-error', error.message)
    }
  })

  socket.on('delete-product', async (id) => {
    try {
      await inventory.deleteProduct(id)
      socket.emit('product-deleted', id)
      io.emit('inventory-updated')

      // 🔄 SINCRONIZACIÓN AUTOMÁTICA CON GOOGLE DRIVE
      if (googleDrive.isAuthenticated && googleDrive.syncEnabled) {
        googleDrive.queueSync('inventory_delete', { productId: id })
      }
    } catch (error) {
      socket.emit('inventory-error', error.message)
    }
  })

  // Eventos para productos destacados ⭐
  socket.on('toggle-destacado', async (productId) => {
    try {
      const product = await inventory.toggleDestacado(productId)
      socket.emit('product-destacado-updated', product)
      io.emit('inventory-updated')

      // 🔄 SINCRONIZACIÓN AUTOMÁTICA CON GOOGLE DRIVE
      if (googleDrive.isAuthenticated && googleDrive.syncEnabled) {
        googleDrive.queueSync('inventory_destacado', { productId, destacado: product.destacado })
      }
    } catch (error) {
      socket.emit('inventory-error', error.message)
    }
  })

  socket.on('get-destacados', async () => {
    try {
      const destacados = await inventory.getDestacados()
      socket.emit('destacados-data', destacados)
    } catch (error) {
      socket.emit('inventory-error', error.message)
    }
  })

  socket.on('get-products-by-category', async (categoria) => {
    try {
      const products = await inventory.getProductsByCategory(categoria)
      socket.emit('products-by-category-data', products)
    } catch (error) {
      socket.emit('inventory-error', error.message)
    }
  })

  // Eventos de pedidos
  socket.on('get-orders', async () => {
    try {
      const ordersList = await orders.getAllOrders()
      socket.emit('orders-data', ordersList)
    } catch (error) {
      socket.emit('orders-error', error.message)
    }
  })

  socket.on('update-order-status', async (orderId, status) => {
    try {
      // Pasar el servicio de WhatsApp para notificaciones automáticas
      const order = await orders.updateOrderStatus(orderId, status, '', whatsapp)
      socket.emit('order-updated', order)
      io.emit('orders-updated')

      // Notificaciones especiales para eventos importantes
      if (status === 'completado') {
        io.emit('notification', {
          type: 'success',
          title: 'Venta Completada',
          message: `Pedido #${orderId} completado - S/ ${order.total}`,
          timestamp: new Date().toISOString()
        })
      } else if (status === 'pagado') {
        io.emit('notification', {
          type: 'info',
          title: 'Pago Recibido',
          message: `Pedido #${orderId} pagado - S/ ${order.total}`,
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      socket.emit('orders-error', error.message)
    }
  })

  socket.on('delete-order', async (orderId) => {
    try {
      const result = await orders.deleteOrder(orderId)
      socket.emit('order-deleted', result)
      io.emit('orders-updated')
    } catch (error) {
      socket.emit('orders-error', error.message)
    }
  })

  // Eventos de estadísticas de ventas 📊
  socket.on('get-sales-stats', async () => {
    try {
      const stats = await sales.getEstadisticasGenerales()
      socket.emit('sales-stats-data', stats)
    } catch (error) {
      socket.emit('sales-error', error.message)
    }
  })

  socket.on('get-ventas-por-categoria', async () => {
    try {
      const ventas = await sales.getVentasPorCategoria()
      socket.emit('ventas-categoria-data', ventas)
    } catch (error) {
      socket.emit('sales-error', error.message)
    }
  })

  socket.on('get-productos-mas-vendidos', async (categoria) => {
    try {
      const productos = await sales.getProductosMasVendidos(categoria, 10)
      socket.emit('productos-mas-vendidos-data', productos)
    } catch (error) {
      socket.emit('sales-error', error.message)
    }
  })

  socket.on('get-clientes-recurrentes', async () => {
    try {
      const clientes = await sales.getClientesRecurrentes(20)
      socket.emit('clientes-recurrentes-data', clientes)
    } catch (error) {
      socket.emit('sales-error', error.message)
    }
  })

  socket.on('get-ventas-por-periodo', async (dias) => {
    try {
      const ventas = await sales.getVentasPorPeriodo(dias || 30)
      socket.emit('ventas-periodo-data', ventas)
    } catch (error) {
      socket.emit('sales-error', error.message)
    }
  })

  // Evento para historial de ventas con filtros y paginación
  socket.on('get-sales-history', async (params) => {
    try {
      const { filtros, paginacion, ordenamiento } = params
      const historial = await sales.getHistorialVentas(filtros, paginacion, ordenamiento)
      socket.emit('sales-history-data', historial)
    } catch (error) {
      socket.emit('sales-history-error', error.message)
    }
  })

  // Evento para exportar historial de ventas
  socket.on('export-sales-history', async (params) => {
    try {
      const { filtros, ordenamiento } = params
      const exportData = await sales.exportHistorialVentas(filtros, ordenamiento)
      socket.emit('sales-export-ready', exportData)
    } catch (error) {
      socket.emit('sales-history-error', error.message)
    }
  })

  // Eventos para limpieza de datos
  socket.on('clear-all-orders', async () => {
    try {
      console.log('🗑️ Iniciando limpieza de todos los pedidos...')

      // Eliminar todos los pedidos
      const result = await db.run('DELETE FROM pedidos')

      console.log(`✅ Pedidos eliminados: ${result.changes} registros`)

      socket.emit('orders-cleared', {
        message: `Todos los pedidos han sido eliminados exitosamente. (${result.changes} registros eliminados)`,
        deletedCount: result.changes
      })

      // Notificar a todos los clientes para actualizar la UI
      io.emit('orders-updated')

    } catch (error) {
      console.error('❌ Error limpiando pedidos:', error)
      socket.emit('orders-clear-error', error.message)
    }
  })

  socket.on('clear-all-sales', async () => {
    try {
      console.log('🗑️ Iniciando limpieza de todas las estadísticas de ventas...')

      // Eliminar estadísticas de ventas
      const salesResult = await db.run('DELETE FROM estadisticas_ventas')

      // Eliminar clientes recurrentes
      const clientsResult = await db.run('DELETE FROM clientes_recurrentes')

      console.log(`✅ Estadísticas eliminadas: ${salesResult.changes} registros`)
      console.log(`✅ Clientes recurrentes eliminados: ${clientsResult.changes} registros`)

      socket.emit('sales-cleared', {
        message: `Todas las estadísticas de ventas han sido eliminadas exitosamente. (${salesResult.changes} ventas + ${clientsResult.changes} clientes)`,
        salesDeleted: salesResult.changes,
        clientsDeleted: clientsResult.changes
      })

      // Notificar a todos los clientes para actualizar la UI
      io.emit('sales-updated')

    } catch (error) {
      console.error('❌ Error limpiando estadísticas de ventas:', error)
      socket.emit('sales-clear-error', error.message)
    }
  })

  // 🔐 EVENTOS DE GESTIÓN ADMINISTRATIVA

  // Verificar si la contraseña maestra está configurada
  socket.on('check-master-password', async () => {
    try {
      const isSet = await db.isMasterPasswordSet()
      socket.emit('master-password-status', { isSet })
    } catch (error) {
      socket.emit('admin-error', error.message)
    }
  })

  // Configurar contraseña maestra
  socket.on('set-master-password', async (password) => {
    try {
      if (!password || !password.trim()) {
        socket.emit('admin-error', 'La contraseña no puede estar vacía')
        return
      }

      const result = await db.setMasterPassword(password.trim())
      if (result.success) {
        socket.emit('master-password-set')
      } else {
        socket.emit('admin-error', result.error)
      }
    } catch (error) {
      socket.emit('admin-error', error.message)
    }
  })

  // Verificar contraseña maestra y obtener códigos
  socket.on('verify-master-password', async (password) => {
    try {
      const verification = await db.verifyMasterPassword(password)

      if (verification.valid) {
        const codes = await db.getAllAdminCodes()
        socket.emit('admin-codes-data', { codes })
      } else {
        socket.emit('admin-auth-failed', verification.reason)
      }
    } catch (error) {
      socket.emit('admin-error', error.message)
    }
  })

  // Crear nuevo código administrativo
  socket.on('create-admin-code', async (data) => {
    try {
      const { password, descripcion } = data

      // Verificar contraseña maestra
      const verification = await db.verifyMasterPassword(password)
      if (!verification.valid) {
        socket.emit('admin-auth-failed', verification.reason)
        return
      }

      const result = await db.createAdminCode(descripcion)
      if (result.success) {
        const codes = await db.getAllAdminCodes()
        socket.emit('admin-codes-data', { codes })
        socket.emit('admin-code-created', { code: result.code })
      } else {
        socket.emit('admin-error', result.error)
      }
    } catch (error) {
      socket.emit('admin-error', error.message)
    }
  })

  // Eliminar código administrativo
  socket.on('delete-admin-code', async (data) => {
    try {
      const { password, codeId } = data

      // Verificar contraseña maestra
      const verification = await db.verifyMasterPassword(password)
      if (!verification.valid) {
        socket.emit('admin-auth-failed', verification.reason)
        return
      }

      const result = await db.deleteAdminCode(codeId)
      if (result.success) {
        const codes = await db.getAllAdminCodes()
        socket.emit('admin-codes-data', { codes })
      } else {
        socket.emit('admin-error', result.error)
      }
    } catch (error) {
      socket.emit('admin-error', error.message)
    }
  })

  // Activar/desactivar código administrativo
  socket.on('toggle-admin-code', async (data) => {
    try {
      const { password, codeId, active } = data

      // Verificar contraseña maestra
      const verification = await db.verifyMasterPassword(password)
      if (!verification.valid) {
        socket.emit('admin-auth-failed', verification.reason)
        return
      }

      const result = await db.toggleAdminCode(codeId, active)
      if (result.success) {
        const codes = await db.getAllAdminCodes()
        socket.emit('admin-codes-data', { codes })
      } else {
        socket.emit('admin-error', result.error)
      }
    } catch (error) {
      socket.emit('admin-error', error.message)
    }
  })

  // Eventos de configuración
  socket.on('get-config', async () => {
    try {
      const config = await db.getAllConfig()
      socket.emit('config-data', config)
    } catch (error) {
      socket.emit('config-error', error.message)
    }
  })

  socket.on('save-config', async (configData) => {
    try {
      for (const [key, value] of Object.entries(configData)) {
        await db.setConfig(key, value)
      }
      socket.emit('config-saved')
    } catch (error) {
      socket.emit('config-error', error.message)
    }
  })

  // 🎭 NUEVO: Endpoint para obtener perfiles de negocio
  socket.on('get-business-profiles', () => {
    try {
      const profiles = gemini.getAllBusinessProfiles()
      socket.emit('business-profiles-data', profiles)
    } catch (error) {
      socket.emit('config-error', error.message)
    }
  })

  // Eventos de Google Drive
  socket.on('check-google-drive-auth', async () => {
    try {
      const status = googleDrive.getStatus()
      socket.emit('google-drive-auth-status', status)
    } catch (error) {
      console.error('Error verificando auth Google Drive:', error)
      socket.emit('google-drive-error', error.message)
    }
  })

  socket.on('get-google-auth-url', async () => {
    try {
      if (!googleAuth.isConfigured()) {
        return socket.emit('google-drive-error', 'OAuth no configurado. Falta archivo credentials.json')
      }

      const authUrl = googleAuth.getAuthUrl()
      socket.emit('google-auth-url', { authUrl })
    } catch (error) {
      console.error('Error generando URL de auth:', error)
      socket.emit('google-drive-error', error.message)
    }
  })

  socket.on('disconnect-google-drive', async () => {
    try {
      await googleDrive.disconnect()
      socket.emit('google-drive-auth-status', googleDrive.getStatus())
    } catch (error) {
      console.error('Error desconectando Google Drive:', error)
      socket.emit('google-drive-error', error.message)
    }
  })

  socket.on('toggle-google-drive-sync', async (data) => {
    try {
      await googleDrive.setSyncEnabled(data.enabled)
      socket.emit('google-drive-auth-status', googleDrive.getStatus())
    } catch (error) {
      console.error('Error cambiando estado de sync:', error)
      socket.emit('google-drive-error', error.message)
    }
  })

  socket.on('manual-backup-to-drive', async () => {
    try {
      if (!googleDrive.isAuthenticated) {
        return socket.emit('google-drive-error', 'No autenticado con Google Drive')
      }

      await googleDrive.uploadDatabase()
      socket.emit('backup-completed', {
        message: 'Respaldo manual completado exitosamente',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Error en respaldo manual:', error)
      socket.emit('google-drive-error', error.message)
    }
  })

  socket.on('manual-restore-from-drive', async () => {
    try {
      if (!googleDrive.isAuthenticated) {
        return socket.emit('google-drive-error', 'No autenticado con Google Drive')
      }

      const result = await googleDrive.downloadDatabase()

      // Notificar SOLO a otros clientes (no al que inició la restauración)
      socket.broadcast.emit('database-restored-notification', {
        message: 'La base de datos ha sido actualizada por otro usuario',
        timestamp: result.timestamp
      })

      // Responder SOLO al cliente que inició la restauración
      socket.emit('restore-completed', {
        message: 'Restauración completada exitosamente. Los datos han sido actualizados.',
        success: true,
        timestamp: result.timestamp,
        shouldReload: true // Indicar que este cliente debe recargar
      })

      console.log('✅ Restauración completada y notificada a todos los clientes')

    } catch (error) {
      console.error('Error en restauración:', error)
      socket.emit('google-drive-error', error.message)
    }
  })

  // Estadísticas
  socket.on('get-stats', async () => {
    try {
      const stats = await getStats()
      socket.emit('stats-update', stats)
    } catch (error) {
      socket.emit('stats-error', error.message)
    }
  })

  // Estadísticas de API Keys Gemini
  socket.on('get-gemini-stats', () => {
    try {
      const apiKeyStats = gemini.getApiKeyStats()
      socket.emit('gemini-stats-update', {
        apiKeys: apiKeyStats,
        summary: {
          totalKeys: apiKeyStats.length,
          activeKeys: apiKeyStats.filter(k => k.isActive).length,
          availableKeys: apiKeyStats.filter(k => k.isAvailable).length,
          totalRequests: apiKeyStats.reduce((sum, k) => sum + k.requestCount, 0),
          totalSuccesses: apiKeyStats.reduce((sum, k) => sum + k.successCount, 0),
          totalErrors: apiKeyStats.reduce((sum, k) => sum + k.errorCount, 0)
        }
      })
    } catch (error) {
      socket.emit('gemini-stats-error', error.message)
    }
  })

  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado: ${socket.id} [${new Date().toLocaleTimeString()}]`)
  })
})

// Función para obtener estadísticas
async function getStats() {
  const totalProducts = await inventory.getProductCount()
  const pendingOrders = await orders.getPendingOrdersCount()
  const todayMessages = await whatsapp.getTodayMessagesCount()
  const todaySales = await orders.getTodaySales()

  return {
    totalProducts,
    pendingOrders,
    todayMessages,
    todaySales
  }
}

// Rutas API REST
app.get('/api/health', async (req, res) => {
  try {
    // Verificar servicios críticos
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: 'OK',
        gemini: 'OK',
        whatsapp: 'OK'
      }
    }

    // Verificar base de datos
    try {
      await db.getConfig('business_name')
    } catch (error) {
      health.services.database = 'ERROR'
      health.status = 'DEGRADED'
    }

    // Verificar API keys de Gemini
    const apiKeyStats = gemini.getApiKeyStats()
    const activeKeys = apiKeyStats.filter(k => k.isAvailable).length
    if (activeKeys === 0) {
      health.services.gemini = 'ERROR'
      health.status = 'DEGRADED'
    }

    res.json(health)
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: process.env.NODE_ENV === 'production' ? 'Health check failed' : error.message
    })
  }
})

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getSystemStats()
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      ...stats
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Endpoint para estadísticas de ventas específicas
app.get('/api/sales-summary', async (req, res) => {
  try {
    if (!sales) {
      return res.json({ message: 'Sales service not available' })
    }

    const [
      statsGenerales,
      ventasPorCategoria,
      productosMasVendidos,
      clientesRecurrentes
    ] = await Promise.all([
      sales.getEstadisticasGenerales(),
      sales.getVentasPorCategoria(),
      sales.getProductosMasVendidos(null, 5),
      sales.getClientesRecurrentes(10)
    ])

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      general: statsGenerales,
      categorias: ventasPorCategoria,
      topProductos: productosMasVendidos,
      topClientes: clientesRecurrentes
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Nueva ruta para estadísticas de API keys
app.get('/api/gemini-stats', (req, res) => {
  try {
    const apiKeyStats = gemini.getApiKeyStats()
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      apiKeys: apiKeyStats,
      summary: {
        totalKeys: apiKeyStats.length,
        activeKeys: apiKeyStats.filter(k => k.isActive).length,
        availableKeys: apiKeyStats.filter(k => k.isAvailable).length,
        totalRequests: apiKeyStats.reduce((sum, k) => sum + k.requestCount, 0),
        totalSuccesses: apiKeyStats.reduce((sum, k) => sum + k.successCount, 0),
        totalErrors: apiKeyStats.reduce((sum, k) => sum + k.errorCount, 0)
      }
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Manejo de errores global
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error)
})

// Función para verificar integridad del sistema
async function verificarIntegridadSistema() {
  console.log('🔍 Verificando integridad del sistema...')

  try {
    // Verificar conexión a base de datos
    const testConfig = await db.getConfig('business_name')
    console.log('✅ Base de datos: Conectada')

    // Verificar servicios
    const totalProducts = await inventory.getProductCount()
    console.log(`✅ Inventario: ${totalProducts} productos`)

    const totalOrders = await orders.getAllOrders()
    console.log(`✅ Pedidos: ${totalOrders.length} pedidos`)

    // Verificar estadísticas de ventas
    if (sales) {
      const statsGenerales = await sales.getEstadisticasGenerales()
      console.log(`✅ Ventas: ${statsGenerales.total_ventas} ventas registradas`)
    }

    // Verificar API keys de Gemini
    const apiKeyStats = gemini.getApiKeyStats()
    const activeKeys = apiKeyStats.filter(k => k.isAvailable).length
    console.log(`✅ Gemini: ${activeKeys}/${apiKeyStats.length} API keys disponibles`)

    console.log('🎉 Sistema verificado correctamente')

  } catch (error) {
    console.error('❌ Error verificando sistema:', error)
  }
}

// Función para obtener estadísticas completas del sistema
async function getSystemStats() {
  try {
    const [
      totalProducts,
      pendingOrders,
      todayMessages,
      todaySales,
      salesStats,
      apiKeyStats
    ] = await Promise.all([
      inventory.getProductCount(),
      orders.getPendingOrdersCount(),
      whatsapp.getTodayMessagesCount(),
      orders.getTodaySales(),
      sales ? sales.getEstadisticasGenerales() : { total_ventas: 0, ingresos_totales: 0 },
      Promise.resolve(gemini.getApiKeyStats())
    ])

    return {
      totalProducts,
      pendingOrders,
      todayMessages,
      todaySales,
      totalSales: salesStats.total_ventas || 0,
      totalRevenue: salesStats.ingresos_totales || 0,
      apiKeys: {
        total: apiKeyStats.length,
        available: apiKeyStats.filter(k => k.isAvailable).length,
        totalRequests: apiKeyStats.reduce((sum, k) => sum + k.requestCount, 0)
      }
    }
  } catch (error) {
    console.error('Error obteniendo estadísticas del sistema:', error)
    return {
      totalProducts: 0,
      pendingOrders: 0,
      todayMessages: 0,
      todaySales: 0,
      totalSales: 0,
      totalRevenue: 0,
      apiKeys: { total: 0, available: 0, totalRequests: 0 }
    }
  }
}

// Manejo mejorado de errores
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason)
  console.error('📍 Promise:', promise)

  // Notificar a todos los clientes conectados
  io.emit('system-error', {
    type: 'unhandled-rejection',
    message: 'Error interno del sistema',
    timestamp: new Date().toISOString()
  })
})

process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error)

  // Notificar a todos los clientes conectados
  io.emit('system-error', {
    type: 'uncaught-exception',
    message: 'Error crítico del sistema',
    timestamp: new Date().toISOString()
  })

  // Intentar cerrar conexiones gracefully
  setTimeout(() => {
    process.exit(1)
  }, 5000)
})

// Función para monitorear salud del sistema
setInterval(async () => {
  try {
    const stats = await getSystemStats()

    // Verificar si hay problemas críticos
    if (stats.apiKeys.available === 0) {
      io.emit('system-warning', {
        type: 'api-keys-exhausted',
        message: 'Todas las API keys están agotadas',
        timestamp: new Date().toISOString()
      })
    }

    // Verificar memoria
    const memUsage = process.memoryUsage()
    const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024)

    if (memUsageMB > 500) { // Más de 500MB
      console.warn(`⚠️ Alto uso de memoria: ${memUsageMB}MB`)
    }

  } catch (error) {
    console.error('Error monitoreando sistema:', error)
  }
}, 60000) // Cada minuto

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 WHATSAPP SALES AGENT - SISTEMA COMPLETO')
  console.log('='.repeat(60))
  console.log(`📡 Servidor: http://localhost:${PORT}`)
  console.log(`🌐 Panel de control: http://localhost:${PORT}`)
  console.log(`📱 WhatsApp Bot: Listo para conectar`)
  console.log('\n📊 FUNCIONALIDADES IMPLEMENTADAS:')
  console.log('  ⭐ Productos destacados con estrella')
  console.log('  📈 Sistema completo de estadísticas de ventas')
  console.log('  🤖 Agente inteligente con reconocimiento de clientes')
  console.log('  🏷️ Búsqueda inteligente por categorías')
  console.log('  📷 Envío de imágenes de productos')
  console.log('  👑 Niveles de cliente (Nuevo → Recurrente → Frecuente → VIP)')
  console.log('  🔄 11 API keys de Gemini con rotación automática')
  console.log('  ⚙️ Configuraciones avanzadas de filtros y horarios')
  console.log('  🔔 Notificaciones en tiempo real')
  console.log('  📊 Dashboard completo con métricas')
  console.log('\n🎯 FLUJO OPTIMIZADO:')
  console.log('  1. Cliente saluda → Reconocimiento automático')
  console.log('  2. Muestra productos destacados (máximo 5)')
  console.log('  3. Sugiere categorías para explorar más')
  console.log('  4. Búsqueda inteligente por categoría')
  console.log('  5. Productos ordenados por popularidad')
  console.log('  6. Proceso de compra optimizado')
  console.log('\n' + '='.repeat(60))
  console.log('✅ Sistema listo para usar')
  console.log('='.repeat(60) + '\n')
})

// 🚨 MANEJO DE ERRORES (debe ir al final)
app.use(notFoundHandler)
app.use(errorHandler)

// 🚨 MANEJO DE ERRORES NO CAPTURADOS
process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error)
  if (process.env.NODE_ENV === 'production') {
    process.exit(1)
  }
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason)
  if (process.env.NODE_ENV === 'production') {
    process.exit(1)
  }
})
