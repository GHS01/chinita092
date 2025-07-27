import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { API_CONFIG } from './config/api'
import Dashboard from './components/Dashboard'
import Inventory from './components/Inventory'
import Orders from './components/Orders'
import Sales from './components/Sales'
import Settings from './components/Settings'
import Navigation from './components/Navigation'
import ConnectionStatus from './components/ConnectionStatus'
import NotificationToast from './components/NotificationToast'

function App() {
  const [socket, setSocket] = useState(null)
  const [whatsappStatus, setWhatsappStatus] = useState('disconnected')
  const [qrCode, setQrCode] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [notification, setNotification] = useState(null)

  useEffect(() => {
    // Conectar al servidor Socket.IO usando configuración dinámica
    console.log('🔌 Conectando a Socket.IO:', API_CONFIG.SOCKET_URL)
    const newSocket = io(API_CONFIG.SOCKET_URL)
    setSocket(newSocket)

    // Escuchar eventos de WhatsApp
    newSocket.on('whatsapp-status', (status) => {
      setWhatsappStatus(status)
    })

    newSocket.on('qr-code', (qr) => {
      setQrCode(qr)
    })

    newSocket.on('whatsapp-ready', () => {
      setWhatsappStatus('connected')
      setQrCode('')
    })

    newSocket.on('whatsapp-disconnected', () => {
      setWhatsappStatus('disconnected')
    })

    // Eventos del Smart Session Manager
    newSocket.on('session-cleared', (result) => {
      showNotification('success', 'Sesión Limpiada', result.message)
    })

    newSocket.on('session-invalid', () => {
      showNotification('warning', 'Sesión Inválida', 'WhatsApp fue cerrado desde el teléfono. Limpiando automáticamente...')
    })

    newSocket.on('ready-to-connect', () => {
      showNotification('info', 'Listo para Conectar', 'Sesión limpiada. Puedes conectar WhatsApp nuevamente.')
    })

    // Notificaciones del sistema
    newSocket.on('notification', (data) => {
      showNotification(data.type, data.title, data.message, 7000)
    })

    newSocket.on('system-error', (data) => {
      showNotification('error', 'Error del Sistema', data.message, 10000)
    })

    newSocket.on('system-warning', (data) => {
      showNotification('warning', 'Advertencia del Sistema', data.message, 8000)
    })

    return () => {
      newSocket.close()
    }
  }, [])

  const connectWhatsApp = () => {
    if (socket) {
      socket.emit('connect-whatsapp')
      setWhatsappStatus('connecting')
    }
  }

  const disconnectWhatsApp = () => {
    if (socket) {
      socket.emit('disconnect-whatsapp')
      setWhatsappStatus('disconnected')
    }
  }

  const showNotification = (type, title, message, duration = 5000) => {
    setNotification({ type, title, message, duration })
  }

  const closeNotification = () => {
    setNotification(null)
  }

  return (
    <div className="app">
      <div className="container">
        <ConnectionStatus 
          status={whatsappStatus}
          onConnect={connectWhatsApp}
          onDisconnect={disconnectWhatsApp}
        />
        
        <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="main-content">
          {activeTab === 'dashboard' && (
            <Dashboard 
              whatsappStatus={whatsappStatus}
              qrCode={qrCode}
              socket={socket}
            />
          )}
          
          {activeTab === 'inventory' && (
            <Inventory socket={socket} />
          )}
          
          {activeTab === 'orders' && (
            <Orders socket={socket} />
          )}

          {activeTab === 'sales' && (
            <Sales socket={socket} />
          )}

          {activeTab === 'settings' && (
            <Settings socket={socket} />
          )}
        </main>

        {/* Sistema de Notificaciones */}
        <NotificationToast
          notification={notification}
          onClose={closeNotification}
        />
      </div>
    </div>
  )
}

export default App
