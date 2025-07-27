import { useState, useEffect } from 'react'
import { QrCode, MessageCircle, TrendingUp, Package, ShoppingCart, AlertTriangle, RefreshCw } from 'lucide-react'
import { buildApiUrl, API_CONFIG } from '../config/api'
import QRCodeDisplay from './QRCodeDisplay'

const Dashboard = ({ whatsappStatus, qrCode, socket }) => {
  const [stats, setStats] = useState({
    totalProducts: 0,
    pendingOrders: 0,
    todayMessages: 0,
    todaySales: 0,
    totalSales: 0,
    totalRevenue: 0,
    apiKeys: { total: 0, available: 0, totalRequests: 0 }
  })

  // Función para cargar estadísticas desde API REST
  const loadStats = async () => {
    try {
      const statsUrl = buildApiUrl(API_CONFIG.ENDPOINTS.STATS)
      console.log('📊 Cargando estadísticas desde:', statsUrl)
      const response = await fetch(statsUrl)
      const data = await response.json()
      if (data.status === 'OK') {
        setStats(data)
      }
    } catch (error) {
      console.error('Error cargando estadísticas:', error)
    }
  }

  useEffect(() => {
    // Cargar estadísticas iniciales
    loadStats()

    // Actualizar cada 30 segundos
    const interval = setInterval(loadStats, 30000)

    if (socket) {
      // Solicitar estadísticas al servidor via socket (fallback)
      socket.emit('get-stats')

      socket.on('stats-update', (newStats) => {
        setStats(prev => ({ ...prev, ...newStats }))
      })

      // Actualizar cuando hay cambios en inventario/pedidos
      socket.on('inventory-updated', loadStats)
      socket.on('orders-updated', loadStats)

      return () => {
        clearInterval(interval)
        socket.off('stats-update')
        socket.off('inventory-updated')
        socket.off('orders-updated')
      }
    }

    return () => clearInterval(interval)
  }, [socket])

  const StatCard = ({ icon: Icon, title, value, color }) => (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ 
          padding: '0.75rem', 
          borderRadius: '12px', 
          backgroundColor: `${color}20`,
          color: color
        }}>
          <Icon size={24} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
            {value}
          </h3>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            {title}
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="dashboard">
      <h1 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
        Dashboard
      </h1>

      {/* Estadísticas */}
      <div className="grid grid-2" style={{ marginBottom: '2rem' }}>
        <StatCard
          icon={Package}
          title="Productos en Inventario"
          value={stats.totalProducts}
          color="var(--whatsapp-green)"
        />
        <StatCard
          icon={ShoppingCart}
          title="Pedidos Pendientes"
          value={stats.pendingOrders}
          color="var(--warning-color)"
        />
        <StatCard
          icon={MessageCircle}
          title="Mensajes Hoy"
          value={stats.todayMessages}
          color="var(--whatsapp-blue)"
        />
        <StatCard
          icon={TrendingUp}
          title="Ventas Hoy"
          value={`S/ ${stats.todaySales}`}
          color="var(--success-color)"
        />
      </div>

      {/* Estadísticas Adicionales */}
      <div className="stats-grid">
        <StatCard
          icon={TrendingUp}
          title="Total Ventas"
          value={stats.totalSales || 0}
          color="#6f42c1"
        />
        <StatCard
          icon={TrendingUp}
          title="Ingresos Totales"
          value={`S/ ${(stats.totalRevenue || 0).toFixed(2)}`}
          color="#28a745"
        />
        <StatCard
          icon={RefreshCw}
          title="API Keys Disponibles"
          value={`${stats.apiKeys?.available || 0}/${stats.apiKeys?.total || 0}`}
          color="#007bff"
        />
        <StatCard
          icon={MessageCircle}
          title="Requests API"
          value={stats.apiKeys?.totalRequests || 0}
          color="#fd7e14"
        />
      </div>

      {/* Estado de WhatsApp */}
      <div className="card">
        <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <QrCode size={24} />
          Estado de WhatsApp
        </h2>
        
        {whatsappStatus === 'disconnected' && (
          <div className="qr-container">
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Conecta tu WhatsApp escaneando el código QR desde tu teléfono
            </p>
            <div style={{
              padding: '1rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <QrCode size={48} color="var(--text-secondary)" />
              <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)' }}>
                Esperando conexión...
              </p>
            </div>
          </div>
        )}

        {whatsappStatus === 'session-invalid' && (
          <div className="qr-container">
            <div style={{
              padding: '1.5rem',
              backgroundColor: '#fff3cd',
              borderRadius: '8px',
              textAlign: 'center',
              border: '1px solid #ffeaa7'
            }}>
              <AlertTriangle size={48} color="#856404" style={{ marginBottom: '1rem' }} />
              <h3 style={{ color: '#856404', margin: '0 0 0.5rem 0' }}>
                Sesión Cerrada desde WhatsApp
              </h3>
              <p style={{ margin: '0 0 1rem 0', color: '#856404' }}>
                Detectamos que cerraste la sesión desde tu teléfono. Estamos limpiando automáticamente...
              </p>
              <div className="spinner" style={{ margin: '0 auto' }}></div>
            </div>
          </div>
        )}

        {whatsappStatus === 'ready-to-connect' && (
          <div className="qr-container">
            <div style={{
              padding: '1.5rem',
              backgroundColor: '#d1ecf1',
              borderRadius: '8px',
              textAlign: 'center',
              border: '1px solid #bee5eb'
            }}>
              <RefreshCw size={48} color="#0c5460" style={{ marginBottom: '1rem' }} />
              <h3 style={{ color: '#0c5460', margin: '0 0 0.5rem 0' }}>
                ¡Listo para Reconectar!
              </h3>
              <p style={{ margin: '0', color: '#0c5460' }}>
                Sesión limpiada exitosamente. Haz clic en "Conectar" para escanear un nuevo código QR.
              </p>
            </div>
          </div>
        )}

        {whatsappStatus === 'connecting' && qrCode && (
          <QRCodeDisplay qrCode={qrCode} />
        )}

        {whatsappStatus === 'connected' && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ 
              width: '64px', 
              height: '64px', 
              backgroundColor: 'var(--success-color)', 
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem auto'
            }}>
              <MessageCircle size={32} color="white" />
            </div>
            <h3 style={{ color: 'var(--success-color)', margin: '0 0 0.5rem 0' }}>
              ¡WhatsApp Conectado!
            </h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              El agente de ventas está activo y listo para recibir mensajes
            </p>
          </div>
        )}
      </div>

      {/* Instrucciones */}
      {whatsappStatus === 'connected' && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--whatsapp-green)' }}>
            🤖 Agente IA Activo
          </h3>
          <div style={{ backgroundColor: 'var(--whatsapp-light-green)', padding: '1rem', borderRadius: '8px' }}>
            <p style={{ margin: 0, lineHeight: '1.6' }}>
              <strong>El agente inteligente está funcionando:</strong><br />
              • Responde automáticamente a consultas de productos<br />
              • Procesa pedidos y valida pagos Yape<br />
              • Actualiza el inventario en tiempo real<br />
              • Gestiona el estado de los pedidos
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
