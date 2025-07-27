import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'

export class GoogleDriveService {
  constructor(database) {
    this.db = database
    this.drive = null
    this.oauth2Client = null
    this.isAuthenticated = false
    this.syncEnabled = false
    this.userInfo = null
    this.syncQueue = []
    this.isProcessing = false
  }

  async initialize() {
    try {
      // Cargar tokens guardados y configuración
      const tokens = await this.db.getConfig('google_drive_tokens')
      const syncEnabled = await this.db.getConfig('google_drive_sync_enabled')
      const userInfo = await this.db.getConfig('google_drive_user_info')
      
      if (tokens) {
        await this.setCredentials(JSON.parse(tokens))
      }
      
      this.syncEnabled = syncEnabled === 'true'
      this.userInfo = userInfo ? JSON.parse(userInfo) : null
      
      console.log(`🔄 Google Drive inicializado - Auth: ${this.isAuthenticated}, Sync: ${this.syncEnabled}`)
    } catch (error) {
      console.error('⚠️ Error inicializando Google Drive:', error.message)
    }
  }

  async setCredentials(tokens, userInfo = null) {
    try {
      // 🌐 PRIORIDAD 1: Cargar desde variables de entorno (PRODUCCIÓN)
      let credentials
      if (process.env.CLIENT_ID && process.env.CLIENT_SECRET) {
        console.log('✅ GoogleDrive: Usando credenciales desde variables de entorno')
        credentials = {
          web: {
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            redirect_uris: [process.env.REDIRECT_URI || 'http://localhost:3001/auth/google/callback']
          }
        }
      } else {
        // 📁 FALLBACK: Cargar desde archivo (DESARROLLO)
        const credentialsPath = path.join(process.cwd(), 'auth', 'credentials.json')
        if (!fs.existsSync(credentialsPath)) {
          throw new Error('Credenciales OAuth no encontradas. Configure CLIENT_ID y CLIENT_SECRET en variables de entorno o agregue credentials.json')
        }
        console.log('✅ GoogleDrive: Usando credenciales desde archivo local')
        credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
      }

      this.oauth2Client = new google.auth.OAuth2(
        credentials.web.client_id,
        credentials.web.client_secret,
        credentials.web.redirect_uris[0]
      )
      
      this.oauth2Client.setCredentials(tokens)
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client })
      this.isAuthenticated = true
      
      // Guardar tokens y info del usuario en BD
      await this.db.setConfig('google_drive_tokens', JSON.stringify(tokens))
      
      if (userInfo) {
        this.userInfo = userInfo
        await this.db.setConfig('google_drive_user_info', JSON.stringify(userInfo))
      }
      
