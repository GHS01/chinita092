export class InventoryService {
  constructor(database) {
    this.db = database
  }

  async getAllProducts() {
    try {
      const products = await this.db.all(
        'SELECT * FROM productos WHERE activo = 1 ORDER BY categoria, nombre'
      )
      return products
    } catch (error) {
      console.error('Error obteniendo productos:', error)
      throw new Error('Error al obtener el inventario')
    }
  }

  async getProductById(id) {
    try {
      const product = await this.db.get(
        'SELECT * FROM productos WHERE id = ? AND activo = 1',
        [id]
      )
      return product
    } catch (error) {
      console.error('Error obteniendo producto por ID:', error)
      throw new Error('Error al obtener el producto')
    }
  }

  async getProductsByCategory(category) {
    try {
      const products = await this.db.all(
        'SELECT * FROM productos WHERE categoria = ? AND activo = 1 ORDER BY nombre',
        [category]
      )
      return products
    } catch (error) {
      console.error('Error obteniendo productos por categoría:', error)
      throw new Error('Error al obtener productos por categoría')
    }
  }

  async addProduct(productData) {
    try {
      const { nombre, descripcion, precio, stock, categoria, imagen_url } = productData
      
      // Validaciones
      if (!nombre || !precio) {
        throw new Error('Nombre y precio son requeridos')
      }
      
      if (precio < 0 || stock < 0) {
        throw new Error('Precio y stock deben ser valores positivos')
      }

      const result = await this.db.run(
        `INSERT INTO productos (nombre, descripcion, precio, stock, categoria, imagen_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [nombre, descripcion || '', precio, stock || 0, categoria || 'General', imagen_url || '']
      )

      // Obtener el producto creado
      const newProduct = await this.getProductById(result.id)
      console.log('✅ Producto agregado:', newProduct.nombre)
      return newProduct
    } catch (error) {
      console.error('Error agregando producto:', error)
      throw new Error('Error al agregar el producto: ' + error.message)
    }
  }

  async updateProduct(id, productData) {
    try {
      const { nombre, descripcion, precio, stock, categoria, imagen_url, activo } = productData
      
      // Validaciones
      if (precio !== undefined && precio < 0) {
        throw new Error('El precio debe ser un valor positivo')
      }
      
      if (stock !== undefined && stock < 0) {
        throw new Error('El stock debe ser un valor positivo')
      }

      const result = await this.db.run(
        `UPDATE productos 
         SET nombre = COALESCE(?, nombre),
             descripcion = COALESCE(?, descripcion),
             precio = COALESCE(?, precio),
             stock = COALESCE(?, stock),
             categoria = COALESCE(?, categoria),
             imagen_url = COALESCE(?, imagen_url),
             activo = COALESCE(?, activo),
             fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nombre, descripcion, precio, stock, categoria, imagen_url, activo, id]
      )

      if (result.changes === 0) {
        throw new Error('Producto no encontrado')
      }

      const updatedProduct = await this.getProductById(id)
      console.log('✅ Producto actualizado:', updatedProduct.nombre)
      return updatedProduct
    } catch (error) {
      console.error('Error actualizando producto:', error)
      throw new Error('Error al actualizar el producto: ' + error.message)
    }
  }

  async deleteProduct(id) {
    try {
      // Soft delete - marcar como inactivo
      const result = await this.db.run(
        'UPDATE productos SET activo = 0, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      )

      if (result.changes === 0) {
        throw new Error('Producto no encontrado')
      }

      console.log('✅ Producto eliminado (soft delete):', id)
      return { success: true, id }
    } catch (error) {
      console.error('Error eliminando producto:', error)
      throw new Error('Error al eliminar el producto: ' + error.message)
    }
  }

  async updateStock(id, newStock, googleDriveService = null) {
    try {
      if (newStock < 0) {
        throw new Error('El stock no puede ser negativo')
      }

      const result = await this.db.run(
        'UPDATE productos SET stock = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND activo = 1',
        [newStock, id]
      )

      if (result.changes === 0) {
        throw new Error('Producto no encontrado o inactivo')
      }

      const updatedProduct = await this.getProductById(id)
      console.log('✅ Stock actualizado:', updatedProduct.nombre, 'nuevo stock:', newStock)

      // 🔄 SINCRONIZACIÓN AUTOMÁTICA CON GOOGLE DRIVE (si se proporciona el servicio)
      if (googleDriveService && googleDriveService.isAuthenticated && googleDriveService.syncEnabled) {
        googleDriveService.queueSync('inventory_stock_update', {
          productId: id,
          productName: updatedProduct.nombre,
          newStock: newStock
        })
      }

      return updatedProduct
    } catch (error) {
      console.error('Error actualizando stock:', error)
      throw new Error('Error al actualizar el stock: ' + error.message)
    }
  }

  async reduceStock(id, quantity, googleDriveService = null) {
    try {
      const product = await this.getProductById(id)
      if (!product) {
        throw new Error('Producto no encontrado')
      }

      if (product.stock < quantity) {
        throw new Error(`Stock insuficiente. Disponible: ${product.stock}, solicitado: ${quantity}`)
      }

      const newStock = product.stock - quantity
      return await this.updateStock(id, newStock, googleDriveService)
    } catch (error) {
      console.error('Error reduciendo stock:', error)
      throw error
    }
  }

  async getProductCount() {
    try {
      const result = await this.db.get('SELECT COUNT(*) as count FROM productos WHERE activo = 1')
      return result.count
    } catch (error) {
      console.error('Error obteniendo conteo de productos:', error)
      return 0
    }
  }

  async getCategories() {
    try {
      const categories = await this.db.all(
        'SELECT DISTINCT categoria FROM productos WHERE activo = 1 AND categoria IS NOT NULL ORDER BY categoria'
      )
      return categories.map(row => row.categoria)
    } catch (error) {
      console.error('Error obteniendo categorías:', error)
      return []
    }
  }

  async searchProducts(searchTerm) {
    try {
      const products = await this.db.all(
        `SELECT * FROM productos 
         WHERE activo = 1 AND (
           nombre LIKE ? OR 
           descripcion LIKE ? OR 
           categoria LIKE ?
         ) ORDER BY nombre`,
        [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
      )
      return products
    } catch (error) {
      console.error('Error buscando productos:', error)
      throw new Error('Error al buscar productos')
    }
  }

  async getLowStockProducts(threshold = 5) {
    try {
      const products = await this.db.all(
        'SELECT * FROM productos WHERE activo = 1 AND stock <= ? ORDER BY stock ASC',
        [threshold]
      )
      return products
    } catch (error) {
      console.error('Error obteniendo productos con stock bajo:', error)
      return []
    }
  }

  // MÉTODOS PARA PRODUCTOS DESTACADOS ⭐
  async getDestacados() {
    try {
      const products = await this.db.all(
        'SELECT * FROM productos WHERE activo = 1 AND destacado = 1 ORDER BY categoria, nombre'
      )
      return products
    } catch (error) {
      console.error('Error obteniendo productos destacados:', error)
      throw new Error('Error al obtener productos destacados')
    }
  }

  async toggleDestacado(id) {
    try {
      // Obtener estado actual
      const product = await this.getProductById(id)
      if (!product) {
        throw new Error('Producto no encontrado')
      }

      // Cambiar estado destacado
      const newDestacado = product.destacado ? 0 : 1

      const result = await this.db.run(
        'UPDATE productos SET destacado = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
        [newDestacado, id]
      )

      if (result.changes === 0) {
        throw new Error('No se pudo actualizar el producto')
      }

      // Obtener producto actualizado
      const updatedProduct = await this.getProductById(id)
      console.log(`⭐ Producto ${updatedProduct.nombre} ${newDestacado ? 'marcado como destacado' : 'desmarcado como destacado'}`)

      return updatedProduct
    } catch (error) {
      console.error('Error cambiando estado destacado:', error)
      throw new Error('Error al cambiar estado destacado: ' + error.message)
    }
  }

  async getProductsByCategory(categoria) {
    try {
      const products = await this.db.all(
        'SELECT * FROM productos WHERE activo = 1 AND categoria = ? ORDER BY nombre',
        [categoria]
      )
      return products
    } catch (error) {
      console.error('Error obteniendo productos por categoría:', error)
      throw new Error('Error al obtener productos por categoría')
    }
  }
}
