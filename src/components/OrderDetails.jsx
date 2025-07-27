import { useState } from 'react'
import { X, Clock, CheckCircle, Truck, Package, User, Phone, Calendar, DollarSign, Image } from 'lucide-react'

const OrderDetails = ({ order, onStatusChange, onClose }) => {
  const [showPaymentImage, setShowPaymentImage] = useState(false)

  const getStatusConfig = (status) => {
    const configs = {
      pendiente: { 
        icon: Clock, 
        color: '#ffc107', 
        bg: '#fff3cd', 
        label: 'Pendiente',
        description: 'Esperando confirmación de pago'
      },
      pagado: { 
        icon: CheckCircle, 
        color: '#28a745', 
        bg: '#d4edda', 
        label: 'Pagado',
        description: 'Pago confirmado, preparando envío'
      },
      enviado: { 
        icon: Truck, 
        color: '#17a2b8', 
        bg: '#d1ecf1', 
        label: 'Enviado',
        description: 'Pedido en camino al cliente'
      },
      completado: { 
        icon: CheckCircle, 
        color: '#28a745', 
        bg: '#d4edda', 
        label: 'Completado',
        description: 'Pedido entregado exitosamente'
      },
      cancelado: { 
        icon: X, 
        color: '#dc3545', 
        bg: '#f8d7da', 
        label: 'Cancelado',
        description: 'Pedido cancelado'
      }
    }
    return configs[status] || configs.pendiente
  }

  const statusConfig = getStatusConfig(order.estado)
  const StatusIcon = statusConfig.icon

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('es-PE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getNextStatuses = (currentStatus) => {
    const statusFlow = {
      pendiente: ['pagado', 'cancelado'],
      pagado: ['enviado', 'cancelado'],
      enviado: ['completado'],
      completado: [],
      cancelado: []
    }
    return statusFlow[currentStatus] || []
  }

  const nextStatuses = getNextStatuses(order.estado)

  const handleStatusChange = (newStatus) => {
    onStatusChange(order.id, newStatus)
  }

  return (
    <div className="order-details">
      <div className="order-details-header">
        <div className="header-info">
          <h2>Pedido #{order.id}</h2>
          <div 
            className="order-status-large"
            style={{ 
              backgroundColor: statusConfig.bg, 
              color: statusConfig.color 
            }}
          >
            <StatusIcon size={20} />
            <div>
              <div className="status-label">{statusConfig.label}</div>
              <div className="status-description">{statusConfig.description}</div>
            </div>
          </div>
        </div>
        
        <button className="btn-close" onClick={onClose}>
          <X size={24} />
        </button>
      </div>

      <div className="order-details-content">
        {/* Información del cliente */}
        <div className="details-section">
          <h3>
            <User size={20} />
            Información del Cliente
          </h3>
          <div className="client-info">
            <div className="info-item">
              <User size={16} />
              <span>{order.cliente_nombre || 'Cliente'}</span>
            </div>
            <div className="info-item">
              <Phone size={16} />
              <span>{order.cliente_whatsapp}</span>
            </div>
            <div className="info-item">
              <Calendar size={16} />
              <span>{formatDate(order.fecha_creacion)}</span>
            </div>
          </div>
        </div>

        {/* Productos */}
        <div className="details-section">
          <h3>
            <Package size={20} />
            Productos ({order.productos.length})
          </h3>
          <div className="products-list">
            {order.productos.map((producto, index) => (
              <div key={index} className="product-detail-item">
                <div className="product-info">
                  <div className="product-name">{producto.nombre}</div>
                  <div className="product-quantity">Cantidad: {producto.cantidad}</div>
                </div>
                <div className="product-prices">
                  <div className="unit-price">S/ {producto.precio_unitario}</div>
                  <div className="total-price">
                    S/ {(producto.cantidad * producto.precio_unitario).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="order-total-section">
            <div className="total-row">
              <span>Total del Pedido:</span>
              <strong>S/ {order.total.toFixed(2)}</strong>
            </div>
          </div>
        </div>

        {/* Información de pago Yape */}
        {(order.captura_pago_url || order.yape_operation_number || order.yape_payment_date || order.yape_detected_holder) && (
          <div className="details-section">
            <h3>
              <Image size={20} />
              Información de Pago Yape
            </h3>

            {/* Captura de pago si existe */}
            {order.captura_pago_url && (
              <div className="payment-proof">
                <img
                  src={order.captura_pago_url}
                  alt="Comprobante de pago Yape"
                  className="payment-image-thumb"
                  onClick={() => setShowPaymentImage(true)}
                />
                <p>Haz clic en la imagen para verla en tamaño completo</p>
              </div>
            )}

            {/* Información extraída del comprobante */}
            {(order.yape_operation_number || order.yape_payment_date || order.yape_detected_holder) && (
              <div className="payment-extracted-info">
                <h4>Datos del Comprobante</h4>
                <div className="payment-details-grid">
                  {order.yape_detected_holder && (
                    <div className="payment-detail-item">
                      <User size={16} />
                      <span className="detail-label">Titular:</span>
                      <span className="detail-value">{order.yape_detected_holder}</span>
                    </div>
                  )}

                  {order.yape_operation_number && (
                    <div className="payment-detail-item">
                      <span className="detail-label">Nº Operación:</span>
                      <span className="detail-value">{order.yape_operation_number}</span>
                    </div>
                  )}

                  {order.yape_payment_date && (
                    <div className="payment-detail-item">
                      <Calendar size={16} />
                      <span className="detail-label">Fecha Pago:</span>
                      <span className="detail-value">{order.yape_payment_date}</span>
                    </div>
                  )}

                  {order.yape_last_digits && (
                    <div className="payment-detail-item">
                      <span className="detail-label">Últimos dígitos:</span>
                      <span className="detail-value">***{order.yape_last_digits}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notas */}
        {order.notas && (
          <div className="details-section">
            <h3>Notas</h3>
            <div className="order-notes">
              {order.notas}
            </div>
          </div>
        )}

        {/* Acciones */}
        {nextStatuses.length > 0 && (
          <div className="details-section">
            <h3>Acciones</h3>
            <div className="status-actions">
              {nextStatuses.map(status => {
                const config = getStatusConfig(status)
                const Icon = config.icon
                return (
                  <button
                    key={status}
                    className="btn btn-primary"
                    onClick={() => handleStatusChange(status)}
                  >
                    <Icon size={16} />
                    Marcar como {config.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal para imagen de pago */}
      {showPaymentImage && order.captura_pago_url && (
        <div className="image-modal-overlay" onClick={() => setShowPaymentImage(false)}>
          <div className="image-modal">
            <button 
              className="image-modal-close"
              onClick={() => setShowPaymentImage(false)}
            >
              <X size={24} />
            </button>
            <img 
              src={order.captura_pago_url} 
              alt="Comprobante de pago Yape"
              className="payment-image-full"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default OrderDetails