      console.log('✅ Credenciales Google Drive configuradas')
    } catch (error) {
      console.error('❌ Error configurando credenciales:', error.message)
      throw error
    }
  }

  async disconnect() {
    try {
      this.drive = null
      this.oauth2Client = null
      this.isAuthenticated = false
      this.syncEnabled = false
      this.userInfo = null
      
      // Limpiar configuración de BD
      await this.db.setConfig('google_drive_tokens', '')
      await this.db.setConfig('google_drive_user_info', '')
      await this.db.setConfig('google_drive_sync_enabled', 'false')
      
      console.log('🔌 Google Drive desconectado')
    } catch (error) {
      console.error('❌ Error desconectando Google Drive:', error.message)
    }
  }

  async setSyncEnabled(enabled) {
    this.syncEnabled = enabled
    await this.db.setConfig('google_drive_sync_enabled', enabled.toString())
    console.log(`🔄 Sincronización Google Drive: ${enabled ? 'ACTIVADA' : 'DESACTIVADA'}`)
  }

  getStatus() {
    return {
      authenticated: this.isAuthenticated,
      syncEnabled: this.syncEnabled,
      userInfo: this.userInfo,
      queueLength: this.syncQueue.length,
      isProcessing: this.isProcessing
    }
  }

  // Agregar elemento a la cola de sincronización
  queueSync(action, data) {
    if (!this.isAuthenticated || !this.syncEnabled) {
      return
    }

    this.syncQueue.push({
      action,
      data,
      timestamp: Date.now()
    })

    console.log(`📋 Agregado a cola de sync: ${action} (${this.syncQueue.length} elementos)`)
    
    // Procesar cola en segundo plano
    this.processQueue()
  }

  // Procesar cola de sincronización
  async processQueue() {
    if (this.isProcessing || this.syncQueue.length === 0 || !this.isAuthenticated) {
      return
    }

    this.isProcessing = true
    console.log(`🔄 Procesando cola de sincronización (${this.syncQueue.length} elementos)`)

    try {
      await this.uploadDatabase()
      this.syncQueue = [] // Limpiar cola después de sincronización exitosa
      console.log('✅ Cola de sincronización procesada exitosamente')
    } catch (error) {
      console.error('❌ Error procesando cola de sincronización:', error.message)
      // Reintentar después de 30 segundos
      setTimeout(() => {
        this.isProcessing = false
        this.processQueue()
      }, 30000)
      return
    }

    this.isProcessing = false
  }

  async uploadDatabase() {
    if (!this.isAuthenticated) {
      throw new Error('No autenticado con Google Drive')
    }

    try {
      const dbPath = path.join(process.cwd(), 'sales_agent.db')
      
      if (!fs.existsSync(dbPath)) {
        throw new Error('Base de datos no encontrada')
      }

      const fileMetadata = {
        name: 'sales_agent_backup.db',
        description: `Respaldo automático - ${new Date().toISOString()}`
      }
      
      const media = {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(dbPath)
      }

      // Buscar archivo existente
      const existingFiles = await this.drive.files.list({
        q: "name='sales_agent_backup.db' and trashed=false",
        spaces: 'drive',
        fields: 'files(id, name, modifiedTime)'
      })

      let result
      if (existingFiles.data.files.length > 0) {
        // Actualizar archivo existente
        const fileId = existingFiles.data.files[0].id
        result = await this.drive.files.update({
          fileId: fileId,
          resource: fileMetadata,
          media: media
        })
        console.log('📤 Base de datos actualizada en Google Drive')
      } else {
        // Crear nuevo archivo
        result = await this.drive.files.create({
          resource: fileMetadata,
          media: media
        })
        console.log('📤 Base de datos subida a Google Drive por primera vez')
      }

      // Actualizar timestamp de última sincronización
      await this.db.setConfig('google_drive_last_sync', new Date().toISOString())
      
      return result.data
    } catch (error) {
      console.error('❌ Error subiendo base de datos:', error.message)
      throw error
    }
  }

  async downloadDatabase() {
    if (!this.isAuthenticated) {
      throw new Error('No autenticado con Google Drive')
    }

    try {
      // Buscar archivo de respaldo
      const files = await this.drive.files.list({
        q: "name='sales_agent_backup.db' and trashed=false",
        spaces: 'drive',
        fields: 'files(id, name, modifiedTime)',
        orderBy: 'modifiedTime desc'
      })

      if (files.data.files.length === 0) {
        throw new Error('No se encontró respaldo en Google Drive')
      }

      const fileId = files.data.files[0].id
      const currentDbPath = path.join(process.cwd(), 'sales_agent.db')
      const backupPath = path.join(process.cwd(), 'sales_agent_backup_temp.db')
      const oldDbPath = path.join(process.cwd(), 'sales_agent_old.db')

      // Descargar archivo a temporal
      const response = await this.drive.files.get({
        fileId: fileId,
        alt: 'media'
      }, { responseType: 'stream' })

      const dest = fs.createWriteStream(backupPath)
      response.data.pipe(dest)

      return new Promise((resolve, reject) => {
        dest.on('finish', async () => {
          try {
            console.log('📥 Base de datos descargada desde Google Drive')

            // PASO CRÍTICO: Cerrar conexión actual de BD
            if (this.db && this.db.db) {
              await new Promise((resolveClose) => {
                this.db.db.close((err) => {
                  if (err) console.error('⚠️ Error cerrando BD:', err)
                  resolveClose()
                })
              })
              console.log('🔌 Conexión de base de datos cerrada')
            }

            // Hacer backup de la BD actual
            if (fs.existsSync(currentDbPath)) {
              if (fs.existsSync(oldDbPath)) {
                fs.unlinkSync(oldDbPath) // Eliminar backup anterior
              }
              fs.renameSync(currentDbPath, oldDbPath)
              console.log('💾 Backup de BD actual creado')
            }

            // Reemplazar con la BD descargada
            fs.renameSync(backupPath, currentDbPath)
            console.log('🔄 Base de datos reemplazada exitosamente')

            // Reinicializar conexión de BD
            await this.db.initialize()
            console.log('✅ Conexión de base de datos reinicializada')

            resolve({
              success: true,
              message: 'Base de datos restaurada exitosamente',
              backupCreated: oldDbPath,
              timestamp: new Date().toISOString()
            })

          } catch (error) {
            console.error('❌ Error en proceso de restauración:', error)

            // Intentar restaurar BD original si algo falló
            if (fs.existsSync(oldDbPath) && !fs.existsSync(currentDbPath)) {
              fs.renameSync(oldDbPath, currentDbPath)
              await this.db.initialize()
              console.log('🔄 BD original restaurada después de error')
            }

            reject(new Error('Error en restauración: ' + error.message))
          }
        })
        dest.on('error', reject)
      })
    } catch (error) {
      console.error('❌ Error descargando base de datos:', error.message)
      throw error
    }
  }
}
