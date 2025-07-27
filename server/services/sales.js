export class SalesService {
  constructor(database) {
    this.db = database
  }

  // REGISTRAR VENTA CUANDO SE COMPLETA UN PEDIDO
  async registrarVenta(pedido) {
    try {
      // Manejar tanto productos_json (string) como productos (array)
      let productos
      if (pedido.productos_json) {
        // Si viene productos_json como string, parsearlo
        productos = JSON.parse(pedido.productos_json)
      } else if (pedido.productos) {
        // Si viene productos como array (desde getOrderById), usarlo directamente
        productos = pedido.productos
      } else {
        throw new Error('No se encontraron productos en el pedido')
      }

      console.log('🔍 DEBUG registrarVenta - productos recibidos:', JSON.stringify(productos, null, 2))
      
      for (const item of productos) {
        // Registrar en estadísticas de ventas con fecha local explícita
        await this.db.run(
          `INSERT INTO estadisticas_ventas (
            producto_id, producto_nombre, categoria, cantidad_vendida,
            precio_unitario, ingresos_totales, cliente_whatsapp,
            cliente_nombre, pedido_id, fecha_venta
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.nombre,
            item.categoria || 'Sin categoría',
            item.cantidad,
            item.precio,
            item.precio * item.cantidad,
            pedido.cliente_whatsapp,
            pedido.cliente_nombre,
            pedido.id,
            this.db.getCurrentTimestamp() // Usar fecha local explícita
          ]
        )
      }

      // Actualizar estadísticas del cliente
      await this.actualizarClienteRecurrente(pedido)
      
      console.log(`📊 Venta registrada para pedido ${pedido.id}`)
    } catch (error) {
      console.error('Error registrando venta:', error)
      throw new Error('Error al registrar estadísticas de venta')
    }
  }

  // ACTUALIZAR ESTADÍSTICAS DE CLIENTE RECURRENTE
  async actualizarClienteRecurrente(pedido) {
    try {
      const cliente = await this.db.get(
        'SELECT * FROM clientes_recurrentes WHERE cliente_whatsapp = ?',
        [pedido.cliente_whatsapp]
      )

      if (cliente) {
        // Cliente existente - actualizar estadísticas
        await this.db.run(
          `UPDATE clientes_recurrentes SET
            cliente_nombre = ?,
            total_pedidos = total_pedidos + 1,
            total_gastado = total_gastado + ?,
            ultima_compra = CURRENT_TIMESTAMP,
            categoria_favorita = ?,
            fecha_actualizacion = CURRENT_TIMESTAMP
          WHERE cliente_whatsapp = ?`,
          [
            pedido.cliente_nombre,
            pedido.total,
            await this.getCategoriaFavorita(pedido.cliente_whatsapp),
            pedido.cliente_whatsapp
          ]
        )
      } else {
        // Cliente nuevo - crear registro
        await this.db.run(
          `INSERT INTO clientes_recurrentes (
            cliente_whatsapp, cliente_nombre, total_pedidos, 
            total_gastado, primera_compra, ultima_compra, categoria_favorita
          ) VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`,
          [
            pedido.cliente_whatsapp,
            pedido.cliente_nombre,
            pedido.total,
            await this.getCategoriaFavorita(pedido.cliente_whatsapp)
          ]
        )
      }
    } catch (error) {
      console.error('Error actualizando cliente recurrente:', error)
    }
  }

  // OBTENER CATEGORÍA FAVORITA DEL CLIENTE
  async getCategoriaFavorita(clienteWhatsapp) {
    try {
      const result = await this.db.get(
        `SELECT categoria, SUM(cantidad_vendida) as total
         FROM estadisticas_ventas 
         WHERE cliente_whatsapp = ? 
         GROUP BY categoria 
         ORDER BY total DESC 
         LIMIT 1`,
        [clienteWhatsapp]
      )
      return result ? result.categoria : 'Sin categoría'
    } catch (error) {
      return 'Sin categoría'
    }
  }

  // OBTENER VENTAS POR CATEGORÍA
  async getVentasPorCategoria() {
    try {
      const ventas = await this.db.all(
        `SELECT 
          categoria,
          SUM(cantidad_vendida) as total_productos_vendidos,
          SUM(ingresos_totales) as total_ingresos,
          COUNT(DISTINCT cliente_whatsapp) as clientes_unicos,
          COUNT(*) as total_transacciones
         FROM estadisticas_ventas 
         GROUP BY categoria 
         ORDER BY total_ingresos DESC`
      )
      return ventas
    } catch (error) {
      console.error('Error obteniendo ventas por categoría:', error)
      return []
    }
  }

  // OBTENER PRODUCTOS MÁS VENDIDOS POR CATEGORÍA
  async getProductosMasVendidos(categoria = null, limite = 10) {
    try {
      let query = `
        SELECT 
          producto_id,
          producto_nombre,
          categoria,
          SUM(cantidad_vendida) as total_vendido,
          SUM(ingresos_totales) as total_ingresos,
          COUNT(*) as veces_comprado,
          AVG(precio_unitario) as precio_promedio
        FROM estadisticas_ventas`
      
      let params = []
      
      if (categoria) {
        query += ' WHERE categoria = ?'
        params.push(categoria)
      }
      
      query += `
        GROUP BY producto_id, producto_nombre, categoria
        ORDER BY total_vendido DESC, total_ingresos DESC
        LIMIT ?`
      
      params.push(limite)
      
      const productos = await this.db.all(query, params)
      return productos
    } catch (error) {
      console.error('Error obteniendo productos más vendidos:', error)
      return []
    }
  }

  // OBTENER CLIENTES RECURRENTES (RANKING)
  async getClientesRecurrentes(limite = 20) {
    try {
      const clientes = await this.db.all(
        `SELECT 
          cliente_whatsapp,
          cliente_nombre,
          total_pedidos,
          total_gastado,
          categoria_favorita,
          primera_compra,
          ultima_compra,
          CASE 
            WHEN total_pedidos >= 10 THEN 'VIP'
            WHEN total_pedidos >= 5 THEN 'Frecuente'
            WHEN total_pedidos >= 2 THEN 'Recurrente'
            ELSE 'Nuevo'
          END as nivel_cliente
         FROM clientes_recurrentes 
         ORDER BY total_gastado DESC, total_pedidos DESC 
         LIMIT ?`,
        [limite]
      )
      return clientes
    } catch (error) {
      console.error('Error obteniendo clientes recurrentes:', error)
      return []
    }
  }

  // OBTENER INFORMACIÓN DE UN CLIENTE ESPECÍFICO
  async getClienteInfo(clienteWhatsapp) {
    try {
      const cliente = await this.db.get(
        `SELECT 
          cliente_whatsapp,
          cliente_nombre,
          total_pedidos,
          total_gastado,
          categoria_favorita,
          primera_compra,
          ultima_compra,
          CASE 
            WHEN total_pedidos >= 10 THEN 'VIP'
            WHEN total_pedidos >= 5 THEN 'Frecuente'
            WHEN total_pedidos >= 2 THEN 'Recurrente'
            ELSE 'Nuevo'
          END as nivel_cliente
         FROM clientes_recurrentes 
         WHERE cliente_whatsapp = ?`,
        [clienteWhatsapp]
      )
      return cliente
    } catch (error) {
      console.error('Error obteniendo información del cliente:', error)
      return null
    }
  }

  // OBTENER ESTADÍSTICAS GENERALES
  async getEstadisticasGenerales() {
    try {
      const stats = await this.db.get(
        `SELECT 
          COUNT(DISTINCT cliente_whatsapp) as total_clientes,
          COUNT(*) as total_ventas,
          SUM(cantidad_vendida) as productos_vendidos,
          SUM(ingresos_totales) as ingresos_totales,
          AVG(ingresos_totales) as venta_promedio
         FROM estadisticas_ventas`
      )
      
      // Obtener fecha actual del sistema local
      const fechaHoy = this.db.getCurrentTimestamp().split(' ')[0] // Solo la parte de fecha YYYY-MM-DD

      const ventasHoy = await this.db.get(
        `SELECT
          COUNT(*) as ventas_hoy,
          SUM(ingresos_totales) as ingresos_hoy
         FROM estadisticas_ventas
         WHERE DATE(fecha_venta) = ?`,
        [fechaHoy]
      )
      
      return {
        ...stats,
        ...ventasHoy
      }
    } catch (error) {
      console.error('Error obteniendo estadísticas generales:', error)
      return {
        total_clientes: 0,
        total_ventas: 0,
        productos_vendidos: 0,
        ingresos_totales: 0,
        venta_promedio: 0,
        ventas_hoy: 0,
        ingresos_hoy: 0
      }
    }
  }

  // OBTENER VENTAS POR PERÍODO
  async getVentasPorPeriodo(dias = 30) {
    try {
      // Calcular fecha límite usando fecha local del sistema
      const ahora = new Date()
      const fechaLimite = new Date(ahora.getTime() - (dias * 24 * 60 * 60 * 1000))
      const fechaLimiteStr = fechaLimite.getFullYear() + '-' +
                            String(fechaLimite.getMonth() + 1).padStart(2, '0') + '-' +
                            String(fechaLimite.getDate()).padStart(2, '0')

      const ventas = await this.db.all(
        `SELECT
          DATE(fecha_venta) as fecha,
          COUNT(*) as total_ventas,
          SUM(ingresos_totales) as ingresos_dia
         FROM estadisticas_ventas
         WHERE DATE(fecha_venta) >= ?
         GROUP BY DATE(fecha_venta)
         ORDER BY fecha DESC`,
        [fechaLimiteStr]
      )
      return ventas
    } catch (error) {
      console.error('Error obteniendo ventas por período:', error)
      return []
    }
  }

  // OBTENER HISTORIAL DE VENTAS CON FILTROS Y PAGINACIÓN
  async getHistorialVentas(filtros = {}, paginacion = { pagina: 1, limite: 20 }, ordenamiento = { campo: 'fecha_venta', direccion: 'DESC' }) {
    try {
      const { fechaInicio, fechaFin, cliente, producto, montoMin, montoMax } = filtros
      const { pagina, limite } = paginacion
      const { campo, direccion } = ordenamiento

      let whereConditions = []
      let params = []

      // Aplicar filtros
      if (fechaInicio) {
        whereConditions.push('DATE(fecha_venta) >= ?')
        params.push(fechaInicio)
      }

      if (fechaFin) {
        whereConditions.push('DATE(fecha_venta) <= ?')
        params.push(fechaFin)
      }

      if (cliente) {
        whereConditions.push('(cliente_nombre LIKE ? OR cliente_whatsapp LIKE ?)')
        params.push(`%${cliente}%`, `%${cliente}%`)
      }

      if (producto) {
        whereConditions.push('producto_nombre LIKE ?')
        params.push(`%${producto}%`)
      }

      if (montoMin) {
        whereConditions.push('ingresos_totales >= ?')
        params.push(parseFloat(montoMin))
      }

      if (montoMax) {
        whereConditions.push('ingresos_totales <= ?')
        params.push(parseFloat(montoMax))
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

      // Consulta para contar total de registros
      const countQuery = `SELECT COUNT(*) as total FROM estadisticas_ventas ${whereClause}`
      const countResult = await this.db.get(countQuery, params)
      const total = countResult.total

      // Consulta principal con paginación
      const offset = (pagina - 1) * limite
      const query = `
        SELECT * FROM estadisticas_ventas
        ${whereClause}
        ORDER BY ${campo} ${direccion}
        LIMIT ? OFFSET ?
      `

      const ventas = await this.db.all(query, [...params, limite, offset])

      return {
        ventas,
        total,
        pagina,
        limite,
        totalPaginas: Math.ceil(total / limite)
      }
    } catch (error) {
      console.error('Error obteniendo historial de ventas:', error)
      return {
        ventas: [],
        total: 0,
        pagina: 1,
        limite: 20,
        totalPaginas: 0
      }
    }
  }

  // EXPORTAR HISTORIAL DE VENTAS
  async exportHistorialVentas(filtros = {}, ordenamiento = { campo: 'fecha_venta', direccion: 'DESC' }) {
    try {
      const { fechaInicio, fechaFin, cliente, producto, montoMin, montoMax } = filtros
      const { campo, direccion } = ordenamiento

      let whereConditions = []
      let params = []

      // Aplicar los mismos filtros que en getHistorialVentas
      if (fechaInicio) {
        whereConditions.push('DATE(fecha_venta) >= ?')
        params.push(fechaInicio)
      }

      if (fechaFin) {
        whereConditions.push('DATE(fecha_venta) <= ?')
        params.push(fechaFin)
      }

      if (cliente) {
        whereConditions.push('(cliente_nombre LIKE ? OR cliente_whatsapp LIKE ?)')
        params.push(`%${cliente}%`, `%${cliente}%`)
      }

      if (producto) {
        whereConditions.push('producto_nombre LIKE ?')
        params.push(`%${producto}%`)
      }

      if (montoMin) {
        whereConditions.push('ingresos_totales >= ?')
        params.push(parseFloat(montoMin))
      }

      if (montoMax) {
        whereConditions.push('ingresos_totales <= ?')
        params.push(parseFloat(montoMax))
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

      const query = `
        SELECT
          fecha_venta,
          producto_nombre,
          categoria,
          cantidad_vendida,
          precio_unitario,
          ingresos_totales,
          cliente_nombre,
          cliente_whatsapp,
          pedido_id
        FROM estadisticas_ventas
        ${whereClause}
        ORDER BY ${campo} ${direccion}
      `

      const ventas = await this.db.all(query, params)

      // Formatear datos para exportación
      const exportData = {
        filename: `historial_ventas_${new Date().toISOString().split('T')[0]}.csv`,
        headers: [
          'Fecha',
          'Producto',
          'Categoría',
          'Cantidad',
          'Precio Unitario',
          'Total',
          'Cliente',
          'WhatsApp',
          'Pedido ID'
        ],
        data: ventas.map(venta => [
          // La fecha ya viene en formato local desde la base de datos
          new Date(venta.fecha_venta).toLocaleDateString('es-PE'),
          venta.producto_nombre,
          venta.categoria,
          venta.cantidad_vendida,
          venta.precio_unitario,
          venta.ingresos_totales,
          venta.cliente_nombre,
          venta.cliente_whatsapp,
          venta.pedido_id
        ])
      }

      return exportData
    } catch (error) {
      console.error('Error exportando historial de ventas:', error)
      throw new Error('Error al exportar historial de ventas')
    }
  }
}
