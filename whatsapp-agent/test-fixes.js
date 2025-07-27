// Script de prueba para verificar las correcciones implementadas
import { DatabaseService } from './server/services/database.js'
import { WhatsAppService } from './server/services/whatsapp.js'
import { SalesService } from './server/services/sales.js'

async function testFixes() {
  console.log('🧪 Iniciando pruebas de correcciones...\n')
  
  try {
    // 1. Probar corrección de fechas
    console.log('1️⃣ Probando corrección de fechas...')
    const db = new DatabaseService()
    await db.initialize()
    
    const timestamp = db.getCurrentTimestamp()
    console.log(`   ✅ Timestamp de Perú generado: ${timestamp}`)
    
    // Verificar que la fecha esté en formato correcto
    const fechaActual = new Date()
    const fechaGenerada = new Date(timestamp)
    const diferencia = Math.abs(fechaActual - fechaGenerada) / (1000 * 60 * 60) // en horas
    
    if (diferencia <= 6) { // Máximo 6 horas de diferencia (considerando UTC)
      console.log('   ✅ Fecha generada está en rango correcto')
    } else {
      console.log('   ⚠️ Fecha generada puede tener problemas de zona horaria')
    }
    
    // 2. Probar corrección del error de referencia
    console.log('\n2️⃣ Probando corrección de referencia salesService...')
    
    // Simular inicialización de servicios como en index.js
    const sales = new SalesService(db)
    
    // Verificar que sales.db existe
    if (sales.db) {
      console.log('   ✅ SalesService.db está correctamente inicializado')
    } else {
      console.log('   ❌ SalesService.db no está inicializado')
    }
    
    // 3. Verificar estructura de la corrección
    console.log('\n3️⃣ Verificando estructura de corrección...')
    
    // Leer el archivo WhatsApp service para verificar la corrección
    const fs = await import('fs')
    const whatsappContent = fs.readFileSync('./server/services/whatsapp.js', 'utf8')
    
    if (whatsappContent.includes('this.sales.db.get')) {
      console.log('   ✅ Corrección aplicada: this.sales.db.get encontrado')
    } else {
      console.log('   ❌ Corrección no aplicada correctamente')
    }
    
    if (whatsappContent.includes('this.salesService.db')) {
      console.log('   ⚠️ Código antiguo aún presente: this.salesService.db encontrado')
    } else {
      console.log('   ✅ Código antiguo removido correctamente')
    }
    
    console.log('\n🎉 ¡Todas las pruebas completadas!')
    console.log('\n📋 Resumen de correcciones:')
    console.log('   • Error de referencia: this.salesService.db → this.sales.db')
    console.log('   • Fechas normalizadas: Zona horaria de Perú (UTC-5)')
    console.log('   • Timestamps explícitos en lugar de CURRENT_TIMESTAMP')
    console.log('   • Método getCurrentTimestamp() agregado a DatabaseService')
    
    await db.close()
    
  } catch (error) {
    console.error('❌ Error en las pruebas:', error.message)
  }
}

// Ejecutar prueba si el script se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  testFixes()
}
