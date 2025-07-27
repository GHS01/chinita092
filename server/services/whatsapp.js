import { makeWASocket, DisconnectReason, useMultiFileAuthState, downloadContentFromMessage } from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import fs from 'fs'
import path from 'path'

export class WhatsAppService {
  constructor(io, geminiService, inventoryService, orderService, dbService, salesService = null) {
    this.io = io
    this.gemini = geminiService
    this.inventory = inventoryService
    this.orders = orderService
    this.db = dbService
    this.sales = salesService
    this.googleDrive = null // Se establecerá después con setGoogleDriveService
    this.sock = null
    this.qr = null
    this.isConnected = false
    this.messageCount = 0
    this.pendingOrders = new Map() // Para manejar pedidos en proceso

    // Control de reconexiones para evitar bucles infinitos
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 3000 // Delay inicial
    this.isReconnecting = false
    this.lastDisconnectReason = null

    // Sistema de estados de conversación
    this.conversationStates = new Map()
    this.conversationHistory = new Map()

    // Estados posibles
    this.STATES = {
      INITIAL: 'initial',           // Primera interacción
      ASKING_NAME: 'asking_name',   // Solicitando nombre del cliente
      BROWSING: 'browsing',         // Viendo productos
      INTERESTED: 'interested',     // Mostró interés en algo
      SPECIFYING: 'specifying',     // Especificando producto/cantidad
      CONFIRMING: 'confirming',     // Esperando confirmación final
      PAYMENT: 'payment',           // Esperando pago
      COMPLETED: 'completed',       // Pedido completado, listo para despedida
      EMOTIONAL_SUPPORT: 'emotional_support', // 🎭 Estado temporal para apoyo emocional

      // 🔐 ESTADOS ADMINISTRATIVOS (NUEVOS)
      ADMIN_AUTH: 'admin_auth',                 // Solicitando código de autorización
      ADMIN_MENU: 'admin_menu',                 // Menú administrativo principal
      ADMIN_ADD_PRODUCT: 'admin_add_product',   // Creando nuevo producto
      ADMIN_UPDATE_PRODUCT: 'admin_update_product', // Actualizando producto existente
      ADMIN_UPDATE_STOCK: 'admin_update_stock', // Actualizando stock
      ADMIN_QUERY_STATS: 'admin_query_stats',   // Consultando estadísticas
      ADMIN_LIST_PRODUCTS: 'admin_list_products' // Listando productos para gestión
    }

    // 🎭 Sistema de timeout para estados emocionales
    this.emotionalTimeouts = new Map() // Almacena timeouts por cliente

    // Crear directorio para auth si no existe
    if (!fs.existsSync('./auth_info_baileys')) {
      fs.mkdirSync('./auth_info_baileys')
    }
  }

  // Método para establecer referencia de GoogleDriveService
  setGoogleDriveService(googleDriveService) {
    this.googleDrive = googleDriveService
  }

  // Métodos para manejar estados de conversación
  getConversationState(clientId) {
    return this.conversationStates.get(clientId) || this.STATES.INITIAL
  }

  setConversationState(clientId, state, data = {}) {
    this.conversationStates.set(clientId, state)

    // Actualizar datos del estado si se proporcionan
    if (Object.keys(data).length > 0) {
      const currentData = this.conversationStates.get(`${clientId}_data`) || {}
      this.conversationStates.set(`${clientId}_data`, { ...currentData, ...data })
    }

    console.log(`🔄 Estado de ${clientId}: ${state}`)
  }

  getConversationData(clientId) {
    return this.conversationStates.get(`${clientId}_data`) || {}
  }

  clearConversationState(clientId) {
    this.conversationStates.delete(clientId)
    this.conversationStates.delete(`${clientId}_data`)
    this.conversationHistory.delete(clientId)
    console.log(`🧹 Estado limpiado para ${clientId}`)
  }

  // Métodos para manejar historial de conversación
  addToHistory(clientId, role, message) {
    if (!this.conversationHistory.has(clientId)) {
      this.conversationHistory.set(clientId, [])
    }

    const history = this.conversationHistory.get(clientId)
    history.push({
      role,
      message,
      timestamp: new Date()
    })

    // Mantener solo los últimos 10 mensajes
    if (history.length > 10) {
      history.shift()
    }
  }

  getRecentHistory(clientId, limit = 5) {
    const history = this.conversationHistory.get(clientId) || []
    return history.slice(-limit)
  }

  // Verificar si es un mensaje duplicado reciente
  isDuplicateMessage(clientId, message) {
    const history = this.conversationHistory.get(clientId) || []
    const recent = history.slice(-3) // Últimos 3 mensajes

    return recent.some(msg =>
      msg.role === 'user' &&
      msg.message === message &&
      (new Date() - msg.timestamp) < 5000 // Menos de 5 segundos
    )
  }

  // Método para obtener el nombre del negocio desde la configuración
  async getBusinessName() {
    try {
      const businessName = await this.db.getConfig('business_name')
      return businessName && businessName.trim() !== '' ? businessName : 'nuestra tienda'
    } catch (error) {
      console.log('⚠️ No se pudo obtener business_name, usando valor por defecto')
      return 'nuestra tienda'
    }
  }

  // Método para obtener el mensaje de bienvenida personalizado desde la configuración
  async getWelcomeMessage() {
    try {
      const welcomeMessage = await this.db.getConfig('welcome_message')
      if (welcomeMessage && welcomeMessage.trim() !== '') {
        return welcomeMessage
      }

      // Fallback: mensaje por defecto con nombre del negocio
      const businessName = await this.getBusinessName()
      return `¡Hola! 👋 Bienvenido/a a ${businessName}.

Para brindarte una atención más personalizada y hacer que tu experiencia sea especial, me encantaría conocerte mejor.

¿Podrías decirme tu nombre? 😊`
    } catch (error) {
      console.log('⚠️ No se pudo obtener welcome_message, usando valor por defecto')
      const businessName = await this.getBusinessName()
      return `¡Hola! 👋 Bienvenido/a a ${businessName}.

Para brindarte una atención más personalizada y hacer que tu experiencia sea especial, me encantaría conocerte mejor.

¿Podrías decirme tu nombre? 😊`
    }
  }

  // Método para manejar reconexiones con backoff exponencial
  handleReconnection() {
    if (this.isReconnecting) {
      console.log('🔄 Ya hay una reconexión en progreso, ignorando...')
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('❌ Máximo número de intentos de reconexión alcanzado')
      this.isConnected = false
      this.isReconnecting = false
      this.io.emit('whatsapp-status', 'error')
      this.io.emit('system-error', {
        message: `Falló la reconexión después de ${this.maxReconnectAttempts} intentos. Intenta conectar manualmente.`
      })
      return
    }

    this.isReconnecting = true
    this.reconnectAttempts++

    // Backoff exponencial: 3s, 6s, 12s, 24s, 48s
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(`🔄 Reconectando WhatsApp... (Intento ${this.reconnectAttempts}/${this.maxReconnectAttempts}) - Esperando ${delay}ms`)
    this.io.emit('whatsapp-status', 'reconnecting')

    setTimeout(() => {
      if (this.isReconnecting) { // Verificar que aún necesitamos reconectar
        this.connect()
      }
    }, delay)
  }

  async connect() {
    try {
      // Si no estamos en proceso de reconexión automática, resetear contadores
      if (!this.isReconnecting) {
        this.reconnectAttempts = 0
        console.log('🔄 Iniciando conexión manual - Reseteando contadores de reconexión')
      }

      const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys')

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: {
          level: 'silent',
          child: () => ({
            level: 'silent',
            trace: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            fatal: () => {}
          }),
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          fatal: () => {}
        }
      })

      // Manejar eventos de conexión
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
          this.qr = qr
          const qrImage = await QRCode.toDataURL(qr)
          this.io.emit('qr-code', qrImage)
          this.io.emit('whatsapp-status', 'connecting')
          console.log('📱 Código QR generado para WhatsApp')
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode
          this.lastDisconnectReason = statusCode

          console.log('📱 Conexión cerrada. Código:', statusCode, 'Razón:', DisconnectReason[statusCode] || 'Desconocida')

          // Manejar código 440 (connectionReplaced) - múltiples instancias
          if (statusCode === DisconnectReason.connectionReplaced) {
            console.log('🚨 CONEXIÓN REEMPLAZADA - Posible múltiple instancia detectada')
            console.log('⚠️ Deteniendo reconexiones automáticas para evitar bucle infinito')
            this.isConnected = false
            this.isReconnecting = false
            this.reconnectAttempts = 0
            this.io.emit('whatsapp-status', 'error')
            this.io.emit('system-error', {
              message: 'Conexión reemplazada por otra instancia. Verifica que no haya múltiples bots corriendo.'
            })
            return // No reconectar automáticamente
          }

