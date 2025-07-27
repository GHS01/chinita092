import { useState, useEffect } from 'react'
import { Save, Settings as SettingsIcon, Key, Store, Phone, MessageCircle, Trash2, RefreshCw, AlertTriangle, Database, ShoppingCart } from 'lucide-react'
import GoogleDriveAuth from './GoogleDriveAuth'

// 🎭 PERFILES DE NEGOCIO DISPONIBLES
const BUSINESS_PROFILES = {
  general: { name: "General", emoji: "🏪" },
  cevicheria: { name: "Cevicheria", emoji: "🐟" },
  tecnologia: { name: "Tienda de Tecnología", emoji: "💻" },
  deportiva: { name: "Tienda Deportiva", emoji: "⚽" },
  postres: { name: "Tienda de Postres", emoji: "🍰" },
  restaurante: { name: "Restaurante", emoji: "🍽️" },
  farmacia: { name: "Farmacia", emoji: "💊" },
  personalizado: { name: "Personalizado", emoji: "✏️" }
}

const Settings = ({ socket }) => {
  const [config, setConfig] = useState({
    business_name: '',
    business_phone: '',
    business_profile: 'general', // 🎭 NUEVO: Perfil de negocio
    yape_number: '',
    yape_account_holder: '',
    welcome_message: '',
    gemini_api_key: '',

    // 🆕 CONFIGURACIÓN DE IDENTIDAD DEL REPRESENTANTE
    representative_name: '',
    representative_role: '',
    use_representative_identity: 'false',

    // NUEVAS CONFIGURACIONES
    auto_responses_enabled: 'true',
    filter_greetings_only_enabled: 'false',
    filter_ignore_emojis_enabled: 'false',
    schedule_enabled: 'false',
    schedule_start_time: '09:00',
    schedule_end_time: '17:00',
    schedule_out_of_hours_message: '',
    response_delay_enabled: 'false',
    response_delay_min: '2',
    response_delay_max: '5',
    response_typing_indicator_enabled: 'false'
  })
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearingSession, setClearingSession] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [clearingOrders, setClearingOrders] = useState(false)
  const [clearingSales, setClearingSales] = useState(false)

  // 🔐 ESTADOS PARA GESTIÓN ADMINISTRATIVA
  const [showAdminSection, setShowAdminSection] = useState(false)
  const [masterPasswordSet, setMasterPasswordSet] = useState(false)
  const [adminCodes, setAdminCodes] = useState([])
  const [adminPassword, setAdminPassword] = useState('')
  const [newMasterPassword, setNewMasterPassword] = useState('')
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('')
  const [newCodeDescription, setNewCodeDescription] = useState('')
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [adminLoading, setAdminLoading] = useState(false)

  // 🎭 ESTADOS PARA PERFIL PERSONALIZADO
  const [showCustomProfileModal, setShowCustomProfileModal] = useState(false)
  const [customProfile, setCustomProfile] = useState({
    name: '',
    emoji: '',
    greeting: '',
    tone: '',
    vocabulary: '',
    instructions: ''
  })

  useEffect(() => {
    if (socket) {
      // Solicitar configuración actual
      socket.emit('get-config')
      
      socket.on('config-data', (data) => {
        setConfig(data)
        setLoading(false)
      })

      socket.on('config-saved', () => {
        setSaving(false)
        alert('Configuración guardada exitosamente')
      })

      socket.on('config-error', (error) => {
        setSaving(false)
        alert('Error guardando configuración: ' + error)
      })

      // Eventos del Smart Session Manager
      socket.on('session-cleared', (result) => {
        setClearingSession(false)
        alert('✅ ' + result.message + '\nPuedes reconectar WhatsApp desde el Dashboard.')
      })

      socket.on('session-clear-error', (error) => {
        setClearingSession(false)
        alert('❌ Error limpiando sesión: ' + error.error)
      })

      socket.on('reconnect-success', (result) => {
        setReconnecting(false)
        alert('✅ ' + result.message)
      })

      socket.on('reconnect-error', (error) => {
        setReconnecting(false)
        alert('❌ Error en reconexión: ' + error.error)
      })

      // Eventos de limpieza de datos
      socket.on('orders-cleared', (result) => {
        setClearingOrders(false)
        alert('✅ ' + result.message)
      })

      socket.on('orders-clear-error', (error) => {
        setClearingOrders(false)
        alert('❌ Error limpiando pedidos: ' + error)
      })

      socket.on('sales-cleared', (result) => {
        setClearingSales(false)
        alert('✅ ' + result.message)
      })

      socket.on('sales-clear-error', (error) => {
        setClearingSales(false)
        alert('❌ Error limpiando estadísticas: ' + error)
      })

      // 🔐 Eventos de gestión administrativa
      socket.on('master-password-status', (data) => {
        setMasterPasswordSet(data.isSet)
        setAdminLoading(false)
      })

      socket.on('master-password-set', () => {
        setMasterPasswordSet(true)
        setNewMasterPassword('')
        setConfirmMasterPassword('')
        alert('✅ Contraseña maestra configurada exitosamente')
      })

      socket.on('admin-codes-data', (data) => {
        setAdminCodes(data.codes)
        setAdminAuthenticated(true)
        setAdminPassword('')
        setAdminLoading(false)
      })

      socket.on('admin-auth-failed', (reason) => {
        setAdminLoading(false)
        alert('❌ ' + reason)
      })

      socket.on('admin-code-created', (data) => {
        alert(`✅ Nuevo código creado: ${data.code}\n\n⚠️ Guarda este código de forma segura`)
        setNewCodeDescription('')
      })

      socket.on('admin-error', (error) => {
        setAdminLoading(false)
        alert('❌ Error: ' + error)
      })

      return () => {
        socket.off('config-data')
        socket.off('config-saved')
        socket.off('config-error')
        socket.off('session-cleared')
        socket.off('session-clear-error')
        socket.off('reconnect-success')
        socket.off('reconnect-error')
        socket.off('orders-cleared')
        socket.off('orders-clear-error')
        socket.off('sales-cleared')
        socket.off('sales-clear-error')
      }
    }
  }, [socket])

  const handleChange = (e) => {
    const { name, value } = e.target

    // 🎭 Si selecciona perfil personalizado, mostrar popup
    if (name === 'business_profile' && value === 'personalizado') {
      setShowCustomProfileModal(true)
      return // No actualizar config hasta que complete el popup
    }

    setConfig(prev => ({
      ...prev,
      [name]: value
    }))
  }

  // 🎭 FUNCIONES PARA PERFIL PERSONALIZADO
  const handleCustomProfileChange = (e) => {
    const { name, value } = e.target
    setCustomProfile(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSaveCustomProfile = () => {
    // Validar campos requeridos
    if (!customProfile.name || !customProfile.instructions) {
      alert('Por favor completa al menos el nombre y las instrucciones del perfil')
      return
    }

    // Guardar perfil personalizado en configuración
    setConfig(prev => ({
      ...prev,
      business_profile: 'personalizado',
      custom_business_profile: JSON.stringify(customProfile)
    }))

    setShowCustomProfileModal(false)
    alert('✅ Perfil personalizado configurado correctamente')
  }

  const handleCancelCustomProfile = () => {
    setShowCustomProfileModal(false)
    // Resetear el dropdown al valor anterior
    setConfig(prev => ({
      ...prev,
      business_profile: prev.business_profile === 'personalizado' ? 'general' : prev.business_profile
    }))
  }

  const handleToggle = (name) => {
    setConfig(prev => ({
      ...prev,
      [name]: prev[name] === 'true' ? 'false' : 'true'
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setSaving(true)
    socket.emit('save-config', config)
  }

  const handleClearSession = () => {
    if (confirm('⚠️ ¿Estás seguro de que quieres limpiar la sesión de WhatsApp?\n\nEsto cerrará la conexión actual y tendrás que escanear el código QR nuevamente.')) {
      setClearingSession(true)
      socket.emit('clear-whatsapp-session')
    }
  }

  const handleForceReconnect = () => {
    if (confirm('🔄 ¿Quieres forzar la reconexión de WhatsApp?\n\nEsto limpiará la sesión actual y intentará reconectar automáticamente.')) {
      setReconnecting(true)
      socket.emit('force-whatsapp-reconnect')
    }
  }

  const handleClearOrders = () => {
    if (confirm('⚠️ ¿ESTÁS SEGURO de que quieres ELIMINAR TODOS LOS PEDIDOS?\n\n🚨 ESTA ACCIÓN NO SE PUEDE DESHACER 🚨\n\nSe eliminarán:\n• Todos los pedidos (pendientes, pagados, enviados, completados)\n• Historial completo de pedidos\n\n¿Continuar?')) {
      if (confirm('🔴 CONFIRMACIÓN FINAL:\n\n¿Realmente quieres BORRAR TODOS LOS PEDIDOS?\n\nEscribe "CONFIRMAR" en tu mente y haz clic en OK para proceder.')) {
        setClearingOrders(true)
        socket.emit('clear-all-orders')
      }
    }
  }

  const handleClearSales = () => {
    if (confirm('⚠️ ¿ESTÁS SEGURO de que quieres ELIMINAR TODAS LAS ESTADÍSTICAS DE VENTAS?\n\n🚨 ESTA ACCIÓN NO SE PUEDE DESHACER 🚨\n\nSe eliminarán:\n• Todas las estadísticas de ventas\n• Historial de clientes recurrentes\n• Datos de análisis y reportes\n\n¿Continuar?')) {
      if (confirm('🔴 CONFIRMACIÓN FINAL:\n\n¿Realmente quieres BORRAR TODAS LAS ESTADÍSTICAS?\n\nEscribe "CONFIRMAR" en tu mente y haz clic en OK para proceder.')) {
        setClearingSales(true)
        socket.emit('clear-all-sales')
      }
    }
  }

  // 🔐 FUNCIONES DE GESTIÓN ADMINISTRATIVA
  const handleShowAdminSection = () => {
    if (!showAdminSection) {
      setAdminLoading(true)
      socket.emit('check-master-password')
    }
    setShowAdminSection(!showAdminSection)
  }

  const handleSetMasterPassword = () => {
    if (!newMasterPassword.trim()) {
      alert('La contraseña no puede estar vacía')
      return
    }
    if (newMasterPassword !== confirmMasterPassword) {
      alert('Las contraseñas no coinciden')
      return
    }
    socket.emit('set-master-password', newMasterPassword)
  }

  const handleVerifyMasterPassword = () => {
    if (!adminPassword) {
      alert('Ingresa la contraseña maestra')
      return
    }
    setAdminLoading(true)
    socket.emit('verify-master-password', adminPassword)
  }

  const handleCreateAdminCode = () => {
    if (!adminPassword) {
      alert('Ingresa la contraseña maestra')
      return
    }
    if (!newCodeDescription.trim()) {
      alert('Ingresa una descripción para el código')
      return
    }
    setAdminLoading(true)
    socket.emit('create-admin-code', {
      password: adminPassword,
      descripcion: newCodeDescription.trim()
    })
  }

  const handleDeleteAdminCode = (codeId) => {
    if (!adminPassword) {
      alert('Ingresa la contraseña maestra')
      return
    }
    if (confirm('¿Estás seguro de eliminar este código?')) {
      setAdminLoading(true)
      socket.emit('delete-admin-code', {
        password: adminPassword,
        codeId
      })
    }
  }

  const handleToggleAdminCode = (codeId, currentActive) => {
    if (!adminPassword) {
      alert('Ingresa la contraseña maestra')
      return
    }
    setAdminLoading(true)
    socket.emit('toggle-admin-code', {
      password: adminPassword,
      codeId,
      active: !currentActive
    })
  }

  if (loading) {
    return (
      <div className="settings-loading">
        <div className="spinner"></div>
        <p>Cargando configuración...</p>
      </div>
    )
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <h1>
          <SettingsIcon size={24} />
          Configuración
        </h1>
        <p>Configura los parámetros del agente de ventas</p>
      </div>

      <form onSubmit={handleSubmit} className="settings-form">
        {/* Información del Negocio */}
        <div className="settings-section card">
          <h2>
            <Store size={20} />
            Información del Negocio
          </h2>
          
          <div className="form-group">
            <label className="form-label">Nombre del Negocio</label>
            <input
              type="text"
              name="business_name"
              value={config.business_name}
              onChange={handleChange}
              className="form-input"
              placeholder="Mi Tienda"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Teléfono del Negocio</label>
            <input
              type="tel"
              name="business_phone"
              value={config.business_phone}
              onChange={handleChange}
              className="form-input"
              placeholder="+51 999 999 999"
            />
          </div>

          {/* 🎭 NUEVO: Perfil de Negocio */}
          <div className="form-group">
            <label className="form-label">
              Perfil del Negocio
              <span style={{ marginLeft: '8px', fontSize: '18px' }}>
                {BUSINESS_PROFILES[config.business_profile]?.emoji || '🏪'}
              </span>
            </label>
            <select
              name="business_profile"
              value={config.business_profile}
              onChange={handleChange}
              className="form-input"
              style={{ cursor: 'pointer' }}
            >
              {Object.entries(BUSINESS_PROFILES).map(([key, profile]) => (
                <option key={key} value={key}>
                  {profile.emoji} {profile.name}
                </option>
              ))}
            </select>
            <small className="form-help">
              El agente adaptará su personalidad y vocabulario según el tipo de negocio seleccionado
            </small>
          </div>

          {/* 🆕 CONFIGURACIÓN DE IDENTIDAD DEL REPRESENTANTE */}
          <div className="form-group">
            <label className="form-label">
              <input
                type="checkbox"
                name="use_representative_identity"
                checked={config.use_representative_identity === 'true'}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  use_representative_identity: e.target.checked ? 'true' : 'false'
                }))}
                style={{ marginRight: '8px' }}
              />
              Usar identidad específica del representante (opcional)
            </label>
            <small className="form-help">
              Si está activado, el agente se presentará con el nombre y rol específicos que configures
            </small>
          </div>

          {config.use_representative_identity === 'true' && (
            <>
              <div className="form-group">
                <label className="form-label">Nombre del Representante</label>
                <input
                  type="text"
                  name="representative_name"
                  value={config.representative_name}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="Ej: María García"
                />
                <small className="form-help">
                  Nombre con el que se presentará el agente (opcional)
                </small>
              </div>

              <div className="form-group">
                <label className="form-label">Rol del Representante</label>
                <input
                  type="text"
                  name="representative_role"
                  value={config.representative_role}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="Ej: Gerente de Ventas, Asesor Comercial"
                />
                <small className="form-help">
                  Rol o cargo con el que se presentará el agente (opcional)
                </small>
              </div>
            </>
          )}
        </div>

        {/* Configuración de Pagos */}
        <div className="settings-section card">
          <h2>
            <Phone size={20} />
            Configuración de Pagos
          </h2>
          
          <div className="form-group">
            <label className="form-label">Número de Yape</label>
            <input
              type="tel"
              name="yape_number"
              value={config.yape_number}
              onChange={handleChange}
              className="form-input"
              placeholder="987654321"
              required
            />
            <small className="form-help">
              Número de teléfono asociado a tu cuenta Yape para recibir pagos
            </small>
          </div>

          <div className="form-group">
            <label className="form-label">Titular de la Cuenta Yape</label>
            <input
              type="text"
              name="yape_account_holder"
              value={config.yape_account_holder}
              onChange={handleChange}
              className="form-input"
              placeholder="Nombre Completo del Titular"
              required
            />
            <small className="form-help">
              Nombre completo del titular de la cuenta Yape (debe coincidir con el comprobante)
            </small>
          </div>
        </div>

        {/* Mensajes del Bot */}
        <div className="settings-section card">
          <h2>
            <MessageCircle size={20} />
            Mensajes del Agente
          </h2>
          
          <div className="form-group">
            <label className="form-label">Mensaje de Bienvenida</label>
            <textarea
              name="welcome_message"
              value={config.welcome_message}
              onChange={handleChange}
              className="form-input form-textarea"
              rows="4"
              placeholder="¡Hola! 👋 Bienvenido a nuestra tienda. ¿En qué puedo ayudarte hoy?"
            />
            <small className="form-help">
              Mensaje que enviará el agente cuando un cliente escriba por primera vez
            </small>
          </div>
        </div>

        {/* API Configuration */}
        <div className="settings-section card">
          <h2>
            <Key size={20} />
            Configuración de API
          </h2>

          <div className="form-group">
            <label className="form-label">Clave API de Gemini</label>
            <input
              type="password"
              name="gemini_api_key"
              value={config.gemini_api_key}
              onChange={handleChange}
              className="form-input"
              placeholder="AIzaSy..."
            />
            <small className="form-help">
              Clave de API de Google Gemini para el agente inteligente
            </small>
          </div>
        </div>

        {/* INTERRUPTOR MAESTRO */}
        <div className="settings-section card">
          <h2>
            <MessageCircle size={20} />
            Control General del Agente
          </h2>

          <div className="form-group">
            <div className="toggle-group">
              <label className="toggle-label">
                <span>Enable Auto Responses</span>
                <small>When enabled, the server will automatically respond to incoming messages</small>
              </label>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={config.auto_responses_enabled === 'true'}
                  onChange={() => handleToggle('auto_responses_enabled')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>

        {/* Filtros de Mensajes & Tiempo de Respuesta */}
        <div className="settings-section card">
          <h2>
            <MessageCircle size={20} />
            Filtros de Mensajes & Tiempo de Respuesta
          </h2>
          <p className="section-description">
            Configuración para controlar qué mensajes responder y cómo responderlos.
          </p>

          {/* Filtrado de Mensajes */}
          <h3>Filtrado de Mensajes</h3>

          <div className="form-group">
            <div className="toggle-group">
              <label className="toggle-label">
                <span>Responder solo a saludos/preguntas</span>
                <small>Si está activado, solo responderá a mensajes que sean saludos o preguntas.</small>
              </label>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={config.filter_greetings_only_enabled === 'true'}
                  onChange={() => handleToggle('filter_greetings_only_enabled')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div className="form-group">
            <div className="toggle-group">
              <label className="toggle-label">
                <span>Ignorar mensajes con solo emojis/stickers</span>
                <small>Si está activado, no responderá a mensajes que solo contengan emojis o stickers.</small>
              </label>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={config.filter_ignore_emojis_enabled === 'true'}
                  onChange={() => handleToggle('filter_ignore_emojis_enabled')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          {/* Horario de Atención */}
          <h3>Horario de Atención</h3>

          <div className="form-group">
            <div className="toggle-group">
              <label className="toggle-label">
                <span>Habilitar horario de atención</span>
                <small>Si está activado, solo responderá durante el horario configurado.</small>
              </label>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={config.schedule_enabled === 'true'}
                  onChange={() => handleToggle('schedule_enabled')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          {config.schedule_enabled === 'true' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Hora de inicio</label>
                  <input
                    type="time"
                    name="schedule_start_time"
                    value={config.schedule_start_time}
                    onChange={handleChange}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Hora de fin</label>
                  <input
                    type="time"
                    name="schedule_end_time"
                    value={config.schedule_end_time}
                    onChange={handleChange}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Respuesta automática fuera de horario</label>
                <textarea
                  name="schedule_out_of_hours_message"
                  value={config.schedule_out_of_hours_message}
                  onChange={handleChange}
                  className="form-input form-textarea"
                  rows="3"
                  placeholder="Gracias por contactarnos. Nuestro horario de atención es de 9:00 AM a 5:00 PM. Te responderemos en cuanto estemos disponibles."
                />
              </div>
            </>
          )}

          {/* Tiempo de Respuesta */}
          <h3>Tiempo de Respuesta</h3>

          <div className="form-group">
            <div className="toggle-group">
              <label className="toggle-label">
                <span>Habilitar retraso en respuestas</span>
                <small>Si está activado, agregará un retraso aleatorio antes de responder para simular un comportamiento más humano.</small>
              </label>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={config.response_delay_enabled === 'true'}
                  onChange={() => handleToggle('response_delay_enabled')}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          {config.response_delay_enabled === 'true' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Retraso mínimo (segundos)</label>
                  <input
                    type="number"
                    name="response_delay_min"
                    value={config.response_delay_min}
                    onChange={handleChange}
                    className="form-input"
                    min="1"
                    max="30"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Retraso máximo (segundos)</label>
                  <input
                    type="number"
                    name="response_delay_max"
                    value={config.response_delay_max}
                    onChange={handleChange}
                    className="form-input"
                    min="1"
                    max="30"
                  />
                </div>
              </div>

              <div className="form-group">
                <div className="toggle-group">
                  <label className="toggle-label">
                    <span>Mostrar "Escribiendo..."</span>
                    <small>Si está activado, mostrará el indicador de "Escribiendo..." antes de enviar la respuesta.</small>
                  </label>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.response_typing_indicator_enabled === 'true'}
                      onChange={() => handleToggle('response_typing_indicator_enabled')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        {/* WhatsApp Session Management */}
        <div className="settings-section card">
          <h2>
            <MessageCircle size={20} />
            Gestión de Sesión WhatsApp
          </h2>

          <div className="session-controls">
            <div className="session-info">
              <AlertTriangle size={20} color="#ffc107" />
              <div>
                <h4>Control de Sesión</h4>
                <p>Si WhatsApp no se conecta o tienes problemas de sesión, usa estos controles para resetear la conexión.</p>
              </div>
            </div>

            <div className="session-buttons">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClearSession}
                disabled={clearingSession}
              >
                {clearingSession ? (
                  <>
                    <div className="spinner"></div>
                    Limpiando...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Limpiar Sesión
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleForceReconnect}
                disabled={reconnecting}
              >
                {reconnecting ? (
                  <>
                    <div className="spinner"></div>
                    Reconectando...
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    Forzar Reconexión
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="session-help">
            <h4>¿Cuándo usar estos controles?</h4>
            <ul>
              <li><strong>Limpiar Sesión:</strong> Cuando cerraste WhatsApp desde tu teléfono y no aparece el QR</li>
              <li><strong>Forzar Reconexión:</strong> Cuando hay problemas de conexión persistentes</li>
              <li><strong>Después de limpiar:</strong> Ve al Dashboard y haz clic en "Conectar" para escanear el nuevo QR</li>
            </ul>
          </div>
        </div>

        {/* Data Management - Limpieza de Datos */}
        <div className="settings-section card">
          <h2>
            <Database size={20} />
            Gestión de Datos
          </h2>

          <div className="data-management-controls">
            <div className="data-warning">
              <AlertTriangle size={20} color="#dc3545" />
              <div>
                <h4>⚠️ Zona de Peligro - Limpieza de Datos</h4>
                <p>Estos botones eliminan datos permanentemente. Úsalos solo en caso de emergencia o para limpiar datos de prueba.</p>
              </div>
            </div>

            <div className="data-actions">
              <div className="data-action-group">
                <div className="action-info">
                  <ShoppingCart size={18} color="#dc3545" />
                  <div>
                    <h4>Limpiar Pedidos</h4>
                    <p>Elimina todos los pedidos (pendientes, pagados, enviados, completados)</p>
                    <small>⚠️ Esta acción no se puede deshacer</small>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleClearOrders}
                  disabled={clearingOrders}
                >
                  {clearingOrders ? (
                    <>
                      <div className="spinner"></div>
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      Limpiar Pedidos
                    </>
                  )}
                </button>
              </div>

              <div className="data-action-group">
                <div className="action-info">
                  <Database size={18} color="#dc3545" />
                  <div>
                    <h4>Limpiar Estadísticas de Ventas</h4>
                    <p>Elimina todas las estadísticas, historial de ventas y clientes recurrentes</p>
                    <small>⚠️ Esta acción no se puede deshacer</small>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleClearSales}
                  disabled={clearingSales}
                >
                  {clearingSales ? (
                    <>
                      <div className="spinner"></div>
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      Limpiar Estadísticas
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="data-help">
              <h4>¿Cuándo usar estos controles?</h4>
              <ul>
                <li><strong>Limpiar Pedidos:</strong> Para eliminar pedidos de prueba o datos erróneos</li>
                <li><strong>Limpiar Estadísticas:</strong> Para resetear completamente las métricas de ventas</li>
                <li><strong>Importante:</strong> Los productos del inventario NO se eliminan</li>
                <li><strong>Recomendación:</strong> Haz respaldo antes de usar estos botones</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 🔐 Gestión Administrativa */}
        <div className="settings-section card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Key size={20} />
              Gestión Administrativa
            </h2>
            <button
              type="button"
              onClick={handleShowAdminSection}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: showAdminSection ? '#dc3545' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              {showAdminSection ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Gestiona códigos de autorización para funciones administrativas desde WhatsApp
          </p>

          {showAdminSection && (
            <div>
              {adminLoading && (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div className="spinner"></div>
                  <p>Cargando...</p>
                </div>
              )}

              {!masterPasswordSet && !adminLoading && (
                <div style={{ padding: '1rem', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '4px', marginBottom: '1rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#856404' }}>⚠️ Configuración Inicial Requerida</h4>
                  <p style={{ margin: '0 0 1rem 0', color: '#856404' }}>
                    Configura una contraseña maestra para proteger la gestión de códigos administrativos.
                  </p>

                  <div style={{ display: 'grid', gap: '1rem', maxWidth: '400px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        Nueva Contraseña Maestra
                      </label>
                      <input
                        type="password"
                        value={newMasterPassword}
                        onChange={(e) => setNewMasterPassword(e.target.value)}
                        className="form-input"
                        placeholder="Ingresa tu contraseña preferida"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        Confirmar Contraseña
                      </label>
                      <input
                        type="password"
                        value={confirmMasterPassword}
                        onChange={(e) => setConfirmMasterPassword(e.target.value)}
                        className="form-input"
                        placeholder="Confirma la contraseña"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSetMasterPassword}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      🔐 Configurar Contraseña Maestra
                    </button>
                  </div>
                </div>
              )}

              {masterPasswordSet && !adminAuthenticated && !adminLoading && (
                <div style={{ padding: '1rem', backgroundColor: '#e7f3ff', border: '1px solid #b3d9ff', borderRadius: '4px', marginBottom: '1rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#0056b3' }}>🔐 Autenticación Requerida</h4>
                  <p style={{ margin: '0 0 1rem 0', color: '#0056b3' }}>
                    Ingresa la contraseña maestra para gestionar códigos administrativos.
                  </p>

                  <div style={{ display: 'flex', gap: '1rem', maxWidth: '400px' }}>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="form-input"
                      placeholder="Contraseña maestra"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={handleVerifyMasterPassword}
                      style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Verificar
                    </button>
                  </div>
                </div>
              )}

              {adminAuthenticated && !adminLoading && (
                <div>
                  <div style={{ padding: '1rem', backgroundColor: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '4px', marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: '#155724' }}>✅ Acceso Autorizado</h4>

                    {/* Crear nuevo código */}
                    <div style={{ marginBottom: '1rem' }}>
                      <h5 style={{ margin: '0 0 0.5rem 0' }}>➕ Crear Nuevo Código</h5>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                            Descripción del código
                          </label>
                          <input
                            type="text"
                            value={newCodeDescription}
                            onChange={(e) => setNewCodeDescription(e.target.value)}
                            className="form-input"
                            placeholder="Ej: Código para administrador principal"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleCreateAdminCode}
                          style={{
                            padding: '0.75rem 1rem',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          Crear Código
                        </button>
                      </div>
                    </div>

                    {/* Lista de códigos existentes */}
                    <div>
                      <h5 style={{ margin: '0 0 1rem 0' }}>📋 Códigos Administrativos ({adminCodes.length})</h5>

                      {adminCodes.length === 0 ? (
                        <p style={{ color: '#666', fontStyle: 'italic' }}>No hay códigos administrativos creados</p>
                      ) : (
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                          {adminCodes.map((code) => (
                            <div
                              key={code.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.75rem',
                                backgroundColor: code.activo ? '#f8f9fa' : '#f1f1f1',
                                border: '1px solid #dee2e6',
                                borderRadius: '4px'
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.1rem' }}>
                                  {code.codigo}
                                </div>
                                <div style={{ fontSize: '0.9rem', color: '#666' }}>
                                  {code.descripcion}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#999' }}>
                                  Creado: {new Date(code.fecha_creacion).toLocaleDateString()}
                                  {code.ultimo_uso && ` | Último uso: ${new Date(code.ultimo_uso).toLocaleDateString()}`}
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleAdminCode(code.id, code.activo)}
                                  style={{
                                    padding: '0.5rem',
                                    backgroundColor: code.activo ? '#ffc107' : '#28a745',
                                    color: code.activo ? '#000' : '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem'
                                  }}
                                >
                                  {code.activo ? 'Desactivar' : 'Activar'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteAdminCode(code.id)}
                                  style={{
                                    padding: '0.5rem',
                                    backgroundColor: '#dc3545',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem'
                                  }}
                                >
                                  Eliminar
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botón de guardar */}
        <div className="settings-actions">
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={saving}
          >
            {saving ? (
              <>
                <div className="spinner"></div>
                Guardando...
              </>
            ) : (
              <>
                <Save size={16} />
                Guardar Configuración
              </>
            )}
          </button>
        </div>
      </form>

      {/* Sincronización con Google Drive */}
      <div className="card">
        <GoogleDriveAuth socket={socket} />
      </div>

      {/* Información adicional */}
      <div className="settings-info card">
        <h3>ℹ️ Información Importante</h3>
        <ul>
          <li>El número de Yape debe estar activo y verificado</li>
          <li>El agente validará automáticamente las capturas de pago</li>
          <li>Los mensajes pueden incluir emojis para mayor cercanía</li>
          <li>La API de Gemini es necesaria para el funcionamiento del agente</li>
          <li>Google Drive permite respaldos automáticos de tu base de datos</li>
        </ul>
      </div>

      {/* 🎭 POPUP MODAL PARA PERFIL PERSONALIZADO */}
      {showCustomProfileModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ marginBottom: '1.5rem', color: '#333' }}>
              ✏️ Configurar Perfil Personalizado
            </h2>

            <div className="form-group">
              <label className="form-label">Nombre del Perfil *</label>
              <input
                type="text"
                name="name"
                value={customProfile.name}
                onChange={handleCustomProfileChange}
                className="form-input"
                placeholder="Ej: Librería, Panadería, Veterinaria"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Emoji Representativo</label>
              <input
                type="text"
                name="emoji"
                value={customProfile.emoji}
                onChange={handleCustomProfileChange}
                className="form-input"
                placeholder="Ej: 📚, 🍞, 🐕"
                maxLength="2"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Forma de Saludar</label>
              <input
                type="text"
                name="greeting"
                value={customProfile.greeting}
                onChange={handleCustomProfileChange}
                className="form-input"
                placeholder="Ej: querido lector, estimado cliente, amigo peludo"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tono de Voz</label>
              <input
                type="text"
                name="tone"
                value={customProfile.tone}
                onChange={handleCustomProfileChange}
                className="form-input"
                placeholder="Ej: educativo y culto, cálido y familiar, profesional y cariñoso"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Vocabulario Específico</label>
              <input
                type="text"
                name="vocabulary"
                value={customProfile.vocabulary}
                onChange={handleCustomProfileChange}
                className="form-input"
                placeholder="Palabras separadas por comas: libro, novela, bestseller"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Instrucciones de Comportamiento *</label>
              <textarea
                name="instructions"
                value={customProfile.instructions}
                onChange={handleCustomProfileChange}
                className="form-input form-textarea"
                rows="4"
                placeholder="Describe cómo debe comportarse el agente, qué personalidad debe tener, cómo debe hablar con los clientes..."
              />
              <small className="form-help">
                Sé específico: describe la personalidad, el estilo de comunicación y cualquier comportamiento especial
              </small>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button
                type="button"
                onClick={handleCancelCustomProfile}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveCustomProfile}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Guardar Perfil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings
