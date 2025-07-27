import { useState } from 'react'
import { Eye, Clock, CheckCircle, Truck, Package, X, ChevronDown, Trash2 } from 'lucide-react'

const OrderCard = ({ order, onStatusChange, onView, onDelete }) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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
      },
      enviado: { 
        icon: Truck, 
        color: '#17a2b8', 
        bg: '#d1ecf1', 
        label: 'Enviado' 
      },
      completado: { 
        icon: CheckCircle, 
        color: '#28a745', 
        bg: '#d4edda', 
        label: 'Completado' 
      },
      cancelado: { 
        icon: X, 
        color: '#dc3545', 
        bg: '#f8d7da', 
        label: 'Cancelado' 
      }
    }
    return configs[status] || configs.pendiente
  }

  const statusConfig = getStatusConfig(order.estado)
  const StatusIcon = statusConfig.icon

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
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

  const handleStatusChange = (newStatus) => {
    onStatusChange(order.id, newStatus)
    setShowStatusMenu(false)
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleDeleteConfirm = () => {
    onDelete(order.id)
    setShowDeleteConfirm(false)
  }

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false)
  }

  const nextStatuses = getNextStatuses(order.estado)

  return (
    <div className="order-card card">
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

          {/* Mostrar botón eliminar para pedidos cancelados */}
          {order.estado === 'cancelado' ? (
            <div className="status-actions">
              <button
                className="delete-btn"
                onClick={handleDeleteClick}
                title="Eliminar pedido"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ) : nextStatuses.length > 0 && (
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

      <div className="order-products">
        <div className="products-summary">
          {order.productos.slice(0, 2).map((producto, index) => (
            <div key={index} className="product-item">
              <span className="product-quantity">{producto.cantidad}x</span>
              <span className="product-name">{producto.nombre}</span>
            </div>
          ))}
          {order.productos.length > 2 && (
            <div className="more-products">
              +{order.productos.length - 2} más
            </div>
          )}
        </div>
      </div>

      <div className="order-footer">
        <div className="order-meta">
          <div className="order-total">
            <strong>S/ {order.total.toFixed(2)}</strong>
          </div>
          <div className="order-date">
            {formatDate(order.fecha_creacion)}
          </div>
          {/* Mostrar número de operación Yape para pedidos pagados */}
          {order.yape_operation_number && (
            <div className="yape-operation-info">
              <span className="yape-operation-label">Op:</span>
              <span className="yape-operation-number">{order.yape_operation_number}</span>
            </div>
          )}
        </div>
        
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onView(order)}
        >
          <Eye size={16} />
          Ver Detalles
        </button>
      </div>

      {order.captura_pago_url && (
        <div className="payment-indicator">
          <CheckCircle size={16} color="var(--success-color)" />
          <span>Captura de pago recibida</span>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {showDeleteConfirm && (
        <div className="delete-confirm-overlay">
          <div className="delete-confirm-modal">
            <h3>¿Eliminar pedido?</h3>
            <p>Esta acción no se puede deshacer. El pedido #{order.id} será eliminado permanentemente.</p>
            <div className="delete-confirm-actions">
              <button
                className="btn btn-secondary"
                onClick={handleDeleteCancel}
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteConfirm}
              >
                <Trash2 size={16} />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrderCard
