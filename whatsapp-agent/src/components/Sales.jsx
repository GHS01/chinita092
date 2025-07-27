import { useState, useEffect } from 'react'
import { TrendingUp, DollarSign, Users, Package, Star, Calendar, Award } from 'lucide-react'
import SalesHistory from './SalesHistory'

const Sales = ({ socket }) => {
  const [statsGenerales, setStatsGenerales] = useState({})
  const [ventasPorCategoria, setVentasPorCategoria] = useState([])
  const [productosMasVendidos, setProductosMasVendidos] = useState([])
  const [clientesRecurrentes, setClientesRecurrentes] = useState([])
  const [ventasPorPeriodo, setVentasPorPeriodo] = useState([])
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (socket) {
      // Cargar datos iniciales
      socket.emit('get-sales-stats')
      socket.emit('get-ventas-por-categoria')
      socket.emit('get-productos-mas-vendidos', null)
      socket.emit('get-clientes-recurrentes')
      socket.emit('get-ventas-por-periodo', 30)

      // Listeners para respuestas
      socket.on('sales-stats-data', (data) => {
        setStatsGenerales(data)
        setLoading(false)
      })

      socket.on('ventas-categoria-data', (data) => {
        setVentasPorCategoria(data)
      })

      socket.on('productos-mas-vendidos-data', (data) => {
        setProductosMasVendidos(data)
      })

      socket.on('clientes-recurrentes-data', (data) => {
        setClientesRecurrentes(data)
      })

      socket.on('ventas-periodo-data', (data) => {
        setVentasPorPeriodo(data)
      })

      socket.on('sales-error', (error) => {
        console.error('Error en ventas:', error)
        setLoading(false)
      })

      return () => {
        socket.off('sales-stats-data')
        socket.off('ventas-categoria-data')
        socket.off('productos-mas-vendidos-data')
        socket.off('clientes-recurrentes-data')
        socket.off('ventas-periodo-data')
        socket.off('sales-error')
      }
    }
  }, [socket])

  const handleCategoriaClick = (categoria) => {
    setCategoriaSeleccionada(categoria)
    socket.emit('get-productos-mas-vendidos', categoria)
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount || 0)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-PE')
  }

  const getNivelColor = (nivel) => {
    switch (nivel) {
      case 'VIP': return '#FFD700'
      case 'Frecuente': return '#32CD32'
      case 'Recurrente': return '#4169E1'
      default: return '#808080'
    }
  }

  if (loading) {
    return (
      <div className="sales loading">
        <div className="loading-spinner">
          <TrendingUp size={48} />
          <p>Cargando estadísticas de ventas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="sales">
      <div className="sales-header">
        <h1>📊 Estadísticas de Ventas</h1>
        <p>Análisis completo de ventas, productos y clientes</p>
      </div>

      {/* Estadísticas Generales */}
      <div className="stats-grid">
        <div
          className="stat-card clickable"
          onClick={() => setShowHistory(true)}
          title="Haz clic para ver el historial completo de ventas"
        >
          <div className="stat-icon">
            <DollarSign size={24} color="#28a745" />
          </div>
          <div className="stat-content">
            <h3>Ingresos Totales</h3>
            <p className="stat-value">{formatCurrency(statsGenerales.ingresos_totales)}</p>
            <small>Hoy: {formatCurrency(statsGenerales.ingresos_hoy)}</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Package size={24} color="#007bff" />
          </div>
          <div className="stat-content">
            <h3>Productos Vendidos</h3>
            <p className="stat-value">{statsGenerales.productos_vendidos || 0}</p>
            <small>{statsGenerales.total_ventas || 0} transacciones</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Users size={24} color="#6f42c1" />
          </div>
          <div className="stat-content">
            <h3>Clientes Únicos</h3>
            <p className="stat-value">{statsGenerales.total_clientes || 0}</p>
            <small>Ventas hoy: {statsGenerales.ventas_hoy || 0}</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <TrendingUp size={24} color="#fd7e14" />
          </div>
          <div className="stat-content">
            <h3>Venta Promedio</h3>
            <p className="stat-value">{formatCurrency(statsGenerales.venta_promedio)}</p>
            <small>Por transacción</small>
          </div>
        </div>
      </div>

      {/* Ventas por Categoría */}
      <div className="sales-section card">
        <h2>
          <Package size={20} />
          Ventas por Categoría
        </h2>
        <div className="categoria-grid">
          {ventasPorCategoria.map((categoria, index) => (
            <div 
              key={index} 
              className={`categoria-card ${categoriaSeleccionada === categoria.categoria ? 'selected' : ''}`}
              onClick={() => handleCategoriaClick(categoria.categoria)}
            >
              <h3>{categoria.categoria}</h3>
              <div className="categoria-stats">
                <p><strong>{formatCurrency(categoria.total_ingresos)}</strong></p>
                <small>{categoria.total_productos_vendidos} productos vendidos</small>
                <small>{categoria.clientes_unicos} clientes únicos</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Productos Más Vendidos */}
      <div className="sales-section card">
        <h2>
          <Star size={20} />
          Productos Más Vendidos
          {categoriaSeleccionada && <span> - {categoriaSeleccionada}</span>}
        </h2>
        {categoriaSeleccionada && (
          <button 
            className="btn btn-secondary"
            onClick={() => {
              setCategoriaSeleccionada(null)
              socket.emit('get-productos-mas-vendidos', null)
            }}
          >
            Ver todos los productos
          </button>
        )}
        <div className="productos-ranking">
          {productosMasVendidos.slice(0, 10).map((producto, index) => (
            <div key={producto.producto_id} className="ranking-item">
              <div className="ranking-position">#{index + 1}</div>
              <div className="ranking-content">
                <h4>{producto.producto_nombre}</h4>
                <p className="categoria-badge">{producto.categoria}</p>
                <div className="ranking-stats">
                  <span>{producto.total_vendido} vendidos</span>
                  <span>{formatCurrency(producto.total_ingresos)}</span>
                  <span>{producto.veces_comprado} transacciones</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Clientes Recurrentes */}
      <div className="sales-section card">
        <h2>
          <Award size={20} />
          Ranking de Clientes
        </h2>
        <div className="clientes-ranking">
          {clientesRecurrentes.slice(0, 15).map((cliente, index) => (
            <div key={cliente.cliente_whatsapp} className="cliente-item">
              <div className="cliente-position">#{index + 1}</div>
              <div className="cliente-content">
                <div className="cliente-info">
                  <h4>{cliente.cliente_nombre || 'Cliente Anónimo'}</h4>
                  <p className="cliente-phone">{cliente.cliente_whatsapp}</p>
                </div>
                <div className="cliente-stats">
                  <span 
                    className="nivel-badge"
                    style={{ backgroundColor: getNivelColor(cliente.nivel_cliente) }}
                  >
                    {cliente.nivel_cliente}
                  </span>
                  <span>{cliente.total_pedidos} pedidos</span>
                  <span>{formatCurrency(cliente.total_gastado)}</span>
                </div>
                <div className="cliente-details">
                  <small>Categoría favorita: {cliente.categoria_favorita}</small>
                  <small>Última compra: {formatDate(cliente.ultima_compra)}</small>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal de Historial de Ventas */}
      <SalesHistory
        socket={socket}
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </div>
  )
}

export default Sales
