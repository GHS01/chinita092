import sqlite3 from 'sqlite3'
import { promisify } from 'util'

export class DatabaseService {
  constructor() {
    this.db = null
  }

  // Método para obtener fecha/hora actual del sistema local
  getCurrentTimestamp() {
    const now = new Date()

    // Usar la fecha/hora local del sistema directamente
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      // 🌐 CONFIGURACIÓN DE BASE DE DATOS PARA PRODUCCIÓN
      // En Render, usar directorio temporal para SQLite
      const dbPath = process.env.NODE_ENV === 'production'
        ? '/tmp/sales_agent.db'
        : './sales_agent.db'

      if (process.env.NODE_ENV === 'production') {
        console.log(`🗄️ Base de datos en producción: ${dbPath}`)
        console.log('⚠️ NOTA: Los datos se perderán en cada redeploy. Considera usar PostgreSQL para producción.')
      }

      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error abriendo base de datos:', err)
          reject(err)
        } else {
          console.log('✅ Base de datos SQLite conectada')
          this.createTables().then(resolve).catch(reject)
        }
      })
    })
  }

  async createTables() {
    const queries = [
      // Tabla de productos
      `CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        precio REAL NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        categoria TEXT,
        imagen_url TEXT,
        destacado BOOLEAN DEFAULT 0,
        activo BOOLEAN DEFAULT 1,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Tabla de pedidos
      `CREATE TABLE IF NOT EXISTS pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_whatsapp TEXT NOT NULL,
        cliente_nombre TEXT,
        productos_json TEXT NOT NULL,
        total REAL NOT NULL,
        estado TEXT DEFAULT 'pendiente',
        captura_pago_url TEXT,
        notas TEXT,
        yape_operation_number TEXT,
        yape_payment_date TEXT,
        yape_last_digits TEXT,
        yape_detected_holder TEXT,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Tabla de mensajes (para estadísticas)
      `CREATE TABLE IF NOT EXISTS mensajes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_whatsapp TEXT NOT NULL,
        mensaje TEXT,
        tipo TEXT DEFAULT 'recibido',
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Tabla de configuración
      `CREATE TABLE IF NOT EXISTS configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT,
        fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Tabla de estadísticas de ventas
      `CREATE TABLE IF NOT EXISTS estadisticas_ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER NOT NULL,
        producto_nombre TEXT NOT NULL,
        categoria TEXT,
        cantidad_vendida INTEGER NOT NULL DEFAULT 0,
        precio_unitario REAL NOT NULL,
        ingresos_totales REAL NOT NULL,
        cliente_whatsapp TEXT NOT NULL,
        cliente_nombre TEXT,
        pedido_id INTEGER NOT NULL,
        fecha_venta DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (producto_id) REFERENCES productos(id),
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
      )`,

      // Tabla de clientes recurrentes
      `CREATE TABLE IF NOT EXISTS clientes_recurrentes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_whatsapp TEXT UNIQUE NOT NULL,
        cliente_nombre TEXT,
        total_pedidos INTEGER DEFAULT 0,
        total_gastado REAL DEFAULT 0,
        primera_compra DATETIME,
        ultima_compra DATETIME,
        categoria_favorita TEXT,
        fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // 🔐 Tabla de códigos de autorización administrativa
      `CREATE TABLE IF NOT EXISTS admin_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        descripcion TEXT,
        activo BOOLEAN DEFAULT 1,
        intentos_fallidos INTEGER DEFAULT 0,
        ultimo_uso DATETIME,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_expiracion DATETIME
      )`,

      // 🔐 Tabla de sesiones administrativas
      `CREATE TABLE IF NOT EXISTS admin_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_whatsapp TEXT NOT NULL,
        codigo_usado TEXT NOT NULL,
        operacion TEXT,
        datos_operacion TEXT,
        estado TEXT DEFAULT 'activa',
        fecha_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_fin DATETIME,
        FOREIGN KEY (codigo_usado) REFERENCES admin_codes(codigo)
      )`
    ]

    for (const query of queries) {
      await this.run(query)
    }

    // Insertar configuración inicial si no existe
    await this.insertInitialConfig()

    // 🔐 Insertar códigos administrativos iniciales
    await this.insertInitialAdminCodes()

    // Migración: Agregar columnas Yape si no existen
    await this.migrateYapeColumns()

    // Migración: Agregar campo destacado si no existe
    await this.migrateDestacadoColumn()

    console.log('✅ Tablas de base de datos creadas/verificadas')
  }

  async insertInitialConfig() {
    const configs = [
      ['gemini_api_key', 'AIzaSyAlUIsKYBxfZ4RH3aimq7XBWQtlGcG1fjo'],
      ['business_name', 'Mi Tienda'],
      ['business_phone', ''],
      ['business_profile', 'general'], // 🆕 PERFIL DE NEGOCIO
      ['custom_business_profile', ''], // 🆕 PERFIL PERSONALIZADO (JSON)

      // 🆕 CONFIGURACIÓN DE IDENTIDAD DEL REPRESENTANTE (OPCIONAL)
      ['representative_name', ''], // Nombre del representante (opcional)
      ['representative_role', ''], // Rol del representante (opcional)
      ['use_representative_identity', 'false'], // Si usar identidad específica
      ['yape_number', '987654321'],
      ['yape_account_holder', 'Nombre del Titular'],
      ['welcome_message', '¡Hola! 👋 Bienvenido a nuestra tienda. ¿En qué puedo ayudarte hoy?'],
      ['payment_instructions', 'Realiza tu pago por Yape al número 987654321 y envía la captura de pantalla.'],

      // INTERRUPTOR MAESTRO
      ['auto_responses_enabled', 'true'],

      // FILTROS DE MENSAJES
      ['filter_greetings_only_enabled', 'false'],
      ['filter_ignore_emojis_enabled', 'false'],

      // HORARIO DE ATENCIÓN
      ['schedule_enabled', 'false'],
      ['schedule_start_time', '09:00'],
      ['schedule_end_time', '17:00'],
      ['schedule_out_of_hours_message', 'Gracias por contactarnos. Nuestro horario de atención es de 9:00 AM a 5:00 PM. Te responderemos en cuanto estemos disponibles.'],

      // TIEMPO DE RESPUESTA
      ['response_delay_enabled', 'false'],
      ['response_delay_min', '2'],
      ['response_delay_max', '5'],
      ['response_typing_indicator_enabled', 'false'],

      // 🔐 CONFIGURACIÓN ADMINISTRATIVA
      ['admin_system_enabled', 'true'],
      ['admin_max_attempts', '3'],
      ['admin_session_timeout', '30'], // minutos
      ['admin_require_auth_for_stats', 'true'],
      ['admin_require_auth_for_inventory', 'true'],
      ['admin_log_operations', 'true'],

      // 🔐 CONTRASEÑA MAESTRA PARA GESTIÓN DE CÓDIGOS
      ['admin_master_password_hash', ''], // Hash de la contraseña maestra
      ['admin_master_password_set', 'false'], // Si ya se configuró la contraseña
      ['admin_codes_visible', 'false'] // Si los códigos son visibles sin contraseña
    ]

    for (const [clave, valor] of configs) {
      await this.run(
        'INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)',
        [clave, valor]
      )
    }
  }

  // 🔐 INSERTAR CÓDIGOS ADMINISTRATIVOS INICIALES
  async insertInitialAdminCodes() {
    try {
      // Verificar si ya existen códigos
      const existingCodes = await this.get('SELECT COUNT(*) as count FROM admin_codes')

      if (existingCodes.count === 0) {
        // Generar código administrativo inicial seguro
        const initialCode = this.generateSecureCode()

        await this.run(
          `INSERT INTO admin_codes (codigo, descripcion, activo)
           VALUES (?, ?, ?)`,
          [initialCode, 'Código administrativo principal', 1]
        )

        console.log(`🔐 Código administrativo inicial creado: ${initialCode}`)
        console.log('⚠️  IMPORTANTE: Guarda este código de forma segura')
      }
    } catch (error) {
      console.error('Error insertando códigos administrativos:', error)
    }
  }

  // 🔐 GENERAR CÓDIGO SEGURO
  generateSecureCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = 'ADMIN'
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  // Métodos de utilidad para promisificar sqlite3
  run(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(query, params, function(err) {
        if (err) {
          reject(err)
        } else {
          resolve({ id: this.lastID, changes: this.changes })
        }
      })
    })
  }

  get(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err)
        } else {
          resolve(row)
        }
      })
    })
  }

  all(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err)
        } else {
          resolve(rows)
        }
      })
    })
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err)
          } else {
            console.log('Base de datos cerrada')
            resolve()
          }
        })
      } else {
        resolve()
      }
    })
  }

  // Métodos específicos para configuración
  async getConfig(key) {
    const result = await this.get('SELECT valor FROM configuracion WHERE clave = ?', [key])
    return result ? result.valor : null
  }

  async setConfig(key, value) {
    await this.run(
      'INSERT OR REPLACE INTO configuracion (clave, valor, fecha_actualizacion) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    )
  }

  // Método para obtener todas las configuraciones
  async getAllConfig() {
    const rows = await this.all('SELECT clave, valor FROM configuracion')
    const config = {}
    rows.forEach(row => {
      config[row.clave] = row.valor
    })
    return config
  }

  // 🔐 MÉTODOS PARA GESTIÓN DE CÓDIGOS ADMINISTRATIVOS

  // Validar código administrativo
  async validateAdminCode(codigo) {
    try {
      const adminCode = await this.get(
        'SELECT * FROM admin_codes WHERE codigo = ? AND activo = 1',
        [codigo]
      )

      if (!adminCode) {
        return { valid: false, reason: 'Código no encontrado o inactivo' }
      }

      // Verificar si el código ha expirado
      if (adminCode.fecha_expiracion) {
        const now = new Date()
        const expiration = new Date(adminCode.fecha_expiracion)
        if (now > expiration) {
          return { valid: false, reason: 'Código expirado' }
        }
      }

      // Actualizar último uso
      await this.run(
        'UPDATE admin_codes SET ultimo_uso = CURRENT_TIMESTAMP WHERE codigo = ?',
        [codigo]
      )

      return {
        valid: true,
        code: adminCode,
        reason: 'Código válido'
      }

    } catch (error) {
      console.error('Error validando código administrativo:', error)
      return { valid: false, reason: 'Error interno' }
    }
  }

  // Registrar intento fallido
  async registerFailedAttempt(codigo) {
    try {
      await this.run(
        `UPDATE admin_codes
         SET intentos_fallidos = intentos_fallidos + 1
         WHERE codigo = ?`,
        [codigo]
      )
    } catch (error) {
      console.error('Error registrando intento fallido:', error)
    }
  }

  // Crear sesión administrativa
  async createAdminSession(clienteWhatsapp, codigoUsado, operacion = null) {
    try {
      const result = await this.run(
        `INSERT INTO admin_sessions (cliente_whatsapp, codigo_usado, operacion, estado)
         VALUES (?, ?, ?, 'activa')`,
        [clienteWhatsapp, codigoUsado, operacion]
      )

      return result.id
    } catch (error) {
      console.error('Error creando sesión administrativa:', error)
      return null
    }
  }

  // Obtener sesión administrativa activa
  async getActiveAdminSession(clienteWhatsapp) {
    try {
      return await this.get(
        `SELECT * FROM admin_sessions
         WHERE cliente_whatsapp = ? AND estado = 'activa'
         ORDER BY fecha_inicio DESC LIMIT 1`,
        [clienteWhatsapp]
      )
    } catch (error) {
      console.error('Error obteniendo sesión administrativa:', error)
      return null
    }
  }

  // Cerrar sesión administrativa
  async closeAdminSession(sessionId) {
    try {
      await this.run(
        `UPDATE admin_sessions
         SET estado = 'cerrada', fecha_fin = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [sessionId]
      )
    } catch (error) {
      console.error('Error cerrando sesión administrativa:', error)
    }
  }

  // Migración: Agregar campo destacado si no existe
  async migrateDestacadoColumn() {
    try {
      // Verificar si la columna destacado ya existe
      const tableInfo = await this.all("PRAGMA table_info(productos)")
      const existingColumns = tableInfo.map(col => col.name)

      if (!existingColumns.includes('destacado')) {
        console.log('🔧 Agregando columna destacado a tabla productos...')
        await this.run('ALTER TABLE productos ADD COLUMN destacado BOOLEAN DEFAULT 0')
        console.log('✅ Migración de columna destacado completada')
      }
    } catch (error) {
      console.error('❌ Error en migración de columna destacado:', error)
    }
  }

  // Migración: Agregar columnas Yape si no existen
  async migrateYapeColumns() {
    try {
      // Verificar si las columnas ya existen
      const tableInfo = await this.all("PRAGMA table_info(pedidos)")
      const existingColumns = tableInfo.map(col => col.name)

      const yapeColumns = [
        'yape_operation_number',
        'yape_payment_date',
        'yape_last_digits',
        'yape_detected_holder'
      ]

      for (const column of yapeColumns) {
        if (!existingColumns.includes(column)) {
          console.log(`🔧 Agregando columna ${column} a tabla pedidos...`)
          await this.run(`ALTER TABLE pedidos ADD COLUMN ${column} TEXT`)
        }
      }

      console.log('✅ Migración de columnas Yape completada')
    } catch (error) {
      console.error('❌ Error en migración de columnas Yape:', error)
    }
  }

  // Método para actualizar información del comprobante Yape
  async updateYapePaymentInfo(pedidoId, paymentInfo) {
    await this.run(
      `UPDATE pedidos SET
        yape_operation_number = ?,
        yape_payment_date = ?,
        yape_last_digits = ?,
        yape_detected_holder = ?,
        fecha_actualizacion = ?
      WHERE id = ?`,
      [
        paymentInfo.numero_operacion,
        paymentInfo.fecha_pago,
        paymentInfo.ultimos_digitos,
        paymentInfo.titular_detectado,
        this.getCurrentTimestamp(),
        pedidoId
      ]
    )
  }

  // 🔐 MÉTODOS PARA CONTRASEÑA MAESTRA

  // Generar hash de contraseña usando crypto nativo de Node.js (ES Modules)
  async generatePasswordHash(password) {
    const crypto = await import('crypto')
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')
    return `${salt}:${hash}`
  }

  // Verificar contraseña
  async verifyPassword(password, storedHash) {
    if (!storedHash) return false

    const crypto = await import('crypto')
    const [salt, hash] = storedHash.split(':')
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')
    return hash === verifyHash
  }

  // Configurar contraseña maestra
  async setMasterPassword(password) {
    try {
      const hash = await this.generatePasswordHash(password)
      await this.setConfig('admin_master_password_hash', hash)
      await this.setConfig('admin_master_password_set', 'true')
      return { success: true }
    } catch (error) {
      console.error('Error configurando contraseña maestra:', error)
      return { success: false, error: error.message }
    }
  }

  // Verificar contraseña maestra
  async verifyMasterPassword(password) {
    try {
      const storedHash = await this.getConfig('admin_master_password_hash')
      const isSet = await this.getConfig('admin_master_password_set')

      if (isSet !== 'true' || !storedHash) {
        return { valid: false, reason: 'Contraseña maestra no configurada' }
      }

      const isValid = await this.verifyPassword(password, storedHash)
      return {
        valid: isValid,
        reason: isValid ? 'Contraseña correcta' : 'Contraseña incorrecta'
      }
    } catch (error) {
      console.error('Error verificando contraseña maestra:', error)
      return { valid: false, reason: 'Error interno' }
    }
  }

  // Verificar si la contraseña maestra está configurada
  async isMasterPasswordSet() {
    try {
      const isSet = await this.getConfig('admin_master_password_set')
      return isSet === 'true'
    } catch (error) {
      return false
    }
  }

  // Obtener todos los códigos administrativos (requiere autenticación)
  async getAllAdminCodes() {
    try {
      return await this.all(
        'SELECT id, codigo, descripcion, activo, intentos_fallidos, ultimo_uso, fecha_creacion FROM admin_codes ORDER BY fecha_creacion DESC'
      )
    } catch (error) {
      console.error('Error obteniendo códigos administrativos:', error)
      return []
    }
  }

  // Crear nuevo código administrativo
  async createAdminCode(descripcion = 'Código administrativo') {
    try {
      const newCode = this.generateSecureCode()
      const result = await this.run(
        'INSERT INTO admin_codes (codigo, descripcion, activo) VALUES (?, ?, 1)',
        [newCode, descripcion]
      )

      return {
        success: true,
        code: newCode,
        id: result.id
      }
    } catch (error) {
      console.error('Error creando código administrativo:', error)
      return { success: false, error: error.message }
    }
  }

  // Eliminar código administrativo
  async deleteAdminCode(codeId) {
    try {
      const result = await this.run(
        'DELETE FROM admin_codes WHERE id = ?',
        [codeId]
      )

      return {
        success: result.changes > 0,
        message: result.changes > 0 ? 'Código eliminado' : 'Código no encontrado'
      }
    } catch (error) {
      console.error('Error eliminando código administrativo:', error)
      return { success: false, error: error.message }
    }
  }

  // Activar/desactivar código administrativo
  async toggleAdminCode(codeId, active) {
    try {
      const result = await this.run(
        'UPDATE admin_codes SET activo = ? WHERE id = ?',
        [active ? 1 : 0, codeId]
      )

      return {
        success: result.changes > 0,
        message: result.changes > 0 ? `Código ${active ? 'activado' : 'desactivado'}` : 'Código no encontrado'
      }
    } catch (error) {
      console.error('Error actualizando código administrativo:', error)
      return { success: false, error: error.message }
    }
  }
}
