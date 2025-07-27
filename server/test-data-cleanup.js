#!/usr/bin/env node

/**
 * Script de prueba para verificar la funcionalidad de limpieza de datos
 * Este script crea datos de prueba y luego los limpia para verificar que todo funciona
 */

import { DatabaseService } from './services/database.js'
import { SalesService } from './services/sales.js'
import { OrderService } from './services/orders.js'

async function testDataCleanup() {
  console.log('🧪 Iniciando prueba de limpieza de datos...')
  
  try {
    // Inicializar servicios
    const db = new DatabaseService()
    await db.initialize()
    
    const sales = new SalesService(db)
    const orders = new OrderService(db)
    
    console.log('\n📊 Estado inicial de la base de datos:')
    await showDatabaseStats(db)
    
    console.log('\n🔧 Creando datos de prueba...')
    
    // Crear pedidos de prueba
    const testOrder1 = await orders.createOrder({
      cliente_whatsapp: '51999999999@s.whatsapp.net',
      cliente_nombre: 'Cliente Prueba 1',
      productos: [
        { id: 1, nombre: 'Producto Test 1', precio: 50, cantidad: 2 }
      ],
      total: 100,
      notas: 'Pedido de prueba 1'
    })
    
    const testOrder2 = await orders.createOrder({
      cliente_whatsapp: '51888888888@s.whatsapp.net',
      cliente_nombre: 'Cliente Prueba 2',
      productos: [
        { id: 2, nombre: 'Producto Test 2', precio: 75, cantidad: 1 }
      ],
      total: 75,
      notas: 'Pedido de prueba 2'
    })
    
    console.log(`✅ Pedidos creados: ${testOrder1.id}, ${testOrder2.id}`)
    
    // Simular ventas completadas
    await orders.updateOrderStatus(testOrder1.id, 'pagado')
    await orders.updateOrderStatus(testOrder2.id, 'pagado')
    
    console.log('✅ Pedidos marcados como pagados (esto genera estadísticas de ventas)')
    
    console.log('\n📊 Estado después de crear datos de prueba:')
    await showDatabaseStats(db)
    
    console.log('\n🗑️ Probando limpieza de pedidos...')
    
    // Limpiar pedidos
    const ordersResult = await db.run('DELETE FROM pedidos')
    console.log(`✅ Pedidos eliminados: ${ordersResult.changes} registros`)
    
    console.log('\n🗑️ Probando limpieza de estadísticas de ventas...')
    
    // Limpiar estadísticas
    const salesResult = await db.run('DELETE FROM estadisticas_ventas')
    const clientsResult = await db.run('DELETE FROM clientes_recurrentes')
    
    console.log(`✅ Estadísticas eliminadas: ${salesResult.changes} registros`)
    console.log(`✅ Clientes recurrentes eliminados: ${clientsResult.changes} registros`)
    
    console.log('\n📊 Estado final después de la limpieza:')
    await showDatabaseStats(db)
    
    await db.close()
    console.log('\n🎉 Prueba de limpieza completada exitosamente!')
    
  } catch (error) {
    console.error('❌ Error durante la prueba:', error)
    process.exit(1)
  }
}

async function showDatabaseStats(db) {
  try {
    const pedidosCount = await db.get('SELECT COUNT(*) as count FROM pedidos')
    const ventasCount = await db.get('SELECT COUNT(*) as count FROM estadisticas_ventas')
    const clientesCount = await db.get('SELECT COUNT(*) as count FROM clientes_recurrentes')
    const productosCount = await db.get('SELECT COUNT(*) as count FROM productos')
    
    console.log(`  📦 Pedidos: ${pedidosCount.count}`)
    console.log(`  📈 Estadísticas de ventas: ${ventasCount.count}`)
    console.log(`  👥 Clientes recurrentes: ${clientesCount.count}`)
    console.log(`  🛍️ Productos (NO se eliminan): ${productosCount.count}`)
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error)
  }
}

// Ejecutar la prueba
testDataCleanup()
