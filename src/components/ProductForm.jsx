import { useState, useEffect } from 'react'
import { X, Save, Package } from 'lucide-react'

const ProductForm = ({ product, categories, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    precio: '',
    stock: '',
    categoria: '',
    imagen_url: ''
  })

  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (product) {
      setFormData({
        nombre: product.nombre || '',
        descripcion: product.descripcion || '',
        precio: product.precio || '',
        stock: product.stock || '',
        categoria: product.categoria || '',
        imagen_url: product.imagen_url || ''
      })
    }
  }, [product])

  const validateForm = () => {
    const newErrors = {}

    if (!formData.nombre.trim()) {
      newErrors.nombre = 'El nombre es requerido'
    }

    if (!formData.precio || formData.precio <= 0) {
      newErrors.precio = 'El precio debe ser mayor a 0'
    }

    if (formData.stock < 0) {
      newErrors.stock = 'El stock no puede ser negativo'
    }

    if (!formData.categoria.trim()) {
      newErrors.categoria = 'La categoría es requerida'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    
    if (validateForm()) {
      const submitData = {
        ...formData,
        precio: parseFloat(formData.precio),
        stock: parseInt(formData.stock) || 0
      }
      onSubmit(submitData)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    
    // Limpiar error del campo cuando el usuario empiece a escribir
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  return (
    <div className="product-form">
      <div className="form-header">
        <h2>
          <Package size={24} />
          {product ? 'Editar Producto' : 'Agregar Producto'}
        </h2>
        <button className="btn-icon" onClick={onCancel}>
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Nombre *</label>
          <input
            type="text"
            name="nombre"
            value={formData.nombre}
            onChange={handleChange}
            className={`form-input ${errors.nombre ? 'error' : ''}`}
            placeholder="Nombre del producto"
          />
          {errors.nombre && <span className="error-message">{errors.nombre}</span>}
        </div>

        <div className="form-group">
          <label className="form-label">Descripción</label>
          <textarea
            name="descripcion"
            value={formData.descripcion}
            onChange={handleChange}
            className="form-input form-textarea"
            placeholder="Descripción del producto"
            rows="3"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Precio (S/) *</label>
            <input
              type="number"
              name="precio"
              value={formData.precio}
              onChange={handleChange}
              className={`form-input ${errors.precio ? 'error' : ''}`}
              placeholder="0.00"
              step="0.01"
              min="0"
            />
            {errors.precio && <span className="error-message">{errors.precio}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Stock</label>
            <input
              type="number"
              name="stock"
              value={formData.stock}
              onChange={handleChange}
              className={`form-input ${errors.stock ? 'error' : ''}`}
              placeholder="0"
              min="0"
            />
            {errors.stock && <span className="error-message">{errors.stock}</span>}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Categoría *</label>
          <input
            type="text"
            name="categoria"
            value={formData.categoria}
            onChange={handleChange}
            className={`form-input ${errors.categoria ? 'error' : ''}`}
            placeholder="Categoría del producto"
            list="categories-list"
          />
          <datalist id="categories-list">
            {categories.map(category => (
              <option key={category} value={category} />
            ))}
          </datalist>
          {errors.categoria && <span className="error-message">{errors.categoria}</span>}
        </div>

        <div className="form-group">
          <label className="form-label">URL de Imagen</label>
          <input
            type="url"
            name="imagen_url"
            value={formData.imagen_url}
            onChange={handleChange}
            className="form-input"
            placeholder="https://ejemplo.com/imagen.jpg"
          />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            <Save size={16} />
            {product ? 'Actualizar' : 'Agregar'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ProductForm
