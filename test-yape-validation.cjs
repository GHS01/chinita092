#!/usr/bin/env node

/**
 * Script de prueba para validar la nueva lógica de validación de pagos Yape
 * Prueba los casos específicos mencionados en el problema
 */

// Función de validación de nombres (copiada de whatsapp.js para pruebas)
function validateYapeName(detectedName, configuredName) {
  if (!detectedName || !configuredName) {
    return { isValid: false, reason: 'Nombre detectado o configurado faltante' }
  }

  // Normalizar nombres (quitar acentos, convertir a minúsculas)
  const normalize = (str) => str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim()

  const detectedNormalized = normalize(detectedName)
  const configuredNormalized = normalize(configuredName)

  // Si son exactamente iguales, es válido
  if (detectedNormalized === configuredNormalized) {
    return { isValid: true, reason: 'Nombres coinciden exactamente' }
  }

  // Dividir nombres en partes
  const detectedParts = detectedNormalized.split(/\s+/).filter(part => part.length > 0)
  const configuredParts = configuredNormalized.split(/\s+/).filter(part => part.length > 0)

  if (detectedParts.length < 1 || configuredParts.length < 1) {
    return { isValid: false, reason: 'Formato de nombre insuficiente para validación' }
  }

  // Caso especial: solo un nombre detectado (ej: "Ana")
  if (detectedParts.length === 1) {
    const detectedFirstName = detectedParts[0]
    const configuredFirstName = configuredParts[0]

    if (detectedFirstName === configuredFirstName) {
      return {
        isValid: true,
        reason: `Primer nombre "${configuredFirstName}" coincide (formato Yape simplificado)`
      }
    } else {
      return {
        isValid: false,
        reason: `Primer nombre no coincide. Detectado: "${detectedFirstName}", Esperado: "${configuredFirstName}"`
      }
    }
  }

  if (configuredParts.length < 2) {
    return { isValid: false, reason: 'Nombre configurado debe tener al menos nombre y apellido' }
  }

  // Extraer componentes del nombre configurado
  const [primerNombre, segundoNombre, primerApellido, segundoApellido] = configuredParts

  // Extraer componentes del nombre detectado (formato Yape)
  const detectedFirstName = detectedParts[0]
  let detectedFirstSurname = null
  let detectedSecondNameInitial = null
  let detectedSecondSurnameInitial = null

  // Buscar iniciales y apellidos en el nombre detectado
  for (let i = 1; i < detectedParts.length; i++) {
    const part = detectedParts[i]

    if (part.length === 1) {
      // Es una inicial
      if (!detectedSecondNameInitial && segundoNombre && part === segundoNombre.charAt(0)) {
        detectedSecondNameInitial = part
      } else if (!detectedSecondSurnameInitial && segundoApellido && part === segundoApellido.charAt(0)) {
        detectedSecondSurnameInitial = part
      }
    } else {
      // Es un nombre/apellido completo - tomar el primer apellido completo encontrado
      if (!detectedFirstSurname) {
        detectedFirstSurname = part
      }
    }
  }

  // Validar componentes críticos (primer nombre y primer apellido)
  const firstNameMatches = detectedFirstName === primerNombre
  const firstSurnameMatches = detectedFirstSurname === primerApellido

  if (firstNameMatches && firstSurnameMatches) {
    return {
      isValid: true,
      reason: `Primer nombre "${primerNombre}" y primer apellido "${primerApellido}" coinciden (formato Yape)`
    }
  }

  // Si solo coincide el primer nombre pero hay apellidos detectados que no coinciden, es inválido
  if (firstNameMatches && detectedFirstSurname && !firstSurnameMatches) {
    return {
      isValid: false,
      reason: `Primer nombre coincide pero apellido no. Detectado: "${detectedFirstSurname}", Esperado: "${primerApellido}"`
    }
  }

  // Si solo coincide el primer nombre y no hay apellido visible, es parcialmente válido
  if (firstNameMatches && !detectedFirstSurname) {
    return {
      isValid: true,
      reason: `Primer nombre "${primerNombre}" coincide, apellido no visible en formato Yape`
    }
  }

  return {
    isValid: false,
    reason: `Primer nombre o apellido no coinciden. Detectado: "${detectedName}", Configurado: "${configuredName}"`
  }
}

