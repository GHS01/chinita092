import { Edit, Trash2, AlertTriangle, Package, Star } from 'lucide-react'

const ProductCard = ({ product, onEdit, onDelete, onToggleDestacado }) => {
  const isLowStock = product.stock <= 5
  const isOutOfStock = product.stock === 0

  return (
    <div className={`product-card card ${isOutOfStock ? 'out-of-stock' : ''}`}>
      {/* Imagen del producto */}
      <div className="product-image">
        {product.imagen_url ? (
          <img src={product.imagen_url} alt={product.nombre} />
        ) : (
          <div className="product-placeholder">
            <Package size={32} color="var(--text-secondary)" />
          </div>
        )}
        
        {/* Badge de stock */}
        {isOutOfStock && (
          <div className="stock-badge out-of-stock">
            Sin Stock
          </div>
        )}
        {isLowStock && !isOutOfStock && (
          <div className="stock-badge low-stock">
            <AlertTriangle size={14} />
            Stock Bajo
          </div>
        )}

        {/* Botón de estrella para destacado */}
        <button
          className={`star-button ${product.destacado ? 'starred' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleDestacado && onToggleDestacado(product.id)
          }}
          title={product.destacado ? 'Quitar de destacados' : 'Marcar como destacado'}
        >
          <Star size={18} fill={product.destacado ? '#FFD700' : 'none'} />
        </button>
      </div>

      {/* Información del producto */}
      <div className="product-info">
        <div className="product-header">
          <h3 className="product-name">{product.nombre}</h3>
          <div className="product-price">S/ {product.precio}</div>
        </div>

        {product.descripcion && (
          <p className="product-description">{product.descripcion}</p>
        )}

        <div className="product-meta">
          <span className="product-category">{product.categoria}</span>
          <span className={`product-stock ${isLowStock ? 'low' : ''}`}>
            Stock: {product.stock}
          </span>
        </div>
      </div>

      {/* Acciones */}
      <div className="product-actions">
        <button
          className="btn-icon btn-edit"
          onClick={() => onEdit(product)}
          title="Editar producto"
        >
          <Edit size={16} />
        </button>
        <button
          className="btn-icon btn-delete"
          onClick={() => onDelete(product.id)}
          title="Eliminar producto"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

export default ProductCard
