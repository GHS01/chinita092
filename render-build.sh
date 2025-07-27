#!/bin/bash

# ===========================================
# SCRIPT DE BUILD PARA RENDER
# ===========================================

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

# Crear directorio public en server si no existe
echo "📁 Preparando archivos estáticos..."
mkdir -p server/public

# Copiar build del frontend al servidor
echo "📋 Copiando archivos del frontend al servidor..."
cp -r dist/* server/public/

# Crear directorio auth si no existe
echo "📁 Preparando directorio de autenticación..."
mkdir -p server/auth

echo "✅ Build completado para Render!"
echo "📡 El servidor estará disponible en el puerto $PORT"
