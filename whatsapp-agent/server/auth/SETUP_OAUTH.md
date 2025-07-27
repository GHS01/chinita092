# 🔧 Configuración OAuth para Google Drive

## 📋 Pasos para configurar OAuth

### 1. 🌐 Crear proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Anota el **Project ID** (lo necesitarás después)

### 2. 🔑 Habilitar APIs necesarias

1. En el menú lateral, ve a **APIs & Services** > **Library**
2. Busca y habilita estas APIs:
   - **Google Drive API**
   - **Google+ API** (para obtener info del usuario)

### 3. 🛡️ Configurar pantalla de consentimiento OAuth

1. Ve a **APIs & Services** > **OAuth consent screen**
2. Selecciona **External** (para uso personal)
3. Completa la información básica:
   - **App name**: "WhatsApp Sales Agent"
   - **User support email**: Tu email
   - **Developer contact information**: Tu email
4. En **Scopes**, agrega:
   - `../auth/drive.file` (para subir/descargar archivos)
   - `../auth/userinfo.email` (para obtener email del usuario)
5. En **Test users**, agrega tu email de Gmail

### 4. 🔐 Crear credenciales OAuth

1. Ve a **APIs & Services** > **Credentials**
2. Haz clic en **+ CREATE CREDENTIALS** > **OAuth 2.0 Client IDs**
3. Selecciona **Web application**
4. Configura:
   - **Name**: "WhatsApp Sales Agent Web Client"
   - **Authorized JavaScript origins**: 
     - `http://localhost:3000`
   - **Authorized redirect URIs**: 
     - `http://localhost:3001/auth/google/callback`
5. Haz clic en **CREATE**
6. **¡IMPORTANTE!** Descarga el archivo JSON de credenciales

### 5. 📁 Configurar archivo de credenciales

1. Renombra el archivo descargado a `credentials.json`
2. Cópialo a la carpeta `server/auth/credentials.json`
3. Verifica que el archivo tenga esta estructura:

```json
{
  "web": {
    "client_id": "tu-client-id.apps.googleusercontent.com",
    "project_id": "tu-proyecto-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "tu-client-secret",
    "redirect_uris": [
      "http://localhost:3001/auth/google/callback"
    ],
    "javascript_origins": [
      "http://localhost:3000"
    ]
  }
}
```

### 6. 🚀 Probar la configuración

1. Reinicia el servidor: `npm run dev`
2. Ve a **Settings** en la aplicación web
3. Busca la sección **"Sincronización con Google Drive"**
4. Haz clic en **"Conectar con Google Drive"**
5. Debería abrirse una ventana de Google para autorizar

## 🔒 Seguridad

- **NUNCA** subas el archivo `credentials.json` a repositorios públicos
- El archivo está incluido en `.gitignore` automáticamente
- Solo tú tendrás acceso a los respaldos en tu Google Drive

## 🆘 Solución de problemas

### Error: "OAuth no configurado"
- Verifica que el archivo `credentials.json` existe en `server/auth/`
- Verifica que el formato JSON es correcto

### Error: "redirect_uri_mismatch"
- Verifica que la URL de callback en Google Cloud Console sea exactamente:
  `http://localhost:3001/auth/google/callback`

### Error: "access_denied"
- Verifica que tu email esté en la lista de **Test users**
- Verifica que las APIs estén habilitadas

### La ventana de OAuth no se abre
- Verifica que no haya bloqueadores de popups
- Intenta en modo incógnito

## 📞 Soporte

Si tienes problemas con la configuración, revisa:
1. Los logs del servidor en la consola
2. Los logs del navegador (F12 > Console)
3. Que todas las URLs coincidan exactamente

¡Una vez configurado, tendrás respaldos automáticos de tu base de datos! 🎉
