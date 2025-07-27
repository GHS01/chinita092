export class OrderService {
  constructor(database, salesService = null) {
    this.db = database
    this.salesService = salesService
    this.googleDrive = null // Se establecerá desde index.js
  }

  // Método para establecer el SalesService después de la inicialización
  setSalesService(salesService) {
    this.salesService = salesService
  }

  // Método para establecer el GoogleDriveService
  setGoogleDriveService(googleDriveService) {
    this.googleDrive = googleDriveService
  }

  async createOrder(orderData) {
    try {
      const { cliente_whatsapp, cliente_nombre, productos, total, notas } = orderData
      
      // Validaciones
      if (!cliente_whatsapp || !productos || productos.length === 0) {
        throw new Error('Cliente y productos son requeridos')
      }
      
      if (total <= 0) {
        throw new Error('El total debe ser mayor a 0')
      }

      const timestamp = this.db.getCurrentTimestamp()

      const result = await this.db.run(
        `INSERT INTO pedidos (cliente_whatsapp, cliente_nombre, productos_json, total, estado, notas, fecha_creacion, fecha_actualizacion)
         VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?)`,
        [
          cliente_whatsapp,
          cliente_nombre || '',
          JSON.stringify(productos),
          total,
          notas || '',
          timestamp,
          timestamp
        ]
      )

      const newOrder = await this.getOrderById(result.id)
      console.log('✅ Pedido creado:', newOrder.id, 'para', cliente_whatsapp)

      // Sincronización automática con Google Drive
      if (this.googleDrive && this.googleDrive.syncEnabled) {
        this.googleDrive.queueSync('order_created', {
          orderId: newOrder.id,
          customer: cliente_whatsapp,
          total: total,
          timestamp: new Date().toISOString()
        })
      }

      return newOrder
    } catch (error) {
      console.error('Error creando pedido:', error)
      throw new Error('Error al crear el pedido: ' + error.message)
    }
  }

  async getOrderById(id) {
    try {
      const order = await this.db.get('SELECT * FROM pedidos WHERE id = ?', [id])
      if (order) {
        // Parsear productos JSON
        order.productos = JSON.parse(order.productos_json)
        delete order.productos_json
      }
      return order
    } catch (error) {
      console.error('Error obteniendo pedido por ID:', error)
      throw new Error('Error al obtener el pedido')
    }
  }

  async getAllOrders() {
    try {
      const orders = await this.db.all(
        'SELECT * FROM pedidos ORDER BY fecha_creacion DESC'
      )

      // Parsear productos JSON para cada pedido y limpiar datos
      return orders.map(order => {
        const cleanOrder = { ...order }
        cleanOrder.productos = JSON.parse(order.productos_json)
        delete cleanOrder.productos_json
        return cleanOrder
      })
    } catch (error) {
      console.error('Error obteniendo todos los pedidos:', error)
      throw new Error('Error al obtener los pedidos')
    }
  }

  async getOrdersByStatus(status) {
    try {
      const orders = await this.db.all(
        'SELECT * FROM pedidos WHERE estado = ? ORDER BY fecha_creacion DESC',
        [status]
      )

      return orders.map(order => {
        const cleanOrder = { ...order }
        cleanOrder.productos = JSON.parse(order.productos_json)
        delete cleanOrder.productos_json
        return cleanOrder
      })
    } catch (error) {
      console.error('Error obteniendo pedidos por estado:', error)
      throw new Error('Error al obtener pedidos por estado')
    }
  }

  async getOrdersByCustomer(cliente_whatsapp) {
    try {
      const orders = await this.db.all(
        'SELECT * FROM pedidos WHERE cliente_whatsapp = ? ORDER BY fecha_creacion DESC',
        [cliente_whatsapp]
      )

      return orders.map(order => {
        const cleanOrder = { ...order }
        cleanOrder.productos = JSON.parse(order.productos_json)
        delete cleanOrder.productos_json
        return cleanOrder
      })
    } catch (error) {
      console.error('Error obteniendo pedidos por cliente:', error)
      throw new Error('Error al obtener pedidos del cliente')
    }
  }

  async updateOrderStatus(id, newStatus, notas = '', whatsappService = null) {
    try {
      const validStatuses = ['pendiente', 'pagado', 'enviado', 'completado', 'cancelado']
      if (!validStatuses.includes(newStatus)) {
        throw new Error('Estado de pedido inválido')
      }

      // Obtener el pedido antes de actualizarlo para comparar estados
      const currentOrder = await this.getOrderById(id)
      if (!currentOrder) {
        throw new Error('Pedido no encontrado')
      }

      const result = await this.db.run(
        `UPDATE pedidos
         SET estado = ?,
             notas = CASE WHEN ? != '' THEN ? ELSE notas END,
             fecha_actualizacion = ?
         WHERE id = ?`,
        [newStatus, notas, notas, this.db.getCurrentTimestamp(), id]
      )

      if (result.changes === 0) {
        throw new Error('Pedido no encontrado')
      }

      const updatedOrder = await this.getOrderById(id)
      console.log('✅ Estado de pedido actualizado:', id, 'a', newStatus)

      // PROTECCIÓN: Advertir si se intenta cambiar a 'pagado' manualmente desde dashboard
      if (currentOrder.estado === 'pendiente' && newStatus === 'pagado') {
        console.log(`⚠️ ADVERTENCIA: Pedido ${id} cambiado manualmente a 'pagado' desde dashboard. Verificar que el stock ya fue reducido correctamente.`)
      }

      // NOTIFICACIÓN AUTOMÁTICA: Si el pedido pasa de 'pagado' a 'enviado'
      if (whatsappService && currentOrder.estado === 'pagado' && newStatus === 'enviado') {
        await this.notifyOrderShipped(updatedOrder, whatsappService)
      }

      // REGISTRAR VENTA: Si el pedido se marca como 'pagado' o 'completado'
      if (this.salesService &&
          (newStatus === 'pagado' || newStatus === 'completado') &&
          currentOrder.estado !== 'pagado' &&
          currentOrder.estado !== 'completado') {
        try {
          await this.salesService.registrarVenta(updatedOrder)
          console.log(`📊 Venta registrada en estadísticas para pedido ${id} (estado: ${newStatus})`)
        } catch (error) {
          console.error('Error registrando venta en estadísticas:', error)
          // No fallar la actualización del pedido por error en estadísticas
        }
      }

      // Sincronización automática con Google Drive
      if (this.googleDrive && this.googleDrive.syncEnabled) {
        this.googleDrive.queueSync('order_status_updated', {
          orderId: id,
          oldStatus: currentOrder.estado,
          newStatus: newStatus,
          customer: updatedOrder.cliente_whatsapp,
          timestamp: new Date().toISOString()
        })
      }

      return updatedOrder
    } catch (error) {
      console.error('Error actualizando estado de pedido:', error)
      throw new Error('Error al actualizar el estado: ' + error.message)
    }
  }

  // Método para notificar al cliente que su pedido fue enviado
  async notifyOrderShipped(order, whatsappService) {
    try {
      const productNames = order.productos.map(p => p.nombre).join(', ')
      const message = `🚚 ¡Tu pedido ha sido enviado!

📦 **Pedido #${order.id}**
🛍️ **Productos**: ${productNames}
💰 **Total**: S/ ${order.total}
📅 **Enviado**: ${new Date().toLocaleDateString('es-PE')}

Te notificaremos cuando llegue a su destino. ¡Gracias por tu compra! 🎉`

      await whatsappService.sendMessage(order.cliente_whatsapp, message)
      console.log(`📦 Notificación de envío enviada a ${order.cliente_whatsapp} para pedido ${order.id}`)
    } catch (error) {
      console.error('Error enviando notificación de envío:', error)
      // No lanzar error para no interrumpir la actualización del pedido
    }
  }

  async addPaymentProof(orderId, capturaUrl) {
    try {
      const result = await this.db.run(
        `UPDATE pedidos 
         SET captura_pago_url = ?, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [capturaUrl, orderId]
      )

      if (result.changes === 0) {
        throw new Error('Pedido no encontrado')
      }

      const updatedOrder = await this.getOrderById(orderId)
      console.log('✅ Captura de pago agregada al pedido:', orderId)
      return updatedOrder
    } catch (error) {
      console.error('Error agregando captura de pago:', error)
      throw new Error('Error al agregar captura de pago: ' + error.message)
    }
  }

  async deleteOrder(id) {
    try {
      const result = await this.db.run('DELETE FROM pedidos WHERE id = ?', [id])

      if (result.changes === 0) {
        throw new Error('Pedido no encontrado')
      }

      console.log('✅ Pedido eliminado:', id)
      return { success: true, id }
    } catch (error) {
      console.error('Error eliminando pedido:', error)
      throw new Error('Error al eliminar el pedido: ' + error.message)
    }
  }

  // Métodos para estadísticas
  async getPendingOrdersCount() {
    try {
      const result = await this.db.get(
        "SELECT COUNT(*) as count FROM pedidos WHERE estado = 'pendiente'"
      )
      return result.count
    } catch (error) {
      console.error('Error obteniendo conteo de pedidos pendientes:', error)
      return 0
    }
  }

  async getTodaySales() {
    try {
      const result = await this.db.get(
        `SELECT COALESCE(SUM(total), 0) as total 
         FROM pedidos 
         WHERE estado IN ('pagado', 'enviado', 'completado') 
         AND DATE(fecha_creacion) = DATE('now')`
      )
      return result.total
    } catch (error) {
      console.error('Error obteniendo ventas del día:', error)
      return 0
    }
  }

  async getOrdersStats() {
    try {
      const stats = await this.db.all(
        `SELECT estado, COUNT(*) as count, COALESCE(SUM(total), 0) as total_amount
         FROM pedidos 
         GROUP BY estado`
      )
      
      const result = {
        pendiente: { count: 0, total: 0 },
        pagado: { count: 0, total: 0 },
        enviado: { count: 0, total: 0 },
        completado: { count: 0, total: 0 },
        cancelado: { count: 0, total: 0 }
      }

      stats.forEach(stat => {
        if (result[stat.estado]) {
          result[stat.estado] = {
            count: stat.count,
            total: stat.total_amount
          }
        }
      })

      return result
    } catch (error) {
      console.error('Error obteniendo estadísticas de pedidos:', error)
      return {}
    }
  }

  async getRecentOrders(limit = 10) {
    try {
      const orders = await this.db.all(
        'SELECT * FROM pedidos ORDER BY fecha_creacion DESC LIMIT ?',
        [limit]
      )

      return orders.map(order => {
        const cleanOrder = { ...order }
        cleanOrder.productos = JSON.parse(order.productos_json)
        delete cleanOrder.productos_json
        return cleanOrder
      })
    } catch (error) {
      console.error('Error obteniendo pedidos recientes:', error)
      return []
    }
  }

  async searchOrders(searchTerm) {
    try {
      const orders = await this.db.all(
        `SELECT * FROM pedidos
         WHERE cliente_whatsapp LIKE ?
         OR cliente_nombre LIKE ?
         OR id = ?
         ORDER BY fecha_creacion DESC`,
        [`%${searchTerm}%`, `%${searchTerm}%`, searchTerm]
      )

      return orders.map(order => {
        const cleanOrder = { ...order }
        cleanOrder.productos = JSON.parse(order.productos_json)
        delete cleanOrder.productos_json
        return cleanOrder
      })
    } catch (error) {
      console.error('Error buscando pedidos:', error)
      throw new Error('Error al buscar pedidos')
    }
  }

  // Método para validar stock antes de crear pedido
  async validateOrderStock(productos, inventoryService) {
    const stockErrors = []
    
    for (const producto of productos) {
      const inventoryProduct = await inventoryService.getProductById(producto.id)
      
      if (!inventoryProduct) {
        stockErrors.push(`Producto ${producto.nombre} no encontrado`)
        continue
      }
      
      if (inventoryProduct.stock < producto.cantidad) {
        stockErrors.push(
          `Stock insuficiente para ${producto.nombre}. Disponible: ${inventoryProduct.stock}, solicitado: ${producto.cantidad}`
        )
      }
    }
    
    return stockErrors
  }

  // Método para reducir stock después de confirmar pago
  async processOrderPayment(orderId, inventoryService, googleDriveService = null) {
    try {
      const order = await this.getOrderById(orderId)
      if (!order) {
        throw new Error('Pedido no encontrado')
      }

      // PROTECCIÓN: Verificar que el pedido no esté ya pagado para evitar reducción doble de stock
      if (order.estado === 'pagado' || order.estado === 'enviado' || order.estado === 'completado') {
        console.log(`⚠️ Pedido ${orderId} ya está en estado '${order.estado}', no se reduce stock nuevamente`)
        return order
      }

      // Reducir stock de cada producto SOLO si el pedido está pendiente
      for (const producto of order.productos) {
        await inventoryService.reduceStock(producto.id, producto.cantidad, googleDriveService)
      }

      // Actualizar estado a pagado
      await this.updateOrderStatus(orderId, 'pagado', 'Pago confirmado y stock actualizado')

      console.log('✅ Pago procesado y stock actualizado para pedido:', orderId)
      return await this.getOrderById(orderId)
    } catch (error) {
      console.error('Error procesando pago de pedido:', error)
      throw error
    }
  }

  // Método para eliminar pedido (solo pedidos cancelados)
  async deleteOrder(orderId) {
    try {
      // Verificar que el pedido existe y está cancelado
      const order = await this.getOrderById(orderId)
      if (!order) {
        throw new Error('Pedido no encontrado')
      }

      if (order.estado !== 'cancelado') {
        throw new Error('Solo se pueden eliminar pedidos cancelados')
      }

      // Eliminar el pedido
      const result = await this.db.run('DELETE FROM pedidos WHERE id = ?', [orderId])

      if (result.changes === 0) {
        throw new Error('No se pudo eliminar el pedido')
      }

      console.log('🗑️ Pedido eliminado:', orderId)
      return { success: true, message: 'Pedido eliminado exitosamente' }
    } catch (error) {
      console.error('Error eliminando pedido:', error)
      throw new Error('Error al eliminar el pedido: ' + error.message)
    }
  }
}
