import { Home, Package, ShoppingCart, Settings, TrendingUp } from 'lucide-react'

const Navigation = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'inventory', label: 'Inventario', icon: Package },
    { id: 'orders', label: 'Pedidos', icon: ShoppingCart },
    { id: 'sales', label: 'Ventas', icon: TrendingUp },
    { id: 'settings', label: 'Configuración', icon: Settings }
  ]

  return (
    <nav className="nav-tabs">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={`nav-tab ${activeTab === id ? 'active' : ''}`}
          onClick={() => setActiveTab(id)}
        >
          <Icon size={20} />
          <span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}

export default Navigation
