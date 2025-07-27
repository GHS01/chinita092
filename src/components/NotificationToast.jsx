import { useState, useEffect } from 'react'
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react'

const NotificationToast = ({ notification, onClose }) => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (notification) {
      setIsVisible(true)
      
      // Auto-close after duration
      const timer = setTimeout(() => {
        handleClose()
      }, notification.duration || 5000)

      return () => clearTimeout(timer)
    }
  }, [notification])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(() => {
      onClose()
    }, 300) // Wait for animation
  }

  if (!notification) return null

  const getNotificationConfig = (type) => {
    const configs = {
      success: {
        icon: CheckCircle,
        color: 'var(--success-color)',
        bg: '#d4edda',
        border: '#c3e6cb'
      },
      warning: {
        icon: AlertTriangle,
        color: 'var(--warning-color)',
        bg: '#fff3cd',
        border: '#ffeaa7'
      },
      error: {
        icon: AlertCircle,
        color: 'var(--error-color)',
        bg: '#f8d7da',
        border: '#f5c6cb'
      },
      info: {
        icon: Info,
        color: 'var(--whatsapp-blue)',
        bg: '#d1ecf1',
        border: '#bee5eb'
      }
    }
    return configs[type] || configs.info
  }

  const config = getNotificationConfig(notification.type)
  const Icon = config.icon

  return (
    <div className={`notification-toast ${isVisible ? 'visible' : ''}`}>
      <div 
        className="toast-content"
        style={{
          backgroundColor: config.bg,
          borderColor: config.border
        }}
      >
        <div className="toast-icon">
          <Icon size={20} color={config.color} />
        </div>
        
        <div className="toast-message">
          <div className="toast-title" style={{ color: config.color }}>
            {notification.title}
          </div>
          {notification.message && (
            <div className="toast-text">
              {notification.message}
            </div>
          )}
        </div>
        
        <button 
          className="toast-close"
          onClick={handleClose}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

export default NotificationToast
