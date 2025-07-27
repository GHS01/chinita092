import { useState, useEffect } from 'react'
import { Search, Filter, Eye, CheckCircle, Truck, Package, X } from 'lucide-react'
import OrderCard from './OrderCard'
import PendingOrderCard from './PendingOrderCard'
import OrderDetails from './OrderDetails'

const Orders = ({ socket }) => {
  const [orders, setOrders] = useState([])
  const [filteredOrders, setFilteredOrders] = useState([])
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({})

  const statusOptions = [
    { value: 'all', label: 'Todos', icon: Package },
    { value: 'pendiente', label: 'Pendientes', icon: Package },
    { value: 'pagado', label: 'Pagados', icon: CheckCircle },
    { value: 'enviado', label: 'Enviados', icon: Truck },
    { value: 'completado', label: 'Completados', icon: CheckCircle },
    { value: 'cancelado', label: 'Cancelados', icon: X }
  ]

  useEffect(() => {
    if (socket) {
      // Solicitar pedidos inicial
      socket.emit('get-orders')
      
      // Escuchar actualizaciones
      socket.on('orders-data', (data) => {
        setOrders(data)
        setLoading(false)
      })

      socket.on('order-updated', (order) => {
        setOrders(prev => prev.map(o => o.id === order.id ? order : o))
        if (selectedOrder && selectedOrder.id === order.id) {
          setSelectedOrder(order)
        }
      })

      socket.on('orders-updated', () => {
        socket.emit('get-orders')
      })

      socket.on('orders-error', (error) => {
        console.error('Error de pedidos:', error)
        alert('Error: ' + error)
      })

      return () => {
        socket.off('orders-data')
        socket.off('order-updated')
        socket.off('orders-updated')
        socket.off('orders-error')
      }
    }
  }, [socket])

  // Filtrar pedidos cuando cambian los filtros
  useEffect(() => {
    let filtered = orders

    // Filtrar por estado
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(order => order.estado === selectedStatus)
    }

    // Filtrar por búsqueda
    if (searchTerm) {
      filtered = filtered.filter(order => 
        order.cliente_whatsapp.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.cliente_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.id.toString().includes(searchTerm)
      )
    }

    setFilteredOrders(filtered)
  }, [orders, selectedStatus, searchTerm])

  // Calcular estadísticas
  useEffect(() => {
    const newStats = statusOptions.reduce((acc, status) => {
      if (status.value === 'all') {
        acc[status.value] = orders.length
      } else {
        acc[status.value] = orders.filter(o => o.estado === status.value).length
      }
      return acc
    }, {})
    setStats(newStats)
  }, [orders])

  const handleStatusChange = (orderId, newStatus) => {
    socket.emit('update-order-status', orderId, newStatus)
  }

  const handleDeleteOrder = (orderId) => {
    socket.emit('delete-order', orderId)
  }

  const handleViewOrder = (order) => {
    setSelectedOrder(order)
  }

  const handleCloseDetails = () => {
    setSelectedOrder(null)
  }

  if (loading) {
    return (
      <div className="orders-loading">
        <div className="spinner"></div>
        <p>Cargando pedidos...</p>
      </div>
    )
  }

  return (
    <div className="orders">
      <div className="orders-header">
        <h1>Pedidos</h1>
        <div className="orders-stats">
          {statusOptions.map(({ value, label, icon: Icon }) => (
            <div key={value} className="stat-item">
              <Icon size={16} />
              <span>{stats[value] || 0}</span>
              <small>{label}</small>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="orders-filters card">
        <div className="search-box">
          <Search size={20} />
          <input
            type="text"
            placeholder="Buscar por cliente, teléfono o ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="status-filters">
          {statusOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              className={`filter-btn ${selectedStatus === value ? 'active' : ''}`}
              onClick={() => setSelectedStatus(value)}
            >
              <Icon size={16} />
              {label}
              {stats[value] > 0 && (
                <span className="filter-count">{stats[value]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de pedidos */}
      <div className="orders-list">
        {filteredOrders.length === 0 ? (
          <div className="empty-state">
            <Package size={48} color="var(--text-secondary)" />
            <h3>No hay pedidos</h3>
            <p>
              {searchTerm || selectedStatus !== 'all' 
                ? 'No se encontraron pedidos con los filtros aplicados'
                : 'Los pedidos aparecerán aquí cuando los clientes hagan compras'
              }
            </p>
          </div>
        ) : (
          filteredOrders.map(order => {
            // Usar PendingOrderCard para pedidos pendientes que tienen información de pago
            const hasPaymentInfo = order.yape_operation_number || order.yape_payment_date || order.yape_detected_holder || order.captura_pago_url
            const isPendingWithPayment = order.estado === 'pendiente' && hasPaymentInfo

            if ((selectedStatus === 'pendiente' && hasPaymentInfo) || (selectedStatus === 'all' && isPendingWithPayment)) {
              return (
                <PendingOrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleStatusChange}
                  onView={handleViewOrder}
                />
              )
            } else {
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleStatusChange}
                  onView={handleViewOrder}
                  onDelete={handleDeleteOrder}
                />
              )
            }
          })
        )}
      </div>

      {/* Modal de detalles */}
      {selectedOrder && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <OrderDetails
              order={selectedOrder}
              onStatusChange={handleStatusChange}
              onClose={handleCloseDetails}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default Orders
