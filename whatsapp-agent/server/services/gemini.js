import { GoogleGenerativeAI } from '@google/generative-ai'

// 🌐 CONFIGURACIÓN DE API KEYS PARA PRODUCCIÓN
// Pool de API Keys para rotación automática - Carga desde variables de entorno
const getApiKeysFromEnv = () => {
  const keys = []

  // Cargar API keys desde variables de entorno
  for (let i = 1; i <= 15; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`]
    if (key && key.trim()) {
      keys.push(key.trim())
    }
  }

  // Fallback a keys hardcodeadas si no hay variables de entorno (desarrollo)
  if (keys.length === 0) {
    console.log('⚠️ No se encontraron API keys en variables de entorno, usando keys por defecto')
    return [
      'AIzaSyAlUIsKYBxfZ4RH3aimq7XBWQtlGcG1fjo', // API Key 1 (original)
      'AIzaSyCFR2kApUeCGSWOf_tkcLe1XH4qgKjDVJ0', // API Key 2
      'AIzaSyBEDtNY0MAWLsHcSn4rObEM_Cp7VdKwDjU', // API Key 3
      'AIzaSyD9zOtMS8Xiymc6AyusRUvhwJh3Xvarssc', // API Key 4
      'AIzaSyCv73IdpI7lkziE6jijFTgbaKOdeKS3Sm4', // API Key 5
      'AIzaSyAPFixQAWKi2M7qDjH1n2QuHH7BeAjyTQ8', // API Key 6
      'AIzaSyCwhRvWvFOfJRMk9qQM2U1fDZaa7_HiB_A', // API Key 7
      'AIzaSyCWQsPEq-D3nJZFdMgsTlxDOweTzPKOTwI', // API Key 8
      'AIzaSyDQdZu9BKU0wthWB5MrLu6jlFqJBjobpPU', // API Key 9
      'AIzaSyDNmqQipY9twB5jLEWrMJHQkKRS0_5bhjw', // API Key 10
      'AIzaSyCpkO5REjtpZhXeMpvIhgh8oY_2X2ABIro', // API Key 11
      'AIzaSyARYabiYzJZ8DfDNJeq8wdjy1T_3UGFAXU', // API Key 12
      'AIzaSyBcYsacd3Ml2wlduHZRzkFzHLtgOcylOhQ', // API Key 13
      'AIzaSyB6vyb1cb7D6u9-ef-y4KZc_8Y82kaWC2M', // API Key 14
      'AIzaSyDKWAZ0FkDd0_5DmGhytiu-lg0mUOdHsXg'  // API Key 15
    ]
  }

  console.log(`✅ Cargadas ${keys.length} API keys desde variables de entorno`)
  return keys
}

const API_KEYS = getApiKeysFromEnv()

// 🎭 PERFILES DE NEGOCIO PREDEFINIDOS
const BUSINESS_PROFILES = {
  general: {
    name: "Representante de Ventas",
    emoji: "🏪",
    greeting_variations: [
      "¡Hola!",
      "¡Buenas!",
      "¡Por supuesto!",
      "¡Perfecto!",
      "¡Excelente pregunta!",
      "¡Claro que sí!",
      "¡Buena elección!",
      "¡Genial!",
      "¡Muy bien!",
      "¡Entendido!"
    ],
    tone: "profesional y amigable",
    vocabulary: ["producto", "artículo", "compra", "servicio"],
    style: "Mantén un tono profesional pero cercano",
    instructions: "Actúa como un representante de ventas profesional y cortés. Usa un lenguaje formal pero amigable. Siempre pregunta el nombre del cliente si no lo conoces.",
    identity_type: "representative" // No es dueño, es representante
  },
  cevicheria: {
    name: "Especialista en Ceviche",
    emoji: "🐟",
    greeting: "amigo/amiga",
    tone: "fresco y apetitoso",
    vocabulary: ["fresquito", "del día", "mariscos", "pescadito", "sabroso", "jugosito"],
    style: "Habla como un especialista en ceviche peruano auténtico, menciona la frescura de los productos del mar",
    instructions: "Eres un especialista en ceviche peruano apasionado. Enfatiza siempre la FRESCURA de tus productos del mar. Usa expresiones como 'fresquito del día', 'recién llegado del puerto'. Menciona que tus ceviches son preparados al momento. Siempre pregunta el nombre del cliente para personalizar el servicio.",
    identity_type: "specialist"
  },
  tecnologia: {
    name: "Especialista en Tecnología",
    emoji: "💻",
    greeting: "amigo/amiga",
    tone: "técnico pero accesible",
    vocabulary: ["especificaciones", "características", "rendimiento", "tecnología", "innovación"],
    style: "Sé técnico pero explica de manera sencilla, enfócate en beneficios",
    instructions: "Eres un especialista en tecnología que sabe explicar conceptos complejos de manera simple. Enfócate en los BENEFICIOS que la tecnología aporta al usuario, no solo en especificaciones técnicas. Usa comparaciones simples. Siempre pregunta el nombre del cliente para brindar asesoría personalizada.",
    identity_type: "specialist"
  },
  deportiva: {
    name: "Especialista Deportivo",
    emoji: "⚽",
    greeting: "campeón/campeona",
    tone: "motivacional y energético",
    vocabulary: ["entrenar", "rendimiento", "superarte", "meta", "logro", "campeón"],
    style: "Sé motivacional y energético, inspira al cliente a alcanzar sus metas",
    instructions: "Eres un especialista deportivo motivacional. INSPIRA al cliente a alcanzar sus metas deportivas. Usa frases motivacionales como 'Vamos campeón', 'Tu puedes lograrlo'. Relaciona cada producto con el logro de objetivos deportivos. Siempre pregunta el nombre del cliente para motivarlo personalmente.",
    identity_type: "specialist"
  },
  postres: {
    name: "Especialista en Postres",
    emoji: "🍰",
    greeting: "dulzura",
    tone: "dulce y tentador",
    vocabulary: ["antojito", "delicioso", "tentador", "dulce", "irresistible", "cremosito"],
    style: "Sé dulce y tentador, haz que los productos suenen irresistibles",
    instructions: "Eres un especialista en postres apasionado que ama endulzar la vida de las personas. Describe los postres de manera SENSORIAL: texturas cremosas, sabores intensos, aromas tentadores. Usa diminutivos cariñosos como 'tortita', 'dulcecito'. Haz que el cliente sienta antojo. Siempre pregunta el nombre del cliente para hacer recomendaciones personalizadas.",
    identity_type: "specialist"
  },
  restaurante: {
    name: "Chef Especialista",
    emoji: "🍽️",
    greeting: "querido cliente",
    tone: "elegante y gastronómico",
    vocabulary: ["platillo", "especialidad", "sabor", "experiencia culinaria", "exquisito"],
    style: "Sé elegante y describe los sabores de manera apetitosa",
    instructions: "Eres un chef especialista experimentado que ama compartir su pasión culinaria. Describe cada platillo como una EXPERIENCIA GASTRONÓMICA: aromas, texturas, combinaciones de sabores. Usa términos culinarios elegantes pero comprensibles. Recomienda maridajes y combinaciones. Siempre pregunta el nombre del cliente para ofrecer recomendaciones personalizadas según sus gustos.",
    identity_type: "specialist"
  },
  farmacia: {
    name: "Farmacéutico Profesional",
    emoji: "💊",
    greeting: "estimado/a",
    tone: "profesional y confiable",
    vocabulary: ["medicamento", "tratamiento", "salud", "bienestar", "cuidado"],
    style: "Mantén un tono profesional y confiable, enfócate en el bienestar",
    instructions: "Eres un farmacéutico profesional comprometido con la salud de las personas. Mantén siempre un tono PROFESIONAL y CONFIABLE. Enfócate en el bienestar del cliente. Nunca des consejos médicos, solo información sobre productos disponibles. Recomienda consultar al médico cuando sea necesario. Siempre pregunta el nombre del cliente para un servicio personalizado.",
    identity_type: "professional"
  },
  personalizado: {
    name: "Representante Personalizado",
    emoji: "✏️",
    greeting: "cliente",
    tone: "adaptable",
    vocabulary: ["producto", "servicio"],
    style: "Adapta tu estilo según las preferencias del usuario",
    instructions: "Adapta tu personalidad según las instrucciones personalizadas del usuario. Siempre pregunta el nombre del cliente sin importar el perfil personalizado configurado.",
    identity_type: "representative"
  }
}

// Modelos a utilizar (en orden de preferencia)
const PRIMARY_MODEL = 'gemini-1.5-flash'
const FALLBACK_MODEL = 'gemini-1.5-flash-8b'

// Gestor de API Keys
class ApiKeyManager {
  constructor() {
    this.apiKeys = API_KEYS
    this.currentIndex = 0
    this.keyStatus = new Map()
    this.keyStats = new Map()

    // Inicializar estado de cada API key
    this.apiKeys.forEach((key, index) => {
      this.keyStatus.set(key, {
        isActive: true,
        isAvailable: true,  // ✅ CRÍTICO: Marcar como disponible por defecto
        lastError: null,
        errorCount: 0,
        lastUsed: null,
        rateLimitUntil: null,
        requestCount: 0,
        successCount: 0
      })
    })

    console.log(`🔑 ApiKeyManager inicializado con ${this.apiKeys.length} API keys`)
  }

  // Obtener la siguiente API key disponible
  getNextApiKey() {
    const startIndex = this.currentIndex
    let attempts = 0

    while (attempts < this.apiKeys.length) {
      const currentKey = this.apiKeys[this.currentIndex]
      const status = this.keyStatus.get(currentKey)

      // Verificar si la API key está disponible
      if (this.isKeyAvailable(currentKey)) {
        console.log(`🔑 Usando API Key ${this.currentIndex + 1}/${this.apiKeys.length}`)
        status.lastUsed = new Date()
        status.requestCount++
        return currentKey
      }

      // Pasar a la siguiente API key
      this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length
      attempts++
    }

    // Si llegamos aquí, todas las API keys están bloqueadas
    console.error('🚨 Todas las API keys están bloqueadas o con rate limit')

    // Resetear rate limits si han pasado más de 1 hora
    this.resetExpiredRateLimits()

    // Devolver la primera API key como último recurso
    return this.apiKeys[0]
  }

  // Verificar si una API key está disponible
  isKeyAvailable(apiKey) {
    const status = this.keyStatus.get(apiKey)

    if (!status.isActive || !status.isAvailable) {
      return false
    }

    // Verificar rate limit
    if (status.rateLimitUntil && new Date() < status.rateLimitUntil) {
      return false
    }

    // Verificar si tiene demasiados errores recientes
    if (status.errorCount > 5) {
      return false
    }

    return true
  }

  // Marcar API key como bloqueada por rate limit
  markRateLimit(apiKey, durationMinutes = 60) {
    const status = this.keyStatus.get(apiKey)
    if (status) {
      status.rateLimitUntil = new Date(Date.now() + durationMinutes * 60 * 1000)
      console.log(`⏰ API Key marcada con rate limit hasta: ${status.rateLimitUntil.toLocaleTimeString()}`)
    }
  }

  // Marcar error en API key
  markError(apiKey, error) {
    const status = this.keyStatus.get(apiKey)
    if (status) {
      status.lastError = error.message
      status.errorCount++

      // Si es error de rate limit, marcar específicamente
      if (error.message.includes('429') || error.message.includes('quota')) {
        this.markRateLimit(apiKey)
      }

      // Si es error 403 (API deshabilitada), marcar como no disponible temporalmente
      else if (error.message.includes('403') || error.message.includes('Forbidden') || error.message.includes('SERVICE_DISABLED')) {
        status.isAvailable = false
        console.log(`🚫 API Key marcada como no disponible (API deshabilitada)`)
      }

      console.log(`❌ Error en API Key: ${error.message}`)
    }
  }

  // Marcar éxito en API key
  markSuccess(apiKey) {
    const status = this.keyStatus.get(apiKey)
    if (status) {
      status.successCount++
      status.errorCount = Math.max(0, status.errorCount - 1) // Reducir contador de errores
      status.isAvailable = true // ✅ Restaurar disponibilidad en caso de éxito
    }
  }

  // Resetear rate limits expirados
  resetExpiredRateLimits() {
    const now = new Date()
    this.keyStatus.forEach((status, key) => {
      if (status.rateLimitUntil && now > status.rateLimitUntil) {
        status.rateLimitUntil = null
        status.errorCount = 0
        status.isAvailable = true // ✅ Restaurar disponibilidad cuando expira rate limit
        console.log(`✅ Rate limit expirado para API Key, reactivando`)
      }
    })
  }

  // Obtener estadísticas de todas las API keys
  getStats() {
    const stats = []
    this.apiKeys.forEach((key, index) => {
      const status = this.keyStatus.get(key)
      stats.push({
        index: index + 1,
        key: key.substring(0, 20) + '...',
        isActive: status.isActive,
        isAvailable: this.isKeyAvailable(key),
        requestCount: status.requestCount,
        successCount: status.successCount,
        errorCount: status.errorCount,
        lastUsed: status.lastUsed,
        rateLimitUntil: status.rateLimitUntil,
        lastError: status.lastError
      })
    })
    return stats
  }
}

export class GeminiService {
  constructor(databaseService = null) {
    // Inicializar el gestor de API keys
    this.apiKeyManager = new ApiKeyManager()
    this.genAI = null // Se inicializará dinámicamente
    this.db = databaseService // Referencia a la base de datos para obtener configuración

    // Configuración de generación optimizada
    this.generationConfig = {
      temperature: 0.7,
      topK: 32,
      topP: 0.95,
      maxOutputTokens: 2048,
    }

    // Configuración de seguridad
    this.safetySettings = [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
    ]

    console.log('🤖 GeminiService inicializado con sistema multi-API key')
  }

  // Obtener instancia de GoogleGenerativeAI con API key actual
  getGeminiInstance() {
    const currentApiKey = this.apiKeyManager.getNextApiKey()
    return new GoogleGenerativeAI(currentApiKey)
  }

  // 🎭 MÉTODO PARA OBTENER PERFIL DE NEGOCIO
  getBusinessProfile(profileKey) {
    return BUSINESS_PROFILES[profileKey] || BUSINESS_PROFILES.general
  }

  // 🎭 MÉTODO PARA OBTENER TODOS LOS PERFILES DISPONIBLES
  getAllBusinessProfiles() {
    return BUSINESS_PROFILES
  }

  // 🧠 MÉTODO PARA CONSTRUIR CONTEXTO CONVERSACIONAL MEJORADO
  buildEnhancedConversationContext(recentHistory, customerName) {
    if (!recentHistory || recentHistory.length === 0) return ''

    // Extraer información clave de la conversación
    const conversationInsights = this.extractConversationInsights(recentHistory, customerName)

    // Construir contexto narrativo
    let contextText = '\n🧠 CONTEXTO CONVERSACIONAL INTELIGENTE:\n'

    // Información del cliente extraída
    if (conversationInsights.customerInfo.length > 0) {
      contextText += `\n📋 INFORMACIÓN DEL CLIENTE ${customerName.toUpperCase()}:\n`
      conversationInsights.customerInfo.forEach(info => {
        contextText += `- ${info}\n`
      })
    }

    // Productos mencionados previamente
    if (conversationInsights.mentionedProducts.length > 0) {
      contextText += `\n🛍️ PRODUCTOS MENCIONADOS ANTERIORMENTE:\n`
      conversationInsights.mentionedProducts.forEach(product => {
        contextText += `- ${product}\n`
      })
    }

    // Preferencias detectadas
    if (conversationInsights.preferences.length > 0) {
      contextText += `\n💡 PREFERENCIAS DETECTADAS:\n`
      conversationInsights.preferences.forEach(pref => {
        contextText += `- ${pref}\n`
      })
    }

    // Historial reciente para referencia
    contextText += `\n💬 ÚLTIMOS INTERCAMBIOS:\n`
    recentHistory.slice(-3).forEach((h, index) => {
      const role = h.role === 'user' ? customerName : 'Tú'
      contextText += `${index + 1}. ${role}: "${h.message}"\n`
    })

    contextText += `\n🎯 INSTRUCCIÓN CLAVE: Usa esta información para crear respuestas más naturales y contextuales. Haz referencia a información previa cuando sea relevante, como si realmente recordaras la conversación.\n`

    return contextText
  }

  // 🎲 MÉTODO PARA SELECCIONAR VARIACIÓN DE SALUDO ALEATORIA
  getRandomGreeting(businessProfile) {
    if (businessProfile.greeting_variations && businessProfile.greeting_variations.length > 0) {
      const randomIndex = Math.floor(Math.random() * businessProfile.greeting_variations.length)
      return businessProfile.greeting_variations[randomIndex]
    }
    // Fallback para perfiles antiguos
    return businessProfile.greeting || "¡Hola!"
  }

  // 🧠 MÉTODO PARA ANALIZAR SI YA TIENE SUFICIENTE INFORMACIÓN DEL CLIENTE
  analyzeCustomerInformationSufficiency(recentHistory, currentMessage) {
    if (!recentHistory || recentHistory.length === 0) return { hasSufficientInfo: false, requirements: [] }

    const customerRequirements = []
    const allMessages = recentHistory.map(h => h.message.toLowerCase()).join(' ') + ' ' + currentMessage.toLowerCase()

    // Detectar información específica del cliente
    const detectedInfo = {
      purpose: false,        // Para qué lo necesita
      location: false,       // Dónde va a usar
      specifications: false, // Características específicas
      preferences: false     // Preferencias del cliente
    }

    // Detectar propósito/uso - MEJORADO
    if (allMessages.includes('ducha') || allMessages.includes('baño') ||
        allMessages.includes('mampara') || allMessages.includes('ventana') ||
        allMessages.includes('puerta') || allMessages.includes('mesa') ||
        allMessages.includes('renovar') || allMessages.includes('cambiar') ||
        allMessages.includes('reemplazar') || allMessages.includes('instalar') ||
        allMessages.includes('necesito') || allMessages.includes('quiero') ||
        allMessages.includes('busco') || allMessages.includes('para')) {
      detectedInfo.purpose = true
      customerRequirements.push('Propósito/uso identificado')
    }

    // Detectar especificaciones técnicas - MEJORADO PARA PRIVACIDAD
    if (allMessages.includes('resistencia') || allMessages.includes('seguridad') ||
        allMessages.includes('transparencia') || allMessages.includes('templado') ||
        allMessages.includes('grosor') || allMessages.includes('medida') ||
        allMessages.includes('privacidad') || allMessages.includes('privado') ||
        allMessages.includes('opaco') || allMessages.includes('esmerilado') ||
        allMessages.includes('transparente') || allMessages.includes('claro') ||
        allMessages.includes('laminado') || allMessages.includes('decorativo') ||
        allMessages.includes('colores') || allMessages.includes('espesor') ||
        allMessages.includes('aislamiento') || allMessages.includes('térmico') ||
        allMessages.includes('acústico') || allMessages.includes('ruido')) {
      detectedInfo.specifications = true
      customerRequirements.push('Especificaciones técnicas mencionadas')
    }

    // Detectar preferencias del cliente - NUEVO
    if (allMessages.includes('económico') || allMessages.includes('barato') ||
        allMessages.includes('calidad') || allMessages.includes('mejor') ||
        allMessages.includes('recomendación') || allMessages.includes('recomiendas') ||
        allMessages.includes('sugieres') || allMessages.includes('aconsejable') ||
        allMessages.includes('recomendarías') || allMessages.includes('ideal')) {
      detectedInfo.preferences = true
      customerRequirements.push('Preferencias del cliente identificadas')
    }

    // Detectar ubicación/contexto
    if (allMessages.includes('jacuzzi') || allMessages.includes('jacuzzy') ||
        allMessages.includes('vapor') || allMessages.includes('agua') ||
        allMessages.includes('humedad') || allMessages.includes('exterior')) {
      detectedInfo.location = true
      customerRequirements.push('Contexto de uso identificado')
    }

    // Determinar si tiene suficiente información - LÓGICA MEJORADA
    const infoCount = Object.values(detectedInfo).filter(Boolean).length
    const hasSufficientInfo = infoCount >= 2 || // Al menos 2 tipos de información
                             (detectedInfo.purpose && detectedInfo.specifications) || // Propósito + especificaciones
                             (detectedInfo.location && detectedInfo.specifications) || // Ubicación + especificaciones
                             (detectedInfo.preferences && detectedInfo.specifications) // Preferencias + especificaciones

    return {
      hasSufficientInfo,
      requirements: customerRequirements,
      detectedInfo,
      infoCount
    }
  }

  // 🎯 MÉTODO PARA FILTRAR PRODUCTOS INTELIGENTEMENTE BASADO EN ESPECIFICACIONES
  filterProductsBySpecifications(inventory, recentHistory, currentMessage) {
    const allMessages = recentHistory.map(h => h.message.toLowerCase()).join(' ') + ' ' + currentMessage.toLowerCase()
    const relevantProducts = []

    // Palabras clave para diferentes tipos de vidrio
    const privacyKeywords = ['privacidad', 'privado', 'opaco', 'esmerilado', 'ocultar', 'intimidad']
    const securityKeywords = ['seguridad', 'resistente', 'templado', 'laminado', 'protección', 'fuerte']
    const decorativeKeywords = ['decorativo', 'colores', 'diseño', 'estético', 'bonito', 'elegante']
    const transparentKeywords = ['transparente', 'claro', 'cristalino', 'ver', 'vista', 'luz']
    const thermalKeywords = ['térmico', 'aislamiento', 'temperatura', 'frío', 'calor', 'energía']
    const acousticKeywords = ['acústico', 'ruido', 'sonido', 'silencio', 'aislante']

    // Analizar qué tipo de especificaciones menciona el cliente
    const clientNeeds = {
      privacy: privacyKeywords.some(keyword => allMessages.includes(keyword)),
      security: securityKeywords.some(keyword => allMessages.includes(keyword)),
      decorative: decorativeKeywords.some(keyword => allMessages.includes(keyword)),
      transparent: transparentKeywords.some(keyword => allMessages.includes(keyword)),
      thermal: thermalKeywords.some(keyword => allMessages.includes(keyword)),
      acoustic: acousticKeywords.some(keyword => allMessages.includes(keyword))
    }

    // Filtrar productos del inventario basándose en las necesidades
    for (const product of inventory) {
      const productName = product.nombre.toLowerCase()
      const productDesc = (product.descripcion || '').toLowerCase()
      const productText = productName + ' ' + productDesc

      let relevanceScore = 0
      let reasons = []

      // Evaluar relevancia para privacidad
      if (clientNeeds.privacy) {
        if (productText.includes('esmerilado') || productText.includes('opaco') ||
            productText.includes('laminado') || productText.includes('privacidad')) {
          relevanceScore += 10
          reasons.push('Ideal para privacidad')
        }
      }

      // Evaluar relevancia para seguridad
      if (clientNeeds.security) {
        if (productText.includes('templado') || productText.includes('laminado') ||
            productText.includes('seguridad') || productText.includes('resistente')) {
          relevanceScore += 8
          reasons.push('Ofrece mayor seguridad')
        }
      }

      // Evaluar relevancia para decoración
      if (clientNeeds.decorative) {
        if (productText.includes('decorativo') || productText.includes('colores') ||
            productText.includes('diseño') || productText.includes('esmerilado')) {
          relevanceScore += 6
          reasons.push('Opción decorativa')
        }
      }

      // Evaluar relevancia para transparencia
      if (clientNeeds.transparent) {
        if (productText.includes('transparente') || productText.includes('claro') ||
            productText.includes('cristal') || productText.includes('simple')) {
          relevanceScore += 7
          reasons.push('Máxima transparencia')
        }
      }

      // Si el producto tiene alguna relevancia, agregarlo
      if (relevanceScore > 0) {
        relevantProducts.push({
          ...product,
          relevanceScore,
          reasons
        })
      }
    }

    // Ordenar por relevancia (mayor score primero)
    relevantProducts.sort((a, b) => b.relevanceScore - a.relevanceScore)

    return {
      filteredProducts: relevantProducts.slice(0, 3), // Top 3 más relevantes
      clientNeeds,
      totalRelevant: relevantProducts.length
    }
  }

  // 🔍 MÉTODO PARA EXTRAER INSIGHTS DE LA CONVERSACIÓN
  extractConversationInsights(recentHistory, customerName) {
    const insights = {
      customerInfo: [],
      mentionedProducts: [],
      preferences: []
    }

    recentHistory.forEach(entry => {
      if (entry.role === 'user') {
        const message = entry.message.toLowerCase()

        // Detectar información personal compartida
        if (message.includes('mi perro') || message.includes('mi perrito')) {
          const petMatch = message.match(/mi perr[oa] se llama (\w+)|mi perr[oa] (\w+)/i)
          if (petMatch) {
            const petName = petMatch[1] || petMatch[2]
            insights.customerInfo.push(`Tiene un perro llamado ${petName}`)
          }
        }

        if (message.includes('vivo en') || message.includes('soy de')) {
          const locationMatch = message.match(/vivo en (\w+)|soy de (\w+)/i)
          if (locationMatch) {
            const location = locationMatch[1] || locationMatch[2]
            insights.customerInfo.push(`Vive en ${location}`)
          }
        }

        // Detectar preferencias
        if (message.includes('me gusta') || message.includes('prefiero')) {
          insights.preferences.push(`Expresó: "${entry.message}"`)
        }

        if (message.includes('privacidad')) {
          insights.preferences.push('Busca productos para privacidad')
        }

        if (message.includes('vidrio') || message.includes('ventana')) {
          insights.mentionedProducts.push('Interesado en vidrios para ventanas')
        }
      }
    })

    return insights
  }

  // 🎭 MÉTODO PARA GENERAR PROMPT PERSONALIZADO SEGÚN PERFIL
  async getPersonalizedPrompt(basePrompt, businessProfile = null) {
    if (!businessProfile) {
      const profileKey = await this.db.getConfig('business_profile') || 'general'
      console.log(`🎭 PERFIL CARGADO DESDE DB: ${profileKey}`)
      businessProfile = this.getBusinessProfile(profileKey)
    }

    // 🆕 OBTENER CONFIGURACIÓN DE IDENTIDAD DEL REPRESENTANTE
    const useRepresentativeIdentity = await this.db.getConfig('use_representative_identity') === 'true'
    const representativeName = await this.db.getConfig('representative_name') || ''
    const representativeRole = await this.db.getConfig('representative_role') || ''

    console.log(`🎭 APLICANDO PERFIL: ${businessProfile.name} ${businessProfile.emoji}`)
    console.log(`🎭 VOCABULARIO: ${businessProfile.vocabulary.join(', ')}`)
    console.log(`🎭 TONO: ${businessProfile.tone}`)

    // Si es perfil personalizado, obtener instrucciones personalizadas
    let customInstructions = ''
    if (businessProfile.name === 'Personalizado') {
      const customProfile = await this.db.getConfig('custom_business_profile')
      console.log(`🎭 PERFIL PERSONALIZADO RAW: ${customProfile}`)
      if (customProfile) {
        try {
          const parsed = JSON.parse(customProfile)

          // 🎯 SOBRESCRIBIR DATOS DEL PERFIL CON LOS PERSONALIZADOS
          if (parsed.name) businessProfile.name = parsed.name
          if (parsed.emoji) businessProfile.emoji = parsed.emoji
          if (parsed.greeting) businessProfile.greeting = parsed.greeting
          if (parsed.tone) businessProfile.tone = parsed.tone
          if (parsed.vocabulary) {
            // Procesar vocabulario personalizado
            if (typeof parsed.vocabulary === 'string') {
              businessProfile.vocabulary = parsed.vocabulary.split(',').map(word => word.trim())
            } else if (Array.isArray(parsed.vocabulary)) {
              businessProfile.vocabulary = parsed.vocabulary
            }
          }

          customInstructions = parsed.instructions || businessProfile.instructions
          console.log(`🎭 PERFIL PERSONALIZADO APLICADO:`)
          console.log(`   - Nombre: ${businessProfile.name}`)
          console.log(`   - Emoji: ${businessProfile.emoji}`)
          console.log(`   - Saludo: ${businessProfile.greeting}`)
          console.log(`   - Tono: ${businessProfile.tone}`)
          console.log(`   - Vocabulario: ${businessProfile.vocabulary.join(', ')}`)
          console.log(`   - Instrucciones: ${customInstructions}`)
        } catch (error) {
          console.error('🚨 Error parseando perfil personalizado:', error)
          customInstructions = businessProfile.instructions
        }
      }
    }

    const personalizedPrompt = `${basePrompt}

🎭 ¡TRANSFORMACIÓN OBLIGATORIA DE PERSONALIDAD!
ERES AHORA UN ${businessProfile.name.toUpperCase()} ${businessProfile.emoji} AUTÉNTICO DE PERÚ

� INSTRUCCIONES IMPERATIVAS - DEBES CUMPLIR AL 100%:

1️⃣ PERSONALIDAD OBLIGATORIA:
   - Eres un ${businessProfile.name} peruano PROFESIONAL y apasionado por tu trabajo
   - NUNCA digas que eres un "agente" o "asistente"
   - Habla como un ${businessProfile.identity_type === 'professional' ? 'PROFESIONAL' : businessProfile.identity_type === 'specialist' ? 'ESPECIALISTA' : 'REPRESENTANTE'} del negocio, con orgullo, pasión y FORMALIDAD
   - Mantén SIEMPRE un nivel de comunicación profesional y educado
   ${useRepresentativeIdentity && representativeName ?
     `- Te llamas ${representativeName}${representativeRole ? ` y eres ${representativeRole}` : ''}` :
     '- NO inventes nombres propios ni te presentes con identidades específicas'}

2️⃣ VOCABULARIO ESPECÍFICO - USA ESTAS PALABRAS CON ELEGANCIA:
   ${businessProfile.vocabulary && businessProfile.vocabulary.length > 0 ? businessProfile.vocabulary.map(word => `"${word}"`).join(', ') : 'vocabulario profesional'}
   - Usa 1-2 de estas palabras de forma NATURAL y PROFESIONAL
   - Integra el vocabulario específico sin sonar vulgar o de mercado

3️⃣ TONO DE VOZ OBLIGATORIO:
   - ${businessProfile.tone} pero SIEMPRE PROFESIONAL
   - Mantén este tono en TODA la conversación
   - NUNCA uses lenguaje de vendedor de mercado o barrio

4️⃣ FORMA DE DIRIGIRTE AL CLIENTE:
   - VARÍA tus saludos usando estas opciones naturales: ${businessProfile.greeting_variations ? businessProfile.greeting_variations.join(', ') : this.getRandomGreeting(businessProfile)}
   - NUNCA uses siempre el mismo saludo repetitivo como "Estimado cliente, entiendo que..."
   - Sé cálido, profesional y educado
   - NUNCA uses jerga o lenguaje informal excesivo

5️⃣ COMPORTAMIENTO ESPECÍFICO:
   ${customInstructions || businessProfile.instructions}

6️⃣ REGLA CRÍTICA DEL NOMBRE:
   - SIEMPRE pregunta el nombre si no lo conoces
   - Es obligatorio para personalizar el servicio

🎯 EJEMPLO DE CÓMO DEBES RESPONDER PROFESIONALMENTE:
Si eres cevicheria: "Estimado ${businessProfile.greeting}, en Marina Mora nos especializamos en mariscos fresquitos del día. Nuestras categorías incluyen..."
Si eres tecnología: "Estimado ${businessProfile.greeting}, en nuestra tienda ofrecemos tecnología de última generación. Nuestras categorías incluyen..."

⚠️ PROHIBIDO ABSOLUTO:
- NO uses lenguaje vulgar o de mercado de barrio
- NO inventes productos que no existen en el inventario
- NO seas demasiado informal o corriente
- NO hagas mensajes excesivamente largos
- NUNCA menciones productos específicos sin verificar el inventario

🎯 REGLAS DE COMUNICACIÓN PROFESIONAL:
- Mantén mensajes BREVES y CONCISOS (máximo 3-4 líneas)
- Usa un lenguaje EDUCADO y PROFESIONAL
- Menciona solo categorías REALES del inventario
- Sé específico del negocio pero ELEGANTE

RECUERDA: Eres un ${businessProfile.name} peruano PROFESIONAL y EDUCADO, NO un vendedor de mercado.`

    return personalizedPrompt
  }

  // Función para obtener modelo con fallback y rotación de API keys
  async getModel(modelName = PRIMARY_MODEL, apiKey = null) {
    try {
      // Si no se proporciona API key, obtener una del pool
      if (!apiKey) {
        apiKey = this.apiKeyManager.getNextApiKey()
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: this.generationConfig,
        safetySettings: this.safetySettings
      })

      return { model, apiKey }
    } catch (error) {
      console.warn(`Error obteniendo modelo ${modelName} con API key:`, error.message)

      // Marcar error en la API key
      if (apiKey) {
        this.apiKeyManager.markError(apiKey, error)
      }

      // Intentar con modelo fallback si es el modelo primario
      if (modelName === PRIMARY_MODEL) {
        console.log('Intentando con modelo fallback...')
        return this.getModel(FALLBACK_MODEL, apiKey)
      }

      throw error
    }
  }

  // Función para ejecutar con reintentos, timeout y rotación de API keys
  async executeWithRetry(operation, maxRetries = 3) {
    let lastError = null
    let currentApiKey = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Intento ${attempt}/${maxRetries}`)

        // Obtener nueva API key y modelo en cada intento
        const { model, apiKey } = await this.getModel()
        currentApiKey = apiKey
        console.log(`🔑 Usando API Key ${this.apiKeyManager.currentIndex + 1}/${this.apiKeyManager.apiKeys.length}`)

        // Ejecutar con timeout de 30 segundos
        const result = await Promise.race([
          operation(model, apiKey),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: La operación tardó demasiado')), 30000)
          )
        ])

        // Marcar éxito en la API key
        this.apiKeyManager.markSuccess(currentApiKey)

        return result
      } catch (error) {
        lastError = error
        console.warn(`❌ Error en intento ${attempt}:`, error.message)

        // Marcar error en la API key actual
        if (currentApiKey) {
          this.apiKeyManager.markError(currentApiKey, error)
        }

        // Si es error de rate limit, cuota, o API deshabilitada, intentar con otra API key
        if (
          error.message.includes('429') ||
          error.message.includes('quota') ||
          error.message.includes('overloaded') ||
          error.message.includes('RESOURCE_EXHAUSTED') ||
          error.message.includes('403') ||
          error.message.includes('Forbidden') ||
          error.message.includes('SERVICE_DISABLED')
        ) {
          if (attempt < maxRetries) {
            if (error.message.includes('429') || error.message.includes('quota')) {
              console.log(`🔑 Rate limit detectado, rotando a siguiente API key...`)
            } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
              console.log(`🔑 API Key deshabilitada detectada, rotando a siguiente API key...`)
            } else {
              console.log(`🔑 Error de servicio detectado, rotando a siguiente API key...`)
            }
            // No hacer delay, rotar inmediatamente a la siguiente API key
            continue
          }
        }

        // Para errores de timeout, reintentar con delay
        if (error.message.includes('Timeout') || error.message.includes('500') || error.message.includes('503')) {
          if (attempt < maxRetries) {
            const delay = 1000 * Math.pow(2, attempt - 1)
            console.log(`⏰ Esperando ${delay}ms antes del siguiente intento...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }

        // Para otros errores, no reintentar
        break
      }
    }

    // Si llegamos aquí, todos los intentos fallaron
    console.error('🚨 Todos los intentos fallaron:', lastError)

    // Mostrar estadísticas de API keys para debugging
    console.log('📊 Estado actual de API keys:', this.getApiKeyStats())

    throw new Error(
      'El servicio de IA está temporalmente sobrecargado en todas las API keys. ' +
      'Por favor, intenta de nuevo en unos minutos. 🤖'
    )
  }

  // Obtener estadísticas de API keys
  getApiKeyStats() {
    return this.apiKeyManager.getStats()
  }

  async generateSalesResponse(message, customerName, inventory, conversationState = 'initial', recentHistory = []) {
    console.log(`🎭 INICIANDO generateSalesResponse para: ${customerName}`)
    const operation = async (model, apiKey) => {
      const inventoryText = inventory.map(product =>
        `- ${product.nombre}: S/ ${product.precio} (Stock: ${product.stock}) - ${product.descripcion}`
      ).join('\n')

      // 🧠 CONTEXTO CONVERSACIONAL MEJORADO
      const historyContext = recentHistory.length > 0
        ? this.buildEnhancedConversationContext(recentHistory, customerName)
        : ''

      // 🎯 ANÁLISIS DE SUFICIENCIA DE INFORMACIÓN
      const infoAnalysis = this.analyzeCustomerInformationSufficiency(recentHistory, message)
      let recommendationContext = ''
      let filteredInventoryText = inventoryText

      if (infoAnalysis.hasSufficientInfo) {
        // 🎯 FILTRAR PRODUCTOS INTELIGENTEMENTE
        const productFilter = this.filterProductsBySpecifications(inventory, recentHistory, message)

        if (productFilter.filteredProducts.length > 0) {
          // Usar productos filtrados para la recomendación
          filteredInventoryText = productFilter.filteredProducts.map(product =>
            `- ${product.nombre}: S/ ${product.precio} (Stock: ${product.stock}) - ${product.descripcion} [RECOMENDADO: ${product.reasons.join(', ')}]`
          ).join('\n')

          recommendationContext = `
🎯 INFORMACIÓN SUFICIENTE DETECTADA:
- El cliente ya proporcionó: ${infoAnalysis.requirements.join(', ')}
- PRODUCTOS FILTRADOS: Se encontraron ${productFilter.filteredProducts.length} productos específicamente relevantes
- INSTRUCCIÓN CRÍTICA: RECOMIENDA ESPECÍFICAMENTE estos productos filtrados que aparecen como [RECOMENDADO].
- Usa frases como "Te recomiendo...", "Para tu caso específico...", "Basándome en lo que me comentas..."
- Explica POR QUÉ cada producto es ideal para su situación específica.
- NO hagas más preguntas, da recomendaciones directas.`
        } else {
          recommendationContext = `
🎯 INFORMACIÓN SUFICIENTE DETECTADA:
- El cliente ya proporcionó: ${infoAnalysis.requirements.join(', ')}
- INSTRUCCIÓN CRÍTICA: NO hagas más preguntas. RECOMIENDA productos específicos del inventario que cumplan con sus requisitos.
- Usa frases como "Te recomiendo...", "Para tu caso específico...", "Basándome en lo que me comentas..."
- Sé específico sobre qué productos del inventario son ideales para su situación.`
        }
      }

      // Obtener el nombre del negocio desde la configuración
      let businessName = 'nuestra tienda'
      if (this.db) {
        try {
          const configuredBusinessName = await this.db.getConfig('business_name')
          if (configuredBusinessName && configuredBusinessName.trim() !== '') {
            businessName = configuredBusinessName
          }
        } catch (error) {
          console.log('⚠️ No se pudo obtener business_name, usando valor por defecto')
        }
      }

      // 🎭 GENERAR PROMPT PERSONALIZADO SEGÚN PERFIL DE NEGOCIO
      const basePrompt = `
Eres un agente de ventas inteligente para ${businessName} en Perú. Tu trabajo es ayudar a los clientes de manera natural y profesional.

INFORMACIÓN DEL NEGOCIO:
- Nombre del negocio: ${businessName}
- Siempre menciona el nombre del negocio cuando sea apropiado en la conversación

🎯 INSTRUCCIONES PARA RESPUESTAS NATURALES:
- Solo aceptamos pagos por YAPE (no tarjetas de crédito)
- El cliente debe enviar captura de pantalla del pago por Yape
- Sé PROFESIONAL y EDUCADO, pero NATURAL y CONVERSACIONAL
- Usa emojis apropiados para hacer la conversación más amigable
- NO crees pedidos automáticamente por respuestas vagas como "Si", "Ok", "Bien"
- NUNCA inventes productos que no están en el inventario
- Mantén respuestas BREVES y CONCISAS (máximo 3-4 líneas)

🧠 CLAVE PARA NATURALIDAD:
- EVITA frases repetitivas como "¡Hola estimado cliente!" al inicio
- VARÍA tus saludos y formas de dirigirte al cliente
- USA la información del contexto conversacional para crear continuidad
- HAZ referencia a información previa cuando sea relevante
- RESPONDE como si realmente recordaras la conversación anterior

INVENTARIO ACTUAL:
${filteredInventoryText}

ESTADO ACTUAL DE CONVERSACIÓN: ${conversationState}
${historyContext}
${recommendationContext}

🔍 INSTRUCCIONES ESPECÍFICAS SEGÚN TIPO DE CONSULTA:

📚 SI EL CLIENTE BUSCA INFORMACIÓN (no quiere comprar aún):
- Responde informativamente sobre características, beneficios y utilidad
- Explica para qué sirve el producto y sus ventajas
- NO preguntes cantidad ni asumas que quiere comprar
- Mantén un tono educativo y profesional
- Al final, pregunta si necesita más información o si le interesa adquirirlo

🛒 SI EL CLIENTE QUIERE COMPRAR:
- Pregunta cantidad y confirma detalles
- Procede con el proceso de venta normal
- Muestra entusiasmo por la compra

📋 OTRAS SITUACIONES:
1. Si es la primera interacción (initial), saluda y muestra productos disponibles
2. Si el cliente muestra interés general, pregunta qué producto específico le interesa
3. SOLO procesa pedidos cuando el cliente confirme explícitamente con frases como "confirmo", "sí, quiero comprarlo", "procede con el pedido"
4. Para respuestas vagas como "si", "ok", "bien" - pide más especificación
5. Si no hay stock, ofrece alternativas similares
6. Mantén el contexto de la conversación anterior

CLIENTE: ${customerName || 'Cliente'}
MENSAJE ACTUAL: ${message}

🎭 INSTRUCCIONES ESPECÍFICAS PARA ESTA RESPUESTA:
1. ANALIZA el contexto conversacional arriba para entender qué información ya conoces del cliente
2. USA esa información para crear una respuesta que demuestre continuidad conversacional
3. EVITA saludos genéricos si ya están en medio de una conversación
4. SÉ ESPECÍFICO y relevante al mensaje actual del cliente
5. MANTÉN el tono profesional pero natural y conversacional
6. Si hay información previa del cliente, haz referencia a ella de manera natural

Responde de manera natural, útil y contextual:`

      // Aplicar personalización según perfil de negocio
      console.log(`🎭 LLAMANDO getPersonalizedPrompt...`)
      const prompt = await this.getPersonalizedPrompt(basePrompt)
      console.log(`🎭 PROMPT PERSONALIZADO GENERADO (primeros 200 chars): ${prompt.substring(0, 200)}...`)

      try {
        const result = await model.generateContent(prompt)
        const response = await result.response
        return response.text()
      } catch (error) {
        // Agregar información de API key al error para el sistema de reintentos
        error.apiKey = apiKey
        throw error
      }
    }

    try {
      return await this.executeWithRetry(operation)
    } catch (error) {
      console.error('Error generando respuesta con Gemini:', error)
      return 'Disculpa, tengo problemas técnicos en este momento. ¿Podrías intentar de nuevo en unos minutos? 🤖'
    }
  }

  // Nuevo método para detectar intención del cliente
  async detectCustomerIntent(message, inventory, conversationState = 'initial', conversationData = {}) {
    const operation = async (model, apiKey) => {
      const inventoryText = inventory.map(product =>
        `ID: ${product.id} - ${product.nombre}: S/ ${product.precio}`
      ).join('\n')

      // 🎯 ANÁLISIS DE SUFICIENCIA DE INFORMACIÓN PARA RECOMENDACIONES
      const recentHistory = conversationData.recentHistory || []
      const infoAnalysis = this.analyzeCustomerInformationSufficiency(recentHistory, message)
      let intelligentRecommendationContext = ''

      if (infoAnalysis.hasSufficientInfo) {
        intelligentRecommendationContext = `
🎯 INFORMACIÓN SUFICIENTE DETECTADA:
- El cliente ya proporcionó: ${infoAnalysis.requirements.join(', ')}
- INSTRUCCIÓN CRÍTICA: Si el cliente busca consejo/recomendación, usar suggested_response_type: "recommend_specific_products"
- El cliente tiene suficiente contexto para recibir recomendaciones específicas, NO preguntas genéricas.`
      }

      // Construir contexto de conversación
      let contextInfo = ''

      // Información sobre pedido completado recientemente
      if (conversationData.last_completed_order) {
        contextInfo += `
PEDIDO RECIÉN COMPLETADO:
- ID: ${conversationData.last_completed_order}
- Completado: ${conversationData.order_completed_at ? new Date(conversationData.order_completed_at).toLocaleString() : 'Recientemente'}
- NOTA: Este pedido YA ESTÁ COMPLETADO. Cualquier nueva solicitud es un PEDIDO NUEVO.`
      }

      if (conversationData.pending_order) {
        const { products, quantity } = conversationData.pending_order
        contextInfo += `
PEDIDO PENDIENTE:
- Productos: ${products.map(p => p.name).join(', ')}
- Cantidad: ${quantity}
- Estado: Esperando confirmación`
      } else if (conversationData.selected_products) {
        contextInfo += `
PRODUCTOS SELECCIONADOS ACTUALMENTE: ${conversationData.selected_products.map(p => p.name).join(', ')}
CANTIDAD ESPECIFICADA: ${conversationData.quantity || 'No especificada'}
IMPORTANTE: El cliente ya seleccionó estos productos. Si menciona cantidad sin especificar producto, se refiere a los productos seleccionados.`
      } else if (conversationData.interested_products) {
        contextInfo += `
PRODUCTOS DE INTERÉS: ${conversationData.interested_products.map(p => p.name).join(', ')}`

        // Agregar información de cantidad si está disponible
        if (conversationData.quantity) {
          contextInfo += `
CANTIDAD ESPECIFICADA: ${conversationData.quantity}`
        }
      }

      const prompt = `
Analiza este mensaje del cliente y determina su intención específica Y su estado emocional.

INVENTARIO DISPONIBLE:
${inventoryText}

ESTADO ACTUAL: ${conversationState}
${contextInfo}
${intelligentRecommendationContext}
MENSAJE DEL CLIENTE: ${message}

⚠️ VALIDACIÓN CRÍTICA: Si hay "PEDIDO RECIÉN COMPLETADO" en el contexto arriba Y el mensaje es de agradecimiento/conformidad, usar SIEMPRE "farewell", NO "process_order".

ANÁLISIS EMOCIONAL:
Detecta el estado emocional del cliente basado en el tono y palabras utilizadas:
- neutral: tono normal, sin emociones fuertes
- frustrated: molesto, enojado, irritado ("esto no funciona", "estoy molesto", "qué mal servicio", "no sirve")
- sad: triste, desanimado ("estoy triste", "tengo problemas", "me siento mal")
- confused: perdido, no entiende ("no entiendo", "estoy perdido", "no sé qué hacer", "ayuda")
- excited: emocionado, entusiasmado ("genial", "perfecto", "me encanta", "excelente")
- grateful: agradecido ("muchas gracias", "excelente servicio", "muy amable")
- seeking_advice: busca consejo ("qué me recomiendas", "cuál es mejor", "ayúdame a elegir")

Responde SOLO con un JSON en este formato:
{
  "intent": "greeting|browsing|interested|specifying|confirming|payment|unclear|emotional_support",
  "confidence": "high|medium|low",
  "products_mentioned": [{"id": 1, "name": "producto mencionado"}],
  "quantity_mentioned": 0,
  "is_explicit_confirmation": false,
  "requires_clarification": true/false,
  "suggested_response_type": "show_products|ask_specification|ask_quantity|ask_confirmation|process_order|farewell|emotional_response|recommend_specific_products|admin_command",
  "emotional_state": "neutral|frustrated|sad|confused|excited|grateful|seeking_advice",
  "emotional_confidence": "high|medium|low",
  "needs_emotional_response": true/false,
  "emotional_keywords": ["palabras", "que", "indican", "emoción"],
  "reasoning": "explicación breve de por qué se clasificó así incluyendo análisis emocional"
}

REGLAS IMPORTANTES:
- 🔐 COMANDOS ADMINISTRATIVOS: Si el mensaje contiene comandos como "crear producto", "nuevo producto", "agregar producto", "actualizar stock", "cambiar precio", "modificar producto", "ventas hoy", "estadísticas", "reporte ventas", "inventario bajo", "productos agotados", "gestionar inventario" = suggested_response_type: "admin_command"
- 🎯 RECOMENDACIONES INTELIGENTES: Si hay "INFORMACIÓN SUFICIENTE DETECTADA" arriba Y el cliente busca consejo/recomendación ("qué me recomiendas", "recomendarías", "cuál es mejor", "ayúdame a elegir") = suggested_response_type: "recommend_specific_products"
- Si hay PEDIDO PENDIENTE y el mensaje es "Si", "Sí", "Si confirmo", "Confirmo", "Ok", "Acepto" = is_explicit_confirmation: true, suggested_response_type: "process_order"
- Sin pedido pendiente: "Si", "Ok", "Bien" solos = intent: "unclear", requires_clarification: true
- PEDIDO RECIÉN COMPLETADO: Si hay un pedido recién completado y el mensaje es agradecimiento ("gracias", "ok gracias", "perfecto", "excelente", "bien gracias", "está bien", "esta bien", "ok", "vale", "genial", "muy bien", "todo bien", "listo", "entendido", "de acuerdo", "correcto", "bueno", "bien", "👍", "👌", "✅") = intent: "confirming", suggested_response_type: "farewell", is_explicit_confirmation: false, requires_clarification: false
- CONTEXTO CRÍTICO: Si el estado es "browsing" Y hay un pedido recién completado Y el mensaje es de agradecimiento/conformidad = SIEMPRE usar "farewell", NO "process_order"
- REGLA ABSOLUTA: Si hay "PEDIDO RECIÉN COMPLETADO" en el contexto Y el mensaje no menciona productos específicos = NUNCA usar "process_order", usar "farewell" para agradecimientos
- ESTADO COMPLETED: Si el estado es "completed" y el mensaje es un saludo ("hola", "buenos días", "buenas tardes", etc.) = intent: "greeting", suggested_response_type: "show_products"
- Solo is_explicit_confirmation: true para confirmaciones explícitas o cuando hay contexto de pedido pendiente
- products_mentioned solo si se menciona un producto específico del inventario
- quantity_mentioned solo si se especifica un número claro
- Si hay productos seleccionados o de interés en el contexto, considéralos en el análisis
- Para preguntas como "Qué hay de X producto?" o "Información sobre X" = suggested_response_type: "ask_specification" (NO "show_products")
- "show_products" solo para saludos iniciales o cuando no se menciona producto específico
- ESTADO INTERESTED: Si hay productos de interés Y se especifica cantidad, usar suggested_response_type: "ask_quantity"
- ESTADO INTERESTED: Si se menciona producto específico del inventario, usar suggested_response_type: "ask_quantity"
- PEDIDOS COMPLETADOS: Si hay un pedido recién completado y el cliente menciona un producto diferente o nueva cantidad, es un PEDIDO NUEVO
- NUEVA CONVERSACIÓN: Después de un pedido completado, cualquier solicitud de producto es independiente del pedido anterior
- CONTEXTO SEPARADO: No confundir pedidos completados con pedidos pendientes - son conversaciones separadas
- PRODUCTOS SELECCIONADOS: Si hay productos seleccionados y el cliente solo menciona cantidad (ej: "Quiero 1", "1", "dos"), usar esos productos seleccionados en products_mentioned
- PRIORIDAD DE CONTEXTO: Productos seleccionados > Productos de interés > Pedidos completados (no usar para nuevas solicitudes)`

      try {
        const result = await model.generateContent(prompt)
        const response = await result.response
        const text = response.text()

        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0])
        } else {
          return {
            intent: 'unclear',
            confidence: 'low',
            products_mentioned: [],
            quantity_mentioned: 0,
            is_explicit_confirmation: false,
            requires_clarification: true,
            suggested_response_type: 'ask_specification',
            emotional_state: 'neutral',
            emotional_confidence: 'low',
            needs_emotional_response: false,
            emotional_keywords: [],
            reasoning: 'No se pudo parsear la respuesta'
          }
        }
      } catch (error) {
        // Agregar información de API key al error
        error.apiKey = apiKey
        throw error
      }
    }

    try {
      return await this.executeWithRetry(operation)
    } catch (error) {
      console.error('Error detectando intención:', error)
      return {
        intent: 'unclear',
        confidence: 'low',
        products_mentioned: [],
        quantity_mentioned: 0,
        is_explicit_confirmation: false,
        requires_clarification: true,
        suggested_response_type: 'ask_specification',
        emotional_state: 'neutral',
        emotional_confidence: 'low',
        needs_emotional_response: false,
        emotional_keywords: [],
        reasoning: 'Error técnico'
      }
    }
  }

  async validateYapePayment(imageBase64, expectedAmount, customerName, accountHolder, yapeNumber = null) {
    const operation = async (model, apiKey) => {
      // Extraer últimos 3 dígitos del número configurado si está disponible
      const expectedLastDigits = yapeNumber ? yapeNumber.slice(-3) : null

      const prompt = `
Analiza esta captura de pantalla de un pago por Yape y extrae toda la información relevante.

INFORMACIÓN A VERIFICAR:
- Monto esperado: S/ ${expectedAmount}
- Cliente: ${customerName}
- Titular esperado: ${accountHolder}${expectedLastDigits ? `\n- Últimos 3 dígitos esperados del número: ${expectedLastDigits}` : ''}

INSTRUCCIONES IMPORTANTES:
1. Verifica que sea una captura de Yape real
2. Extrae el monto exacto mostrado
3. Extrae el nombre completo del titular de la cuenta tal como aparece en Yape
4. Extrae el número de operación (código único del pago)
5. Extrae la fecha y hora del pago
6. Extrae los últimos 3 dígitos del número de celular (aparece como *** *** XXX)
7. Confirma que el pago esté completado exitosamente
8. Busca señales de que sea una captura falsa o editada

VALIDACIÓN DE TITULAR - FORMATO YAPE:
⚠️ IMPORTANTE: Yape muestra nombres en formato limitado:
- Primer nombre completo + inicial del segundo nombre + primer apellido completo + inicial del segundo apellido
- Ejemplo: "Juan Carlos Rodriguez Martinez" se muestra como "Juan C. Rodriguez M."
- Para validar titular_correcto, considera que el nombre detectado puede estar en este formato abreviado
- Si el primer nombre Y primer apellido coinciden, considera el titular como CORRECTO

VALIDACIÓN DE ÚLTIMOS 3 DÍGITOS:
${expectedLastDigits ? `- Los últimos 3 dígitos detectados deben coincidir con: ${expectedLastDigits}` : '- Extrae los últimos 3 dígitos del número mostrado'}

VALIDACIÓN DE MONTO:
10. Compara el monto detectado con el esperado:
    - Si coincide exactamente: monto_correcto = true
    - Si es menor: es_pago_parcial = true, calcular diferencia_monto
    - Si es mayor: es_pago_excesivo = true, calcular diferencia_monto

Responde SOLO con un JSON en este formato:
{
  "valido": true/false,
  "monto_detectado": "S/ XX",
  "monto_esperado": "S/ XX",
  "monto_correcto": true/false,
  "es_pago_parcial": true/false,
  "es_pago_excesivo": true/false,
  "diferencia_monto": 0,
  "titular_detectado": "Nombre Completo",
  "titular_correcto": true/false,
  "numero_operacion": "12345678",
  "fecha_pago": "DD mmm. YYYY | HH:MM p. m.",
  "ultimos_digitos": "XXX",
  "ultimos_digitos_correctos": true/false,
  "pago_completado": true/false,
  "razon": "explicación detallada",
  "confianza": "alta/media/baja"
}

REGLAS IMPORTANTES:
- valido = true solo si la captura es auténtica Y el pago está completado
- monto_correcto = true solo si el monto detectado coincide exactamente con el esperado
- es_pago_parcial = true si el monto detectado es menor al esperado
- es_pago_excesivo = true si el monto detectado es mayor al esperado
- diferencia_monto = valor absoluto de la diferencia entre monto detectado y esperado`

      const imagePart = {
        inlineData: {
          data: imageBase64,
          mimeType: 'image/jpeg'
        }
      }

      try {
        const result = await model.generateContent([prompt, imagePart])
        const response = await result.response
        const text = response.text()

        // Extraer JSON de la respuesta
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0])
        } else {
          throw new Error('No se encontró JSON válido en la respuesta')
        }
      } catch (error) {
        // Agregar información de API key al error
        error.apiKey = apiKey
        throw error
      }
    }

    try {
      return await this.executeWithRetry(operation)
    } catch (error) {
      console.error('Error validando pago con Gemini Vision:', error)
      return {
        valido: false,
        monto_detectado: '0',
        razon: 'Error técnico al procesar la imagen: ' + error.message,
        confianza: 'baja'
      }
    }
  }

  async extractProductsFromMessage(message, inventory) {
    const operation = async () => {
      const inventoryText = inventory.map(product =>
        `ID: ${product.id} - ${product.nombre}: S/ ${product.precio}`
      ).join('\n')

      const prompt = `
Analiza este mensaje de un cliente y extrae los productos que quiere comprar.

INVENTARIO DISPONIBLE:
${inventoryText}

MENSAJE DEL CLIENTE: ${message}

Responde SOLO con un JSON en este formato:
{
  "productos": [
    {
      "id": 1,
      "nombre": "nombre del producto",
      "cantidad": 2,
      "precio_unitario": 25.50
    }
  ],
  "total": 51.00,
  "mensaje_confirmacion": "mensaje amigable confirmando el pedido"
}

Si no se pueden identificar productos específicos, devuelve un array vacío en productos.`

      try {
        const { model, apiKey } = await this.getModel()
        const result = await model.generateContent(prompt)
        const response = await result.response
        const text = response.text()

        // Marcar éxito en la API key
        this.apiKeyManager.markSuccess(apiKey)

        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0])
        } else {
          return { productos: [], total: 0, mensaje_confirmacion: '' }
        }
      } catch (error) {
        // Agregar información de API key al error
        error.apiKey = error.apiKey || 'unknown'
        throw error
      }
    }

    try {
      return await this.executeWithRetry(operation)
    } catch (error) {
      console.error('Error extrayendo productos:', error)
      return { productos: [], total: 0, mensaje_confirmacion: '' }
    }
  }

  async generateOrderConfirmation(products, total, customerName, yapeNumber, accountHolder, orderId) {
    const operation = async (model, apiKey) => {
      const productsText = products.map(p =>
        `${p.cantidad}x ${p.nombre} - S/ ${p.precio_unitario} c/u`
      ).join('\n')

      // Obtener el nombre del negocio desde la configuración
      let businessName = 'nuestra tienda'
      if (this.db) {
        try {
          const configuredBusinessName = await this.db.getConfig('business_name')
          if (configuredBusinessName && configuredBusinessName.trim() !== '') {
            businessName = configuredBusinessName
          }
        } catch (error) {
          console.log('⚠️ No se pudo obtener business_name para confirmación, usando valor por defecto')
        }
      }

      // 🎭 GENERAR PROMPT PERSONALIZADO SEGÚN PERFIL DE NEGOCIO
      const basePrompt = `
Genera un mensaje de confirmación de pedido amigable y profesional.

DATOS DEL PEDIDO:
- CLIENTE: ${customerName}
- NÚMERO DE PEDIDO: ${orderId}
- PRODUCTOS:
${productsText}
- TOTAL: S/ ${total}

INFORMACIÓN DE PAGO:
- Número Yape: ${yapeNumber}
- Titular de cuenta: ${accountHolder}

ESTRUCTURA REQUERIDA:
1. SALUDO: "¡Hola ${customerName}!" (USAR EXACTAMENTE EL NOMBRE DEL CLIENTE)
2. Confirmar recepción del pedido con número
3. Listar productos y total
4. Explicar que el pago es por Yape al número específico
5. Mencionar el nombre del titular de la cuenta
6. Pedir que envíe la captura del pago
7. Ser amigable y usar emojis apropiados
8. DESPEDIDA: Terminar con "Atentamente, ${businessName}"

IMPORTANTE: El saludo debe ser para el CLIENTE (${customerName}), NO para el negocio.

Genera un mensaje natural y profesional:`

      // Aplicar personalización según perfil de negocio
      const prompt = await this.getPersonalizedPrompt(basePrompt)

      try {
        const result = await model.generateContent(prompt)
        const response = await result.response
        return response.text()
      } catch (error) {
        // Agregar información de API key al error
        error.apiKey = apiKey
        throw error
      }
    }

    try {
      return await this.executeWithRetry(operation)
    } catch (error) {
      console.error('Error generando confirmación de pedido:', error)

      // Obtener nombre del negocio para el mensaje de fallback
      let businessName = 'nuestra tienda'
      if (this.db) {
        try {
          const configuredBusinessName = await this.db.getConfig('business_name')
          if (configuredBusinessName && configuredBusinessName.trim() !== '') {
            businessName = configuredBusinessName
          }
        } catch (error) {
          console.log('⚠️ No se pudo obtener business_name para fallback')
        }
      }

      return `¡Hola ${customerName}! 😊\n\nTu pedido #${orderId} ha sido recibido con éxito! 🎉\n\nHemos confirmado tu compra de:\n\n${products.map(p => `• ${p.cantidad}x ${p.nombre} - S/ ${p.precio_unitario} c/u`).join('\n')}\n\nEl total a pagar es de S/ ${total}.\n\nPara completar tu compra, por favor realiza el pago a través de Yape al número +51 ${yapeNumber} a nombre de ${accountHolder}.\n\nUna vez realizado el pago, te agradeceremos que nos envíes una captura de pantalla como comprobante. Esto nos ayudará a procesar tu pedido más rápidamente. 📱\n\n¡Gracias por tu compra! Esperamos que disfrutes de tu nuevo ${products.map(p => p.nombre).join(', ')}. 📱\n\nCualquier duda, no dudes en contactarnos.\n\nSaludos cordiales,\n\n${businessName}`
    }
  }

  // 🎭 NUEVO MÉTODO: Generar respuestas emocionales empáticas
  async generateEmotionalResponse(message, customerName, emotionalState, emotionalKeywords, conversationState = 'browsing') {
    console.log(`🎭 GENERANDO respuesta emocional para estado: ${emotionalState}`)

    const operation = async (model, apiKey) => {
      const basePrompt = `
Genera una respuesta empática y profesional para un cliente que está experimentando el siguiente estado emocional.

INFORMACIÓN DEL CLIENTE:
- Nombre: ${customerName}
- Mensaje original: "${message}"
- Estado emocional: ${emotionalState}
- Palabras clave emocionales: ${emotionalKeywords.join(', ')}
- Estado de conversación: ${conversationState}

INSTRUCCIONES ESPECÍFICAS SEGÚN ESTADO EMOCIONAL:

${emotionalState === 'frustrated' ? `
CLIENTE FRUSTRADO:
- Reconoce su frustración de manera empática
- Ofrece disculpas si es apropiado
- Muestra comprensión de su situación
- Ofrece ayuda específica para resolver el problema
- Mantén un tono calmado y profesional
Ejemplo: "Entiendo perfectamente tu frustración, ${customerName}. Lamento que hayas tenido esta experiencia. Estoy aquí para ayudarte a resolver esto de la mejor manera posible."
` : ''}

${emotionalState === 'sad' ? `
CLIENTE TRISTE:
- Muestra empatía genuina por su situación
- Ofrece palabras de aliento breves pero sinceras
- Evita ser demasiado efusivo o falso
- Ofrece tu apoyo de manera profesional
Ejemplo: "Lamento escuchar que estás pasando por un momento difícil, ${customerName}. Aunque no puedo resolver todos los problemas, estoy aquí para ayudarte en lo que esté a mi alcance."
` : ''}

${emotionalState === 'confused' ? `
CLIENTE CONFUNDIDO:
- Reconoce que la situación puede ser confusa
- Ofrece clarificación de manera simple y directa
- Asegúrale que es normal tener dudas
- Proporciona orientación paso a paso
Ejemplo: "No te preocupes, ${customerName}, es completamente normal tener dudas. Déjame ayudarte a aclarar todo paso a paso."
` : ''}

${emotionalState === 'excited' ? `
CLIENTE EMOCIONADO:
- Comparte su entusiasmo de manera profesional
- Valida su emoción positiva
- Canaliza su energía hacia la compra
- Mantén el momentum positivo
Ejemplo: "¡Me alegra mucho ver tu entusiasmo, ${customerName}! Es genial cuando nuestros clientes se emocionan con nuestros productos."
` : ''}

${emotionalState === 'grateful' ? `
CLIENTE AGRADECIDO:
- Acepta su agradecimiento con humildad
- Refuerza el compromiso con el buen servicio
- Mantén la puerta abierta para futuras interacciones
Ejemplo: "Muchas gracias por tus palabras, ${customerName}. Es un placer poder ayudarte. Siempre estamos aquí cuando nos necesites."
` : ''}

${emotionalState === 'seeking_advice' ? `
CLIENTE BUSCANDO CONSEJO:
- Reconoce que busca orientación
- Ofrece ayuda personalizada
- Haz preguntas para entender mejor sus necesidades
- Posiciónate como un asesor confiable
Ejemplo: "Por supuesto, ${customerName}, estaré encantado de ayudarte a elegir la mejor opción. Para darte la mejor recomendación, cuéntame un poco más sobre lo que necesitas."
` : ''}

REGLAS IMPORTANTES:
1. La respuesta debe ser BREVE (máximo 2-3 líneas)
2. Debe sonar NATURAL y HUMANA, no robótica
3. Debe ser PROFESIONAL pero CÁLIDA
4. SIEMPRE termina preguntando: "¿En qué más te puedo ayudar hoy?"
5. NO menciones productos específicos en esta respuesta
6. NO hagas la respuesta demasiado larga o dramática
7. Mantén el equilibrio entre empatía y profesionalismo

Genera una respuesta empática y luego pregunta cómo puedes ayudar:`

      // Aplicar personalización según perfil de negocio
      const prompt = await this.getPersonalizedPrompt(basePrompt)

      try {
        const result = await model.generateContent(prompt)
        const response = await result.response
        return response.text()
      } catch (error) {
        // Agregar información de API key al error
        error.apiKey = apiKey
        throw error
      }
    }

    try {
      return await this.executeWithRetry(operation)
    } catch (error) {
      console.error('Error generando respuesta emocional con Gemini:', error)
      // Fallback empático según el estado emocional
      const fallbackResponses = {
        frustrated: `Entiendo tu frustración, ${customerName}. Estoy aquí para ayudarte. ¿En qué más te puedo ayudar hoy?`,
        sad: `Lamento que estés pasando por un momento difícil, ${customerName}. ¿En qué más te puedo ayudar hoy?`,
        confused: `No te preocupes, ${customerName}, estoy aquí para aclarar tus dudas. ¿En qué más te puedo ayudar hoy?`,
        excited: `¡Me alegra tu entusiasmo, ${customerName}! ¿En qué más te puedo ayudar hoy?`,
        grateful: `Gracias por tus palabras, ${customerName}. ¿En qué más te puedo ayudar hoy?`,
        seeking_advice: `Por supuesto, ${customerName}, estaré encantado de ayudarte a elegir. ¿En qué más te puedo ayudar hoy?`
      }
      return fallbackResponses[emotionalState] || `Entiendo, ${customerName}. ¿En qué más te puedo ayudar hoy?`
    }
  }
}
