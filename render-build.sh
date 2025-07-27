#!/bin/bash

# ===========================================
# SCRIPT DE BUILD PARA RENDER - MEJORADO
# ===========================================

set -e  # Salir si cualquier comando falla

echo "🚀 Iniciando build para Render..."

# Instalar dependencias del frontend
echo "📦 Instalando dependencias del frontend..."
npm install

# Instalar dependencias del servidor
echo "📦 Instalando dependencias del servidor..."
cd server
npm install
cd ..

# Build del frontend
echo "🏗️ Construyendo frontend..."
npm run build

# Verificar que el build se creó correctamente
if [ ! -d "dist" ]; then
    echo "❌ ERROR: No se creó la carpeta dist/"
    echo "🔍 Listando archivos actuales:"
    ls -la
    exit 1
fi

if [ ! -f "dist/index.html" ]; then
    echo "❌ ERROR: No se encontró dist/index.html"
    echo "🔍 Contenido de dist/:"
    ls -la dist/
    exit 1
fi

echo "✅ Build del frontend completado correctamente"
echo "📁 Contenido de dist/:"
ls -la dist/

# Crear directorio public en server si no existe
echo "📁 Preparando archivos estáticos..."
mkdir -p server/public

# Copiar build del frontend al servidor
echo "📋 Copiando archivos del frontend al servidor..."
cp -r dist/* server/public/

# Verificar que los archivos se copiaron
if [ ! -f "server/public/index.html" ]; then
    echo "❌ ERROR: No se copió index.html a server/public/"
    echo "🔍 Contenido de server/public/:"
    ls -la server/public/
    exit 1
fi

echo "✅ Archivos copiados correctamente"
echo "📁 Contenido de server/public/:"
ls -la server/public/

# Crear directorio auth si no existe
echo "📁 Preparando directorio de autenticación..."
mkdir -p server/public/auth

echo "✅ Build completado para Render!"
echo "📡 El servidor estará disponible en el puerto 10000"
