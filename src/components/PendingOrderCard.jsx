import { useState } from 'react'
import { Eye, Clock, CheckCircle, X, ChevronDown, Receipt, Calendar, Hash, CreditCard, User } from 'lucide-react'

const PendingOrderCard = ({ order, onStatusChange, onView }) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false)

  const formatDate = (dateString) => {
    if (!dateString) return 'No disponible'
    return new Date(dateString).toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatPaymentDate = (dateString) => {
    if (!dateString) return 'No disponible'
    // Si viene en formato "DD mmm. YYYY | HH:MM p. m." lo mostramos tal como está
    return dateString
  }

  const getStatusConfig = (status) => {
    const configs = {
      pendiente: { 
        icon: Clock, 
        color: '#ffc107', 
        bg: '#fff3cd', 
        label: 'Pendiente' 
      },
      pagado: { 
        icon: CheckCircle, 
        color: '#28a745', 
        bg: '#d4edda', 
        label: 'Pagado' 
      }
    }
    return configs[status] || configs.pendiente
  }

  const statusConfig = getStatusConfig(order.estado)
  const StatusIcon = statusConfig.icon

  const getNextStatuses = (currentStatus) => {
    const statusFlow = {
      pendiente: ['pagado', 'cancelado'],
      pagado: ['enviado', 'cancelado']
    }
    return statusFlow[currentStatus] || []
  }

  const nextStatuses = getNextStatuses(order.estado)

  const handleStatusChange = (newStatus) => {
    onStatusChange(order.id, newStatus)
    setShowStatusMenu(false)
  }

  const hasPaymentInfo = order.yape_operation_number || order.yape_payment_date || order.yape_detected_holder

  return (
    <div className="order-card card pending-order-card">
      <div className="order-header">
        <div className="order-info">
          <div className="order-id">Pedido #{order.id}</div>
          <div className="order-customer">
            <strong>{order.cliente_nombre || 'Cliente'}</strong>
            <span className="order-phone">{order.cliente_whatsapp}</span>
          </div>
        </div>
        
        <div className="order-status-container">
          <div 
            className="order-status"
            style={{ 
              backgroundColor: statusConfig.bg, 
              color: statusConfig.color 
            }}
          >
            <StatusIcon size={16} />
            {statusConfig.label}
          </div>
          
          {nextStatuses.length > 0 && (
            <div className="status-actions">
              <button
                className="status-menu-btn"
                onClick={() => setShowStatusMenu(!showStatusMenu)}
              >
                <ChevronDown size={16} />
              </button>
              
              {showStatusMenu && (
                <div className="status-menu">
                  {nextStatuses.map(status => {
                    const config = getStatusConfig(status)
                    const Icon = config.icon
                    return (
                      <button
                        key={status}
                        className="status-menu-item"
                        onClick={() => handleStatusChange(status)}
                      >
                        <Icon size={16} />
                        {config.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Productos */}
      <div className="order-products">
        {order.productos.map((producto, index) => (
          <div key={index} className="product-item">
            <span className="product-quantity">{producto.cantidad}x</span>
            <span className="product-name">{producto.nombre}</span>
          </div>
        ))}
      </div>

      {/* Información del Comprobante Yape */}
      {hasPaymentInfo && (
        <div className="payment-info-section">
          <div className="payment-info-header">
            <Receipt size={16} />
            <span>COMPROBANTE YAPE</span>
          </div>
          
          <div className="payment-details">
            <div className="payment-row">
              <CreditCard size={14} />
              <span className="payment-label">Monto:</span>
              <span className="payment-value success">S/ {order.total.toFixed(2)}</span>
              <span className="payment-status">✅</span>
            </div>
            
            {order.yape_detected_holder && (
              <div className="payment-row">
                <User size={14} />
                <span className="payment-label">Titular:</span>
                <span className="payment-value">{order.yape_detected_holder}</span>
                <span className="payment-status">✅</span>
              </div>
            )}
            
            {order.yape_operation_number && (
              <div className="payment-row">
                <Hash size={14} />
                <span className="payment-label">Operación:</span>
                <span className="payment-value">{order.yape_operation_number}</span>
              </div>
            )}
            
            {order.yape_payment_date && (
              <div className="payment-row">
                <Calendar size={14} />
                <span className="payment-label">Fecha pago:</span>
                <span className="payment-value">{formatPaymentDate(order.yape_payment_date)}</span>
              </div>
            )}
            
            {order.yape_last_digits && (
              <div className="payment-row">
                <span className="payment-label">Últimos dígitos:</span>
                <span className="payment-value">***{order.yape_last_digits}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="order-footer">
        <div className="order-meta">
          <div className="order-total">
            <strong>S/ {order.total.toFixed(2)}</strong>
          </div>
          <div className="order-date">
            <small>Pedido: {formatDate(order.fecha_creacion)}</small>
          </div>
        </div>
        
        <div className="order-actions">
          {hasPaymentInfo && (
            <button
              className="btn btn-success btn-sm"
              onClick={() => handleStatusChange('pagado')}
            >
              <CheckCircle size={16} />
              Aprobar
            </button>
          )}
          
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onView(order)}
          >
            <Eye size={16} />
            Ver Detalles
          </button>
        </div>
      </div>

      {order.captura_pago_url && (
        <div className="payment-indicator">
          <CheckCircle size={16} color="var(--success-color)" />
          <span>Captura de pago recibida</span>
        </div>
      )}
    </div>
  )
}

export default PendingOrderCard
