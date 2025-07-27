# 🚀 GUÍA DE DESPLIEGUE EN RENDER

## 📋 PREPARACIÓN COMPLETADA

La aplicación ya está preparada para el despliegue en Render con las siguientes mejoras:

### ✅ ARCHIVOS CREADOS/MODIFICADOS:
- `.env.example` - Plantilla de variables de entorno
- `render-build.sh` - Script de build para Render
- `render.yaml` - Configuración de servicios
- Modificaciones en `server/index.js` para CORS dinámico
- Modificaciones en `server/services/gemini.js` para API keys desde env
- Modificaciones en `server/auth/google-oauth.js` para OAuth desde env

## 🌐 CONFIGURACIÓN DE RENDER

### 1. CREAR SERVICIO WEB (Backend)

**Configuración del Servicio:**
- **Name:** `whatsapp-sales-agent-backend`
- **Environment:** `Node`
- **Plan:** `Starter` (o superior)
- **Build Command:** `chmod +x render-build.sh && ./render-build.sh`
- **Start Command:** `cd server && node index.js`
- **Health Check Path:** `/api/health`

### 2. VARIABLES DE ENTORNO REQUERIDAS

**⚠️ CRÍTICO: Configurar estas variables en Render Dashboard:**

```bash
# Puerto (Render lo asigna automáticamente)
PORT=10000

# URLs para CORS (CAMBIAR por tus URLs reales)
FRONTEND_URL=https://tu-app-frontend.onrender.com
CORS_ORIGINS=https://tu-app-frontend.onrender.com,http://localhost:3000

# Google Gemini AI - API Keys (MÍNIMO 5 RECOMENDADO)
GEMINI_API_KEY_1=AIzaSy_tu_primera_api_key_aqui
GEMINI_API_KEY_2=AIzaSy_tu_segunda_api_key_aqui
GEMINI_API_KEY_3=AIzaSy_tu_tercera_api_key_aqui
GEMINI_API_KEY_4=AIzaSy_tu_cuarta_api_key_aqui
GEMINI_API_KEY_5=AIzaSy_tu_quinta_api_key_aqui
# ... hasta GEMINI_API_KEY_15

# Google OAuth2 (para Google Drive)
GOOGLE_CLIENT_ID=tu-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-tu-google-client-secret
GOOGLE_PROJECT_ID=whatsapp-sales-agent
GOOGLE_REDIRECT_URI=https://tu-app-backend.onrender.com/auth/google/callback

# Configuración de negocio (opcional)
BUSINESS_NAME=Mi Tienda
BUSINESS_PHONE=+51999999999
YAPE_NUMBER=999999999
YAPE_ACCOUNT_HOLDER=Nombre del Titular

# Entorno
NODE_ENV=production
```

### 3. CREAR SERVICIO ESTÁTICO (Frontend)

**Configuración del Servicio:**
- **Name:** `whatsapp-sales-agent-frontend`
- **Environment:** `Static Site`
- **Build Command:** `npm run build`
- **Publish Directory:** `./dist`

## 🔧 PASOS PARA DESPLEGAR

### Paso 1: Preparar Google OAuth (si usas Google Drive)
1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Actualiza las URLs autorizadas:
   - **JavaScript origins:** `https://tu-app-frontend.onrender.com`
   - **Redirect URIs:** `https://tu-app-backend.onrender.com/auth/google/callback`

### Paso 2: Desplegar Backend
1. Conecta tu repositorio en Render
2. Selecciona "Web Service"
3. Configura según las especificaciones arriba
4. Agrega TODAS las variables de entorno
5. Despliega

### Paso 3: Desplegar Frontend
1. Crea nuevo "Static Site" en Render
2. Conecta el mismo repositorio
3. Configura build command y publish directory
4. Despliega

### Paso 4: Actualizar URLs
1. Una vez desplegado, actualiza las variables:
   - `FRONTEND_URL`
   - `CORS_ORIGINS`
   - `GOOGLE_REDIRECT_URI`
2. Redespliega el backend

## 🚨 CONSIDERACIONES IMPORTANTES

### Base de Datos
- SQLite funciona en Render pero los datos se pierden en cada redeploy
- Para producción, considera migrar a PostgreSQL

### Archivos de WhatsApp
- Los archivos de autenticación de WhatsApp se perderán en redeploys
- Necesitarás reconectar WhatsApp después de cada deploy

### Persistencia
- Considera usar un servicio de base de datos externa
- Implementa backup automático de la base de datos

## 🔍 VERIFICACIÓN POST-DESPLIEGUE

1. **Health Check:** `https://tu-backend.onrender.com/api/health`
2. **Panel de Control:** `https://tu-backend.onrender.com`
3. **API Stats:** `https://tu-backend.onrender.com/api/stats`

## 🆘 TROUBLESHOOTING

### Error de CORS
- Verifica que `CORS_ORIGINS` incluya tu URL de frontend
- Asegúrate de que no haya espacios en las URLs

### Error de API Keys
- Verifica que todas las variables `GEMINI_API_KEY_X` estén configuradas
- Revisa los logs para ver cuántas keys se cargaron

### Error de OAuth
- Verifica las credenciales de Google
- Asegúrate de que las URLs de redirect estén actualizadas

## 📞 SOPORTE

Si encuentras problemas, revisa:
1. Logs de Render Dashboard
2. Variables de entorno configuradas
3. URLs de Google OAuth actualizadas

## ✅ RESUMEN DE PREPARACIÓN COMPLETADA

### 🔧 ARCHIVOS MODIFICADOS:
- `server/index.js` - CORS dinámico, health check mejorado, manejo de errores
- `server/services/gemini.js` - API keys desde variables de entorno
- `server/services/database.js` - Base de datos en directorio temporal para producción
- `server/auth/google-oauth.js` - OAuth desde variables de entorno
- `vite.config.js` - Configuración para producción
- `package.json` - Scripts de producción agregados
- `server/package.json` - Script de producción agregado

### 📁 ARCHIVOS CREADOS:
- `.env.example` - Plantilla de variables de entorno
- `render-build.sh` - Script de build automatizado
- `render.yaml` - Configuración de servicios
- `server/middleware/errorHandler.js` - Manejo de errores para producción
- `DEPLOY-RENDER.md` - Esta guía de despliegue

### 🌐 CARACTERÍSTICAS PARA PRODUCCIÓN:
- ✅ Variables de entorno configurables
- ✅ CORS dinámico basado en configuración
- ✅ API keys de Gemini desde variables de entorno
- ✅ OAuth de Google desde variables de entorno
- ✅ Base de datos en directorio temporal
- ✅ Manejo de errores robusto
- ✅ Health check completo
- ✅ Logging para producción
- ✅ Build automatizado
- ✅ Configuración de servicios para Render

### 🚀 LISTO PARA DESPLEGAR
La aplicación está completamente preparada para el despliegue en Render. Solo necesitas:
1. Configurar las variables de entorno en Render Dashboard
2. Actualizar las URLs de Google OAuth
3. Seguir los pasos de despliegue descritos arriba

¡Tu aplicación está lista para producción! 🎉