async function testYapeValidation() {
  console.log('🧪 INICIANDO PRUEBAS DE VALIDACIÓN YAPE')
  console.log('=' .repeat(50))

  try {
    // Casos de prueba
    const testCases = [
      {
        name: 'Caso 1: Nombre completo vs formato Yape',
        detectedName: 'Jissel M. Rosillo J.',
        configuredName: 'Jissel Maria Rosillo Jimenez',
        expectedResult: true,
        description: 'Primer nombre y apellido coinciden, formato Yape con iniciales'
      },
      {
        name: 'Caso 2: Nombre configurado vs formato Yape',
        detectedName: 'Luis E. Alvarado M.',
        configuredName: 'Luis Enrique Alvarado Mendoza',
        expectedResult: true,
        description: 'Primer nombre y apellido coinciden, formato Yape con iniciales'
      },
      {
        name: 'Caso 3: Solo primer nombre visible',
        detectedName: 'Ana',
        configuredName: 'Ana Maria Gonzalez Rodriguez',
        expectedResult: true,
        description: 'Solo primer nombre visible, debería ser válido'
      },
      {
        name: 'Caso 4: Nombres no coinciden',
        detectedName: 'Carlos R. Martinez L.',
        configuredName: 'Luis Enrique Alvarado Mendoza',
        expectedResult: false,
        description: 'Primer nombre no coincide, debería ser inválido'
      },
      {
        name: 'Caso 5: Apellidos no coinciden',
        detectedName: 'Luis E. Rodriguez M.',
        configuredName: 'Luis Enrique Alvarado Mendoza',
        expectedResult: false,
        description: 'Primer apellido no coincide, debería ser inválido'
      }
    ]

    console.log('🔍 PROBANDO VALIDACIÓN DE NOMBRES')
    console.log('-' .repeat(30))

    for (const testCase of testCases) {
      console.log(`\n📋 ${testCase.name}`)
      console.log(`   Detectado: "${testCase.detectedName}"`)
      console.log(`   Configurado: "${testCase.configuredName}"`)
      console.log(`   Esperado: ${testCase.expectedResult ? '✅ Válido' : '❌ Inválido'}`)
      
      const result = validateYapeName(testCase.detectedName, testCase.configuredName)
      
      console.log(`   Resultado: ${result.isValid ? '✅ Válido' : '❌ Inválido'}`)
      console.log(`   Razón: ${result.reason}`)
      
      if (result.isValid === testCase.expectedResult) {
        console.log('   ✅ PRUEBA PASADA')
      } else {
        console.log('   ❌ PRUEBA FALLIDA')
      }
    }

    // Probar validación de últimos 3 dígitos
    console.log('\n\n🔍 PROBANDO VALIDACIÓN DE ÚLTIMOS 3 DÍGITOS')
    console.log('-' .repeat(40))

    const digitTestCases = [
      {
        name: 'Dígitos coinciden',
        configuredNumber: '987654321',
        detectedDigits: '321',
        expectedResult: true
      },
      {
        name: 'Dígitos no coinciden',
        configuredNumber: '987654572',
        detectedDigits: '957',
        expectedResult: false
      }
    ]

    for (const testCase of digitTestCases) {
      console.log(`\n📋 ${testCase.name}`)
      console.log(`   Número configurado: ${testCase.configuredNumber}`)
      console.log(`   Últimos 3 detectados: ${testCase.detectedDigits}`)
      console.log(`   Últimos 3 esperados: ${testCase.configuredNumber.slice(-3)}`)
      
      const expectedDigits = testCase.configuredNumber.slice(-3)
      const matches = expectedDigits === testCase.detectedDigits
      
      console.log(`   Resultado: ${matches ? '✅ Coinciden' : '❌ No coinciden'}`)
      
      if (matches === testCase.expectedResult) {
        console.log('   ✅ PRUEBA PASADA')
      } else {
        console.log('   ❌ PRUEBA FALLIDA')
      }
    }

    console.log('\n🎉 PRUEBAS COMPLETADAS')
    console.log('=' .repeat(50))

  } catch (error) {
    console.error('❌ Error ejecutando pruebas:', error)
  }
}

// Ejecutar pruebas si se llama directamente
if (require.main === module) {
  testYapeValidation()
}

module.exports = { testYapeValidation }
