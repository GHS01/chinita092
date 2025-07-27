#!/usr/bin/env node

/**
 * Script para registrar manualmente la venta del pedido 26 que se procesó exitosamente
 * pero no se registró en las estadísticas de ventas
 */

import { DatabaseService } from './services/database.js'
import { SalesService } from './services/sales.js'
import { OrderService } from './services/orders.js'

async function fixMissingSale() {
  console.log('🔧 Iniciando corrección de venta faltante...')
  
  try {
    // Inicializar servicios
    const db = new DatabaseService()
    await db.initialize()
    
    const sales = new SalesService(db)
    const orders = new OrderService(db)
    
    // Obtener el pedido 26
    const pedido = await orders.getOrderById(26)
    
    if (!pedido) {
      console.error('❌ Pedido 26 no encontrado')
      return
    }
    
    console.log('📋 Pedido encontrado:', {
      id: pedido.id,
      cliente: pedido.cliente_nombre,
      whatsapp: pedido.cliente_whatsapp,
      estado: pedido.estado,
      total: pedido.total,
      productos: pedido.productos
    })
    
    // Verificar si ya existe en estadísticas
    const existingStats = await db.get(
      'SELECT * FROM estadisticas_ventas WHERE pedido_id = ?',
      [26]
    )
    
    if (existingStats) {
      console.log('✅ La venta ya está registrada en estadísticas')
      return
    }
    
    console.log('🔄 Registrando venta en estadísticas...')

    // Preparar el pedido con el formato correcto para registrarVenta
    const pedidoParaVenta = {
      ...pedido,
      productos_json: JSON.stringify(pedido.productos)
    }

    // Registrar la venta manualmente
    await sales.registrarVenta(pedidoParaVenta)
    
    console.log('✅ Venta registrada exitosamente!')
    
    // Verificar que se registró correctamente
    const newStats = await db.all(
      'SELECT * FROM estadisticas_ventas WHERE pedido_id = ?',
      [26]
    )
    
    console.log('📊 Estadísticas registradas:', newStats)
    
    // Mostrar estadísticas generales actualizadas
    const statsGenerales = await sales.getEstadisticasGenerales()
    console.log('📈 Estadísticas generales actualizadas:', statsGenerales)
    
    await db.close()
    console.log('🎉 Corrección completada exitosamente!')
    
  } catch (error) {
    console.error('❌ Error durante la corrección:', error)
    process.exit(1)
  }
}

// Ejecutar el script
fixMissingSale()
