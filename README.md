# 🤖 WhatsApp Sales Agent - Chinita092

Un agente de ventas inteligente para WhatsApp que utiliza Google Gemini AI para automatizar las ventas y gestionar inventarios.

## 🌟 Características Principales

### 🤖 Agente Inteligente
- **Reconocimiento de clientes** automático con historial
- **Niveles de cliente**: Nuevo → Recurrente → Frecuente → VIP
- **Respuestas contextuales** basadas en conversaciones previas
- **Manejo emocional** inteligente para clientes frustrados

### 📦 Gestión de Inventario
- **Productos destacados** con sistema de estrellas
- **Categorías inteligentes** con filtrado automático
- **Búsqueda por especificaciones** (privacidad, seguridad, etc.)
- **Envío de imágenes** de productos automático

### 💰 Sistema de Ventas
- **Proceso de compra optimizado** con confirmaciones
- **Integración con Yape** para pagos
- **Validación automática** de comprobantes de pago
- **Seguimiento completo** de pedidos

### 📊 Dashboard Administrativo
- **Panel de control completo** con métricas en tiempo real
- **Gestión de inventario** con CRUD completo
- **Estadísticas de ventas** detalladas
- **Configuración de negocio** personalizable

### 🔧 Características Técnicas
- **15 API Keys de Gemini** con rotación automática
- **Base de datos SQLite** con migraciones automáticas
- **WebSockets** para actualizaciones en tiempo real
- **Sistema de respaldos** automático

## 🚀 Tecnologías Utilizadas

### Backend
- **Node.js** + Express
- **Socket.IO** para WebSockets
- **SQLite3** como base de datos
- **Google Gemini AI** para inteligencia artificial
- **Baileys** para WhatsApp Bot

### Frontend
- **React** + Vite
- **Lucide React** para iconos
- **Socket.IO Client** para tiempo real
- **PWA** con service worker

### Servicios Externos
- **Google Gemini AI** - Inteligencia artificial
- **Google Drive API** - Almacenamiento de imágenes
- **WhatsApp Business API** - Mensajería

## 📁 Estructura del Proyecto

```
Proyecto-agente/
├── whatsapp-agent/
│   ├── src/                    # Frontend React
│   ├── server/                 # Backend Node.js
│   │   ├── services/          # Servicios principales
│   │   ├── auth/              # Autenticación OAuth
│   │   └── middleware/        # Middlewares
│   ├── public/                # Archivos estáticos
│   ├── .env.example          # Variables de entorno
│   ├── render-build.sh       # Script de build para Render
│   └── DEPLOY-RENDER.md      # Guía de despliegue
└── memory-bank/              # Documentación del sistema
```

## 🛠️ Instalación y Desarrollo

### Prerrequisitos
- Node.js 18+
- npm o yarn
- Cuenta de Google Cloud (para Gemini AI)
- Cuenta de WhatsApp Business

### Instalación Local

1. **Clonar el repositorio**
```bash
git clone https://github.com/GHS01/chinita092.git
cd chinita092/whatsapp-agent
```

2. **Instalar dependencias**
```bash
# Frontend
npm install

# Backend
cd server
npm install
cd ..
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

4. **Ejecutar en desarrollo**
```bash
# Terminal 1: Backend
npm run server

# Terminal 2: Frontend
npm run dev
```

## 🌐 Despliegue en Producción

### Render (Recomendado)
La aplicación está completamente preparada para Render. Ver `DEPLOY-RENDER.md` para instrucciones detalladas.

### Variables de Entorno Requeridas
```bash
# URLs de producción
FRONTEND_URL=https://tu-app.onrender.com
CORS_ORIGINS=https://tu-app.onrender.com

# API Keys de Gemini (mínimo 5)
GEMINI_API_KEY_1=AIzaSy...
GEMINI_API_KEY_2=AIzaSy...

# Google OAuth
GOOGLE_CLIENT_ID=tu-client-id
GOOGLE_CLIENT_SECRET=tu-client-secret

# Configuración
NODE_ENV=production
```

## 📖 Documentación

- **[Guía de Despliegue](whatsapp-agent/DEPLOY-RENDER.md)** - Instrucciones completas para Render
- **[Análisis del Sistema](memory-bank/)** - Documentación técnica detallada
- **[Variables de Entorno](whatsapp-agent/.env.example)** - Configuración completa

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es privado y propietario.

## 📞 Soporte

Para soporte técnico, contacta al desarrollador.

---

**Desarrollado con ❤️ para automatizar ventas por WhatsApp**
