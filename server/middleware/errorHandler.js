// 🚨 MIDDLEWARE DE MANEJO DE ERRORES PARA PRODUCCIÓN

export const errorHandler = (err, req, res, next) => {
  console.error('❌ Error del servidor:', err)

  // En producción, no exponer detalles del error
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({
      error: 'Error interno del servidor',
      timestamp: new Date().toISOString(),
      path: req.path
    })
  } else {
    // En desarrollo, mostrar detalles completos
    res.status(500).json({
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
      path: req.path
    })
  }
}

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  })
}

// Middleware para logging de requests en producción
export const requestLogger = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`)
  }
  next()
}
