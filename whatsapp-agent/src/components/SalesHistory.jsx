import { useState, useEffect } from 'react'
import { X, Search, Calendar, Filter, Download, Eye, User, Package, DollarSign } from 'lucide-react'

const SalesHistory = ({ socket, isOpen, onClose }) => {
  const [historialVentas, setHistorialVentas] = useState([])
  const [loading, setLoading] = useState(false)
  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    cliente: '',
    producto: '',
    montoMin: '',
    montoMax: ''
  })
  const [paginacion, setPaginacion] = useState({
    pagina: 1,
    limite: 20,
    total: 0
  })
  const [ordenamiento, setOrdenamiento] = useState({
    campo: 'fecha_venta',
    direccion: 'DESC'
  })
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null)

  useEffect(() => {
    if (isOpen && socket) {
      cargarHistorial()
    }
  }, [isOpen, socket, filtros, paginacion.pagina, ordenamiento])

  const cargarHistorial = () => {
    if (!socket) return
    
    setLoading(true)
    socket.emit('get-sales-history', {
      filtros,
      paginacion,
      ordenamiento
    })
  }

  useEffect(() => {
    if (socket) {
      socket.on('sales-history-data', (data) => {
        setHistorialVentas(data.ventas)
        setPaginacion(prev => ({ ...prev, total: data.total }))
        setLoading(false)
      })

      socket.on('sales-history-error', (error) => {
        console.error('Error cargando historial:', error)
        setLoading(false)
      })

      return () => {
        socket.off('sales-history-data')
        socket.off('sales-history-error')
      }
    }
  }, [socket])

  const handleFiltroChange = (campo, valor) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }))
    setPaginacion(prev => ({ ...prev, pagina: 1 }))
  }

  const limpiarFiltros = () => {
    setFiltros({
      fechaInicio: '',
      fechaFin: '',
      cliente: '',
      producto: '',
      montoMin: '',
      montoMax: ''
    })
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount || 0)
  }

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

  const exportarHistorial = () => {
    if (socket) {
      socket.emit('export-sales-history', { filtros, ordenamiento })
    }
  }

  const agruparPorFecha = (ventas) => {
    const grupos = {}

    // Obtener fecha actual del sistema (local)
    const ahora = new Date()
    const hoy = ahora.toDateString()
    const ayer = new Date(ahora.getTime() - 86400000).toDateString()

    ventas.forEach(venta => {
      // Crear fecha desde el string de la base de datos (que ya está en hora local)
      // No agregar GMT-0500 porque ya viene en hora local desde el backend corregido
      const fechaVenta = new Date(venta.fecha_venta).toDateString()
      let grupo

      if (fechaVenta === hoy) {
        grupo = 'Hoy'
      } else if (fechaVenta === ayer) {
        grupo = 'Ayer'
      } else {
        // Usar la fecha local del sistema para el formateo
        grupo = new Date(venta.fecha_venta).toLocaleDateString('es-PE', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      }

      if (!grupos[grupo]) {
        grupos[grupo] = []
      }
      grupos[grupo].push(venta)
    })

    return grupos
  }

  if (!isOpen) return null

  const gruposVentas = agruparPorFecha(historialVentas)

  return (
    <div className="sales-history-overlay">
      <div className="sales-history-modal">
        <div className="sales-history-header">
          <div className="header-title">
            <h2>📈 Historial de Ventas</h2>
            <p>Registro completo de todas las transacciones</p>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {/* Filtros */}
        <div className="sales-filters">
          <div className="filters-row">
            <div className="filter-group">
              <label>Fecha Inicio:</label>
              <input
                type="date"
                value={filtros.fechaInicio}
                onChange={(e) => handleFiltroChange('fechaInicio', e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label>Fecha Fin:</label>
              <input
                type="date"
                value={filtros.fechaFin}
                onChange={(e) => handleFiltroChange('fechaFin', e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label>Cliente:</label>
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={filtros.cliente}
                onChange={(e) => handleFiltroChange('cliente', e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label>Producto:</label>
              <input
                type="text"
                placeholder="Buscar producto..."
                value={filtros.producto}
                onChange={(e) => handleFiltroChange('producto', e.target.value)}
              />
            </div>
          </div>
          
          <div className="filters-actions">
            <button className="btn btn-secondary" onClick={limpiarFiltros}>
              Limpiar Filtros
            </button>
            <button className="btn btn-primary" onClick={exportarHistorial}>
              <Download size={16} />
              Exportar
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="sales-history-content">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Cargando historial...</p>
            </div>
          ) : Object.keys(gruposVentas).length === 0 ? (
            <div className="empty-state">
              <Package size={48} />
              <h3>No hay ventas registradas</h3>
              <p>Las ventas aparecerán aquí cuando se completen pedidos</p>
            </div>
          ) : (
            Object.entries(gruposVentas).map(([fecha, ventas]) => (
              <div key={fecha} className="sales-group">
                <div className="group-header">
                  <h3>{fecha}</h3>
                  <span className="group-count">{ventas.length} venta{ventas.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="sales-list">
                  {ventas.map((venta) => (
                    <div key={venta.id} className="sale-card">
                      <div className="sale-info">
                        <div className="sale-product">
                          <Package size={16} />
                          <span>{venta.producto_nombre}</span>
                          <span className="quantity">x{venta.cantidad_vendida}</span>
                        </div>
                        <div className="sale-client">
                          <User size={14} />
                          <span>{venta.cliente_nombre}</span>
                        </div>
                        <div className="sale-time">
                          <Calendar size={14} />
                          <span>{formatDate(venta.fecha_venta)}</span>
                        </div>
                      </div>
                      <div className="sale-amount">
                        <span className="amount">{formatCurrency(venta.ingresos_totales)}</span>
                        <button 
                          className="btn btn-sm btn-outline"
                          onClick={() => setVentaSeleccionada(venta)}
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Paginación */}
        {paginacion.total > paginacion.limite && (
          <div className="sales-pagination">
            <button 
              className="btn btn-secondary"
              disabled={paginacion.pagina === 1}
              onClick={() => setPaginacion(prev => ({ ...prev, pagina: prev.pagina - 1 }))}
            >
              Anterior
            </button>
            <span>
              Página {paginacion.pagina} de {Math.ceil(paginacion.total / paginacion.limite)}
            </span>
            <button 
              className="btn btn-secondary"
              disabled={paginacion.pagina >= Math.ceil(paginacion.total / paginacion.limite)}
              onClick={() => setPaginacion(prev => ({ ...prev, pagina: prev.pagina + 1 }))}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {/* Modal de detalles de venta */}
      {ventaSeleccionada && (
        <div className="sale-details-overlay">
          <div className="sale-details-modal">
            <div className="details-header">
              <h3>Detalles de Venta #{ventaSeleccionada.pedido_id}</h3>
              <button onClick={() => setVentaSeleccionada(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="details-content">
              <div className="detail-row">
                <strong>Producto:</strong> {ventaSeleccionada.producto_nombre}
              </div>
              <div className="detail-row">
                <strong>Categoría:</strong> {ventaSeleccionada.categoria}
              </div>
              <div className="detail-row">
                <strong>Cantidad:</strong> {ventaSeleccionada.cantidad_vendida}
              </div>
              <div className="detail-row">
                <strong>Precio Unitario:</strong> {formatCurrency(ventaSeleccionada.precio_unitario)}
              </div>
              <div className="detail-row">
                <strong>Total:</strong> {formatCurrency(ventaSeleccionada.ingresos_totales)}
              </div>
              <div className="detail-row">
                <strong>Cliente:</strong> {ventaSeleccionada.cliente_nombre}
              </div>
              <div className="detail-row">
                <strong>WhatsApp:</strong> {ventaSeleccionada.cliente_whatsapp}
              </div>
              <div className="detail-row">
                <strong>Fecha:</strong> {formatDate(ventaSeleccionada.fecha_venta)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SalesHistory
