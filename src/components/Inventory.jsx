import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Search, Package, AlertTriangle, Star } from 'lucide-react'
import ProductForm from './ProductForm'
import ProductCard from './ProductCard'

const Inventory = ({ socket }) => {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showDestacadosOnly, setShowDestacadosOnly] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (socket) {
      // Solicitar inventario inicial
      socket.emit('get-inventory')
      
      // Escuchar actualizaciones
      socket.on('inventory-data', (data) => {
        setProducts(data)
        extractCategories(data)
        setLoading(false)
      })

      socket.on('product-added', (product) => {
        setProducts(prev => [...prev, product])
        setShowForm(false)
        setEditingProduct(null)
      })

      socket.on('product-updated', (product) => {
        setProducts(prev => prev.map(p => p.id === product.id ? product : p))
        setShowForm(false)
        setEditingProduct(null)
      })

      socket.on('product-deleted', (productId) => {
        setProducts(prev => prev.filter(p => p.id !== productId))
      })

      socket.on('inventory-updated', () => {
        socket.emit('get-inventory')
      })

      socket.on('inventory-error', (error) => {
        console.error('Error de inventario:', error)
        alert('Error: ' + error)
      })

      return () => {
        socket.off('inventory-data')
        socket.off('product-added')
        socket.off('product-updated')
        socket.off('product-deleted')
        socket.off('inventory-updated')
        socket.off('inventory-error')
      }
    }
  }, [socket])

  const extractCategories = (products) => {
    const cats = [...new Set(products.map(p => p.categoria).filter(Boolean))]
    setCategories(cats)
  }

  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === 'all' || product.categoria === selectedCategory
    const matchesSearch = product.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesDestacado = !showDestacadosOnly || product.destacado
    return matchesCategory && matchesSearch && matchesDestacado
  })

  const lowStockProducts = products.filter(p => p.stock <= 5)

  const handleAddProduct = () => {
    setEditingProduct(null)
    setShowForm(true)
  }

  const handleEditProduct = (product) => {
    setEditingProduct(product)
    setShowForm(true)
  }

  const handleDeleteProduct = (productId) => {
    if (confirm('¿Estás seguro de que quieres eliminar este producto?')) {
      socket.emit('delete-product', productId)
    }
  }

  const handleFormSubmit = (productData) => {
    if (editingProduct) {
      socket.emit('update-product', editingProduct.id, productData)
    } else {
      socket.emit('add-product', productData)
    }
  }

  const handleFormCancel = () => {
    setShowForm(false)
    setEditingProduct(null)
  }

  const handleToggleDestacado = (productId) => {
    socket.emit('toggle-destacado', productId)
  }

  if (loading) {
    return (
      <div className="inventory-loading">
        <div className="spinner"></div>
        <p>Cargando inventario...</p>
      </div>
    )
  }

  return (
    <div className="inventory">
      <div className="inventory-header">
        <h1>Inventario</h1>
        <button className="btn btn-primary" onClick={handleAddProduct}>
          <Plus size={20} />
          Agregar Producto
        </button>
      </div>

      {/* Alerta de stock bajo */}
      {lowStockProducts.length > 0 && (
        <div className="card" style={{ backgroundColor: '#fff3cd', borderLeft: '4px solid #ffc107' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <AlertTriangle size={20} color="#856404" />
            <strong style={{ color: '#856404' }}>Stock Bajo</strong>
          </div>
          <p style={{ margin: 0, color: '#856404' }}>
            {lowStockProducts.length} producto(s) con stock bajo (≤5 unidades)
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="inventory-filters card">
        <div className="search-box">
          <Search size={20} />
          <input
            type="text"
            placeholder="Buscar productos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="category-filters">
          <button
            className={`filter-btn ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            Todas
          </button>
          {categories.map(category => (
            <button
              key={category}
              className={`filter-btn ${selectedCategory === category ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Filtro de destacados */}
        <div className="destacados-filter">
          <button
            className={`filter-btn destacados-btn ${showDestacadosOnly ? 'active' : ''}`}
            onClick={() => setShowDestacadosOnly(!showDestacadosOnly)}
            title="Mostrar solo productos destacados"
          >
            <Star size={16} fill={showDestacadosOnly ? '#FFD700' : 'none'} />
            Solo Destacados
          </button>
        </div>
      </div>

      {/* Lista de productos */}
      <div className="products-grid">
        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <Package size={48} color="var(--text-secondary)" />
            <h3>No hay productos</h3>
            <p>
              {searchTerm || selectedCategory !== 'all' 
                ? 'No se encontraron productos con los filtros aplicados'
                : 'Agrega tu primer producto para comenzar'
              }
            </p>
          </div>
        ) : (
          filteredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={handleEditProduct}
              onDelete={handleDeleteProduct}
              onToggleDestacado={handleToggleDestacado}
            />
          ))
        )}
      </div>

      {/* Modal de formulario */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal">
            <ProductForm
              product={editingProduct}
              categories={categories}
              onSubmit={handleFormSubmit}
              onCancel={handleFormCancel}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default Inventory
