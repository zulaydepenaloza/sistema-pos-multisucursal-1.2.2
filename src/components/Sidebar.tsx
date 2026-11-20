import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ShoppingBag,
  Users,
  Truck,
  CreditCard,
  Receipt,
  FileText,
  Settings,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  PackageCheck,
  Globe,
} from 'lucide-react';
import { Usuario, EmpresaConfig } from '../types';

export type SidebarTab =
  | 'dashboard'
  | 'ventas'
  | 'pedidos_web'
  | 'inventario'
  | 'compras'
  | 'clientes'
  | 'proveedores'
  | 'cxc'
  | 'cxp'
  | 'reportes'
  | 'configuracion';

interface SidebarProps {
  activeTab: SidebarTab;
  onSelectTab: (tab: SidebarTab) => void;
  currentUser: Usuario | null;
  empresaConfig: EmpresaConfig;
  onOpenRateModal: () => void;
  onLogout: () => void;
  onOpenHtmlModal?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  pendingWebOrdersCount?: number;
  onOpenClientStore?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  currentUser,
  empresaConfig,
  onOpenRateModal,
  onLogout,
  onOpenHtmlModal,
  isCollapsed = false,
  onToggleCollapse,
  pendingWebOrdersCount = 0,
  onOpenClientStore,
}) => {
  const isGeneralManager = currentUser?.rol === 'admin';

  // Check if a user has access to a specific tab
  const hasAccess = (tab: SidebarTab): boolean => {
    if (!currentUser) return tab === 'ventas';
    if (isGeneralManager) return true;
    if (currentUser.permisos && currentUser.permisos[tab] !== undefined) {
      return Boolean(currentUser.permisos[tab]);
    }
    if (tab === 'pedidos_web') {
      return currentUser.rol === 'supervisor';
    }
    // Default rule: non-manager can ONLY do ventas
    return tab === 'ventas';
  };

  const navItems: {
    id: SidebarTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    badgeColor?: string;
    description: string;
  }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      description: 'Cuadro de Mando',
    },
    {
      id: 'ventas',
      label: 'Ventas (POS)',
      icon: ShoppingCart,
      description: 'Facturación Dual $ / Bs.',
    },
    {
      id: 'pedidos_web',
      label: 'Pedidos Web',
      icon: PackageCheck,
      badge: pendingWebOrdersCount > 0 ? String(pendingWebOrdersCount) : undefined,
      badgeColor: 'bg-amber-400 text-slate-950',
      description: 'E-commerce & Envíos',
    },
    {
      id: 'inventario',
      label: 'Inventario',
      icon: Package,
      description: 'Stock y Traspasos',
    },
    {
      id: 'compras',
      label: 'Compras',
      icon: ShoppingBag,
      description: 'Recepción y Stock',
    },
    {
      id: 'clientes',
      label: 'Clientes',
      icon: Users,
      description: 'Directorio y Créditos',
    },
    {
      id: 'proveedores',
      label: 'Proveedores',
      icon: Truck,
      description: 'Cuentas y Contactos',
    },
    {
      id: 'cxc',
      label: 'CxC',
      icon: CreditCard,
      description: 'Cuentas por Cobrar',
    },
    {
      id: 'cxp',
      label: 'CxP',
      icon: Receipt,
      description: 'Cuentas por Pagar',
    },
    {
      id: 'reportes',
      label: 'Reportes',
      icon: FileText,
      description: 'Ventas, Compras y Facturas',
    },
    {
      id: 'configuracion',
      label: 'Configuración',
      icon: Settings,
      description: 'Usuarios, PINs y Permisos',
    },
  ];

  return (
    <aside
      id="main-sidebar"
      className={`${
        isCollapsed ? 'w-16 sm:w-[68px]' : 'w-64'
      } bg-slate-900 border-r border-slate-800/80 flex flex-col shrink-0 min-h-full lg:h-full sticky top-0 text-slate-200 select-none z-30 transition-all duration-300 ease-in-out`}
    >
      {/* Collapse/Expand Toggle Bar */}
      {onToggleCollapse && (
        <div
          className={`px-2.5 py-2 border-b border-slate-800/80 bg-slate-950/60 flex items-center ${
            isCollapsed ? 'justify-center' : 'justify-end'
          }`}
        >
          <button
            type="button"
            onClick={onToggleCollapse}
            title={isCollapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral hacia la izquierda'}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-emerald-300 border border-slate-700/80 transition-colors cursor-pointer shrink-0"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-emerald-400" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>
      )}

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1 custom-scrollbar">

        {navItems.map((item) => {
          const allowed = hasAccess(item.id);
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              id={`nav-item-${item.id}`}
              type="button"
              onClick={() => {
                if (allowed) {
                  onSelectTab(item.id);
                }
              }}
              disabled={!allowed}
              title={isCollapsed ? `${item.label} - ${item.description}` : undefined}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2.5'
              } rounded-xl text-xs font-semibold transition-all text-left group ${
                isActive
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                  : allowed
                  ? 'text-slate-300 hover:bg-slate-800/80 hover:text-white cursor-pointer'
                  : 'text-slate-600 bg-slate-950/30 opacity-60 cursor-not-allowed border border-transparent'
              }`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'} min-w-0`}>
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? 'text-slate-950'
                      : allowed
                      ? 'text-emerald-400 group-hover:scale-110 transition-transform'
                      : 'text-slate-600'
                  }`}
                />
                {!isCollapsed && (
                  <div className="truncate">
                    <div className="truncate">{item.label}</div>
                    <div
                      className={`text-[10px] font-normal truncate ${
                        isActive ? 'text-slate-900/80' : 'text-slate-500'
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                )}
              </div>

              {!isCollapsed && !allowed && (
                <span title="Solo disponible para Gerente General o usuarios autorizados">
                  <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                </span>
              )}

              {!isCollapsed && allowed && item.badge && (
                <span
                  className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                    item.badgeColor || 'bg-emerald-400 text-slate-950'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Dedicated Quick Action for Online Store / Digital Catalog */}
        {onOpenClientStore && (
          <div className="pt-2 mt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onOpenClientStore}
              title={isCollapsed ? 'Abrir Catálogo / Tienda Online' : undefined}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center p-2' : 'justify-between px-3 py-2.5'
              } rounded-xl bg-gradient-to-r from-emerald-950/50 to-teal-950/40 border border-emerald-500/30 hover:border-emerald-400/60 text-emerald-300 hover:text-white transition-all cursor-pointer group shadow-sm`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'} min-w-0`}>
                <Globe className="w-4 h-4 text-emerald-400 shrink-0 group-hover:rotate-12 transition-transform" />
                {!isCollapsed && (
                  <div className="truncate text-left">
                    <div className="text-xs font-bold truncate">Catálogo Digital</div>
                    <div className="text-[10px] text-emerald-400/80 truncate">Modo Cliente Web</div>
                  </div>
                )}
              </div>
              {!isCollapsed && (
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-500/30">
                  VER
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
