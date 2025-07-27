import { useState } from 'react'
import { QrCode, Smartphone, Wifi } from 'lucide-react'

const QRCodeDisplay = ({ qrCode }) => {
  const [imageLoaded, setImageLoaded] = useState(false)

  return (
    <div className="qr-display">
      <div className="qr-header">
        <h3>
          <QrCode size={24} />
          Conectar WhatsApp
        </h3>
        <p>Escanea este código QR desde tu WhatsApp para conectar el agente</p>
      </div>

      <div className="qr-code-container">
        {qrCode && (
          <img 
            src={qrCode} 
            alt="Código QR de WhatsApp"
            className={`qr-image ${imageLoaded ? 'loaded' : ''}`}
            onLoad={() => setImageLoaded(true)}
          />
        )}
        
        {!imageLoaded && (
          <div className="qr-loading">
            <div className="spinner"></div>
            <p>Generando código QR...</p>
          </div>
        )}
      </div>

      <div className="qr-instructions">
        <h4>Instrucciones:</h4>
        <div className="instruction-steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-content">
              <Smartphone size={20} />
              <span>Abre WhatsApp en tu teléfono</span>
            </div>
          </div>
          
          <div className="step">
            <div className="step-number">2</div>
            <div className="step-content">
              <QrCode size={20} />
              <span>Ve a Configuración → Dispositivos vinculados</span>
            </div>
          </div>
          
          <div className="step">
            <div className="step-number">3</div>
            <div className="step-content">
              <Wifi size={20} />
              <span>Toca "Vincular un dispositivo" y escanea este código</span>
            </div>
          </div>
        </div>
      </div>

      <div className="qr-warning">
        <p>
          <strong>⚠️ Importante:</strong> Este código QR es único y temporal. 
          No lo compartas con nadie más. Se renovará automáticamente si no se usa.
        </p>
      </div>
    </div>
  )
}

export default QRCodeDisplay
