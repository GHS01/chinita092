import { useState, useEffect } from 'react'
import { Cloud, User, CheckCircle, AlertCircle, Upload, Download, Settings, Loader } from 'lucide-react'

export default function GoogleDriveAuth({ socket }) {
  const [authStatus, setAuthStatus] = useState('disconnected') // disconnected, connecting, connected
  const [userInfo, setUserInfo] = useState(null)
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [queueLength, setQueueLength] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!socket) return

    // Verificar estado de autenticación al cargar
    socket.emit('check-google-drive-auth')
    
    // Listeners de eventos
    socket.on('google-drive-auth-status', handleAuthStatus)
    socket.on('google-auth-url', handleAuthUrl)
    socket.on('google-drive-error', handleError)
    socket.on('backup-completed', handleBackupCompleted)
    socket.on('restore-completed', handleRestoreCompleted)
    socket.on('database-restored-notification', handleDatabaseRestoredNotification)

    return () => {
      socket.off('google-drive-auth-status', handleAuthStatus)
      socket.off('google-auth-url', handleAuthUrl)
      socket.off('google-drive-error', handleError)
      socket.off('backup-completed', handleBackupCompleted)
      socket.off('restore-completed', handleRestoreCompleted)
      socket.off('database-restored-notification', handleDatabaseRestoredNotification)
    }
  }, [socket])

  const handleAuthStatus = (data) => {
    setAuthStatus(data.authenticated ? 'connected' : 'disconnected')
    setUserInfo(data.userInfo)
    setSyncEnabled(data.syncEnabled)
    setQueueLength(data.queueLength || 0)
    setIsLoading(false)
    setError(null)
  }

  const handleAuthUrl = (data) => {
    // Abrir popup de OAuth
    const popup = window.open(
      data.authUrl,
      'google-oauth',
      'width=500,height=600,scrollbars=yes,resizable=yes,left=' + 
      (window.screen.width / 2 - 250) + ',top=' + (window.screen.height / 2 - 300)
    )
    
    // Escuchar mensajes del popup
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return
      
      if (event.data.type === 'auth-success') {
        popup.close()
        setIsLoading(false)
        // Verificar estado actualizado
        socket.emit('check-google-drive-auth')
        window.removeEventListener('message', handleMessage)
      } else if (event.data.type === 'auth-error') {
        popup.close()
        setIsLoading(false)
        setError('Error en autenticación: ' + event.data.error)
        window.removeEventListener('message', handleMessage)
      } else if (event.data.type === 'auth-cancelled') {
        popup.close()
        setIsLoading(false)
        setError('Autenticación cancelada por el usuario')
        window.removeEventListener('message', handleMessage)
      }
    }
    
    window.addEventListener('message', handleMessage)
    
    // Verificar si el popup se cerró manualmente
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed)
        setIsLoading(false)
        window.removeEventListener('message', handleMessage)
      }
    }, 1000)
  }

  const handleError = (errorMessage) => {
    setError(errorMessage)
    setIsLoading(false)
  }

  const handleBackupCompleted = (data) => {
    setLastSync(data.timestamp)
    setIsLoading(false)
    setError(null)
    // Mostrar notificación de éxito
    console.log('✅ Respaldo completado:', data.message)
  }

  const handleRestoreCompleted = (data) => {
    setIsLoading(false)
    setError(null)
    // Mostrar notificación de éxito
    alert('✅ ' + data.message)

    // Si este cliente inició la restauración, recargar la página
    if (data.shouldReload) {
      if (confirm('¿Recargar la página para ver los cambios actualizados?')) {
        window.location.reload()
      }
    }
  }

  const handleDatabaseRestoredNotification = (data) => {
    // Notificación para otros clientes (no el que inició la restauración)
    console.log('🔄 Base de datos actualizada por otro usuario:', data.message)

    // Mostrar notificación discreta sin forzar recarga
    if (confirm('Otro usuario ha actualizado la base de datos. ¿Recargar para ver los cambios?')) {
      window.location.reload()
    }
  }

  const handleConnect = () => {
    setIsLoading(true)
    setError(null)
    socket.emit('get-google-auth-url')
  }

  const handleDisconnect = () => {
    if (confirm('¿Desconectar de Google Drive? Se deshabilitará la sincronización automática.')) {
      setIsLoading(true)
      socket.emit('disconnect-google-drive')
    }
  }

  const toggleSync = () => {
    const newState = !syncEnabled
    setIsLoading(true)
    socket.emit('toggle-google-drive-sync', { enabled: newState })
  }

  const handleManualBackup = () => {
    if (confirm('¿Realizar respaldo manual ahora?')) {
      setIsLoading(true)
      socket.emit('manual-backup-to-drive')
    }
  }

  const handleManualRestore = () => {
    if (confirm('⚠️ ADVERTENCIA: Esto sobrescribirá todos los datos actuales con el respaldo de Google Drive. ¿Continuar?')) {
      if (confirm('🔄 CONFIRMACIÓN FINAL: Se reemplazará completamente la base de datos actual. Esta acción no se puede deshacer. ¿Proceder?')) {
        setIsLoading(true)
        socket.emit('manual-restore-from-drive')
      }
    }
  }

  const clearError = () => {
    setError(null)
  }

  return (
    <div className="google-drive-section">
      <div className="section-header">
        <h3>
          <Cloud size={20} />
          Sincronización con Google Drive
        </h3>
        {isLoading && <Loader size={16} className="spinner" />}
      </div>

      {/* Mostrar errores */}
      {error && (
        <div className="error-message">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={clearError} className="error-close">×</button>
        </div>
      )}

      {/* Estado desconectado */}
      {authStatus === 'disconnected' && (
        <div className="auth-disconnected">
          <div className="auth-info">
            <AlertCircle size={48} color="#dc3545" />
            <div>
              <h4>No conectado</h4>
              <p>Conecta tu cuenta de Google para habilitar respaldos automáticos de tu base de datos</p>
              <small>Los datos se sincronizarán automáticamente cada vez que realices cambios</small>
            </div>
          </div>
          
          <button 
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={isLoading}
          >
            <Cloud size={16} />
            {isLoading ? 'Conectando...' : 'Conectar con Google Drive'}
          </button>
        </div>
      )}

      {/* Estado conectado */}
      {authStatus === 'connected' && (
        <div className="auth-connected">
          {/* Información del usuario */}
          <div className="user-info">
            <div className="user-details">
              <CheckCircle size={20} color="#28a745" />
              <div>
                <h4>Conectado como:</h4>
                <p className="user-email">{userInfo?.email}</p>
                {userInfo?.name && <small>{userInfo.name}</small>}
              </div>
            </div>
            <button 
              className="btn btn-outline btn-sm"
              onClick={handleDisconnect}
              disabled={isLoading}
            >
              Desconectar
            </button>
          </div>

          {/* Control de sincronización automática */}
          <div className="sync-controls">

            
            <div className="sync-description">
              <small>
                {syncEnabled 
                  ? 'Los datos se respaldan automáticamente en Google Drive cada vez que realizas cambios'
                  : 'Los datos solo se guardan localmente. Activa la sincronización para respaldos automáticos'
                }
              </small>
            </div>
          </div>

          {/* Estado de sincronización */}
          <div className="sync-status">
            <div className="status-grid">
              <div className="status-item">
                <Settings size={16} />
                <div>
                  <span className="status-label">Estado:</span>
                  <span className="status-value">
                    {syncEnabled ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="status-toggle">
                  <label className="switch-small">
                    <input
                      type="checkbox"
                      checked={syncEnabled}
                      onChange={toggleSync}
                      disabled={isLoading}
                    />
                    <span className="slider-small round"></span>
                  </label>
                </div>
              </div>
              
              {queueLength > 0 && (
                <div className="status-item">
                  <Upload size={16} />
                  <div>
                    <span className="status-label">Cola:</span>
                    <span className="status-value">{queueLength} elementos</span>
                  </div>
                </div>
              )}
              
              {lastSync && (
                <div className="status-item">
                  <CheckCircle size={16} />
                  <div>
                    <span className="status-label">Último respaldo:</span>
                    <span className="status-value">
                      {new Date(lastSync).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Controles manuales */}
          <div className="manual-controls">
            <h5>Controles Manuales</h5>
            <div className="manual-buttons">
              <button 
                className="btn btn-secondary"
                onClick={handleManualBackup}
                disabled={isLoading}
              >
                <Upload size={16} />
                Respaldar Ahora
              </button>
              
              <button 
                className="btn btn-warning"
                onClick={handleManualRestore}
                disabled={isLoading}
              >
                <Download size={16} />
                Restaurar desde Drive
              </button>
            </div>
            <small className="manual-description">
              Usa estos botones para respaldos y restauraciones manuales cuando lo necesites
            </small>
          </div>
        </div>
      )}
    </div>
  )
}
