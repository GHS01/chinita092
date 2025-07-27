import { Wifi, WifiOff, Loader, AlertTriangle, RefreshCw } from 'lucide-react'

const ConnectionStatus = ({ status, onConnect, onDisconnect }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: Wifi,
          text: 'WhatsApp Conectado',
          color: 'var(--success-color)',
          description: 'Agente de ventas activo y funcionando',
          action: { text: 'Desconectar', onClick: onDisconnect, variant: 'secondary' }
        }
      case 'connecting':
        return {
          icon: Loader,
          text: 'Conectando...',
          color: 'var(--warning-color)',
          description: 'Estableciendo conexión con WhatsApp',
          action: null
        }
      case 'reconnecting':
        return {
          icon: Loader,
          text: 'Reconectando...',
          color: 'var(--warning-color)',
          description: 'Reestableciendo conexión automáticamente',
          action: null
        }
      case 'session-invalid':
        return {
          icon: AlertTriangle,
          text: 'Sesión Inválida',
          color: 'var(--error-color)',
          description: 'Sesión cerrada desde WhatsApp. Limpiando automáticamente...',
          action: null
        }
      case 'session-cleared':
      case 'ready-to-connect':
        return {
          icon: RefreshCw,
          text: 'Listo para Conectar',
          color: 'var(--whatsapp-blue)',
          description: 'Sesión limpiada. Puedes conectar nuevamente',
          action: { text: 'Conectar', onClick: onConnect, variant: 'primary' }
        }
      case 'error':
        return {
          icon: AlertTriangle,
          text: 'Error de Conexión',
          color: 'var(--error-color)',
          description: 'Problema técnico. Ve a Configuración para resetear',
          action: { text: 'Reintentar', onClick: onConnect, variant: 'primary' }
        }
      case 'disconnected':
      default:
        return {
          icon: WifiOff,
          text: 'WhatsApp Desconectado',
          color: 'var(--error-color)',
          description: 'Conecta WhatsApp para activar el agente de ventas',
          action: { text: 'Conectar', onClick: onConnect, variant: 'primary' }
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Icon
            size={24}
            color={config.color}
            className={status === 'connecting' || status === 'reconnecting' ? 'spinner' : ''}
          />
          <div>
            <div style={{ fontWeight: '500', color: config.color }}>
              {config.text}
            </div>
            {config.description && (
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {config.description}
              </div>
            )}
          </div>
        </div>
        
        {config.action && (
          <button
            className={`btn btn-${config.action.variant}`}
            onClick={config.action.onClick}
          >
            {config.action.text}
          </button>
        )}
      </div>
    </div>
  )
}

export default ConnectionStatus
