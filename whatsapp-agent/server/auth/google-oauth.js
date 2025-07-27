import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'

export class GoogleOAuthService {
  constructor() {
    this.credentials = null
    this.oauth2Client = null
    this.SCOPES = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
    
    this.initializeCredentials()
  }

  initializeCredentials() {
    try {
      // 🌐 PRIORIDAD 1: Cargar desde variables de entorno (PRODUCCIÓN)
      if (process.env.CLIENT_ID && process.env.CLIENT_SECRET) {
        console.log('✅ Cargando credenciales OAuth desde variables de entorno')
        this.credentials = {
          web: {
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            project_id: process.env.PROJECT_ID || 'whatsapp-sales-agent',
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
            auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
            redirect_uris: [process.env.REDIRECT_URI || 'http://localhost:3001/auth/google/callback'],
            javascript_origins: [
              process.env.FRONTEND_URL || 'http://localhost:3000',
              'http://localhost:3000',
              'http://localhost:3002'
            ]
          }
        }
        this.setupOAuth2Client()
        return
      }

      // 🌐 PRIORIDAD 2: Cargar desde archivo (DESARROLLO)
      const credentialsPath = path.join(process.cwd(), 'auth', 'credentials.json')
      if (fs.existsSync(credentialsPath)) {
        console.log('✅ Cargando credenciales OAuth desde archivo credentials.json')
        this.credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
        this.setupOAuth2Client()
      } else {
        console.log('⚠️ OAuth no configurado:')
        console.log('   - Variables de entorno: CLIENT_ID, CLIENT_SECRET no encontradas')
        console.log('   - Archivo credentials.json no encontrado en: auth/credentials.json')
        console.log('📝 Configura OAuth para habilitar Google Drive')
      }
    } catch (error) {
      console.error('❌ Error cargando credenciales OAuth:', error.message)
    }
  }

  setupOAuth2Client() {
    if (!this.credentials?.web) {
      throw new Error('Credenciales OAuth mal configuradas')
    }

    this.oauth2Client = new google.auth.OAuth2(
      this.credentials.web.client_id,
      this.credentials.web.client_secret,
      this.credentials.web.redirect_uris[0]
    )
  }

  isConfigured() {
    return this.oauth2Client !== null
  }

  // Generar URL de autorización
  getAuthUrl() {
    if (!this.isConfigured()) {
      throw new Error('OAuth no configurado. Falta archivo credentials.json')
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.SCOPES,
      prompt: 'consent', // Fuerza mostrar selector de cuenta
      include_granted_scopes: true
    })
  }

  // Intercambiar código por tokens
  async getTokens(code) {
    if (!this.isConfigured()) {
      throw new Error('OAuth no configurado')
    }

    try {
      const { tokens } = await this.oauth2Client.getToken(code)
      this.oauth2Client.setCredentials(tokens)
      return tokens
    } catch (error) {
      console.error('❌ Error obteniendo tokens:', error.message)
      throw new Error('Error en autenticación con Google')
    }
  }

  // Obtener información del usuario autenticado
  async getUserInfo(tokens) {
    if (!this.isConfigured()) {
      throw new Error('OAuth no configurado')
    }

    try {
      // Crear cliente temporal con los tokens
      const tempClient = new google.auth.OAuth2(
        this.credentials.web.client_id,
        this.credentials.web.client_secret,
        this.credentials.web.redirect_uris[0]
      )
      tempClient.setCredentials(tokens)

      const oauth2 = google.oauth2({ version: 'v2', auth: tempClient })
      const { data } = await oauth2.userinfo.get()
      
      return {
        email: data.email,
        name: data.name,
        picture: data.picture,
        verified_email: data.verified_email
      }
    } catch (error) {
      console.error('❌ Error obteniendo info del usuario:', error.message)
      throw new Error('Error obteniendo información del usuario')
    }
  }

  // Verificar si los tokens son válidos
  async verifyTokens(tokens) {
    if (!this.isConfigured()) {
      return false
    }

    try {
      const tempClient = new google.auth.OAuth2(
        this.credentials.web.client_id,
        this.credentials.web.client_secret,
        this.credentials.web.redirect_uris[0]
      )
      tempClient.setCredentials(tokens)

      // Intentar hacer una llamada simple para verificar
      const oauth2 = google.oauth2({ version: 'v2', auth: tempClient })
      await oauth2.userinfo.get()
      
      return true
    } catch (error) {
      console.log('⚠️ Tokens inválidos o expirados')
      return false
    }
  }

  // Refrescar tokens si es necesario
  async refreshTokens(tokens) {
    if (!this.isConfigured()) {
      throw new Error('OAuth no configurado')
    }

    try {
      const tempClient = new google.auth.OAuth2(
        this.credentials.web.client_id,
        this.credentials.web.client_secret,
        this.credentials.web.redirect_uris[0]
      )
      tempClient.setCredentials(tokens)

      const { credentials } = await tempClient.refreshAccessToken()
      return credentials
    } catch (error) {
      console.error('❌ Error refrescando tokens:', error.message)
      throw new Error('Error refrescando tokens de acceso')
    }
  }
}