          if (statusCode === DisconnectReason.loggedOut) {
            // Sesión cerrada desde el teléfono - Auto-limpiar
            console.log('🚨 Sesión cerrada desde WhatsApp - Iniciando auto-limpieza...')
            this.isConnected = false
            this.isReconnecting = false
            this.reconnectAttempts = 0
            this.io.emit('whatsapp-status', 'session-invalid')

            // Auto-limpiar sesión después de un momento
            setTimeout(async () => {
              try {
                await this.clearSession()
                this.io.emit('whatsapp-status', 'ready-to-connect')
              } catch (error) {
                console.error('Error en auto-limpieza:', error)
                this.io.emit('whatsapp-status', 'error')
              }
            }, 2000)

          } else if (statusCode !== DisconnectReason.loggedOut && statusCode !== DisconnectReason.connectionReplaced) {
            // Implementar backoff exponencial para otras desconexiones
            this.handleReconnection()
          } else {
            console.log('❌ WhatsApp desconectado')
            this.isConnected = false
            this.isReconnecting = false
            this.io.emit('whatsapp-status', 'disconnected')
          }
        } else if (connection === 'open') {
          console.log('✅ WhatsApp conectado exitosamente')
          this.isConnected = true
          this.isReconnecting = false
          this.reconnectAttempts = 0 // Reset contador en conexión exitosa
          this.qr = null
          this.io.emit('whatsapp-ready')
          this.io.emit('whatsapp-status', 'connected')
        }
      })

      // Guardar credenciales cuando cambien
      this.sock.ev.on('creds.update', saveCreds)

      // Manejar mensajes entrantes
      this.sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0]
        if (!message.key.fromMe && message.message) {
          await this.handleIncomingMessage(message)
        }
      })

    } catch (error) {
      console.error('Error conectando WhatsApp:', error)
      throw error
    }
  }

  async disconnect() {
    if (this.sock) {
      await this.sock.logout()
      this.sock = null
      this.isConnected = false
      this.io.emit('whatsapp-status', 'disconnected')
      console.log('📱 WhatsApp desconectado')
    }
  }

  async clearSession() {
    try {
      console.log('🧹 Iniciando limpieza de sesión WhatsApp...')

      // Desconectar si está conectado
      if (this.sock) {
        try {
          await this.sock.logout()
        } catch (error) {
          console.log('⚠️ Error al desconectar (esperado si sesión inválida):', error.message)
        }
        this.sock = null
      }

      // Limpiar estado
      this.isConnected = false
      this.qr = null
      this.pendingOrders.clear()

      // Eliminar archivos de autenticación
      if (fs.existsSync('./auth_info_baileys')) {
        console.log('🗑️ Eliminando archivos de autenticación...')
        fs.rmSync('./auth_info_baileys', { recursive: true, force: true })
        console.log('✅ Archivos de autenticación eliminados')
      }

      // Recrear directorio
      if (!fs.existsSync('./auth_info_baileys')) {
        fs.mkdirSync('./auth_info_baileys')
      }

      // Notificar al frontend
      this.io.emit('whatsapp-status', 'session-cleared')
      this.io.emit('session-cleared', {
        message: 'Sesión limpiada exitosamente. Puedes reconectar ahora.'
      })

      console.log('✅ Sesión WhatsApp limpiada exitosamente')
      return { success: true, message: 'Sesión limpiada exitosamente' }

    } catch (error) {
      console.error('❌ Error limpiando sesión:', error)
      this.io.emit('session-clear-error', { error: error.message })
      throw new Error('Error al limpiar sesión: ' + error.message)
    }
  }

  async forceReconnect() {
    try {
      console.log('🔄 Forzando reconexión WhatsApp...')

      // Limpiar sesión primero
      await this.clearSession()

      // Esperar un momento
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Reconectar
      await this.connect()

      console.log('✅ Reconexión forzada completada')
      return { success: true, message: 'Reconexión exitosa' }

    } catch (error) {
      console.error('❌ Error en reconexión forzada:', error)
      throw error
    }
  }

  async handleIncomingMessage(message) {
    try {
      const from = message.key.remoteJid
      const messageText = message.message?.conversation ||
                         message.message?.extendedTextMessage?.text || ''

      // Verificar duplicados
      if (this.isDuplicateMessage(from, messageText)) {
        console.log(`🔄 Mensaje duplicado ignorado de ${from}`)
        return
      }

      // Incrementar contador de mensajes
      this.messageCount++

      // Registrar mensaje en base de datos y historial
      await this.logMessage(from, messageText, 'recibido')
      this.addToHistory(from, 'user', messageText)

      console.log(`📨 Mensaje de ${from}: ${messageText}`)

      // Obtener inventario actual
      const products = await this.inventory.getAllProducts()

      // INTERRUPTOR MAESTRO - Verificar si las respuestas automáticas están habilitadas
      const autoResponsesEnabled = await this.db.getConfig('auto_responses_enabled')
      if (autoResponsesEnabled !== 'true') {
        console.log('🔇 Auto respuestas deshabilitadas - mensaje ignorado')
        return
      }

      // Verificar si es una imagen (posible captura de pago)
      if (message.message?.imageMessage) {
        await this.handleImageMessage(message, from)
        return
      }

      // Obtener estado actual de conversación
      const currentState = this.getConversationState(from)
      const conversationData = this.getConversationData(from)
      const recentHistory = this.getRecentHistory(from, 3)

      console.log(`🔍 Estado actual: ${currentState}`)

      // DETECTAR INTENCIÓN PRIMERO (para lógica inteligente de filtros)
      const intent = await this.gemini.detectCustomerIntent(messageText, products, currentState, {
        ...conversationData,
        recentHistory
      })
      console.log(`🎯 Intención detectada:`, intent)

      // APLICAR FILTROS DE MENSAJES (con lógica inteligente)
      const shouldProcessMessage = await this.shouldProcessMessageIntelligent(messageText, currentState, from, intent)
      if (!shouldProcessMessage) {
        console.log('🚫 Mensaje filtrado - no cumple criterios configurados')
        return
      }

      // Procesar según la intención y estado
      await this.processCustomerIntent(from, messageText, intent, products, currentState, conversationData, recentHistory)

    } catch (error) {
      console.error('Error manejando mensaje entrante:', error)
      await this.sendMessage(
        message.key.remoteJid,
        'Disculpa, tuve un problema técnico. ¿Podrías intentar de nuevo? 🤖'
      )
    }
  }

  // Procesar intención del cliente según el estado actual
  async processCustomerIntent(from, messageText, intent, products, currentState, conversationData, recentHistory) {
    // 🔐 MANEJAR ESTADOS ADMINISTRATIVOS PRIMERO
    if (this.isAdminState(currentState)) {
      await this.processAdminState(from, messageText, currentState, conversationData)
      return // Salir aquí para no procesar lógica de ventas
    }

    // Manejar estado ASKING_NAME primero
    if (currentState === this.STATES.ASKING_NAME) {
      const processedName = await this.processReceivedName(from, messageText)
      if (processedName) {
        // Nombre procesado exitosamente, continuar con flujo normal
        console.log(`✅ Nombre guardado: ${processedName} para ${from}`)
      }
      return // Salir aquí para no procesar más lógica
    }

    // 🎭 VERIFICAR TRANSICIÓN DE ESTADO EMOCIONAL
    const hadEmotionalTransition = await this.checkEmotionalStateTransition(from, intent, currentState)
    if (hadEmotionalTransition) {
      // Si hubo transición, actualizar el estado actual
      currentState = this.getConversationState(from)
      console.log(`🎭 Estado actualizado después de transición emocional: ${currentState}`)
    }

    // Manejar estado COMPLETED - cliente inicia nueva conversación después de despedida
    if (currentState === this.STATES.COMPLETED && intent.intent === 'greeting') {
      const customerName = await this.getCustomerName(from)
      if (customerName) {
        await this.handleReturningCustomerGreeting(from, customerName, products)
        this.setConversationState(from, this.STATES.BROWSING)
        return
      }
    }

    const customerName = await this.getCustomerName(from)

    // 🔐 MANEJAR ACTIVACIÓN DE MODO ADMINISTRATIVO
    if (this.isAdminModeActivation(messageText)) {
      await this.handleAdminModeActivation(from, messageText, customerName)
      return
    }

    // 🔐 MANEJAR DESACTIVACIÓN DE MODO ADMINISTRATIVO
    if (this.isAdminModeDeactivation(messageText) && this.isAdminState(currentState)) {
      await this.handleAdminModeDeactivation(from, customerName)
      return
    }

    // Si no tenemos nombre y no estamos en ASKING_NAME, solicitarlo
    if (!customerName && currentState === this.STATES.INITIAL) {
      await this.askForCustomerName(from)
      return // Salir aquí para esperar el nombre
    }

    // 🎭 MANEJAR ESTADO EMOTIONAL_SUPPORT
    if (currentState === this.STATES.EMOTIONAL_SUPPORT) {
      // Si sigue necesitando apoyo emocional, continuar con respuesta emocional
      if (intent.needs_emotional_response) {
        await this.handleEmotionalResponse(from, messageText, intent, customerName, currentState)
        return
      } else {
        // Si ya no necesita apoyo emocional, hacer transición automática
        await this.returnFromEmotionalState(from)
        currentState = this.getConversationState(from) // Actualizar estado
        console.log(`🎭 Transición automática completada, nuevo estado: ${currentState}`)
        // Continuar con el procesamiento normal
      }
    }

    // LÓGICA ESPECIAL: Si cliente está en INTERESTED y especifica producto + cantidad, avanzar a confirmación
    // 🔍 NUEVA CONDICIÓN: Solo si NO está buscando información (seeking_advice) Y NO está navegando (browsing)
    if (currentState === this.STATES.INTERESTED &&
        intent.products_mentioned.length > 0 &&
        (intent.quantity_mentioned > 0 || conversationData.quantity > 0) &&
        intent.intent !== 'seeking_advice' &&
        intent.intent !== 'browsing') {

      const finalQuantity = intent.quantity_mentioned || conversationData.quantity || 1

      // MEJORA: Usar productos del contexto si Gemini no detectó productos correctamente
      let productsToConfirm = intent.products_mentioned
      if (productsToConfirm.length === 0 && conversationData.interested_products) {
        productsToConfirm = conversationData.interested_products
        console.log(`🔧 CORRECCIÓN LÓGICA ESPECIAL: Usando productos del contexto:`, productsToConfirm)
      }

      // Avanzar directamente a confirmación
      console.log(`🔍 DEBUG LÓGICA ESPECIAL - Creando pending_order:`, {
        products: productsToConfirm,
        quantity: finalQuantity
      })
      await this.handleAskConfirmation(from, intent, conversationData, customerName, productsToConfirm)
      this.setConversationState(from, this.STATES.CONFIRMING, {
        ...conversationData,
        pending_order: {
          products: productsToConfirm,
          quantity: finalQuantity
        },
        order_processed: false  // Resetear para permitir nuevo pedido
      })
      return
    }

    // 🚫 MANEJO ESPECIAL: Detectar cancelación en estado CONFIRMING
    if (currentState === this.STATES.CONFIRMING &&
        (messageText.toLowerCase().trim() === 'no' ||
         messageText.toLowerCase().includes('cancelar') ||
         messageText.toLowerCase().includes('no quiero'))) {

      console.log(`🚫 CANCELACIÓN DETECTADA en estado CONFIRMING para ${customerName}`)

      // Limpiar pending_order y volver a navegación
      await this.handleOrderCancellation(from, customerName)
      this.setConversationState(from, this.STATES.BROWSING, {
        ...conversationData,
        pending_order: null,
        order_processed: false
      })
      return
    }

    try {
      switch (intent.suggested_response_type) {
        case 'show_products':
          await this.handleShowProducts(from, customerName, products, recentHistory)
          this.setConversationState(from, this.STATES.BROWSING)
          break

        case 'recommend_specific_products':
          await this.handleRecommendSpecificProducts(from, messageText, customerName, products, recentHistory)
          this.setConversationState(from, this.STATES.INTERESTED)
          break

        case 'admin_command':
          await this.handleAdminCommand(from, messageText, customerName)
          break

        case 'farewell':
          await this.handleFarewell(from, customerName)
          this.setConversationState(from, this.STATES.COMPLETED)
          break

        case 'ask_specification':
          await this.handleAskSpecification(from, messageText, intent, products, customerName, recentHistory)

          // Mejorar gestión de contexto: preservar cantidad si se especifica
          const newStateData = {
            interested_products: intent.products_mentioned
          }

          // Si se detectó cantidad en este mensaje, guardarla
          if (intent.quantity_mentioned > 0) {
            newStateData.quantity = intent.quantity_mentioned
          }

          this.setConversationState(from, this.STATES.INTERESTED, newStateData)
          break

        case 'ask_quantity':
          await this.handleAskQuantity(from, intent, conversationData, customerName, recentHistory)

          // Mejorar transición: usar productos de interés si no hay productos mencionados específicamente
          const selectedProducts = intent.products_mentioned.length > 0
            ? intent.products_mentioned
            : conversationData.interested_products || []

          // Usar cantidad detectada o cantidad previa del contexto
          const finalQuantity = intent.quantity_mentioned || conversationData.quantity || 1

          this.setConversationState(from, this.STATES.SPECIFYING, {
            ...conversationData,
            selected_products: selectedProducts,
            quantity: finalQuantity
          })
          break

        case 'ask_confirmation':
          const confirmQuantity = intent.quantity_mentioned || conversationData.quantity || 1

          // MEJORA: Usar productos del contexto si Gemini no detectó productos correctamente
          let productsToConfirm = intent.products_mentioned
          if (productsToConfirm.length === 0 && conversationData.selected_products) {
            productsToConfirm = conversationData.selected_products
            console.log(`🔧 CORRECCIÓN: Usando productos del contexto:`, productsToConfirm)
          }

          console.log(`🔍 DEBUG CASO NORMAL - Creando pending_order:`, {
            products: productsToConfirm,
            quantity: confirmQuantity
          })
          await this.handleAskConfirmation(from, intent, conversationData, customerName, productsToConfirm)
          this.setConversationState(from, this.STATES.CONFIRMING, {
            ...conversationData,
            pending_order: {
              products: productsToConfirm,
              quantity: confirmQuantity
            },
            order_processed: false  // Resetear para permitir nuevo pedido
          })
          break

        case 'process_order':
          if (intent.is_explicit_confirmation && currentState === this.STATES.CONFIRMING) {
            await this.handleProcessOrder(from, conversationData, customerName)
            this.setConversationState(from, this.STATES.PAYMENT)
          } else {
            // No es confirmación explícita, pedir clarificación
            await this.handleAskClarification(from, messageText, customerName, recentHistory)
          }
          break

        case 'emotional_response':
          // 🎭 NUEVO: Manejar respuestas emocionales
          await this.handleEmotionalResponse(from, messageText, intent, customerName, currentState)
          break

        default:
          // DETECTAR SOLICITUDES DE LISTA DE CATEGORÍAS
          if (await this.esSolicitudListaCategorias(messageText)) {
            await this.mostrarListaCategorias(from, customerName)
            this.setConversationState(from, this.STATES.BROWSING)
            return
          }

          // DETECTAR SOLICITUDES DE CATEGORÍAS ESPECÍFICAS
          const categoriaDetectada = await this.detectarSolicitudCategoria(messageText)
          if (categoriaDetectada) {
            await this.handleCategoryRequest(from, messageText, customerName, categoriaDetectada)
            this.setConversationState(from, this.STATES.BROWSING)
            return
          }

          // Respuesta general con contexto
          await this.handleGeneralResponse(from, messageText, customerName, products, currentState, recentHistory)
          break
      }
    } catch (error) {
      console.error('Error procesando intención:', error)
      await this.sendMessage(from, 'Disculpa, tuve un problema. ¿Podrías repetir tu mensaje? 🤖')
    }
  }

  // Métodos para manejar diferentes tipos de respuesta
  async handleShowProducts(from, customerName, products, recentHistory) {
    try {
      // Obtener productos destacados
      const productosDestacados = await this.inventory.getDestacados()

      if (productosDestacados.length > 0) {
        // Generar saludo personalizado según historial del cliente
        const introMessage = await this.generatePersonalizedGreeting(from, customerName)
        await this.sendMessage(from, introMessage)
        this.addToHistory(from, 'assistant', introMessage)

        // Enviar cada producto destacado con su imagen (máximo 5)
        const productosAMostrar = productosDestacados.slice(0, 5)
        for (const product of productosAMostrar) {
          await this.sendProductWithImage(from, product)
          // Pequeña pausa entre productos para no saturar
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

        // Sugerir categorías para más opciones
        await this.sugerirCategorias(from, customerName)
      } else {
        // Fallback: si no hay productos destacados, mostrar algunos productos normales
        const productosLimitados = products.slice(0, 3)
        const introMessage = `¡Hola ${customerName}! 😊 Aquí tienes algunos de nuestros productos disponibles:`
        await this.sendMessage(from, introMessage)
        this.addToHistory(from, 'assistant', introMessage)

        for (const product of productosLimitados) {
          await this.sendProductWithImage(from, product)
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

        await this.sugerirCategorias(from, customerName)
      }
    } catch (error) {
      console.error('Error mostrando productos:', error)
      // Fallback en caso de error
      const response = await this.gemini.generateSalesResponse(
        'Muestra productos disponibles',
        customerName,
        products,
        this.STATES.INITIAL,
        recentHistory
      )
      await this.sendMessage(from, response)
      this.addToHistory(from, 'assistant', response)
    }
  }

  // 🔐 MÉTODOS ADMINISTRATIVOS

  // Verificar si un estado es administrativo
  isAdminState(state) {
    const adminStates = [
      this.STATES.ADMIN_AUTH,
      this.STATES.ADMIN_MENU,
      this.STATES.ADMIN_ADD_PRODUCT,
      this.STATES.ADMIN_UPDATE_PRODUCT,
      this.STATES.ADMIN_UPDATE_STOCK,
      this.STATES.ADMIN_QUERY_STATS,
      this.STATES.ADMIN_LIST_PRODUCTS
    ]
    return adminStates.includes(state)
  }

  // Detectar frases de activación del modo administrativo
  isAdminModeActivation(messageText) {
    const text = messageText.toLowerCase().trim()
    const activationPhrases = [
      'modo admin',
      'modo administrador',
      'administrar',
      'panel admin',
      'acceso admin',
      'gestión admin',
      'admin mode',
      'administración'
    ]

    return activationPhrases.some(phrase => text.includes(phrase))
  }

  // Detectar frases de desactivación del modo administrativo
  isAdminModeDeactivation(messageText) {
    const text = messageText.toLowerCase().trim()
    const deactivationPhrases = [
      'salir admin',
      'modo ventas',
      'volver ventas',
      'salir administración',
      'modo cliente',
      'exit admin',
      'cerrar admin',
      'finalizar admin'
    ]

    return deactivationPhrases.some(phrase => text.includes(phrase))
  }

  // Detectar comandos administrativos directos
  isDirectAdminCommand(text) {
    const directCommands = [
      'crear producto',
      'nuevo producto',
      'agregar producto',
      'actualizar stock',
      'cambiar precio',
      'modificar producto',
      'actualizar producto',
      'estadísticas',
      'ventas hoy',
      'reporte ventas',
      'inventario bajo',
      'productos agotados',
      'listar productos',
      'ver productos',
      'salir admin',
      'salir del panel',
      'cerrar admin',
      'modo ventas',
      'volver ventas'
    ]

    return directCommands.some(command => text.includes(command))
  }

  // Procesar comandos administrativos directos
  async processDirectAdminCommand(from, text, conversationData) {
    try {
      console.log(`🔐 Procesando comando directo: ${text}`)

      if (text.includes('crear producto') || text.includes('nuevo producto') || text.includes('agregar producto')) {
        // Ir directamente a creación de producto
        await this.sendMessage(from,
          `📝 *Crear Nuevo Producto*\n\n` +
          `Vamos a crear un nuevo producto paso a paso.\n\n` +
          `Paso 1/6: Envía el *nombre* del producto:`
        )
        this.setConversationState(from, this.STATES.ADMIN_ADD_PRODUCT, {
          ...conversationData,
          admin_step: 'name',
          product_data: {}
        })

      } else if (text.includes('estadísticas') || text.includes('ventas hoy') || text.includes('reporte ventas')) {
        // Ir directamente a estadísticas
        await this.handleAdminQueryStats(from, 'menu', conversationData)

      } else if (text.includes('listar productos') || text.includes('ver productos')) {
        // Ir directamente a listado
        await this.handleAdminListProducts(from, 'all', conversationData)

      } else if (text.includes('actualizar stock')) {
        // Ir directamente a actualización de stock
        await this.sendMessage(from,
          `📦 *Actualizar Stock*\n\n` +
          `Envía el *ID* o *nombre* del producto para actualizar su stock:`
        )
        this.setConversationState(from, this.STATES.ADMIN_UPDATE_STOCK, {
          ...conversationData,
          admin_step: 'search'
        })

      } else if (text.includes('modificar producto') || text.includes('cambiar precio') || text.includes('actualizar producto')) {
        // Ir directamente a actualización de producto
        await this.sendMessage(from,
          `✏️ *Actualizar Producto*\n\n` +
          `Envía el *ID* o *nombre* del producto que deseas actualizar:`
        )
        this.setConversationState(from, this.STATES.ADMIN_UPDATE_PRODUCT, {
          ...conversationData,
          admin_step: 'search'
        })

      } else if (text.includes('salir admin') || text.includes('salir del panel') || text.includes('cerrar admin') ||
                 text.includes('modo ventas') || text.includes('volver ventas')) {
        // Salir del modo administrativo
        await this.handleAdminModeDeactivation(from, await this.getCustomerName(from))

      } else {
        // Comando no reconocido, mostrar menú
        await this.sendMessage(from,
          `❓ Comando no reconocido: "${text}"\n\n` +
          `Aquí tienes el menú de opciones:`
        )
        await this.showAdminMenu(from, await this.getCustomerName(from))
      }

    } catch (error) {
      console.error('Error procesando comando directo:', error)
      await this.sendMessage(from, '❌ Error procesando comando.')
      await this.showAdminMenu(from, await this.getCustomerName(from))
    }
  }

  // Manejar activación del modo administrativo
  async handleAdminModeActivation(from, messageText, customerName) {
    try {
      console.log(`🔐 Activación de modo administrativo solicitada por ${customerName}: ${messageText}`)

      // Verificar si el sistema administrativo está habilitado
      const adminEnabled = await this.db.getConfig('admin_system_enabled')
      if (adminEnabled !== 'true') {
        await this.sendMessage(from, '❌ El sistema administrativo está deshabilitado.')
        return
      }

      // Verificar si ya tiene una sesión administrativa activa
      const activeSession = await this.db.getActiveAdminSession(from)
      if (activeSession) {
        // Ya está autenticado, ir al menú
        await this.sendMessage(from,
          `🔐 *Modo Administrativo Activado*\n\n` +
          `Ya tienes una sesión activa.\n` +
          `Bienvenido de vuelta al panel administrativo.`
        )
        await this.showAdminMenu(from, customerName)
        this.setConversationState(from, this.STATES.ADMIN_MENU)
        return
      }

      // Solicitar código de autorización con mensaje personalizado
      await this.sendMessage(from,
        `🔐 *Activando Modo Administrativo*\n\n` +
        `Hola ${customerName || 'Administrador'}, para acceder al modo administrativo necesito verificar tu identidad.\n\n` +
        `Por favor, envía tu código de autorización:\n\n` +
        `⚠️ *Importante:* Solo personal autorizado puede acceder a estas funciones.`
      )

      this.setConversationState(from, this.STATES.ADMIN_AUTH, {
        admin_command: messageText,
        admin_attempts: 0,
        activation_mode: true
      })

    } catch (error) {
      console.error('Error activando modo administrativo:', error)
      await this.sendMessage(from, '❌ Error activando modo administrativo.')
    }
  }

  // Manejar desactivación del modo administrativo
  async handleAdminModeDeactivation(from, customerName) {
    try {
      console.log(`🔐 Desactivación de modo administrativo solicitada por ${customerName}`)

      // Cerrar sesión administrativa si existe
      const conversationData = this.getConversationData(from)
      if (conversationData && conversationData.admin_session_id) {
        await this.db.closeAdminSession(conversationData.admin_session_id)
      }

      // Volver al modo de ventas
      await this.sendMessage(from,
        `👋 *Modo Administrativo Desactivado*\n\n` +
        `Has salido del panel administrativo.\n` +
        `Volviendo al modo de ventas... 🛒\n\n` +
        `¡Hola ${customerName || 'cliente'}! ¿En qué puedo ayudarte hoy?`
      )

      this.setConversationState(from, this.STATES.BROWSING)

    } catch (error) {
      console.error('Error desactivando modo administrativo:', error)
      await this.sendMessage(from, '❌ Error desactivando modo administrativo.')
    }
  }

  // Manejar comando administrativo inicial
  async handleAdminCommand(from, messageText, customerName) {
    try {
      console.log(`🔐 Comando administrativo detectado de ${customerName}: ${messageText}`)

      // Verificar si el sistema administrativo está habilitado
      const adminEnabled = await this.db.getConfig('admin_system_enabled')
      if (adminEnabled !== 'true') {
        await this.sendMessage(from, '❌ El sistema administrativo está deshabilitado.')
        return
      }

      // Verificar si ya tiene una sesión administrativa activa
      const activeSession = await this.db.getActiveAdminSession(from)
      if (activeSession) {
        // Ya está autenticado, ir al menú
        await this.showAdminMenu(from, customerName)
        this.setConversationState(from, this.STATES.ADMIN_MENU)
        return
      }

      // Solicitar código de autorización
      await this.sendMessage(from,
        `🔐 *Acceso Administrativo*\n\n` +
        `Para acceder a las funciones administrativas, envía tu código de autorización:\n\n` +
        `⚠️ *Importante:* Solo personal autorizado puede acceder a estas funciones.`
      )

      this.setConversationState(from, this.STATES.ADMIN_AUTH, {
        admin_command: messageText,
        admin_attempts: 0
      })

    } catch (error) {
      console.error('Error manejando comando administrativo:', error)
      await this.sendMessage(from, '❌ Error procesando comando administrativo.')
    }
  }

  // Procesar estados administrativos
  async processAdminState(from, messageText, currentState, conversationData) {
    try {
      switch (currentState) {
        case this.STATES.ADMIN_AUTH:
          await this.handleAdminAuth(from, messageText, conversationData)
          break

        case this.STATES.ADMIN_MENU:
          await this.handleAdminMenuSelection(from, messageText, conversationData)
          break

        case this.STATES.ADMIN_ADD_PRODUCT:
          await this.handleAdminAddProduct(from, messageText, conversationData)
          break

        case this.STATES.ADMIN_UPDATE_PRODUCT:
          await this.handleAdminUpdateProduct(from, messageText, conversationData)
          break

        case this.STATES.ADMIN_UPDATE_STOCK:
          await this.handleAdminUpdateStock(from, messageText, conversationData)
          break

        case this.STATES.ADMIN_QUERY_STATS:
          await this.handleAdminQueryStats(from, messageText, conversationData)
          break

        case this.STATES.ADMIN_LIST_PRODUCTS:
          await this.handleAdminListProducts(from, messageText, conversationData)
          break

        default:
          console.log(`⚠️ Estado administrativo no manejado: ${currentState}`)
          await this.sendMessage(from, '❌ Estado administrativo no válido.')
          this.setConversationState(from, this.STATES.INITIAL)
      }
    } catch (error) {
      console.error('Error procesando estado administrativo:', error)
      await this.sendMessage(from, '❌ Error en operación administrativa.')
      this.setConversationState(from, this.STATES.INITIAL)
    }
  }

  // 🎯 NUEVO MÉTODO: Manejar recomendaciones específicas inteligentes
  async handleRecommendSpecificProducts(from, messageText, customerName, products, recentHistory) {
    try {
      console.log(`🎯 INICIANDO recomendaciones específicas para: ${customerName}`)

      // Usar el filtrado inteligente de productos
      const productFilter = this.gemini.filterProductsBySpecifications(products, recentHistory, messageText)

      if (productFilter.filteredProducts.length > 0) {
        console.log(`🎯 Productos filtrados encontrados: ${productFilter.filteredProducts.length}`)

        // 🎯 MEJORA: Detectar si es una recomendación específica de UN solo producto
        const isSpecificRecommendation = this.detectSpecificRecommendation(messageText, recentHistory)
        let productsToRecommend = productFilter.filteredProducts

        if (isSpecificRecommendation) {
          // Si es recomendación específica, usar solo el producto más relevante
          productsToRecommend = [productFilter.filteredProducts[0]]
          console.log(`🎯 RECOMENDACIÓN ESPECÍFICA detectada - usando solo: ${productsToRecommend[0].nombre}`)
        }

        // Generar respuesta con productos específicamente recomendados
        const response = await this.gemini.generateSalesResponse(
          `Cliente busca recomendación específica: "${messageText}". RECOMIENDA ESPECÍFICAMENTE estos productos filtrados que son ideales para su situación.`,
          customerName,
          productsToRecommend, // Usar productos filtrados (1 o varios según el contexto)
          this.STATES.INTERESTED,
          recentHistory
        )

        await this.sendMessage(from, response)
        this.addToHistory(from, 'assistant', response)

        // 🎯 MEJORA: Enviar imágenes según el tipo de recomendación
        const topProducts = isSpecificRecommendation ?
          [productsToRecommend[0]] : // Solo 1 producto si es recomendación específica
          productsToRecommend.slice(0, 3) // Hasta 3 productos si es recomendación general

        for (let i = 0; i < topProducts.length; i++) {
          const product = topProducts[i]
          await new Promise(resolve => setTimeout(resolve, 2000)) // Delay entre imágenes
          await this.sendTyping(from)

          const productMessage = `*${product.nombre}* - S/ ${product.precio}\n📋 ${product.descripcion}\n✨ ${product.reasons.join(', ')}`
          await this.sendProductWithImage(from, product, productMessage)
        }

        // Guardar productos recomendados en el contexto
        this.setConversationState(from, this.STATES.INTERESTED, {
          ...this.getConversationData(from),
          interested_products: productsToRecommend.map(p => ({
            id: p.id,
            name: p.nombre
          })),
          last_recommendation: {
            message: messageText,
            products: productsToRecommend.map(p => p.nombre),
            timestamp: Date.now(),
            isSpecific: isSpecificRecommendation
          }
        })

      } else {
        console.log(`🎯 No se encontraron productos específicos, usando recomendación general`)

        // Fallback: usar respuesta general con todos los productos
        const response = await this.gemini.generateSalesResponse(
          `Cliente busca recomendación: "${messageText}". Recomienda productos del inventario que mejor se adapten a su necesidad.`,
          customerName,
          products,
          this.STATES.INTERESTED,
          recentHistory
        )

        await this.sendMessage(from, response)
        this.addToHistory(from, 'assistant', response)
      }

    } catch (error) {
      console.error('Error en recomendaciones específicas:', error)

      // Fallback en caso de error
      const response = await this.gemini.generateSalesResponse(
        `Cliente busca recomendación: "${messageText}". Ayúdalo a encontrar el producto ideal.`,
        customerName,
        products,
        this.STATES.INTERESTED,
        recentHistory
      )
      await this.sendMessage(from, response)
      this.addToHistory(from, 'assistant', response)
    }
  }

  // 🎯 NUEVO MÉTODO: Detectar si es una recomendación específica de un solo producto
  detectSpecificRecommendation(messageText, recentHistory) {
    const message = messageText.toLowerCase()
    const recentMessages = recentHistory.slice(-3).map(h => h.message.toLowerCase()).join(' ')

    // Palabras clave que indican recomendación específica
    const specificKeywords = [
      'te recomiendo',
      'recomiendo',
      'ideal para',
      'perfecto para',
      'mejor opción',
      'específicamente',
      'en particular',
      'especialmente'
    ]

    // Palabras que indican uso específico (contexto de la conversación)
    const specificUseKeywords = [
      'para piscina',
      'para baño',
      'para cocina',
      'para ventana',
      'para puerta',
      'para seguridad',
      'para privacidad'
    ]

    // Verificar si hay indicadores de recomendación específica
    const hasSpecificRecommendation = specificKeywords.some(keyword =>
      message.includes(keyword) || recentMessages.includes(keyword)
    )

    const hasSpecificUse = specificUseKeywords.some(keyword =>
      message.includes(keyword) || recentMessages.includes(keyword)
    )

    return hasSpecificRecommendation || hasSpecificUse
  }

  // 🔐 MANEJAR AUTENTICACIÓN ADMINISTRATIVA
  async handleAdminAuth(from, messageText, conversationData) {
    try {
      const codigo = messageText.trim().toUpperCase()
      const maxAttempts = parseInt(await this.db.getConfig('admin_max_attempts')) || 3
      const currentAttempts = conversationData.admin_attempts || 0

      console.log(`🔐 Intento de autenticación: ${codigo} (intento ${currentAttempts + 1}/${maxAttempts})`)

      // Validar código
      const validation = await this.db.validateAdminCode(codigo)

      if (validation.valid) {
        // Código válido - crear sesión administrativa
        const sessionId = await this.db.createAdminSession(from, codigo, conversationData.admin_command)

        if (sessionId) {
          await this.sendMessage(from,
            `✅ *Acceso Autorizado*\n\n` +
            `Bienvenido al panel administrativo.\n` +
            `Sesión iniciada correctamente.`
          )

          // Mostrar menú administrativo
          await this.showAdminMenu(from, await this.getCustomerName(from))
          this.setConversationState(from, this.STATES.ADMIN_MENU, {
            admin_session_id: sessionId,
            admin_code: codigo
          })
        } else {
          await this.sendMessage(from, '❌ Error creando sesión administrativa.')
          this.setConversationState(from, this.STATES.INITIAL)
        }

      } else {
        // Código inválido
        const newAttempts = currentAttempts + 1

        if (newAttempts >= maxAttempts) {
          await this.sendMessage(from,
            `❌ *Acceso Denegado*\n\n` +
            `Has excedido el número máximo de intentos (${maxAttempts}).\n` +
            `Acceso bloqueado temporalmente.`
          )
          this.setConversationState(from, this.STATES.INITIAL)
        } else {
          await this.sendMessage(from,
            `❌ Código incorrecto.\n\n` +
            `Intentos restantes: ${maxAttempts - newAttempts}\n` +
            `Envía el código de autorización correcto:`
          )
          this.setConversationState(from, this.STATES.ADMIN_AUTH, {
            ...conversationData,
            admin_attempts: newAttempts
          })
        }

        // Registrar intento fallido
        await this.db.registerFailedAttempt(codigo)
      }

    } catch (error) {
      console.error('Error en autenticación administrativa:', error)
      await this.sendMessage(from, '❌ Error en el proceso de autenticación.')
      this.setConversationState(from, this.STATES.INITIAL)
    }
  }

  // 🔐 MOSTRAR MENÚ ADMINISTRATIVO
  async showAdminMenu(from, customerName) {
    const menuMessage =
      `🔐 *Panel Administrativo Activado*\n` +
      `Hola ${customerName || 'Administrador'}, estás en modo administrativo.\n\n` +
      `Selecciona una opción:\n\n` +
      `1️⃣ *Crear nuevo producto*\n` +
      `2️⃣ *Actualizar producto existente*\n` +
      `3️⃣ *Actualizar stock*\n` +
      `4️⃣ *Consultar estadísticas*\n` +
      `5️⃣ *Listar productos*\n` +
      `6️⃣ *Salir del panel*\n\n` +
      `💡 *Tip:* También puedes escribir comandos directos como:\n` +
      `• "crear producto"\n` +
      `• "estadísticas"\n` +
      `• "salir admin" (para volver al modo ventas)\n\n` +
      `Envía el número de la opción o escribe tu comando:`

    await this.sendMessage(from, menuMessage)
  }

  // 🔐 MANEJAR SELECCIÓN DEL MENÚ ADMINISTRATIVO
  async handleAdminMenuSelection(from, messageText, conversationData) {
    try {
      const option = messageText.trim()
      const lowerText = messageText.toLowerCase().trim()

      // 🔐 PROCESAR COMANDOS DIRECTOS EN MODO ADMIN
      if (this.isDirectAdminCommand(lowerText)) {
        await this.processDirectAdminCommand(from, lowerText, conversationData)
        return
      }

      // 🔐 PROCESAR OPCIONES NUMÉRICAS DEL MENÚ
      switch (option) {
        case '1':
          await this.sendMessage(from,
            `📝 *Crear Nuevo Producto*\n\n` +
            `Vamos a crear un nuevo producto paso a paso.\n\n` +
            `Paso 1/6: Envía el *nombre* del producto:`
          )
          this.setConversationState(from, this.STATES.ADMIN_ADD_PRODUCT, {
            ...conversationData,
            admin_step: 'name',
            product_data: {}
          })
          break

        case '2':
          await this.sendMessage(from,
            `✏️ *Actualizar Producto*\n\n` +
            `Envía el *ID* o *nombre* del producto que deseas actualizar:`
          )
          this.setConversationState(from, this.STATES.ADMIN_UPDATE_PRODUCT, {
            ...conversationData,
            admin_step: 'search'
          })
          break

        case '3':
          await this.sendMessage(from,
            `📦 *Actualizar Stock*\n\n` +
            `Envía el *ID* o *nombre* del producto para actualizar su stock:`
          )
          this.setConversationState(from, this.STATES.ADMIN_UPDATE_STOCK, {
            ...conversationData,
            admin_step: 'search'
          })
          break

        case '4':
          await this.handleAdminQueryStats(from, 'menu', conversationData)
          break

        case '5':
          await this.handleAdminListProducts(from, 'all', conversationData)
          break

        case '6':
          // Cerrar sesión administrativa
          if (conversationData.admin_session_id) {
            await this.db.closeAdminSession(conversationData.admin_session_id)
          }
          await this.sendMessage(from,
            `👋 *Sesión Cerrada*\n\n` +
            `Has salido del panel administrativo.\n` +
            `¡Hasta luego!`
          )
          this.setConversationState(from, this.STATES.INITIAL)
          break

        default:
          await this.sendMessage(from,
            `❌ Opción no válida.\n\n` +
            `Por favor, envía un número del 1 al 6:`
          )
          await this.showAdminMenu(from, await this.getCustomerName(from))
      }

    } catch (error) {
      console.error('Error en selección de menú administrativo:', error)
      await this.sendMessage(from, '❌ Error procesando selección.')
      await this.showAdminMenu(from, await this.getCustomerName(from))
    }
  }

  // 🔐 MANEJAR CREACIÓN DE PRODUCTO
  async handleAdminAddProduct(from, messageText, conversationData) {
    try {
      const step = conversationData.admin_step
      const productData = conversationData.product_data || {}

      switch (step) {
        case 'name':
          productData.nombre = messageText.trim()
          await this.sendMessage(from,
            `✅ Nombre: ${productData.nombre}\n\n` +
            `Paso 2/6: Envía la *descripción* del producto:`
          )
          this.setConversationState(from, this.STATES.ADMIN_ADD_PRODUCT, {
            ...conversationData,
            admin_step: 'description',
            product_data: productData
          })
          break

        case 'description':
          productData.descripcion = messageText.trim()
          await this.sendMessage(from,
            `✅ Descripción: ${productData.descripcion}\n\n` +
            `Paso 3/6: Envía el *precio* del producto (solo número):`
          )
          this.setConversationState(from, this.STATES.ADMIN_ADD_PRODUCT, {
            ...conversationData,
            admin_step: 'price',
            product_data: productData
          })
          break

        case 'price':
          const precio = parseFloat(messageText.trim())
          if (isNaN(precio) || precio <= 0) {
            await this.sendMessage(from,
              `❌ Precio inválido.\n\n` +
              `Envía un número válido mayor a 0:`
            )
            return
          }
          productData.precio = precio
          await this.sendMessage(from,
            `✅ Precio: S/ ${productData.precio}\n\n` +
            `Paso 4/6: Envía el *stock inicial* (solo número):`
          )
          this.setConversationState(from, this.STATES.ADMIN_ADD_PRODUCT, {
            ...conversationData,
            admin_step: 'stock',
            product_data: productData
          })
          break

        case 'stock':
          const stock = parseInt(messageText.trim())
          if (isNaN(stock) || stock < 0) {
            await this.sendMessage(from,
              `❌ Stock inválido.\n\n` +
              `Envía un número válido mayor o igual a 0:`
            )
            return
          }
          productData.stock = stock
          await this.sendMessage(from,
            `✅ Stock: ${productData.stock} unidades\n\n` +
            `Paso 5/6: Envía la *categoría* del producto:`
          )
          this.setConversationState(from, this.STATES.ADMIN_ADD_PRODUCT, {
            ...conversationData,
            admin_step: 'category',
            product_data: productData
          })
          break

        case 'category':
          productData.categoria = messageText.trim()
          await this.sendMessage(from,
            `✅ Categoría: ${productData.categoria}\n\n` +
            `Paso 6/6: Envía la *URL de imagen* del producto (o escribe "sin imagen"):`
          )
          this.setConversationState(from, this.STATES.ADMIN_ADD_PRODUCT, {
            ...conversationData,
            admin_step: 'image',
            product_data: productData
          })
          break

        case 'image':
          productData.imagen_url = messageText.trim().toLowerCase() === 'sin imagen' ? '' : messageText.trim()

          // Mostrar resumen y confirmar
          const resumen =
            `📋 *Resumen del Producto*\n\n` +
            `• *Nombre:* ${productData.nombre}\n` +
            `• *Descripción:* ${productData.descripcion}\n` +
            `• *Precio:* S/ ${productData.precio}\n` +
            `• *Stock:* ${productData.stock} unidades\n` +
            `• *Categoría:* ${productData.categoria}\n` +
            `• *Imagen:* ${productData.imagen_url || 'Sin imagen'}\n\n` +
            `¿Confirmas la creación del producto?\n` +
            `Responde *SI* para confirmar o *NO* para cancelar:`

          await this.sendMessage(from, resumen)
          this.setConversationState(from, this.STATES.ADMIN_ADD_PRODUCT, {
            ...conversationData,
            admin_step: 'confirm',
            product_data: productData
          })
          break

        case 'confirm':
          const response = messageText.trim().toLowerCase()
          if (response === 'si' || response === 'sí') {
            try {
              // Crear el producto
              const newProduct = await this.inventory.addProduct(productData)

              await this.sendMessage(from,
                `✅ *Producto Creado Exitosamente*\n\n` +
                `• *ID:* ${newProduct.id}\n` +
                `• *Nombre:* ${newProduct.nombre}\n` +
                `• *Precio:* S/ ${newProduct.precio}\n\n` +
                `El producto ha sido agregado al inventario.`
              )

              // Volver al menú administrativo
              await this.showAdminMenu(from, await this.getCustomerName(from))
              this.setConversationState(from, this.STATES.ADMIN_MENU, {
                admin_session_id: conversationData.admin_session_id,
                admin_code: conversationData.admin_code
              })

            } catch (error) {
              console.error('Error creando producto:', error)
              await this.sendMessage(from,
                `❌ Error creando el producto: ${error.message}\n\n` +
                `Intenta nuevamente.`
              )
              await this.showAdminMenu(from, await this.getCustomerName(from))
              this.setConversationState(from, this.STATES.ADMIN_MENU, {
                admin_session_id: conversationData.admin_session_id,
                admin_code: conversationData.admin_code
              })
            }
          } else {
            await this.sendMessage(from,
              `❌ Creación de producto cancelada.\n\n` +
              `Volviendo al menú principal...`
            )
            await this.showAdminMenu(from, await this.getCustomerName(from))
            this.setConversationState(from, this.STATES.ADMIN_MENU, {
              admin_session_id: conversationData.admin_session_id,
              admin_code: conversationData.admin_code
            })
          }
          break

        default:
          await this.sendMessage(from, '❌ Estado de creación no válido.')
          await this.showAdminMenu(from, await this.getCustomerName(from))
          this.setConversationState(from, this.STATES.ADMIN_MENU, {
            admin_session_id: conversationData.admin_session_id,
            admin_code: conversationData.admin_code
          })
      }

    } catch (error) {
      console.error('Error en creación de producto:', error)
      await this.sendMessage(from, '❌ Error en el proceso de creación.')
      await this.showAdminMenu(from, await this.getCustomerName(from))
      this.setConversationState(from, this.STATES.ADMIN_MENU, {
        admin_session_id: conversationData.admin_session_id,
        admin_code: conversationData.admin_code
      })
    }
  }

  // 🔐 MANEJAR CONSULTA DE ESTADÍSTICAS
  async handleAdminQueryStats(from, messageText, conversationData) {
    try {
      if (messageText === 'menu') {
        // Mostrar opciones de estadísticas
        const statsMenu =
          `📊 *Consultar Estadísticas*\n\n` +
          `Selecciona el tipo de consulta:\n\n` +
          `1️⃣ *Ventas de hoy*\n` +
          `2️⃣ *Estadísticas generales*\n` +
          `3️⃣ *Productos más vendidos*\n` +
          `4️⃣ *Inventario bajo stock*\n` +
          `5️⃣ *Volver al menú principal*\n\n` +
          `Envía el número de la opción:`

        await this.sendMessage(from, statsMenu)
        this.setConversationState(from, this.STATES.ADMIN_QUERY_STATS, {
          ...conversationData,
          admin_step: 'select'
        })
        return
      }

      // 🔄 MANEJAR RESPUESTA SI/NO DESPUÉS DE MOSTRAR ESTADÍSTICAS
      if (conversationData.admin_step === 'continue') {
        const response = messageText.trim().toLowerCase()

        if (response === 'si' || response === 'sí' || response === 's') {
          // Usuario quiere ver más estadísticas - mostrar menú nuevamente
          await this.handleAdminQueryStats(from, 'menu', conversationData)
          return
        } else if (response === 'no' || response === 'n') {
          // Usuario quiere volver al menú principal
          await this.showAdminMenu(from, await this.getCustomerName(from))
          this.setConversationState(from, this.STATES.ADMIN_MENU, {
            admin_session_id: conversationData.admin_session_id,
            admin_code: conversationData.admin_code
          })
          return
        } else {
          // Respuesta no válida para SI/NO
          await this.sendMessage(from,
            `❌ Respuesta no válida.\n\n` +
            `Responde *SI* para ver el menú de estadísticas o *NO* para volver al panel principal:`
          )
          return
        }
      }

      const option = messageText.trim()
      switch (option) {
        case '1':
          // Ventas de hoy
          const todayStats = await this.sales.getEstadisticasGenerales()
          const ventasHoyMsg =
            `📈 *Ventas de Hoy*\n\n` +
            `• *Ventas:* ${todayStats.ventas_hoy || 0}\n` +
            `• *Ingresos:* S/ ${todayStats.ingresos_hoy || 0}\n\n` +
            `Fecha: ${new Date().toLocaleDateString()}`

          await this.sendMessage(from, ventasHoyMsg)
          break

        case '2':
          // Estadísticas generales
          const generalStats = await this.sales.getEstadisticasGenerales()
          const generalMsg =
            `📊 *Estadísticas Generales*\n\n` +
            `• *Total Clientes:* ${generalStats.total_clientes || 0}\n` +
            `• *Total Ventas:* ${generalStats.total_ventas || 0}\n` +
            `• *Productos Vendidos:* ${generalStats.productos_vendidos || 0}\n` +
            `• *Ingresos Totales:* S/ ${generalStats.ingresos_totales || 0}\n` +
            `• *Venta Promedio:* S/ ${(generalStats.venta_promedio || 0).toFixed(2)}`

          await this.sendMessage(from, generalMsg)
          break

        case '3':
          // Productos más vendidos
          const topProducts = await this.sales.getProductosMasVendidos(null, 5)
          let topMsg = `🏆 *Top 5 Productos Más Vendidos*\n\n`

          if (topProducts.length > 0) {
            topProducts.forEach((product, index) => {
              topMsg += `${index + 1}️⃣ *${product.producto_nombre}*\n`
              topMsg += `   Vendidos: ${product.total_vendido}\n`
              topMsg += `   Ingresos: S/ ${product.total_ingresos}\n\n`
            })
          } else {
            topMsg += `No hay datos de ventas disponibles.`
          }

          await this.sendMessage(from, topMsg)
          break

        case '4':
          // Inventario bajo stock
          const allProducts = await this.inventory.getAllProducts()
          const lowStock = allProducts.filter(p => p.stock <= 5)

          let lowStockMsg = `⚠️ *Productos con Stock Bajo*\n\n`

          if (lowStock.length > 0) {
            lowStock.forEach(product => {
              lowStockMsg += `• *${product.nombre}*\n`
              lowStockMsg += `  Stock: ${product.stock} unidades\n`
              lowStockMsg += `  ID: ${product.id}\n\n`
            })
          } else {
            lowStockMsg += `✅ Todos los productos tienen stock suficiente.`
          }

          await this.sendMessage(from, lowStockMsg)
          break

        case '5':
          // Volver al menú principal
          await this.showAdminMenu(from, await this.getCustomerName(from))
          this.setConversationState(from, this.STATES.ADMIN_MENU, {
            admin_session_id: conversationData.admin_session_id,
            admin_code: conversationData.admin_code
          })
          return

        default:
          await this.sendMessage(from,
            `❌ Opción no válida.\n\n` +
            `Envía un número del 1 al 5:`
          )
          return
      }

      // Después de mostrar estadísticas, preguntar si quiere ver más
      await this.sendMessage(from,
        `¿Deseas consultar otras estadísticas?\n\n` +
        `Responde *SI* para ver el menú o *NO* para volver al panel principal:`
      )

      this.setConversationState(from, this.STATES.ADMIN_QUERY_STATS, {
        ...conversationData,
        admin_step: 'continue'
      })

    } catch (error) {
      console.error('Error consultando estadísticas:', error)
      await this.sendMessage(from, '❌ Error consultando estadísticas.')
      await this.showAdminMenu(from, await this.getCustomerName(from))
      this.setConversationState(from, this.STATES.ADMIN_MENU, {
        admin_session_id: conversationData.admin_session_id,
        admin_code: conversationData.admin_code
      })
    }
  }

  // 🔐 MANEJAR LISTADO DE PRODUCTOS
  async handleAdminListProducts(from, messageText, conversationData) {
    try {
      const products = await this.inventory.getAllProducts()

      if (products.length === 0) {
        await this.sendMessage(from,
          `📦 *Inventario Vacío*\n\n` +
          `No hay productos en el inventario.`
        )
      } else {
        let productList = `📦 *Lista de Productos* (${products.length} productos)\n\n`

        products.forEach((product, index) => {
          productList += `${index + 1}. *${product.nombre}*\n`
          productList += `   ID: ${product.id} | Stock: ${product.stock}\n`
          productList += `   Precio: S/ ${product.precio} | Cat: ${product.categoria}\n\n`

          // Limitar a 10 productos por mensaje para evitar mensajes muy largos
          if ((index + 1) % 10 === 0 && index < products.length - 1) {
            productList += `_Continúa..._`
          }
        })

        await this.sendMessage(from, productList)
      }

      // Volver al menú principal
      await this.sendMessage(from,
        `¿Deseas realizar otra operación?\n\n` +
        `Responde cualquier cosa para volver al menú principal:`
      )

      this.setConversationState(from, this.STATES.ADMIN_MENU, {
        admin_session_id: conversationData.admin_session_id,
        admin_code: conversationData.admin_code
      })

    } catch (error) {
      console.error('Error listando productos:', error)
      await this.sendMessage(from, '❌ Error obteniendo lista de productos.')
      await this.showAdminMenu(from, await this.getCustomerName(from))
      this.setConversationState(from, this.STATES.ADMIN_MENU, {
        admin_session_id: conversationData.admin_session_id,
        admin_code: conversationData.admin_code
      })
    }
  }

  // 🔐 MANEJAR ACTUALIZACIÓN DE PRODUCTO
  async handleAdminUpdateProduct(from, messageText, conversationData) {
    try {
      const step = conversationData.admin_step || 'search'
      const productData = conversationData.product_data || {}

      switch (step) {
        case 'search':
          // Buscar producto por ID o nombre
          const searchTerm = messageText.trim()

          if (searchTerm.toLowerCase() === 'cancelar') {
            await this.sendMessage(from, `❌ *Operación Cancelada*\n\nVolviendo al menú principal...`)
            await this.showAdminMenu(from, await this.getCustomerName(from))
            this.setConversationState(from, this.STATES.ADMIN_MENU, {
              admin_session_id: conversationData.admin_session_id,
              admin_code: conversationData.admin_code
            })
            return
          }

          // Buscar productos que coincidan
          const products = await this.inventory.searchProducts(searchTerm)

          if (products.length === 0) {
            await this.sendMessage(from,
              `❌ *Producto No Encontrado*\n\n` +
              `No se encontró ningún producto con: "${searchTerm}"\n\n` +
              `Intenta con:\n` +
              `• ID del producto (ej: 1, 2, 3)\n` +
              `• Nombre completo o parcial\n` +
              `• Escribe "cancelar" para volver al menú\n\n` +
              `Envía otro término de búsqueda:`
            )
            return
          }

          if (products.length === 1) {
            // Solo un producto encontrado, proceder directamente
            const product = products[0]
            await this.sendMessage(from,
              `✅ *Producto Encontrado*\n\n` +
              `📦 *${product.nombre}*\n` +
              `💰 Precio: S/ ${product.precio}\n` +
              `📊 Stock: ${product.stock} unidades\n` +
              `📝 Descripción: ${product.descripcion}\n` +
              `🏷️ Categoría: ${product.categoria}\n\n` +
              `¿Qué deseas actualizar?\n\n` +
              `1️⃣ Nombre\n` +
              `2️⃣ Precio\n` +
              `3️⃣ Descripción\n` +
              `4️⃣ Categoría\n` +
              `5️⃣ Imagen URL\n` +
              `6️⃣ Cancelar\n\n` +
              `Envía el número de la opción:`
            )

            this.setConversationState(from, this.STATES.ADMIN_UPDATE_PRODUCT, {
              ...conversationData,
              admin_step: 'select_field',
              product_data: { ...product }
            })
          } else {
            // Múltiples productos encontrados
            let productList = `🔍 *Productos Encontrados*\n\n`
            products.slice(0, 10).forEach((product, index) => {
              productList += `${index + 1}️⃣ *${product.nombre}* (ID: ${product.id})\n`
              productList += `   💰 S/ ${product.precio} | 📊 Stock: ${product.stock}\n\n`
            })

            productList += `Envía el *número* del producto que deseas actualizar:`

            await this.sendMessage(from, productList)

            this.setConversationState(from, this.STATES.ADMIN_UPDATE_PRODUCT, {
              ...conversationData,
              admin_step: 'select_product',
              product_data: { search_results: products }
            })
          }
          break

        case 'select_product':
          // Seleccionar producto de la lista
          const productIndex = parseInt(messageText.trim()) - 1
          const searchResults = productData.search_results || []

          if (isNaN(productIndex) || productIndex < 0 || productIndex >= searchResults.length) {
            await this.sendMessage(from,
              `❌ *Selección Inválida*\n\n` +
              `Por favor, envía un número del 1 al ${searchResults.length}:`
            )
            return
          }

          const selectedProduct = searchResults[productIndex]
          await this.sendMessage(from,
            `✅ *Producto Seleccionado*\n\n` +
            `📦 *${selectedProduct.nombre}*\n` +
            `💰 Precio: S/ ${selectedProduct.precio}\n` +
            `📊 Stock: ${selectedProduct.stock} unidades\n` +
            `📝 Descripción: ${selectedProduct.descripcion}\n` +
            `🏷️ Categoría: ${selectedProduct.categoria}\n\n` +
            `¿Qué deseas actualizar?\n\n` +
            `1️⃣ Nombre\n` +
            `2️⃣ Precio\n` +
            `3️⃣ Descripción\n` +
            `4️⃣ Categoría\n` +
            `5️⃣ Imagen URL\n` +
            `6️⃣ Cancelar\n\n` +
            `Envía el número de la opción:`
          )

          this.setConversationState(from, this.STATES.ADMIN_UPDATE_PRODUCT, {
            ...conversationData,
            admin_step: 'select_field',
            product_data: { ...selectedProduct }
          })
          break

        case 'select_field':
          // Seleccionar campo a actualizar
          const fieldOption = messageText.trim()

          switch (fieldOption) {
            case '1':
              await this.sendMessage(from,
                `✏️ *Actualizar Nombre*\n\n` +
                `Nombre actual: *${productData.nombre}*\n\n` +
                `Envía el nuevo nombre del producto:`
              )
              this.setConversationState(from, this.STATES.ADMIN_UPDATE_PRODUCT, {
                ...conversationData,
                admin_step: 'update_name'
              })
              break

            case '2':
              await this.sendMessage(from,
                `💰 *Actualizar Precio*\n\n` +
                `Precio actual: *S/ ${productData.precio}*\n\n` +
                `Envía el nuevo precio (solo el número, ej: 25.50):`
              )
              this.setConversationState(from, this.STATES.ADMIN_UPDATE_PRODUCT, {
                ...conversationData,
                admin_step: 'update_price'
              })
              break

            case '3':
              await this.sendMessage(from,
                `📝 *Actualizar Descripción*\n\n` +
                `Descripción actual: *${productData.descripcion}*\n\n` +
                `Envía la nueva descripción del producto:`
              )
              this.setConversationState(from, this.STATES.ADMIN_UPDATE_PRODUCT, {
                ...conversationData,
                admin_step: 'update_description'
              })
              break

            case '4':
              await this.sendMessage(from,
                `🏷️ *Actualizar Categoría*\n\n` +
                `Categoría actual: *${productData.categoria}*\n\n` +
                `Envía la nueva categoría del producto:`
              )
              this.setConversationState(from, this.STATES.ADMIN_UPDATE_PRODUCT, {
                ...conversationData,
                admin_step: 'update_category'
              })
              break

            case '5':
              await this.sendMessage(from,
                `🖼️ *Actualizar Imagen*\n\n` +
                `URL actual: *${productData.imagen_url || 'Sin imagen'}*\n\n` +
                `Envía la nueva URL de la imagen:`
              )
              this.setConversationState(from, this.STATES.ADMIN_UPDATE_PRODUCT, {
                ...conversationData,
                admin_step: 'update_image'
              })
              break

            case '6':
              await this.sendMessage(from, `❌ *Operación Cancelada*\n\nVolviendo al menú principal...`)
              await this.showAdminMenu(from, await this.getCustomerName(from))
              this.setConversationState(from, this.STATES.ADMIN_MENU, {
                admin_session_id: conversationData.admin_session_id,
                admin_code: conversationData.admin_code
              })
              break

            default:
              await this.sendMessage(from,
                `❌ *Opción Inválida*\n\n` +
                `Por favor, envía un número del 1 al 6:`
              )
          }
          break

        case 'update_name':
          // Actualizar nombre del producto
          const newName = messageText.trim()

          if (newName.length < 3) {
            await this.sendMessage(from,
              `❌ *Nombre Muy Corto*\n\n` +
              `El nombre debe tener al menos 3 caracteres.\n` +
              `Envía un nombre válido:`
            )
            return
          }

          try {
            await this.inventory.updateProduct(productData.id, { nombre: newName })
            await this.sendMessage(from,
              `✅ *Nombre Actualizado*\n\n` +
              `📦 Producto: *${newName}*\n` +
              `✏️ Nombre anterior: ${productData.nombre}\n` +
              `✏️ Nombre nuevo: *${newName}*\n\n` +
              `¡Actualización completada exitosamente!`
            )

            // Volver al menú
            await this.showAdminMenu(from, await this.getCustomerName(from))
            this.setConversationState(from, this.STATES.ADMIN_MENU, {
              admin_session_id: conversationData.admin_session_id,
              admin_code: conversationData.admin_code
            })
          } catch (error) {
            console.error('Error actualizando nombre:', error)
            await this.sendMessage(from, `❌ Error actualizando el nombre del producto.`)
          }
          break

        case 'update_price':
          // Actualizar precio del producto
          const newPrice = parseFloat(messageText.trim())

          if (isNaN(newPrice) || newPrice <= 0) {
            await this.sendMessage(from,
              `❌ *Precio Inválido*\n\n` +
              `El precio debe ser un número mayor a 0.\n` +
              `Ejemplo: 25.50\n\n` +
              `Envía un precio válido:`
            )
            return
          }

          try {
            await this.inventory.updateProduct(productData.id, { precio: newPrice })
            await this.sendMessage(from,
              `✅ *Precio Actualizado*\n\n` +
              `📦 Producto: *${productData.nombre}*\n` +
              `💰 Precio anterior: S/ ${productData.precio}\n` +
              `💰 Precio nuevo: *S/ ${newPrice}*\n\n` +
              `¡Actualización completada exitosamente!`
            )

            // Volver al menú
            await this.showAdminMenu(from, await this.getCustomerName(from))
            this.setConversationState(from, this.STATES.ADMIN_MENU, {
              admin_session_id: conversationData.admin_session_id,
              admin_code: conversationData.admin_code
            })
          } catch (error) {
            console.error('Error actualizando precio:', error)
            await this.sendMessage(from, `❌ Error actualizando el precio del producto.`)
          }
          break

        case 'update_description':
          // Actualizar descripción del producto
          const newDescription = messageText.trim()

          if (newDescription.length < 10) {
            await this.sendMessage(from,
              `❌ *Descripción Muy Corta*\n\n` +
              `La descripción debe tener al menos 10 caracteres.\n` +
              `Envía una descripción más detallada:`
            )
            return
          }

          try {
            await this.inventory.updateProduct(productData.id, { descripcion: newDescription })
            await this.sendMessage(from,
              `✅ *Descripción Actualizada*\n\n` +
              `📦 Producto: *${productData.nombre}*\n` +
              `📝 Descripción anterior: ${productData.descripcion}\n` +
              `📝 Descripción nueva: *${newDescription}*\n\n` +
              `¡Actualización completada exitosamente!`
            )

            // Volver al menú
            await this.showAdminMenu(from, await this.getCustomerName(from))
            this.setConversationState(from, this.STATES.ADMIN_MENU, {
              admin_session_id: conversationData.admin_session_id,
              admin_code: conversationData.admin_code
            })
          } catch (error) {
            console.error('Error actualizando descripción:', error)
            await this.sendMessage(from, `❌ Error actualizando la descripción del producto.`)
          }
          break

        case 'update_category':
          // Actualizar categoría del producto
          const newCategory = messageText.trim()

          if (newCategory.length < 3) {
            await this.sendMessage(from,
              `❌ *Categoría Muy Corta*\n\n` +
              `La categoría debe tener al menos 3 caracteres.\n` +
              `Envía una categoría válida:`
            )
            return
          }

          try {
            await this.inventory.updateProduct(productData.id, { categoria: newCategory })
            await this.sendMessage(from,
              `✅ *Categoría Actualizada*\n\n` +
              `📦 Producto: *${productData.nombre}*\n` +
              `🏷️ Categoría anterior: ${productData.categoria}\n` +
              `🏷️ Categoría nueva: *${newCategory}*\n\n` +
              `¡Actualización completada exitosamente!`
            )

            // Volver al menú
            await this.showAdminMenu(from, await this.getCustomerName(from))
            this.setConversationState(from, this.STATES.ADMIN_MENU, {
              admin_session_id: conversationData.admin_session_id,
              admin_code: conversationData.admin_code
            })
          } catch (error) {
            console.error('Error actualizando categoría:', error)
            await this.sendMessage(from, `❌ Error actualizando la categoría del producto.`)
          }
          break

        case 'update_image':
          // Actualizar imagen del producto
          const newImageUrl = messageText.trim()

          // Validar URL básica
          if (newImageUrl && !newImageUrl.match(/^https?:\/\/.+/)) {
            await this.sendMessage(from,
              `❌ *URL Inválida*\n\n` +
              `La URL debe comenzar con http:// o https://\n` +
              `Ejemplo: https://ejemplo.com/imagen.jpg\n\n` +
              `Envía una URL válida o "sin imagen" para quitar la imagen:`
            )
            return
          }

          try {
            const finalImageUrl = newImageUrl.toLowerCase() === 'sin imagen' ? null : newImageUrl
            await this.inventory.updateProduct(productData.id, { imagen_url: finalImageUrl })

            await this.sendMessage(from,
              `✅ *Imagen Actualizada*\n\n` +
              `📦 Producto: *${productData.nombre}*\n` +
              `🖼️ URL anterior: ${productData.imagen_url || 'Sin imagen'}\n` +
              `🖼️ URL nueva: *${finalImageUrl || 'Sin imagen'}*\n\n` +
              `¡Actualización completada exitosamente!`
            )

            // Volver al menú
            await this.showAdminMenu(from, await this.getCustomerName(from))
            this.setConversationState(from, this.STATES.ADMIN_MENU, {
              admin_session_id: conversationData.admin_session_id,
              admin_code: conversationData.admin_code
            })
          } catch (error) {
            console.error('Error actualizando imagen:', error)
            await this.sendMessage(from, `❌ Error actualizando la imagen del producto.`)
          }
          break

        default:
          await this.sendMessage(from, `❌ Estado no válido. Volviendo al menú principal...`)
          await this.showAdminMenu(from, await this.getCustomerName(from))
          this.setConversationState(from, this.STATES.ADMIN_MENU, {
            admin_session_id: conversationData.admin_session_id,
            admin_code: conversationData.admin_code
          })
      }

    } catch (error) {
      console.error('Error en handleAdminUpdateProduct:', error)
      await this.sendMessage(from, '❌ Error procesando actualización de producto.')
      await this.showAdminMenu(from, await this.getCustomerName(from))
      this.setConversationState(from, this.STATES.ADMIN_MENU, {
        admin_session_id: conversationData.admin_session_id,
        admin_code: conversationData.admin_code
      })
    }
  }

  // 🔐 MANEJAR ACTUALIZACIÓN DE STOCK
  async handleAdminUpdateStock(from, messageText, conversationData) {
    try {
      const step = conversationData.admin_step || 'search'
      const productData = conversationData.product_data || {}

      switch (step) {
        case 'search':
          // Buscar producto por ID o nombre
          const searchTerm = messageText.trim()

          if (searchTerm.toLowerCase() === 'cancelar') {
            await this.sendMessage(from, `❌ *Operación Cancelada*\n\nVolviendo al menú principal...`)
            await this.showAdminMenu(from, await this.getCustomerName(from))
            this.setConversationState(from, this.STATES.ADMIN_MENU, {
              admin_session_id: conversationData.admin_session_id,
              admin_code: conversationData.admin_code
            })
            return
          }

          // Buscar productos que coincidan
          const products = await this.inventory.searchProducts(searchTerm)

          if (products.length === 0) {
            await this.sendMessage(from,
              `❌ *Producto No Encontrado*\n\n` +
              `No se encontró ningún producto con: "${searchTerm}"\n\n` +
              `Intenta con:\n` +
              `• ID del producto (ej: 1, 2, 3)\n` +
              `• Nombre completo o parcial\n` +
              `• Escribe "cancelar" para volver al menú\n\n` +
              `Envía otro término de búsqueda:`
            )
            return
          }

          if (products.length === 1) {
            // Solo un producto encontrado, proceder directamente
            const product = products[0]
            await this.sendMessage(from,
              `✅ *Producto Encontrado*\n\n` +
              `📦 *${product.nombre}*\n` +
              `📊 Stock actual: *${product.stock} unidades*\n` +
              `💰 Precio: S/ ${product.precio}\n` +
              `🏷️ Categoría: ${product.categoria}\n\n` +
              `¿Qué tipo de actualización deseas hacer?\n\n` +
              `1️⃣ Establecer stock exacto\n` +
              `2️⃣ Agregar stock (suma)\n` +
              `3️⃣ Reducir stock (resta)\n` +
              `4️⃣ Cancelar\n\n` +
              `Envía el número de la opción:`
            )

            this.setConversationState(from, this.STATES.ADMIN_UPDATE_STOCK, {
              ...conversationData,
              admin_step: 'select_operation',
              product_data: { ...product }
            })
          } else {
            // Múltiples productos encontrados
            let productList = `🔍 *Productos Encontrados*\n\n`
            products.slice(0, 10).forEach((product, index) => {
              productList += `${index + 1}️⃣ *${product.nombre}* (ID: ${product.id})\n`
              productList += `   📊 Stock: ${product.stock} | 💰 S/ ${product.precio}\n\n`
            })

            productList += `Envía el *número* del producto para actualizar su stock:`

            await this.sendMessage(from, productList)

            this.setConversationState(from, this.STATES.ADMIN_UPDATE_STOCK, {
              ...conversationData,
              admin_step: 'select_product',
              product_data: { search_results: products }
            })
          }
          break

        case 'select_product':
          // Seleccionar producto de la lista
          const productIndex = parseInt(messageText.trim()) - 1
          const searchResults = productData.search_results || []

          if (isNaN(productIndex) || productIndex < 0 || productIndex >= searchResults.length) {
            await this.sendMessage(from,
              `❌ *Selección Inválida*\n\n` +
              `Por favor, envía un número del 1 al ${searchResults.length}:`
            )
            return
          }

          const selectedProduct = searchResults[productIndex]
          await this.sendMessage(from,
            `✅ *Producto Seleccionado*\n\n` +
            `📦 *${selectedProduct.nombre}*\n` +
            `📊 Stock actual: *${selectedProduct.stock} unidades*\n` +
            `💰 Precio: S/ ${selectedProduct.precio}\n` +
            `🏷️ Categoría: ${selectedProduct.categoria}\n\n` +
            `¿Qué tipo de actualización deseas hacer?\n\n` +
            `1️⃣ Establecer stock exacto\n` +
            `2️⃣ Agregar stock (suma)\n` +
            `3️⃣ Reducir stock (resta)\n` +
            `4️⃣ Cancelar\n\n` +
            `Envía el número de la opción:`
          )

          this.setConversationState(from, this.STATES.ADMIN_UPDATE_STOCK, {
            ...conversationData,
            admin_step: 'select_operation',
            product_data: { ...selectedProduct }
          })
          break

        case 'select_operation':
          // Seleccionar tipo de operación
          const operation = messageText.trim()

          switch (operation) {
            case '1':
              await this.sendMessage(from,
                `📊 *Establecer Stock Exacto*\n\n` +
                `📦 Producto: *${productData.name}*\n` +
                `📊 Stock actual: ${productData.stock} unidades\n\n` +
                `Envía la cantidad exacta de stock que deseas establecer:`
              )
              this.setConversationState(from, this.STATES.ADMIN_UPDATE_STOCK, {
                ...conversationData,
                admin_step: 'set_exact',
                operation_type: 'set'
              })
              break

            case '2':
              await this.sendMessage(from,
                `➕ *Agregar Stock*\n\n` +
                `📦 Producto: *${productData.name}*\n` +
                `📊 Stock actual: ${productData.stock} unidades\n\n` +
                `Envía la cantidad que deseas AGREGAR al stock actual:`
              )
              this.setConversationState(from, this.STATES.ADMIN_UPDATE_STOCK, {
                ...conversationData,
                admin_step: 'add_stock',
                operation_type: 'add'
              })
              break

            case '3':
              await this.sendMessage(from,
                `➖ *Reducir Stock*\n\n` +
                `📦 Producto: *${productData.name}*\n` +
                `📊 Stock actual: ${productData.stock} unidades\n\n` +
                `Envía la cantidad que deseas REDUCIR del stock actual:`
              )
              this.setConversationState(from, this.STATES.ADMIN_UPDATE_STOCK, {
                ...conversationData,
                admin_step: 'reduce_stock',
                operation_type: 'reduce'
              })
              break

            case '4':
              await this.sendMessage(from, `❌ *Operación Cancelada*\n\nVolviendo al menú principal...`)
              await this.showAdminMenu(from, await this.getCustomerName(from))
              this.setConversationState(from, this.STATES.ADMIN_MENU, {
                admin_session_id: conversationData.admin_session_id,
                admin_code: conversationData.admin_code
              })
              break

            default:
              await this.sendMessage(from,
                `❌ *Opción Inválida*\n\n` +
                `Por favor, envía un número del 1 al 4:`
              )
          }
          break

        case 'set_exact':
          // Establecer stock exacto
          const exactStock = parseInt(messageText.trim())

          if (isNaN(exactStock) || exactStock < 0) {
            await this.sendMessage(from,
              `❌ *Cantidad Inválida*\n\n` +
              `El stock debe ser un número entero mayor o igual a 0.\n` +
              `Ejemplo: 50\n\n` +
              `Envía una cantidad válida:`
            )
            return
          }

          try {
            await this.inventory.updateProduct(productData.id, { stock: exactStock })
            await this.sendMessage(from,
              `✅ *Stock Actualizado*\n\n` +
              `📦 Producto: *${productData.nombre}*\n` +
              `📊 Stock anterior: ${productData.stock} unidades\n` +
              `📊 Stock nuevo: *${exactStock} unidades*\n\n` +
              `¡Actualización completada exitosamente!`
            )

            // Volver al menú
            await this.showAdminMenu(from, await this.getCustomerName(from))
            this.setConversationState(from, this.STATES.ADMIN_MENU, {
              admin_session_id: conversationData.admin_session_id,
              admin_code: conversationData.admin_code
            })
          } catch (error) {
            console.error('Error actualizando stock:', error)
            await this.sendMessage(from, `❌ Error actualizando el stock del producto.`)
          }
          break

        case 'add_stock':
          // Agregar stock
          const addAmount = parseInt(messageText.trim())

          if (isNaN(addAmount) || addAmount <= 0) {
            await this.sendMessage(from,
              `❌ *Cantidad Inválida*\n\n` +
              `La cantidad a agregar debe ser un número entero mayor a 0.\n` +
              `Ejemplo: 25\n\n` +
              `Envía una cantidad válida:`
            )
            return
          }

          try {
            const newStock = productData.stock + addAmount
            await this.inventory.updateProduct(productData.id, { stock: newStock })
            await this.sendMessage(from,
              `✅ *Stock Agregado*\n\n` +
              `📦 Producto: *${productData.name}*\n` +
              `📊 Stock anterior: ${productData.stock} unidades\n` +
              `➕ Cantidad agregada: ${addAmount} unidades\n` +
              `📊 Stock nuevo: *${newStock} unidades*\n\n` +
              `¡Actualización completada exitosamente!`
            )

            // Volver al menú
            await this.showAdminMenu(from, await this.getCustomerName(from))
            this.setConversationState(from, this.STATES.ADMIN_MENU, {
              admin_session_id: conversationData.admin_session_id,
              admin_code: conversationData.admin_code
            })
          } catch (error) {
            console.error('Error agregando stock:', error)
            await this.sendMessage(from, `❌ Error agregando stock al producto.`)
          }
          break

        case 'reduce_stock':
          // Reducir stock
          const reduceAmount = parseInt(messageText.trim())

          if (isNaN(reduceAmount) || reduceAmount <= 0) {
            await this.sendMessage(from,
              `❌ *Cantidad Inválida*\n\n` +
              `La cantidad a reducir debe ser un número entero mayor a 0.\n` +
              `Ejemplo: 10\n\n` +
              `Envía una cantidad válida:`
            )
            return
          }

          if (reduceAmount > productData.stock) {
            await this.sendMessage(from,
              `❌ *Cantidad Excesiva*\n\n` +
              `No puedes reducir ${reduceAmount} unidades.\n` +
              `Stock actual: ${productData.stock} unidades\n` +
              `Máximo a reducir: ${productData.stock} unidades\n\n` +
              `Envía una cantidad válida:`
            )
            return
          }

          try {
            const newStock = productData.stock - reduceAmount
            await this.inventory.updateProduct(productData.id, { stock: newStock })
            await this.sendMessage(from,
              `✅ *Stock Reducido*\n\n` +
              `📦 Producto: *${productData.name}*\n` +
              `📊 Stock anterior: ${productData.stock} unidades\n` +
              `➖ Cantidad reducida: ${reduceAmount} unidades\n` +
              `📊 Stock nuevo: *${newStock} unidades*\n\n` +
              `¡Actualización completada exitosamente!`
            )

            // Volver al menú
            await this.showAdminMenu(from, await this.getCustomerName(from))
            this.setConversationState(from, this.STATES.ADMIN_MENU, {
              admin_session_id: conversationData.admin_session_id,
              admin_code: conversationData.admin_code
            })
          } catch (error) {
            console.error('Error reduciendo stock:', error)
            await this.sendMessage(from, `❌ Error reduciendo stock del producto.`)
          }
          break

        default:
          await this.sendMessage(from, `❌ Estado no válido. Volviendo al menú principal...`)
          await this.showAdminMenu(from, await this.getCustomerName(from))
          this.setConversationState(from, this.STATES.ADMIN_MENU, {
            admin_session_id: conversationData.admin_session_id,
            admin_code: conversationData.admin_code
          })
      }

    } catch (error) {
      console.error('Error en handleAdminUpdateStock:', error)
      await this.sendMessage(from, '❌ Error procesando actualización de stock.')
      await this.showAdminMenu(from, await this.getCustomerName(from))
      this.setConversationState(from, this.STATES.ADMIN_MENU, {
        admin_session_id: conversationData.admin_session_id,
        admin_code: conversationData.admin_code
      })
    }
  }

  // Sugerir categorías para explorar más productos
  async sugerirCategorias(from, customerName) {
    try {
      const categorias = await this.inventory.getCategories()

      if (categorias.length > 0) {
        const categoriasTexto = categorias.join(', ')
        const sugerenciaMessage = `¿Te interesa algún producto diferente? 🤔

Entre nuestras categorías tenemos: ${categoriasTexto}.

Solo dime algo como "muéstrame deportes" o "qué tienes en electrónica" y te mostraré los productos más populares de esa categoría. 😊`

        await this.sendMessage(from, sugerenciaMessage)
        this.addToHistory(from, 'assistant', sugerenciaMessage)
      } else {
        const closingMessage = `¿Te interesa alguno de estos productos? ¡Dime cuál te llama la atención! 🛍️`
        await this.sendMessage(from, closingMessage)
        this.addToHistory(from, 'assistant', closingMessage)
      }
    } catch (error) {
      console.error('Error sugiriendo categorías:', error)
      const closingMessage = `¿Te interesa alguno de estos productos? ¡Dime cuál te llama la atención! 🛍️`
      await this.sendMessage(from, closingMessage)
      this.addToHistory(from, 'assistant', closingMessage)
    }
  }

  // Manejar solicitudes de categorías específicas
  async handleCategoryRequest(from, messageText, customerName, categoria) {
    try {
      console.log(`🏷️ Cliente solicita categoría: ${categoria}`)

      // Obtener productos de la categoría
      const productosCategoria = await this.inventory.getProductsByCategory(categoria)

      if (productosCategoria.length === 0) {
        const noProductsMessage = `Lo siento, actualmente no tenemos productos disponibles en la categoría "${categoria}". 😔

¿Te gustaría ver nuestros productos destacados o explorar otra categoría?`

        await this.sendMessage(from, noProductsMessage)
        this.addToHistory(from, 'assistant', noProductsMessage)
        return
      }

      // Obtener productos más vendidos de esta categoría (si hay datos de ventas)
      let productosMostrar = productosCategoria

      if (this.sales) {
        try {
          const productosMasVendidos = await this.sales.getProductosMasVendidos(categoria, 5)

          if (productosMasVendidos.length > 0) {
            // Filtrar productos que existen en inventario y ordenar por ventas
            const productosConVentas = []

            for (const vendido of productosMasVendidos) {
              const producto = productosCategoria.find(p => p.id === vendido.producto_id)
              if (producto) {
                productosConVentas.push({
                  ...producto,
                  total_vendido: vendido.total_vendido,
                  total_ingresos: vendido.total_ingresos
                })
              }
            }

            // Agregar productos restantes que no están en el ranking
            const productosRestantes = productosCategoria.filter(p =>
              !productosConVentas.find(pv => pv.id === p.id)
            )

            productosMostrar = [...productosConVentas, ...productosRestantes].slice(0, 5)
          }
        } catch (error) {
          console.error('Error obteniendo productos más vendidos:', error)
          // Usar productos normales si falla
          productosMostrar = productosCategoria.slice(0, 5)
        }
      } else {
        productosMostrar = productosCategoria.slice(0, 5)
      }

      // Enviar mensaje introductorio
      const introMessage = `🏷️ Aquí tienes nuestros productos de ${categoria}${this.sales ? ' (ordenados por popularidad)' : ''}:`
      await this.sendMessage(from, introMessage)
      this.addToHistory(from, 'assistant', introMessage)

      // Enviar productos con imágenes
      for (const product of productosMostrar) {
        let descripcionExtra = ''
        if (product.total_vendido) {
          descripcionExtra = `\n🔥 ¡${product.total_vendido} vendidos! Muy popular`
        }

        await this.sendProductWithImage(from, product, descripcionExtra)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      // Mensaje de cierre
      const closingMessage = `¿Te interesa alguno de estos productos de ${categoria}? ¡Dime cuál te llama la atención! 😊

También puedes preguntarme por otra categoría si quieres explorar más opciones. 🛍️`

      await this.sendMessage(from, closingMessage)
      this.addToHistory(from, 'assistant', closingMessage)

    } catch (error) {
      console.error('Error manejando solicitud de categoría:', error)

      const errorMessage = `Disculpa, tuve un problema buscando productos de ${categoria}. ¿Podrías intentar de nuevo o preguntarme por otra categoría? 😊`
      await this.sendMessage(from, errorMessage)
      this.addToHistory(from, 'assistant', errorMessage)
    }
  }

  async handleAskSpecification(from, messageText, intent, products, customerName, recentHistory) {
    let response;

    if (intent.products_mentioned.length > 0) {
      // Cliente mencionó productos específicos
      const mentionedProducts = intent.products_mentioned

      // 🔍 NUEVA LÓGICA: Diferenciar entre buscar información vs querer comprar
      if (intent.intent === 'seeking_advice') {
        // Cliente busca información/consejo sobre el producto
        if (mentionedProducts.length === 1) {
          const productId = mentionedProducts[0].id
          const product = products.find(p => p.id === productId)

          if (product) {
            // Enviar imagen del producto
            await this.sendProductWithImage(from, product, '')

            // Generar respuesta informativa (no de venta)
            response = await this.gemini.generateSalesResponse(
              `Cliente pregunta sobre ${product.nombre}: "${messageText}". Responde informativamente sobre características, beneficios y utilidad del producto. NO preguntes cantidad ni asumas que quiere comprar.`,
              customerName,
              products,
              this.STATES.INTERESTED,
              recentHistory
            )
          } else {
            // Fallback si no se encuentra el producto
            response = await this.gemini.generateSalesResponse(
              `Cliente busca información sobre: ${mentionedProducts.map(p => p.name).join(', ')}. Mensaje: "${messageText}". Responde informativamente.`,
              customerName,
              products,
              this.STATES.INTERESTED,
              recentHistory
            )
          }
        } else {
          // Múltiples productos mencionados para información
          response = await this.gemini.generateSalesResponse(
            `Cliente busca información sobre múltiples productos: ${mentionedProducts.map(p => p.name).join(', ')}. Mensaje: "${messageText}". Responde informativamente.`,
            customerName,
            products,
            this.STATES.INTERESTED,
            recentHistory
          )
        }

        await this.sendMessage(from, response)

      } else {
        // Cliente quiere especificar para comprar (lógica original)
        if (mentionedProducts.length === 1) {
          // Un solo producto mencionado - mostrar con imagen y preguntar cantidad
          const productId = mentionedProducts[0].id
          const product = products.find(p => p.id === productId)

          if (product) {
            const askQuantityText = `¡Excelente elección! 😊 ¿Cuántas unidades de ${product.nombre} te gustaría?`
            await this.sendProductWithImage(from, product, askQuantityText)
            response = askQuantityText // Para el historial
          } else {
            // Fallback si no se encuentra el producto
            response = await this.gemini.generateSalesResponse(
              `Cliente interesado en: ${mentionedProducts.map(p => p.name).join(', ')}. Pregunta cantidad.`,
              customerName,
              products,
              this.STATES.INTERESTED,
              recentHistory
            )
            await this.sendMessage(from, response)
          }
        } else {
          // Múltiples productos mencionados - usar respuesta tradicional
          response = await this.gemini.generateSalesResponse(
            `Cliente interesado en: ${mentionedProducts.map(p => p.name).join(', ')}. Pregunta cantidad.`,
            customerName,
            products,
            this.STATES.INTERESTED,
            recentHistory
          )
          await this.sendMessage(from, response)
        }
      }
    } else {
      // Respuesta vaga, pedir especificación
      response = await this.gemini.generateSalesResponse(
        `Cliente dijo "${messageText}" pero no especificó producto. Pide que sea más específico.`,
        customerName,
        products,
        this.STATES.BROWSING,
        recentHistory
      )
      await this.sendMessage(from, response)
    }
    this.addToHistory(from, 'assistant', response)
  }

  async handleAskQuantity(from, intent, conversationData, customerName, recentHistory) {
    const products = await this.inventory.getAllProducts()
    const response = await this.gemini.generateSalesResponse(
      `Cliente especificó productos: ${intent.products_mentioned.map(p => p.name).join(', ')}. Pregunta cantidad específica.`,
      customerName,
      products,
      this.STATES.SPECIFYING,
      recentHistory
    )
    await this.sendMessage(from, response)
    this.addToHistory(from, 'assistant', response)
  }

  async handleAskConfirmation(from, intent, conversationData, customerName, overrideProducts = null) {
    const selectedProducts = overrideProducts || intent.products_mentioned
    const quantity = intent.quantity_mentioned || conversationData.quantity || 1

    if (selectedProducts.length > 0) {
      // Buscar productos en inventario para obtener precios exactos
      const products = await this.inventory.getAllProducts()
      const productDetails = selectedProducts.map(sp => {
        const product = products.find(p => p.id === sp.id || p.nombre.toLowerCase().includes(sp.name.toLowerCase()))
        return product ? {
          id: product.id,
          nombre: product.nombre,
          precio: product.precio,
          categoria: product.categoria,
          cantidad: quantity
        } : null
      }).filter(Boolean)

      if (productDetails.length > 0) {
        const total = productDetails.reduce((sum, p) => sum + (p.precio * p.cantidad), 0)

        const confirmationMessage = `¿Confirmas tu pedido? 📋

${productDetails.map(p => `📦 ${p.cantidad}x ${p.nombre} - S/ ${p.precio} c/u`).join('\n')}

💵 Total: S/ ${total.toFixed(2)}

Responde "SÍ CONFIRMO" para procesar tu pedido o "NO" para cancelar.`

        await this.sendMessage(from, confirmationMessage)
        this.addToHistory(from, 'assistant', confirmationMessage)
      }
    }
  }

  async handleProcessOrder(from, conversationData, customerName) {
    try {
      console.log(`🔍 DEBUG handleProcessOrder - conversationData:`, JSON.stringify(conversationData, null, 2))
      const pendingOrder = conversationData.pending_order
      console.log(`🔍 DEBUG pendingOrder:`, JSON.stringify(pendingOrder, null, 2))

      if (pendingOrder && pendingOrder.products && pendingOrder.products.length > 0) {
        // Verificar si ya se procesó este pedido (prevenir duplicados)
        if (conversationData.order_processed) {
          await this.sendMessage(from, 'Tu pedido ya fue procesado anteriormente. ¿En qué más puedo ayudarte? 😊')
          return
        }

        // Crear pedido real
        const products = await this.inventory.getAllProducts()
        const orderProducts = pendingOrder.products.map(sp => {
          const product = products.find(p => p.id === sp.id || p.nombre.toLowerCase().includes(sp.name.toLowerCase()))
          return product ? {
            id: product.id,
            nombre: product.nombre,
            precio: product.precio,
            categoria: product.categoria,
            cantidad: pendingOrder.quantity || 1
          } : null
        }).filter(Boolean)

        if (orderProducts.length > 0) {
          const total = orderProducts.reduce((sum, p) => sum + (p.precio * p.cantidad), 0)

          const orderData = {
            cliente_whatsapp: from,
            cliente_nombre: customerName,
            productos: orderProducts,
            total: total,
            notas: `Pedido confirmado explícitamente por WhatsApp`
          }

          const newOrder = await this.orders.createOrder(orderData)
          console.log(`✅ Pedido creado: ${newOrder.id} para ${from}`)

          // Marcar como procesado para evitar duplicados
          this.setConversationState(from, this.STATES.PAYMENT, {
            ...conversationData,
            order_processed: true,
            order_id: newOrder.id
          })

          // Guardar pedido pendiente para proceso de imagen
          this.pendingOrders.set(from, {
            orderId: newOrder.id,
            total: total,
            customerName: customerName,
            productos: orderProducts
          })

          // Obtener configuración de pago
          const config = await this.db.getAllConfig()

          // Generar mensaje de confirmación con datos de pago
          const confirmationMessage = await this.gemini.generateOrderConfirmation(
            orderProducts,
            total,
            customerName,
            config.yape_number,
            config.yape_account_holder,
            newOrder.id
          )

          await this.sendMessage(from, confirmationMessage)
          this.addToHistory(from, 'assistant', confirmationMessage)

          // NO limpiar estado aquí - mantener para el proceso de pago
        } else {
          console.log(`⚠️ DEBUG: No se encontraron productos válidos en pending_order`)
          await this.sendMessage(from, 'Hubo un problema con tu pedido. ¿Podrías especificar nuevamente qué producto deseas? 🤖')
        }
      } else {
        console.log(`⚠️ DEBUG: No hay pending_order válido. conversationData:`, JSON.stringify(conversationData, null, 2))
        await this.sendMessage(from, 'No encontré un pedido pendiente. ¿Qué producto te interesa? 🤖')
      }
    } catch (error) {
      console.error('Error procesando pedido:', error)
      await this.sendMessage(from, 'Hubo un problema procesando tu pedido. Por favor, intenta nuevamente. 🤖')
      // No limpiar estado en caso de error para permitir reintento
    }
  }

  async handleAskClarification(from, messageText, customerName, recentHistory) {
    const products = await this.inventory.getAllProducts()
    const response = await this.gemini.generateSalesResponse(
      `Cliente dijo "${messageText}" pero no es una confirmación clara. Pide confirmación explícita.`,
      customerName,
      products,
      this.STATES.CONFIRMING,
      recentHistory
    )
    await this.sendMessage(from, response)
    this.addToHistory(from, 'assistant', response)
  }

  // 🚫 NUEVO MÉTODO: Manejar cancelación de pedido
  async handleOrderCancellation(from, customerName) {
    try {
      console.log(`🚫 Procesando cancelación de pedido para: ${customerName}`)

      const response = await this.gemini.generateSalesResponse(
        `SITUACIÓN: El cliente ${customerName} acaba de cancelar su pedido diciendo "No".

        INSTRUCCIONES ESPECÍFICAS:
        - Responde de manera comprensiva y amigable
        - Reconoce que entiende que quiere cancelar el pedido
        - Ofrece ayuda para encontrar otros productos que puedan interesarle
        - Pregunta si hay algo más en lo que puedas ayudar
        - Mantén un tono positivo y servicial
        - NO insistas en el producto cancelado

        EJEMPLO DE RESPUESTA ESPERADA:
        "Entiendo ${customerName} que quieres cancelar el pedido. No hay problema 😊

        Quizás te pueda interesar otro tipo de producto. Si es así, házmelo saber... ¡estaré encantada de atenderte! 🌟

        ¿Hay algo más en lo que te pueda ayudar hoy?"`,
        customerName,
        await this.inventory.getAllProducts(),
        this.STATES.BROWSING,
        this.getRecentHistory(from)
      )

      await this.sendMessage(from, response)
      this.addToHistory(from, 'assistant', response)

    } catch (error) {
      console.error('Error manejando cancelación:', error)

      // Mensaje de fallback mejorado
      await this.sendMessage(from,
        `Entiendo ${customerName} que quieres cancelar el pedido. No hay problema 😊\n\n` +
        `Quizás te pueda interesar otro tipo de producto. Si es así, házmelo saber... ¡estaré encantada de atenderte! 🌟\n\n` +
        `¿Hay algo más en lo que te pueda ayudar hoy?`
      )
      this.addToHistory(from, 'assistant', 'Pedido cancelado - mensaje de fallback')
    }
  }

  async handleFarewell(from, customerName) {
    // Obtener el nombre del negocio desde la configuración
    const businessName = await this.getBusinessName()

    const farewellMessage = `¡Eres bienvenido siempre en ${businessName}! 🏪✨ Las veces que quieras comprar algo estaré dispuesta a atenderte de inmediato. ¡Vuelve pronto ${customerName}, que tengas un bonito día! 😊🌟`

    await this.sendMessage(from, farewellMessage)
    this.addToHistory(from, 'assistant', farewellMessage)
  }

  async handleReturningCustomerGreeting(from, customerName, products) {
    // Obtener productos destacados para cliente recurrente
    const productosDestacados = await this.inventory.getDestacados()

    // Obtener el nombre del negocio desde la configuración
    const businessName = await this.getBusinessName()

    const greetingMessage = `¡Hola de nuevo ${customerName}! 😊 ¡Qué bueno verte de nuevo en ${businessName}! 🌟\n\nVeo que ya tienes experiencia comprando con nosotros. ¿En qué puedo ayudarte hoy?`

    await this.sendMessage(from, greetingMessage)
    this.addToHistory(from, 'assistant', greetingMessage)

    // Mostrar productos destacados después de un breve delay
    if (productosDestacados.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await this.sendTyping(from)

      const productMessage = `Aquí tienes nuestros productos más populares:\n\n${productosDestacados.map(p =>
        `${p.destacado ? '⭐ ' : ''}*${p.nombre}* - S/ ${p.precio}\n📱 ${p.categoria}`
      ).join('\n\n')}\n\n¿Te interesa alguno de estos o prefieres que te muestre algo específico? 🛍️`

      await this.sendMessage(from, productMessage)
      this.addToHistory(from, 'assistant', productMessage)
    }
  }

  async handleGeneralResponse(from, messageText, customerName, products, currentState, recentHistory) {
    const response = await this.gemini.generateSalesResponse(
      messageText,
      customerName,
      products,
      currentState,
      recentHistory
    )
    await this.sendMessage(from, response)
    this.addToHistory(from, 'assistant', response)
  }

  async handleImageMessage(message, from) {
    try {
      // Verificar si hay un pedido pendiente para este cliente
      const pendingOrder = this.pendingOrders.get(from)
      if (!pendingOrder) {
        await this.sendMessage(from,
          'He recibido tu imagen, pero no tienes pedidos pendientes de pago. ¿En qué puedo ayudarte? 😊')
        return
      }

      // Descargar imagen
      console.log('📷 Descargando imagen de captura de pago...')
      const buffer = await this.downloadMediaMessage(message.message.imageMessage)
      const base64Image = buffer.toString('base64')

      console.log('🔍 Enviando imagen a Gemini Vision para validación...')

      // Obtener configuración del titular de cuenta Yape
      const config = await this.orders.db.getAllConfig()
      const accountHolder = config.yape_account_holder || 'Titular no configurado'
      const yapeNumber = config.yape_number || null

      // Validar pago con Gemini Vision
      const validation = await this.gemini.validateYapePayment(
        base64Image,
        pendingOrder.total,
        pendingOrder.customerName,
        accountHolder,
        yapeNumber
      )

      console.log('✅ Validación de Gemini completada:', validation)

      // Post-procesamiento: Validación adicional con lógica mejorada
      const enhancedValidation = await this.enhancePaymentValidation(validation, accountHolder, yapeNumber)
      console.log('🔍 Validación mejorada:', enhancedValidation)

      if (enhancedValidation.valido && (enhancedValidation.confianza === 'alta' || enhancedValidation.confianza === 'media')) {
        if (enhancedValidation.monto_correcto) {
          // Pago exacto - procesar pedido completo
          await this.processValidPayment(from, pendingOrder, enhancedValidation)
        } else if (enhancedValidation.es_pago_parcial) {
          // Pago parcial - solicitar monto restante
          await this.processPartialPayment(from, pendingOrder, enhancedValidation)
        } else if (enhancedValidation.es_pago_excesivo) {
          // Pago excesivo - notificar diferencia
          await this.processExcessivePayment(from, pendingOrder, enhancedValidation)
        } else {
          // Monto incorrecto por otra razón
          await this.sendMessage(from,
            `❌ El monto no coincide. ${enhancedValidation.razon}\n\nPor favor, verifica el monto y envía una nueva captura. 😊`)
        }
      } else {
        // Pago inválido
        await this.sendMessage(from,
          `❌ No pude validar tu pago. ${enhancedValidation.razon}\n\nPor favor, envía una captura clara del pago por Yape. Si necesitas ayuda, escríbeme "ayuda". 😊`)
      }

    } catch (error) {
      console.error('Error procesando imagen:', error)
      await this.sendMessage(from,
        'Hubo un problema procesando tu imagen. ¿Podrías enviarla de nuevo? 📷')
    }
  }

  async processPartialPayment(from, pendingOrder, validation) {
    try {
      // Obtener datos de pago acumulado del estado de conversación
      const conversationData = this.getConversationData(from)
      const paymentData = conversationData.payment_data || {
        total_esperado: pendingOrder.total,
        total_recibido: 0,
        pagos_recibidos: []
      }

      // Extraer monto numérico del string "S/ XX"
      const montoRecibido = parseFloat(validation.monto_detectado.replace('S/', '').trim())

      // DEBUG: Logs para diagnosticar el problema
      console.log('🔍 DEBUG processPartialPayment - Datos iniciales:')
      console.log('  - validation.monto_detectado:', validation.monto_detectado)
      console.log('  - montoRecibido parseado:', montoRecibido)
      console.log('  - pendingOrder.total:', pendingOrder.total)
      console.log('  - paymentData antes:', JSON.stringify(paymentData, null, 2))

      // Agregar este pago al historial
      paymentData.pagos_recibidos.push({
        monto: montoRecibido,
        fecha: validation.fecha_pago,
        operacion: validation.numero_operacion,
        ultimos_digitos: validation.ultimos_digitos
      })

      // Actualizar total recibido
      paymentData.total_recibido += montoRecibido
      paymentData.faltante = paymentData.total_esperado - paymentData.total_recibido

      // DEBUG: Logs después de los cálculos
      console.log('🔍 DEBUG processPartialPayment - Después de cálculos:')
      console.log('  - paymentData.total_esperado:', paymentData.total_esperado)
      console.log('  - paymentData.total_recibido:', paymentData.total_recibido)
      console.log('  - paymentData.faltante:', paymentData.faltante)
      console.log('  - Condición (faltante <= 0):', paymentData.faltante <= 0)

      // Actualizar estado de conversación con datos de pago
      this.setConversationState(from, this.STATES.PAYMENT, {
        ...conversationData,
        payment_data: paymentData
      })

      if (paymentData.faltante <= 0) {
        // Pago completado con este pago parcial
        await this.processValidPayment(from, pendingOrder, validation)
      } else {
        // Aún falta dinero - solicitar el resto
        const mensaje = `¡Gracias! Recibí tu pago de ${validation.monto_detectado} para tu pedido de ${pendingOrder.productos.map(p => p.nombre).join(', ')}.

💰 **Total del pedido**: S/ ${paymentData.total_esperado}
✅ **Total recibido**: S/ ${paymentData.total_recibido}
⏳ **Falta**: S/ ${paymentData.faltante}

Por favor envía el pago del monto restante (S/ ${paymentData.faltante}) para completar tu pedido. 😊

📱 Número Yape: ${await this.getYapeNumber()}
👤 Titular: ${await this.getYapeAccountHolder()}`

        await this.sendMessage(from, mensaje)
        this.addToHistory(from, 'assistant', mensaje)
      }

    } catch (error) {
      console.error('Error procesando pago parcial:', error)
      await this.sendMessage(from, 'Hubo un problema procesando tu pago parcial. ¿Podrías intentar de nuevo? 😊')
    }
  }

  async processExcessivePayment(from, pendingOrder, validation) {
    try {
      const diferencia = validation.diferencia_monto
      const mensaje = `¡Gracias por tu pago de ${validation.monto_detectado}!

💰 **Total del pedido**: S/ ${pendingOrder.total}
✅ **Recibido**: ${validation.monto_detectado}
💸 **Diferencia**: S/ ${diferencia} de más

Tu pedido está confirmado. La diferencia de S/ ${diferencia} será considerada como propina o puedes solicitar la devolución. 😊`

      await this.sendMessage(from, mensaje)
      this.addToHistory(from, 'assistant', mensaje)

      // Procesar como pago válido
      await this.processValidPayment(from, pendingOrder, validation)

    } catch (error) {
      console.error('Error procesando pago excesivo:', error)
      await this.sendMessage(from, 'Hubo un problema procesando tu pago. ¿Podrías intentar de nuevo? 😊')
    }
  }

  async getYapeNumber() {
    try {
      const config = await this.db.getAllConfig()
      return config.yape_number || 'No configurado'
    } catch (error) {
      return 'No disponible'
    }
  }

  async getYapeAccountHolder() {
    try {
      const config = await this.db.getAllConfig()
      return config.yape_account_holder || 'No configurado'
    } catch (error) {
      return 'No disponible'
    }
  }

  // Función para validar nombres considerando el formato limitado de Yape
  validateYapeName(detectedName, configuredName) {
    if (!detectedName || !configuredName) {
      return { isValid: false, reason: 'Nombre detectado o configurado faltante' }
    }

    // Normalizar nombres (quitar acentos, convertir a minúsculas)
    const normalize = (str) => str.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z\s]/g, '')
      .trim()

    const detectedNormalized = normalize(detectedName)
    const configuredNormalized = normalize(configuredName)

    // Si son exactamente iguales, es válido
    if (detectedNormalized === configuredNormalized) {
      return { isValid: true, reason: 'Nombres coinciden exactamente' }
    }

      // Dividir nombres en partes
    const detectedParts = detectedNormalized.split(/\s+/).filter(part => part.length > 0)
    const configuredParts = configuredNormalized.split(/\s+/).filter(part => part.length > 0)

    if (detectedParts.length < 1 || configuredParts.length < 1) {
      return { isValid: false, reason: 'Formato de nombre insuficiente para validación' }
    }

    // Caso especial: solo un nombre detectado (ej: "Ana")
    if (detectedParts.length === 1) {
      const detectedFirstName = detectedParts[0]
      const configuredFirstName = configuredParts[0]

      if (detectedFirstName === configuredFirstName) {
        return {
          isValid: true,
          reason: `Primer nombre "${configuredFirstName}" coincide (formato Yape simplificado)`
        }
      } else {
        return {
          isValid: false,
          reason: `Primer nombre no coincide. Detectado: "${detectedFirstName}", Esperado: "${configuredFirstName}"`
        }
      }
    }

    if (configuredParts.length < 2) {
      return { isValid: false, reason: 'Nombre configurado debe tener al menos nombre y apellido' }
    }

    // Extraer componentes del nombre configurado
    const [primerNombre, segundoNombre, primerApellido, segundoApellido] = configuredParts

    // Extraer componentes del nombre detectado (formato Yape)
    const detectedFirstName = detectedParts[0]
    let detectedFirstSurname = null
    let detectedSecondNameInitial = null
    let detectedSecondSurnameInitial = null

    // Buscar iniciales y apellidos en el nombre detectado
    for (let i = 1; i < detectedParts.length; i++) {
      const part = detectedParts[i]

      if (part.length === 1) {
        // Es una inicial
        if (!detectedSecondNameInitial && segundoNombre && part === segundoNombre.charAt(0)) {
          detectedSecondNameInitial = part
        } else if (!detectedSecondSurnameInitial && segundoApellido && part === segundoApellido.charAt(0)) {
          detectedSecondSurnameInitial = part
        }
      } else {
        // Es un nombre/apellido completo - tomar el primer apellido completo encontrado
        if (!detectedFirstSurname) {
          detectedFirstSurname = part
        }
      }
    }

    // Validar componentes críticos (primer nombre y primer apellido)
    const firstNameMatches = detectedFirstName === primerNombre
    const firstSurnameMatches = detectedFirstSurname === primerApellido

    if (firstNameMatches && firstSurnameMatches) {
      return {
        isValid: true,
        reason: `Primer nombre "${primerNombre}" y primer apellido "${primerApellido}" coinciden (formato Yape)`
      }
    }

    // Si solo coincide el primer nombre pero hay apellidos detectados que no coinciden, es inválido
    if (firstNameMatches && detectedFirstSurname && !firstSurnameMatches) {
      return {
        isValid: false,
        reason: `Primer nombre coincide pero apellido no. Detectado: "${detectedFirstSurname}", Esperado: "${primerApellido}"`
      }
    }

    // Si solo coincide el primer nombre y no hay apellido visible, es parcialmente válido
    if (firstNameMatches && !detectedFirstSurname) {
      return {
        isValid: true,
        reason: `Primer nombre "${primerNombre}" coincide, apellido no visible en formato Yape`
      }
    }

    return {
      isValid: false,
      reason: `Primer nombre o apellido no coinciden. Detectado: "${detectedName}", Configurado: "${configuredName}"`
    }
  }

  // Función para mejorar la validación de pagos con lógica adicional
  async enhancePaymentValidation(geminiValidation, configuredAccountHolder, configuredYapeNumber) {
    try {
      // Crear copia de la validación original
      const enhanced = { ...geminiValidation }

      // Validar nombre con lógica mejorada
      if (geminiValidation.titular_detectado && configuredAccountHolder) {
        const nameValidation = this.validateYapeName(
          geminiValidation.titular_detectado,
          configuredAccountHolder
        )

        // Actualizar titular_correcto basado en nuestra lógica mejorada
        enhanced.titular_correcto = nameValidation.isValid

        // Agregar información adicional a la razón
        if (nameValidation.isValid && !geminiValidation.titular_correcto) {
          enhanced.razon = `${geminiValidation.razon} | ✅ Validación mejorada de nombre: ${nameValidation.reason}`
        } else if (!nameValidation.isValid && geminiValidation.titular_correcto) {
          enhanced.razon = `${geminiValidation.razon} | ⚠️ Validación mejorada de nombre: ${nameValidation.reason}`
        }
      }

      // Validar últimos 3 dígitos con lógica mejorada
      if (configuredYapeNumber && geminiValidation.ultimos_digitos) {
        const expectedLastDigits = configuredYapeNumber.slice(-3)
        const detectedLastDigits = geminiValidation.ultimos_digitos

        const digitsMatch = expectedLastDigits === detectedLastDigits
        enhanced.ultimos_digitos_correctos = digitsMatch

        // Agregar información sobre los dígitos a la razón
        if (!digitsMatch) {
          const digitInfo = `⚠️ Últimos 3 dígitos no coinciden: esperado "${expectedLastDigits}", detectado "${detectedLastDigits}"`
          enhanced.razon = enhanced.razon ? `${enhanced.razon} | ${digitInfo}` : digitInfo

          // Si los dígitos no coinciden, marcar como inválido
          enhanced.valido = false
          enhanced.confianza = 'baja'
        } else {
          const digitInfo = `✅ Últimos 3 dígitos coinciden: ${expectedLastDigits}`
          enhanced.razon = enhanced.razon ? `${enhanced.razon} | ${digitInfo}` : digitInfo
        }
      }

      // Validación final: debe tener nombre correcto Y dígitos correctos para ser completamente válido
      if (enhanced.valido) {
        const nameOk = enhanced.titular_correcto
        const digitsOk = enhanced.ultimos_digitos_correctos !== false // true o undefined (si no se validó)

        if (!nameOk || !digitsOk) {
          enhanced.valido = false
          enhanced.confianza = 'baja'

          const issues = []
          if (!nameOk) issues.push('titular no coincide')
          if (!digitsOk) issues.push('últimos 3 dígitos no coinciden')

          enhanced.razon = `${enhanced.razon} | ❌ Validación fallida: ${issues.join(', ')}`
        }
      }

      return enhanced

    } catch (error) {
      console.error('Error en validación mejorada:', error)
      // En caso de error, devolver la validación original
      return geminiValidation
    }
  }

  async createPendingOrder(from, orderData, customerName) {
    try {
      // Validar stock
      const stockErrors = await this.orders.validateOrderStock(orderData.productos, this.inventory)

      if (stockErrors.length > 0) {
        await this.sendMessage(from,
          `❌ Lo siento, hay problemas con el stock:\n\n${stockErrors.join('\n')}\n\n¿Te gustaría modificar tu pedido? 😊`)
        return
      }

      // Crear pedido en base de datos
      const order = await this.orders.createOrder({
        cliente_whatsapp: from,
        cliente_nombre: customerName,
        productos: orderData.productos,
        total: orderData.total,
        notas: 'Pedido creado desde WhatsApp'
      })

      // Guardar pedido pendiente en memoria
      this.pendingOrders.set(from, {
        orderId: order.id,
        total: orderData.total,
        customerName: customerName,
        productos: orderData.productos
      })

      // Obtener configuración de pago
      const config = await this.orders.db.getAllConfig()
      const yapeNumber = config.yape_number || '987654321'
      const accountHolder = config.yape_account_holder || 'Titular no configurado'

      // Generar mensaje de confirmación
      const confirmationMessage = await this.gemini.generateOrderConfirmation(
        orderData.productos,
        orderData.total,
        customerName,
        yapeNumber,
        accountHolder
      )

      await this.sendMessage(from, confirmationMessage)

      // Notificar al dashboard
      this.io.emit('orders-updated')

    } catch (error) {
      console.error('Error creando pedido pendiente:', error)
      await this.sendMessage(from,
        'Hubo un problema procesando tu pedido. ¿Podrías intentar de nuevo? 😊')
    }
  }

  async processValidPayment(from, pendingOrder, validation) {
    try {
      // Guardar información del comprobante Yape
      await this.orders.db.updateYapePaymentInfo(pendingOrder.orderId, {
        numero_operacion: validation.numero_operacion,
        fecha_pago: validation.fecha_pago,
        ultimos_digitos: validation.ultimos_digitos,
        titular_detectado: validation.titular_detectado
      })

      // Procesar pago y actualizar stock
      const updatedOrder = await this.orders.processOrderPayment(
        pendingOrder.orderId,
        this.inventory,
        this.googleDrive
      )

      // Remover de pedidos pendientes
      this.pendingOrders.delete(from)

      // RESETEAR ESTADO CONVERSACIONAL DESPUÉS DE PAGO COMPLETADO
      // Esto permite que el cliente inicie nuevas conversaciones/pedidos
      this.setConversationState(from, this.STATES.BROWSING, {
        last_completed_order: updatedOrder.id,
        order_completed_at: new Date().toISOString()
      })

      // Enviar confirmación con información detallada
      await this.sendMessage(from,
        `✅ ¡Pago confirmado!\n\nTu pedido #${updatedOrder.id} ha sido procesado exitosamente.\n💰 Monto: ${validation.monto_detectado}\n🔢 Operación: ${validation.numero_operacion}\n📅 Fecha: ${validation.fecha_pago}\n\nTe notificaremos cuando esté listo para envío. ¡Gracias por tu compra! 🎉`)

      // Notificar al dashboard
      this.io.emit('orders-updated')
      this.io.emit('inventory-updated')

    } catch (error) {
      console.error('Error procesando pago válido:', error)
      await this.sendMessage(from,
        'Tu pago es válido, pero hubo un problema procesando el pedido. Nos pondremos en contacto contigo pronto. 😊')
    }
  }

  async sendMessage(to, text) {
    if (!this.isConnected || !this.sock) {
      throw new Error('WhatsApp no está conectado')
    }

    try {
      // Aplicar configuraciones de tiempo de respuesta
      await this.applyResponseTiming(to)

      await this.sock.sendMessage(to, { text })
      console.log(`📤 Mensaje enviado a ${to}`)
    } catch (error) {
      console.error('Error enviando mensaje:', error)
      throw error
    }
  }

  async sendImageMessage(to, imageUrl, caption = '') {
    if (!this.isConnected || !this.sock) {
      throw new Error('WhatsApp no está conectado')
    }

    try {
      // Aplicar configuraciones de tiempo de respuesta
      await this.applyResponseTiming(to)

      // Enviar imagen desde URL
      await this.sock.sendMessage(to, {
        image: { url: imageUrl },
        caption: caption
      })
      console.log(`📷 Imagen enviada a ${to} desde URL: ${imageUrl}`)
    } catch (error) {
      console.error('Error enviando imagen:', error)
      // Si falla el envío de imagen, enviar solo el texto
      await this.sendMessage(to, caption || 'No pude enviar la imagen, pero aquí tienes la información del producto.')
    }
  }

  async sendProductWithImage(to, product, additionalText = '') {
    if (!this.isConnected || !this.sock) {
      throw new Error('WhatsApp no está conectado')
    }

    try {
      const productInfo = `🛍️ *${product.nombre}*\n\n` +
                         `💰 Precio: S/ ${product.precio}\n` +
                         `📦 Stock: ${product.stock} unidades\n` +
                         (product.descripcion ? `📝 ${product.descripcion}\n` : '') +
                         (product.categoria ? `🏷️ Categoría: ${product.categoria}\n` : '') +
                         (additionalText ? `\n${additionalText}` : '')

      // Si tiene imagen, enviarla con la información
      if (product.imagen_url && product.imagen_url.trim() !== '') {
        await this.sendImageMessage(to, product.imagen_url, productInfo)
      } else {
        // Si no tiene imagen, enviar solo el texto
        await this.sendMessage(to, productInfo)
      }
    } catch (error) {
      console.error('Error enviando producto con imagen:', error)
      // Fallback: enviar solo información de texto
      const fallbackText = `🛍️ *${product.nombre}*\n\n` +
                          `💰 Precio: S/ ${product.precio}\n` +
                          `📦 Stock: ${product.stock} unidades`
      await this.sendMessage(to, fallbackText)
    }
  }

  async sendTyping(to) {
    if (!this.isConnected || !this.sock) {
      console.warn('WhatsApp no está conectado, omitiendo indicador de escritura')
      return
    }

    try {
      const typingEnabled = await this.db.getConfig('response_typing_indicator_enabled')

      if (typingEnabled === 'true') {
        await this.sock.sendPresenceUpdate('composing', to)
        console.log(`✍️ Mostrando "escribiendo..." a ${to}`)
      }
    } catch (error) {
      console.error('Error enviando indicador de escritura:', error)
      // Continuar sin indicador si hay error
    }
  }

  async applyResponseTiming(to) {
    try {
      const delayEnabled = await this.db.getConfig('response_delay_enabled')
      const typingEnabled = await this.db.getConfig('response_typing_indicator_enabled')

      if (delayEnabled === 'true') {
        const minDelay = parseInt(await this.db.getConfig('response_delay_min') || '2')
        const maxDelay = parseInt(await this.db.getConfig('response_delay_max') || '5')

        // Calcular retraso aleatorio entre min y max
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay

        console.log(`⏱️ Aplicando retraso de ${delay} segundos`)

        // Mostrar indicador de escritura si está habilitado
        if (typingEnabled === 'true') {
          await this.sock.sendPresenceUpdate('composing', to)
          console.log(`✍️ Mostrando "escribiendo..." a ${to}`)
        }

        // Esperar el tiempo configurado
        await new Promise(resolve => setTimeout(resolve, delay * 1000))

        // Detener indicador de escritura
        if (typingEnabled === 'true') {
          await this.sock.sendPresenceUpdate('paused', to)
        }
      }
    } catch (error) {
      console.error('Error aplicando timing de respuesta:', error)
      // Continuar sin retraso si hay error
    }
  }

  async downloadMediaMessage(message) {
    if (!this.sock) {
      throw new Error('WhatsApp no está conectado')
    }

    try {
      // Usar la API correcta de Baileys para descargar media
      const stream = await downloadContentFromMessage(message, 'image')

      // Convertir stream a buffer
      const chunks = []
      for await (const chunk of stream) {
        chunks.push(chunk)
      }

      const buffer = Buffer.concat(chunks)
      console.log('✅ Imagen descargada exitosamente, tamaño:', buffer.length, 'bytes')
      return buffer
    } catch (error) {
      console.error('Error descargando media:', error)
      throw error
    }
  }

  async getCustomerName(phoneNumber) {
    // Primero verificar si tenemos el nombre guardado en conversationData
    const conversationData = this.getConversationData(phoneNumber)
    if (conversationData && conversationData.customer_name) {
      return conversationData.customer_name
    }

    // Si no, intentar obtener nombre del contacto de WhatsApp
    try {
      const contact = await this.sock?.onWhatsApp(phoneNumber)
      const contactName = contact?.[0]?.notify

      // Si el nombre del contacto es diferente al número, usarlo
      if (contactName && contactName !== phoneNumber.replace('@s.whatsapp.net', '')) {
        return contactName
      }

      // Si no hay nombre del contacto, retornar null para solicitar nombre
      return null
    } catch (error) {
      return null
    }
  }

  // Método para solicitar nombre al cliente (con reconocimiento de clientes recurrentes)
  async askForCustomerName(phoneNumber) {
    // Verificar si es un cliente recurrente
    const clienteInfo = await this.getClienteRecurrenteInfo(phoneNumber)

    if (clienteInfo) {
      // Cliente recurrente - saludo personalizado
      const saludoPersonalizado = await this.generarSaludoPersonalizado(clienteInfo)
      await this.sendMessage(phoneNumber, saludoPersonalizado)

      // Establecer estado con información del cliente
      this.setConversationState(phoneNumber, this.STATES.BROWSING, {
        customer_name: clienteInfo.cliente_nombre,
        cliente_nivel: clienteInfo.nivel_cliente,
        es_recurrente: true
      })
    } else {
      // Cliente nuevo - usar mensaje de bienvenida personalizado
      const welcomeMessage = await this.getWelcomeMessage()

      await this.sendMessage(phoneNumber, welcomeMessage)
      this.setConversationState(phoneNumber, this.STATES.ASKING_NAME)
    }
  }

  // Obtener información de cliente recurrente
  async getClienteRecurrenteInfo(phoneNumber) {
    if (!this.sales) return null

    try {
      return await this.sales.getClienteInfo(phoneNumber)
    } catch (error) {
      console.error('Error obteniendo info de cliente recurrente:', error)
      return null
    }
  }

  // Generar saludo personalizado para cliente recurrente
  async generarSaludoPersonalizado(clienteInfo) {
    const { cliente_nombre, nivel_cliente, total_pedidos, categoria_favorita } = clienteInfo
    const businessName = await this.getBusinessName()

    let emoji = '😊'
    let nivelTexto = ''

    switch (nivel_cliente) {
      case 'VIP':
        emoji = '👑'
        nivelTexto = `¡Nuestro cliente VIP de ${businessName}!`
        break
      case 'Frecuente':
        emoji = '⭐'
        nivelTexto = `¡Uno de nuestros clientes frecuentes de ${businessName}!`
        break
      case 'Recurrente':
        emoji = '🎉'
        nivelTexto = `¡Qué gusto verte de nuevo en ${businessName}!`
        break
      default:
        emoji = '😊'
        nivelTexto = `¡Bienvenido de vuelta a ${businessName}!`
    }

    return `${emoji} ¡Hola ${cliente_nombre}! ${nivelTexto}

Es un placer tenerte aquí nuevamente. Veo que ya tienes ${total_pedidos} ${total_pedidos === 1 ? 'pedido' : 'pedidos'} con nosotros${categoria_favorita ? ` y que te gusta mucho la categoría de ${categoria_favorita}` : ''}.

¿En qué puedo ayudarte hoy? 🛍️`
  }

  // Método para procesar el nombre recibido
  async processReceivedName(phoneNumber, messageText) {
    // Extraer el nombre del mensaje (primera palabra o frase corta)
    const name = messageText.trim().split(' ')[0].replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '')

    if (name && name.length > 1) {
      // Guardar nombre en conversationData
      this.setConversationState(phoneNumber, this.STATES.BROWSING, {
        customer_name: name
      })

      // 🎭 Mensaje de confirmación personalizado usando perfil + categorías
      console.log(`🎭 GENERANDO confirmación personalizada para: ${name}`)

      // Obtener categorías reales del inventario
      const categorias = await this.inventory.getCategories()
      const categoriasTexto = categorias.length > 0 ? categorias.join(', ') : 'productos variados'

      const confirmMessage = await this.gemini.generateSalesResponse(
        `Confirma que recibiste el nombre ${name} del cliente. Dale una bienvenida BREVE y PROFESIONAL mencionando que tienes los mejores productos. Luego menciona las categorías disponibles: ${categoriasTexto}. Pregunta qué le interesa. Máximo 3-4 líneas.`,
        name,
        [], // No necesitamos inventario completo para confirmación
        'asking_name',
        []
      )

      await this.sendMessage(phoneNumber, confirmMessage)
      this.addToHistory(phoneNumber, 'assistant', confirmMessage)
      return name
    } else {
      // Si el nombre no es válido, pedir de nuevo
      const retryMessage = `Disculpa, no pude entender tu nombre correctamente.

¿Podrías decirme solo tu nombre, por favor? Por ejemplo: "María" o "Juan" 😊`

      await this.sendMessage(phoneNumber, retryMessage)
      return null
    }
  }

  async logMessage(phoneNumber, message, type) {
    // Aquí podrías guardar en base de datos para estadísticas
    // Por ahora solo incrementamos el contador
    if (type === 'recibido') {
      this.messageCount++
    }
  }

  getTodayMessagesCount() {
    return this.messageCount
  }

  getConnectionStatus() {
    return this.isConnected ? 'connected' : 'disconnected'
  }

  // Validaciones dinámicas sin hardcodeo
  validateProductMention(message, inventory) {
    const messageLower = message.toLowerCase()
    const mentionedProducts = []

    for (const product of inventory) {
      const productNameLower = product.nombre.toLowerCase()
      const categoryLower = product.categoria?.toLowerCase() || ''

      // Buscar por nombre completo o parcial
      if (messageLower.includes(productNameLower) ||
          productNameLower.includes(messageLower.trim())) {
        mentionedProducts.push({
          id: product.id,
          name: product.nombre,
          price: product.precio,
          confidence: 'high'
        })
      }
      // Buscar por categoría
      else if (categoryLower && messageLower.includes(categoryLower)) {
        mentionedProducts.push({
          id: product.id,
          name: product.nombre,
          price: product.precio,
          confidence: 'medium'
        })
      }
    }

    return mentionedProducts
  }

  validateQuantityMention(message) {
    // Buscar números en el mensaje
    const numberMatches = message.match(/\d+/g)
    if (numberMatches) {
      const quantity = parseInt(numberMatches[0])
      return quantity > 0 && quantity <= 100 ? quantity : 0
    }

    // Buscar palabras que indican cantidad
    const quantityWords = {
      'un': 1, 'una': 1, 'uno': 1,
      'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
      'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10
    }

    const messageLower = message.toLowerCase()
    for (const [word, num] of Object.entries(quantityWords)) {
      if (messageLower.includes(word)) {
        return num
      }
    }

    return 0
  }

  validateExplicitConfirmation(message) {
    const confirmationPhrases = [
      'sí confirmo', 'si confirmo', 'confirmo el pedido', 'confirmo',
      'sí, confirmo', 'si, confirmo', 'acepto el pedido', 'acepto',
      'procede con el pedido', 'procede', 'está bien, confirmo',
      'ok, confirmo', 'dale, confirmo', 'sí, está bien'
    ]

    const messageLower = message.toLowerCase().trim()

    return confirmationPhrases.some(phrase =>
      messageLower === phrase ||
      messageLower.includes(phrase)
    )
  }

  validatePurchaseIntent(message) {
    const purchaseKeywords = [
      'quiero comprar', 'quiero', 'me llevo', 'compro',
      'necesito', 'busco', 'me interesa comprar',
      'quisiera comprar', 'voy a comprar', 'puedo comprar'
    ]

    const messageLower = message.toLowerCase()

    return purchaseKeywords.some(keyword =>
      messageLower.includes(keyword)
    )
  }

  isVagueResponse(message) {
    const vagueResponses = [
      'si', 'sí', 'ok', 'okay', 'bien', 'bueno', 'dale',
      'ya', 'aja', 'ajá', 'mmm', 'uhm', 'claro', 'perfecto'
    ]

    const messageLower = message.toLowerCase().trim()

    return vagueResponses.includes(messageLower) || messageLower.length < 3
  }

  // MÉTODO PARA GENERAR SALUDO PERSONALIZADO SEGÚN HISTORIAL DEL CLIENTE
  async generatePersonalizedGreeting(from, customerName) {
    try {
      const businessName = await this.getBusinessName()

      // Obtener información del cliente desde estadísticas
      const clienteInfo = await this.sales.db.get(
        'SELECT * FROM clientes_recurrentes WHERE cliente_whatsapp = ?',
        [from]
      )

      if (!clienteInfo || clienteInfo.total_compras === 0) {
        // Cliente nuevo - usar perfil personalizado
        console.log(`🎭 GENERANDO saludo personalizado para cliente nuevo: ${customerName}`)
        const personalizedGreeting = await this.gemini.generateSalesResponse(
          `Saluda al cliente nuevo ${customerName} y muestra productos destacados`,
          customerName,
          [], // No necesitamos inventario completo para el saludo
          'initial',
          []
        )
        return personalizedGreeting
      }

      // Cliente recurrente - generar saludo según ranking
      let saludo = `¡Hola de nuevo ${customerName}! 😊`
      let emoji = ''
      let mensaje = ''

      if (clienteInfo.total_compras >= 10) {
        // Cliente VIP (10+ compras)
        emoji = '👑'
        mensaje = `${emoji} ¡Nuestro cliente VIP de ${businessName} está de vuelta! Gracias por tu fidelidad. Te muestro nuestros productos más cotizados:`
      } else if (clienteInfo.total_compras >= 5) {
        // Cliente Frecuente (5-9 compras)
        emoji = '⭐'
        mensaje = `${emoji} ¡Qué gusto verte de nuevo en ${businessName}, cliente estrella! Te muestro nuestros productos más cotizados:`
      } else if (clienteInfo.total_compras >= 2) {
        // Cliente Recurrente (2-4 compras)
        emoji = '🤝'
        mensaje = `${emoji} ¡Bienvenido de vuelta a ${businessName}! Me alegra que regreses. Te muestro nuestros productos más cotizados:`
      } else {
        // Cliente con 1 compra
        emoji = '😊'
        mensaje = `${emoji} ¡Qué bueno verte de nuevo en ${businessName}! Te muestro nuestros productos más cotizados:`
      }

      return `${saludo} ${mensaje}`

    } catch (error) {
      console.error('Error generando saludo personalizado:', error)
      const businessName = await this.getBusinessName()
      return `¡Hola ${customerName}! 😊 Bienvenido a ${businessName}. Te muestro nuestros productos más cotizados:`
    }
  }

  // MÉTODOS PARA FILTROS DE MENSAJES Y CONFIGURACIONES
  async shouldProcessMessage(messageText, currentState, from) {
    try {
      // Verificar horario de atención
      const withinBusinessHours = await this.isWithinBusinessHours(from)
      if (!withinBusinessHours) {
        return false
      }

      // Aplicar filtros de mensajes
      const passesFilters = await this.passesMessageFilters(messageText, currentState)
      return passesFilters

    } catch (error) {
      console.error('Error validando mensaje:', error)
      return true // En caso de error, procesar el mensaje
    }
  }

  // NUEVO MÉTODO: Filtros inteligentes que consideran la intención detectada
  async shouldProcessMessageIntelligent(messageText, currentState, from, intent) {
    try {
      // Verificar horario de atención
      const withinBusinessHours = await this.isWithinBusinessHours(from)
      if (!withinBusinessHours) {
        return false
      }

      // 🔐 EXCEPCIÓN ESPECIAL: Activación de modo administrativo
      if (this.isAdminModeActivation(messageText)) {
        console.log('✅ Mensaje procesado por activación de modo administrativo')
        return true
      }

      // 🔐 EXCEPCIÓN ESPECIAL: Usuario ya en modo administrativo
      if (this.isAdminState(currentState)) {
        console.log('✅ Mensaje procesado por estar en modo administrativo')
        return true
      }

      // 🔐 EXCEPCIÓN ESPECIAL: Comandos administrativos detectados por Gemini
      if (intent && intent.suggested_response_type === 'admin_command') {
        console.log('✅ Mensaje procesado por comando administrativo detectado')
        return true
      }

      // Si Gemini detectó una intención válida con alta confianza, procesar siempre
      if (intent && intent.confidence === 'high' &&
          ['browsing', 'purchase_intent', 'asking_question', 'greeting'].includes(intent.intent)) {
        console.log('✅ Mensaje procesado por intención válida detectada:', intent.intent)
        return true
      }

      // Si hay productos mencionados, procesar siempre
      if (intent && intent.products_mentioned && intent.products_mentioned.length > 0) {
        console.log('✅ Mensaje procesado por productos mencionados')
        return true
      }

      // Para el resto, aplicar filtros normales
      const passesFilters = await this.passesMessageFilters(messageText, currentState)
      return passesFilters

    } catch (error) {
      console.error('Error validando mensaje inteligente:', error)
      return true // En caso de error, procesar el mensaje
    }
  }

  async isWithinBusinessHours(from) {
    try {
      const scheduleEnabled = await this.db.getConfig('schedule_enabled')
      if (scheduleEnabled !== 'true') {
        return true // Si no está habilitado, siempre está dentro del horario
      }

      const now = new Date()
      const currentTime = now.toTimeString().slice(0, 5) // HH:MM format

      const startTime = await this.db.getConfig('schedule_start_time') || '09:00'
      const endTime = await this.db.getConfig('schedule_end_time') || '17:00'

      if (currentTime >= startTime && currentTime <= endTime) {
        return true
      } else {
        // Enviar mensaje automático fuera de horario
        const outOfHoursMessage = await this.db.getConfig('schedule_out_of_hours_message') ||
          'Gracias por contactarnos. Te responderemos en nuestro horario de atención.'

        // Solo enviar si no hemos enviado este mensaje recientemente
        const lastMessage = this.getLastMessage(from)
        if (!lastMessage || lastMessage !== outOfHoursMessage) {
          await this.sendMessage(from, outOfHoursMessage)
          this.addToHistory(from, 'assistant', outOfHoursMessage)
        }

        return false
      }
    } catch (error) {
      console.error('Error verificando horario:', error)
      return true
    }
  }

  async passesMessageFilters(messageText, currentState) {
    try {
      // Si estamos en un estado específico de conversación (no inicial), no aplicar filtros estrictos
      if (currentState !== this.STATES.INITIAL) {
        // Para conversaciones ya establecidas, solo filtrar contenido realmente problemático
        const filterEmojisEnabled = await this.db.getConfig('filter_ignore_emojis_enabled')

        if (filterEmojisEnabled === 'true') {
          if (this.isOnlyEmojisOrStickers(messageText)) {
            console.log('🚫 Mensaje filtrado: solo contiene emojis/stickers')
            return false
          }
        }

        return true // Permitir todos los demás mensajes en conversaciones establecidas
      }

      // Solo para conversaciones nuevas (INITIAL), aplicar filtros estrictos
      const filterGreetingsEnabled = await this.db.getConfig('filter_greetings_only_enabled')
      const filterEmojisEnabled = await this.db.getConfig('filter_ignore_emojis_enabled')

      // Filtro: Solo responder a saludos/preguntas (SOLO para conversaciones nuevas)
      if (filterGreetingsEnabled === 'true') {
        if (!this.isGreetingOrQuestion(messageText)) {
          console.log('🚫 Mensaje filtrado: no es saludo ni pregunta (conversación nueva)')
          return false
        }
      }

      // Filtro: Ignorar mensajes con solo emojis/stickers
      if (filterEmojisEnabled === 'true') {
        if (this.isOnlyEmojisOrStickers(messageText)) {
          console.log('🚫 Mensaje filtrado: solo contiene emojis/stickers')
          return false
        }
      }

      return true
    } catch (error) {
      console.error('Error aplicando filtros:', error)
      return true
    }
  }

  isGreetingOrQuestion(message) {
    const greetings = [
      'hola', 'hello', 'hi', 'buenas', 'buenos días', 'buenas tardes', 'buenas noches',
      'saludos', 'que tal', 'qué tal', 'como estas', 'cómo estás'
    ]

    const questionWords = [
      '?', 'que', 'qué', 'como', 'cómo', 'cuando', 'cuándo', 'donde', 'dónde',
      'por que', 'por qué', 'para que', 'para qué', 'cuanto', 'cuánto',
      'cual', 'cuál', 'quiero', 'necesito', 'busco', 'me interesa'
    ]

    // Palabras que indican solicitud/pregunta (aunque no tengan ?)
    const requestWords = [
      'podrías', 'podrias', 'puedes', 'puedas', 'mostrar', 'mostrarme', 'muestra', 'muestrame',
      'enseñar', 'enseñarme', 'enseña', 'enseñame', 'ver', 'mirar', 'revisar', 'conocer',
      'saber', 'información', 'informacion', 'detalles', 'precio', 'precios',
      'disponible', 'disponibles', 'stock', 'tienes', 'tienen', 'hay',
      'venden', 'vendes', 'ofrecen', 'ofreces', 'manejan', 'manejas',
      'dame', 'dime', 'enviame', 'envíame', 'comprar', 'compro', 'adquirir',
      'conseguir', 'obtener', 'solicitar', 'pedir', 'solicito', 'pido'
    ]

    const messageLower = message.toLowerCase()

    // Verificar saludos
    if (greetings.some(greeting => messageLower.includes(greeting))) {
      return true
    }

    // Verificar palabras de pregunta tradicionales
    if (questionWords.some(question => messageLower.includes(question))) {
      return true
    }

    // Verificar palabras de solicitud/petición (NUEVA LÓGICA)
    if (requestWords.some(request => messageLower.includes(request))) {
      return true
    }

    // Verificar patrones de pregunta sin ? (NUEVA LÓGICA)
    const questionPatterns = [
      /^(me|nos)\s+(puedes|podrias|podrías)/,  // "me puedes", "nos podrías"
      /^(puedes|podrias|podrías)/,             // "puedes mostrar"
      /\b(mostrar|enseñar|ver)\b/,             // contiene "mostrar", "enseñar", "ver"
      /\b(precio|precios|costo|costos)\b/,     // pregunta por precios
      /\b(disponible|disponibles|stock)\b/,    // pregunta por disponibilidad
      /\b(tienes|tienen|hay)\b/                // pregunta por existencia
    ]

    return questionPatterns.some(pattern => pattern.test(messageLower))
  }

  isOnlyEmojisOrStickers(message) {
    // Regex para detectar solo emojis, espacios y caracteres especiales
    const emojiRegex = /^[\s\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]*$/u

    // También considerar mensajes muy cortos sin letras
    const hasLetters = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(message)

    return emojiRegex.test(message) || (!hasLetters && message.trim().length < 3)
  }

  getLastMessage(from) {
    const history = this.conversationHistory.get(from) || []
    const lastAssistantMessage = history.filter(msg => msg.role === 'assistant').pop()
    return lastAssistantMessage ? lastAssistantMessage.content : null
  }

  // Detectar solicitudes de categorías específicas
  async detectarSolicitudCategoria(messageText) {
    try {
      const messageLower = messageText.toLowerCase()

      // Obtener categorías disponibles
      const categorias = await this.inventory.getCategories()

      // Patrones de solicitud de categoría
      const patronesSolicitud = [
        /(?:muestra|enseña|ver|mira|busco|quiero|necesito|tienes|hay)\s*(?:algo\s*(?:de|en))?\s*([a-záéíóúñ]+)/i,
        /(?:que|qué)\s*(?:tienes|hay|vendes|manejas)\s*(?:de|en)?\s*([a-záéíóúñ]+)/i,
        /([a-záéíóúñ]+)\s*(?:por favor|porfavor)?$/i,
        /(?:categoria|categoría)\s*(?:de)?\s*([a-záéíóúñ]+)/i
      ]

      // Buscar coincidencias con patrones
      for (const patron of patronesSolicitud) {
        const match = messageLower.match(patron)
        if (match && match[1]) {
          const palabraClave = match[1].trim()

          // Buscar coincidencia con categorías existentes
          for (const categoria of categorias) {
            const categoriaLower = categoria.toLowerCase()

            // Coincidencia exacta
            if (categoriaLower === palabraClave) {
              return categoria
            }

            // Coincidencia parcial más estricta
            // Solo si la palabra clave tiene al menos 4 caracteres y coincide significativamente
            if (palabraClave.length >= 4) {
              // La categoría contiene la palabra clave completa
              if (categoriaLower.includes(palabraClave)) {
                return categoria
              }
              // La palabra clave contiene la categoría completa (ej: "electronica" contiene "electro")
              if (palabraClave.includes(categoriaLower) && categoriaLower.length >= 4) {
                return categoria
              }
            }

            // Coincidencias específicas para categorías comunes
            if (this.esCategoriaRelacionada(palabraClave, categoriaLower)) {
              return categoria
            }
          }
        }
      }

      return null
    } catch (error) {
      console.error('Error detectando solicitud de categoría:', error)
      return null
    }
  }

  // Verificar si una palabra clave está relacionada con una categoría
  esCategoriaRelacionada(palabraClave, categoria) {
    const relaciones = {
      'ropa': ['moda', 'vestimenta', 'clothing'],
      'zapatos': ['calzado', 'zapatillas', 'deportes'],
      'zapatillas': ['deportes', 'calzado', 'zapatos'],
      'tecnologia': ['electronica', 'electrónica', 'tech'],
      'electronica': ['tecnologia', 'tecnología', 'tech'],
      'casa': ['hogar', 'decoracion', 'decoración'],
      'hogar': ['casa', 'decoracion', 'decoración'],
      'decoracion': ['hogar', 'casa', 'deco'],
      'deporte': ['deportes', 'fitness', 'gym'],
      'deportes': ['deporte', 'fitness', 'gym'],
      'lujo': ['premium', 'exclusivo', 'luxury'],
      'premium': ['lujo', 'exclusivo', 'luxury']
    }

    // Verificar relaciones bidireccionales
    if (relaciones[palabraClave]) {
      return relaciones[palabraClave].includes(categoria)
    }

    // Verificar relaciones inversas
    for (const [key, values] of Object.entries(relaciones)) {
      if (values.includes(palabraClave) && key === categoria) {
        return true
      }
    }

    return false
  }

  // Detectar si el cliente solicita la lista de categorías
  async esSolicitudListaCategorias(messageText) {
    const messageLower = messageText.toLowerCase()

    // Patrones que indican solicitud de lista de categorías
    const patronesListaCategorias = [
      /(?:que|qué)\s*(?:otras?)?\s*categorías?\s*(?:tienes|hay|manejas|vendes)/i,
      /(?:cuales|cuáles)\s*(?:son\s*las\s*)?categorías?\s*(?:tienes|hay|manejas|vendes)/i,
      /(?:muestra|enseña|dime)\s*(?:todas\s*las\s*)?categorías?\s*(?:que\s*tienes|disponibles)/i,
      /(?:lista|listado)\s*(?:de\s*)?categorías?/i,
      /(?:todas\s*las\s*)?categorías?\s*(?:disponibles|que\s*tienes)/i,
      /(?:opciones|alternativas)\s*(?:de\s*categorías?|disponibles)/i
    ]

    return patronesListaCategorias.some(patron => patron.test(messageLower))
  }

  // Mostrar lista completa de categorías
  async mostrarListaCategorias(from, customerName) {
    try {
      console.log(`📋 Mostrando lista de categorías a ${from}`)

      // Obtener todas las categorías disponibles
      const categorias = await this.inventory.getCategories()

      if (!categorias || categorias.length === 0) {
        await this.sendMessage(from, `${customerName}, disculpa pero no tengo categorías disponibles en este momento. 😅`)
        return
      }

      // Crear mensaje con todas las categorías
      let mensaje = `¡Perfecto ${customerName}! 😊\n\n`
      mensaje += `🏪 **Estas son todas nuestras categorías disponibles:**\n\n`

      categorias.forEach((categoria, index) => {
        mensaje += `${index + 1}. 🏷️ **${categoria}**\n`
      })

      mensaje += `\n💡 **¿Cómo funciona?**\n`
      mensaje += `Solo dime el nombre de la categoría que te interesa y te mostraré todos los productos disponibles.\n\n`
      mensaje += `Por ejemplo: *"Muéstrame Electrónica"* o *"Qué tienes en Deportes"*\n\n`
      mensaje += `¿Cuál categoría te llama la atención? 🛍️`

      await this.sendMessage(from, mensaje)

    } catch (error) {
      console.error('Error mostrando lista de categorías:', error)
      await this.sendMessage(from, `${customerName}, disculpa pero hubo un error al cargar las categorías. Por favor intenta de nuevo. 😅`)
    }
  }

  // 🎭 NUEVO MÉTODO: Manejar respuestas emocionales
  async handleEmotionalResponse(from, messageText, intent, customerName, currentState) {
    try {
      console.log(`🎭 MANEJANDO respuesta emocional para ${customerName}: ${intent.emotional_state}`)

      // Verificar si necesita respuesta emocional
      if (!intent.needs_emotional_response) {
        console.log('🎭 No necesita respuesta emocional, usando respuesta general')
        await this.handleGeneralResponse(from, messageText, customerName, [], currentState, [])
        return
      }

      // Generar respuesta emocional empática
      const emotionalResponse = await this.gemini.generateEmotionalResponse(
        messageText,
        customerName,
        intent.emotional_state,
        intent.emotional_keywords || [],
        currentState
      )

      // Enviar respuesta emocional
      await this.sendMessage(from, emotionalResponse)
      this.addToHistory(from, 'assistant', emotionalResponse)

      // 🎯 ESTABLECER ESTADO TEMPORAL EMOTIONAL_SUPPORT
      this.setConversationState(from, this.STATES.EMOTIONAL_SUPPORT, {
        emotional_state: intent.emotional_state,
        emotional_start_time: Date.now(),
        previous_state: currentState,
        emotional_interaction_count: 1
      })

      // ⏰ CONFIGURAR TIMEOUT AUTOMÁTICO (2 minutos)
      this.setEmotionalTimeout(from)

      console.log(`🎭 Cliente ${customerName} en estado emocional: ${intent.emotional_state}`)

    } catch (error) {
      console.error('Error manejando respuesta emocional:', error)
      // Fallback a respuesta general si falla
      await this.handleGeneralResponse(from, messageText, customerName, [], currentState, [])
    }
  }

  // 🎭 Configurar timeout automático para estado emocional
  setEmotionalTimeout(from) {
    // Limpiar timeout existente si existe
    if (this.emotionalTimeouts.has(from)) {
      clearTimeout(this.emotionalTimeouts.get(from))
    }

    // Configurar nuevo timeout de 2 minutos
    const timeout = setTimeout(() => {
      console.log(`⏰ Timeout emocional para ${from} - regresando a BROWSING`)
      this.returnFromEmotionalState(from)
    }, 2 * 60 * 1000) // 2 minutos

    this.emotionalTimeouts.set(from, timeout)
  }

  // 🎭 Regresar del estado emocional a ventas
  async returnFromEmotionalState(from) {
    try {
      const conversationData = this.getConversationData(from)
      const previousState = conversationData.previous_state || this.STATES.BROWSING

      // Limpiar timeout
      if (this.emotionalTimeouts.has(from)) {
        clearTimeout(this.emotionalTimeouts.get(from))
        this.emotionalTimeouts.delete(from)
      }

      // Regresar al estado anterior (generalmente BROWSING)
      this.setConversationState(from, previousState, {
        ...conversationData,
        emotional_state: null,
        emotional_start_time: null,
        previous_state: null,
        emotional_interaction_count: null
      })

      console.log(`🎭 Cliente ${from} regresó de estado emocional a ${previousState}`)

    } catch (error) {
      console.error('Error regresando de estado emocional:', error)
      // Fallback seguro
      this.setConversationState(from, this.STATES.BROWSING)
    }
  }

  // 🎭 Verificar si el cliente está en estado emocional y manejar transición
  async checkEmotionalStateTransition(from, intent, currentState) {
    if (currentState === this.STATES.EMOTIONAL_SUPPORT) {
      const conversationData = this.getConversationData(from)
      const interactionCount = conversationData.emotional_interaction_count || 0

      // Si ya tuvo 2 interacciones emocionales O la nueva intención no es emocional
      if (interactionCount >= 2 || !intent.needs_emotional_response) {
        console.log(`🎭 Transición automática: ${interactionCount >= 2 ? 'máximo alcanzado' : 'intención no emocional'}`)
        await this.returnFromEmotionalState(from)
        return true // Indica que hubo transición
      } else {
        // Incrementar contador de interacciones emocionales
        this.setConversationState(from, this.STATES.EMOTIONAL_SUPPORT, {
          ...conversationData,
          emotional_interaction_count: interactionCount + 1
        })
        return false // Continúa en estado emocional
      }
    }
    return false // No está en estado emocional
  }
}
export default WhatsAppService
