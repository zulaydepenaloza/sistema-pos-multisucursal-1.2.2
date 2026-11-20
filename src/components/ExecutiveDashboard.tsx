import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Package,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Store,
  Users,
  Award,
  AlertTriangle,
  Download,
  Filter,
  BarChart3,
  PieChart as PieChartIcon,
  Clock,
  Briefcase,
  FileSpreadsheet,
  CheckCircle2,
  ShoppingBag,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Sucursal, Producto, InventarioItem, Venta, Usuario, EmpresaConfig, Compra, Proveedor } from '../types';
import { formatUSD, formatBs, formatDual } from '../lib/currency';
import { Settings } from 'lucide-react';

interface ExecutiveDashboardProps {
  sucursales: Sucursal[];
  productos: Producto[];
  inventario: InventarioItem[];
  ventas: Venta[];
  compras?: Compra[];
  proveedores?: Proveedor[];
  usuarios: Usuario[];
  currentUser: Usuario | null;
  empresaConfig: EmpresaConfig;
  onOpenCompanySettings?: () => void;
}

type TimePeriod = 'today' | '7days' | '30days' | 'year' | 'all';

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  sucursales,
  productos,
  inventario,
  ventas,
  compras = [],
  proveedores = [],
  usuarios,
  currentUser,
  empresaConfig,
  onOpenCompanySettings,
}) => {
  const [period, setPeriod] = useState<TimePeriod>('30days');
  const [selectedSucursalFilter, setSelectedSucursalFilter] = useState<string>('all'); // 'all' | '1' | '2'
  const [activeTabSub, setActiveTabSub] = useState<'kpis' | 'sucursales' | 'productos' | 'cajeros'>('kpis');

  // Supuesto de Costo / Margen estimado para cálculos financieros (ej. margen bruto promedio 35% de costo = precio * 0.65)
  const ESTIMATED_COST_RATIO = 0.65;

  // Filtrado de Ventas por Período y Sucursal
  const filteredVentas = useMemo(() => {
    const now = new Date();
    return ventas.filter((v) => {
      // Filtro por Sucursal
      if (selectedSucursalFilter !== 'all' && v.sucursal_id !== Number(selectedSucursalFilter)) {
        return false;
      }

      // Filtro por Fecha / Período
      const vDate = new Date(v.fecha);
      const diffMs = now.getTime() - vDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (period === 'today') {
        return (
          vDate.getDate() === now.getDate() &&
          vDate.getMonth() === now.getMonth() &&
          vDate.getFullYear() === now.getFullYear()
        );
      }
      if (period === '7days') return diffDays <= 7;
      if (period === '30days') return diffDays <= 30;
      if (period === 'year') return diffDays <= 365;
      return true; // 'all'
    });
  }, [ventas, period, selectedSucursalFilter]);

  // Indicadores Financieros y Contadores Globales
  const financialMetrics = useMemo(() => {
    const totalIngresos = filteredVentas.reduce((sum, v) => sum + v.total, 0);
    const totalTransacciones = filteredVentas.length;
    const ticketPromedio = totalTransacciones > 0 ? totalIngresos / totalTransacciones : 0;

    let totalUnidadesVendidas = 0;
    let costoTotalMercaderia = 0;

    filteredVentas.forEach((v) => {
      v.detalles.forEach((d) => {
        totalUnidadesVendidas += d.cantidad;
        costoTotalMercaderia += d.subtotal * ESTIMATED_COST_RATIO;
      });
    });

    const gananciaBruta = totalIngresos - costoTotalMercaderia;
    const margenBrutoPorcentaje = totalIngresos > 0 ? (gananciaBruta / totalIngresos) * 100 : 0;

    // Valorización de Inventario actual
    let valorizacionTotalInventario = 0;
    let stockTotalUnidades = 0;
    let stockCriticoCount = 0;

    inventario.forEach((inv) => {
      const prod = productos.find((p) => p.id === inv.producto_id);
      if (prod) {
        if (selectedSucursalFilter === 'all' || inv.sucursal_id === Number(selectedSucursalFilter)) {
          valorizacionTotalInventario += inv.stock * prod.precio;
          stockTotalUnidades += inv.stock;
          if (inv.stock < 50 && inv.sucursal_id !== 3) {
            stockCriticoCount++;
          }
        }
      }
    });

    return {
      totalIngresos,
      totalTransacciones,
      ticketPromedio,
      totalUnidadesVendidas,
      costoTotalMercaderia,
      gananciaBruta,
      margenBrutoPorcentaje,
      valorizacionTotalInventario,
      stockTotalUnidades,
      stockCriticoCount,
    };
  }, [filteredVentas, inventario, productos, selectedSucursalFilter]);

  // Filtrado de Compras a Proveedores por Período y Sucursal
  const filteredCompras = useMemo(() => {
    const now = new Date();
    return compras.filter((c) => {
      if (selectedSucursalFilter !== 'all' && c.sucursalId !== Number(selectedSucursalFilter)) {
        return false;
      }

      const cDate = new Date(c.fecha);
      if (isNaN(cDate.getTime())) return period === 'all';
      const diffMs = now.getTime() - cDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (period === 'today') {
        return (
          cDate.getDate() === now.getDate() &&
          cDate.getMonth() === now.getMonth() &&
          cDate.getFullYear() === now.getFullYear()
        );
      }
      if (period === '7days') return diffDays <= 7;
      if (period === '30days') return diffDays <= 30;
      if (period === 'year') return diffDays <= 365;
      return true;
    });
  }, [compras, period, selectedSucursalFilter]);

  const comprasMetrics = useMemo(() => {
    const totalCompras = filteredCompras.reduce((sum, c) => sum + (c.total || 0), 0);
    const totalComprasBs = filteredCompras.reduce(
      (sum, c) => sum + (c.total || 0) * (c.tasaRecepcion || empresaConfig.tasaCambio),
      0
    );
    const totalFacturas = filteredCompras.length;
    const totalUnidades = filteredCompras.reduce(
      (sum, c) => sum + (c.detalles || []).reduce((acc, d) => acc + (d.cantidad || 0), 0),
      0
    );
    const totalCredito = filteredCompras
      .filter((c) => c.condicionPago !== 'contado')
      .reduce((sum, c) => sum + (c.total || 0), 0);
    const totalContado = filteredCompras
      .filter((c) => c.condicionPago === 'contado')
      .reduce((sum, c) => sum + (c.total || 0), 0);

    return {
      totalCompras,
      totalComprasBs,
      totalFacturas,
      totalUnidades,
      totalCredito,
      totalContado,
      proveedoresActivos: proveedores.length,
    };
  }, [filteredCompras, proveedores, empresaConfig.tasaCambio]);

  // Datos para gráfico de evolución temporal (100% reales desde filteredVentas, en cero si no hay ventas)
  const salesTimelineData = useMemo(() => {
    if (period === 'today') {
      const slots = [
        { label: '08:00', minHour: 0, maxHour: 9 },
        { label: '10:00', minHour: 10, maxHour: 11 },
        { label: '12:00', minHour: 12, maxHour: 13 },
        { label: '14:00', minHour: 14, maxHour: 15 },
        { label: '16:00', minHour: 16, maxHour: 17 },
        { label: '18:00', minHour: 18, maxHour: 19 },
        { label: '20:00', minHour: 20, maxHour: 23 },
      ];
      return slots.map((slot) => {
        const slotSales = filteredVentas.filter((v) => {
          const d = new Date(v.fecha);
          if (isNaN(d.getTime())) return false;
          const h = d.getHours();
          return h >= slot.minHour && h <= slot.maxHour;
        });
        const ingresos = slotSales.reduce((sum, v) => sum + (v.total || 0), 0);
        return {
          label: slot.label,
          Ingresos: Number(ingresos.toFixed(2)),
          Ganancia: Number((ingresos * (1 - ESTIMATED_COST_RATIO)).toFixed(2)),
          Tickets: slotSales.length,
        };
      });
    }

    if (period === '7days') {
      const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      return days.map((day, idx) => {
        // JS getDay(): 0=Dom, 1=Lun .. 6=Sáb -> map to 0=Lun..6=Dom
        const daySales = filteredVentas.filter((v) => {
          const d = new Date(v.fecha);
          if (isNaN(d.getTime())) return false;
          const jsDay = d.getDay();
          const monIndex = jsDay === 0 ? 6 : jsDay - 1;
          return monIndex === idx;
        });
        const ingresos = daySales.reduce((sum, v) => sum + (v.total || 0), 0);
        return {
          label: day,
          Ingresos: Number(ingresos.toFixed(2)),
          Ganancia: Number((ingresos * (1 - ESTIMATED_COST_RATIO)).toFixed(2)),
          Tickets: daySales.length,
        };
      });
    }

    if (period === '30days') {
      const weeks = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'];
      const nowMs = Date.now();
      return weeks.map((w, idx) => {
        const weekSales = filteredVentas.filter((v) => {
          const d = new Date(v.fecha);
          if (isNaN(d.getTime())) return false;
          const ageDays = Math.max(0, (nowMs - d.getTime()) / (1000 * 60 * 60 * 24));
          // Semana 4 = últimos 7 días, Semana 1 = días 22..30
          const bucket = Math.min(3, Math.max(0, 3 - Math.floor(ageDays / 7.5)));
          return bucket === idx;
        });
        const ingresos = weekSales.reduce((sum, v) => sum + (v.total || 0), 0);
        return {
          label: w,
          Ingresos: Number(ingresos.toFixed(2)),
          Ganancia: Number((ingresos * (1 - ESTIMATED_COST_RATIO)).toFixed(2)),
          Tickets: weekSales.length,
        };
      });
    }

    // 12 meses
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return months.map((m, idx) => {
      const monthSales = filteredVentas.filter((v) => {
        const d = new Date(v.fecha);
        return !isNaN(d.getTime()) && d.getMonth() === idx;
      });
      const ingresos = monthSales.reduce((sum, v) => sum + (v.total || 0), 0);
      return {
        label: m,
        Ingresos: Number(ingresos.toFixed(2)),
        Ganancia: Number((ingresos * (1 - ESTIMATED_COST_RATIO)).toFixed(2)),
        Tickets: monthSales.length,
      };
    });
  }, [filteredVentas, period]);

  // Comparativa de Rendimiento por Sucursal (valores reales, cero si no hay ventas)
  const branchComparisonData = useMemo(() => {
    const storeBranches = sucursales.filter((s) => s.tipo === 'tienda');
    const targetBranches = storeBranches.length > 0 ? storeBranches : sucursales.slice(0, 2);
    return targetBranches.map((suc) => {
      const branchSales = filteredVentas.filter((v) => v.sucursal_id === suc.id);
      const branchTotal = branchSales.reduce((s, v) => s + (v.total || 0), 0);
      return {
        id: suc.id,
        nombre: suc.nombre,
        Ventas: Number(branchTotal.toFixed(2)),
        Transacciones: branchSales.length,
        TicketPromedio:
          branchSales.length > 0 ? Number((branchTotal / branchSales.length).toFixed(2)) : 0,
        StockUnidades: inventario
          .filter((i) => i.sucursal_id === suc.id)
          .reduce((s, i) => s + i.stock, 0),
      };
    });
  }, [sucursales, filteredVentas, inventario]);

  // Distribución de Ingresos por Sucursal (PieChart)
  const pieDistributionData = useMemo(() => {
    const piePalette = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];
    return branchComparisonData.map((branch, idx) => ({
      name: branch.nombre,
      value: branch.Ventas,
      color: piePalette[idx % piePalette.length],
    }));
  }, [branchComparisonData]);

  // Top 5 Productos Más Vendidos (100% reales de filteredVentas)
  const topProductsData = useMemo(() => {
    const prodCounts = new Map<number, { nombre: string; cantidad: number; total: number }>();

    filteredVentas.forEach((v) => {
      (v.detalles || []).forEach((d) => {
        const prev = prodCounts.get(d.producto_id);
        const prod = productos.find((p) => p.id === d.producto_id);
        const nombre = prod?.nombre || d.producto_nombre || `Producto #${d.producto_id}`;
        if (prev) {
          prev.cantidad += Number(d.cantidad || 0);
          prev.total += Number(d.subtotal || 0);
        } else {
          prodCounts.set(d.producto_id, {
            nombre,
            cantidad: Number(d.cantidad || 0),
            total: Number(d.subtotal || 0),
          });
        }
      });
    });

    return Array.from(prodCounts.values())
      .sort((a, b) => b.total - a.total || b.cantidad - a.cantidad)
      .slice(0, 5)
      .map((item) => ({
        name: item.nombre,
        Unidades: Number(item.cantidad.toFixed(2)),
        TotalIngresos: Number(item.total.toFixed(2)),
      }));
  }, [filteredVentas, productos]);

  // Rendimiento de Cajeros / Personal (valores reales en cero si no hay ventas)
  const cashiersPerformance = useMemo(() => {
    const activeOperators = usuarios.filter(
      (u) => u.rol === 'cajero' || filteredVentas.some((v) => v.usuario_id === u.id)
    );
    return activeOperators
      .map((c) => {
        const userSales = filteredVentas.filter((v) => v.usuario_id === c.id);
        const totalRecaudado = userSales.reduce((sum, v) => sum + (v.total || 0), 0);
        const ticketsCount = userSales.length;
        const branchMatch = sucursales.find((s) => s.id === c.sucursal_id);
        const tiendaNombre =
          branchMatch?.nombre ||
          (c.sucursal_id === 1
            ? empresaConfig.nombreTienda1 || 'Tienda 1'
            : c.sucursal_id === 2
            ? empresaConfig.nombreTienda2 || 'Tienda 2'
            : c.sucursal_id === 3
            ? empresaConfig.nombreOficina || 'Oficina Central'
            : c.sucursal_id
            ? `Sucursal #${c.sucursal_id}`
            : 'Todas las Sucursales');

        return {
          id: c.id,
          nombre: c.nombre_completo,
          tienda: tiendaNombre,
          cargo: c.cargo,
          total: Number(totalRecaudado.toFixed(2)),
          tickets: ticketsCount,
          ticketPromedio: ticketsCount > 0 ? Number((totalRecaudado / ticketsCount).toFixed(2)) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [usuarios, filteredVentas, sucursales, empresaConfig.nombreTienda1, empresaConfig.nombreTienda2, empresaConfig.nombreOficina]);

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899'];

  return (
    <div id="gerencia-dashboard" className="space-y-6">
      {/* HEADER ESTRATÉGICO DE GERENCIA GENERAL */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500/20 to-emerald-500/20 border border-purple-500/30 text-purple-300">
              <Briefcase className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Área de Gerencia General — {empresaConfig.nombreEmpresa || 'Comercio Sin Configurar'}
                </h2>
                {empresaConfig.rif && (
                  <span className="bg-purple-500/10 text-purple-300 border border-purple-500/30 text-[11px] font-bold px-2.5 py-0.5 rounded-full font-mono">
                    {empresaConfig.rif}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Cuadro de Mando Integral • Cotización del Día:{' '}
                <strong className="text-emerald-400 font-mono">1 USD = {formatBs(1, empresaConfig.tasaCambio)}</strong>
              </p>
            </div>
          </div>

          {/* FILTROS ESTRATÉGICOS DE PERÍODO Y SUCURSAL + BOTÓN CONFIGURACIÓN */}
          <div className="flex flex-wrap items-center gap-2.5 bg-slate-950 p-2 rounded-xl border border-slate-800">
            {onOpenCompanySettings && (
              <button
                type="button"
                onClick={onOpenCompanySettings}
                className="bg-purple-950/70 hover:bg-purple-900 text-purple-300 border border-purple-500/40 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Configuración de Empresa, Logo, Fiscal y Sucursales"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Configurar Empresa</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 px-2 text-xs text-slate-400 font-medium">
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
              <span>Período:</span>
            </div>

            <div className="grid grid-cols-5 gap-1 text-xs">
              <button
                onClick={() => setPeriod('today')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  period === 'today'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Hoy
              </button>
              <button
                onClick={() => setPeriod('7days')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  period === '7days'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                7 Días
              </button>
              <button
                onClick={() => setPeriod('30days')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  period === '30days'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                30 Días
              </button>
              <button
                onClick={() => setPeriod('year')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  period === 'year'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Año
              </button>
              <button
                onClick={() => setPeriod('all')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  period === 'all'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Histórico
              </button>
            </div>

            <div className="h-6 w-px bg-slate-800 hidden sm:block"></div>

            {/* Filtro Sucursal */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedSucursalFilter}
                onChange={(e) => setSelectedSucursalFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-xs text-white px-2.5 py-1 rounded-lg focus:outline-none focus:border-purple-500 cursor-pointer font-medium"
              >
                <option value="all">Todas las Sucursales</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* TARJETAS DE INDICADORES FINANCIEROS Y CONTADORES ESTRATÉGICOS CON DUAL CURRENCY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* KPI 1: Ingresos Totales */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 relative overflow-hidden shadow-lg group hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Ingresos Brutos
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-0.5 font-mono">
            <div className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              {formatUSD(financialMetrics.totalIngresos)}
            </div>
            <div className="text-sm font-bold text-emerald-400">
              {formatBs(financialMetrics.totalIngresos, empresaConfig.tasaCambio)}
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${financialMetrics.totalTransacciones > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>
              {financialMetrics.totalTransacciones > 0
                ? `${financialMetrics.totalTransacciones} operación${financialMetrics.totalTransacciones === 1 ? '' : 'es'} registrada${financialMetrics.totalTransacciones === 1 ? '' : 's'}`
                : '0 operaciones en el período'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-800/80">
            Total facturado en {filteredVentas.length} transacciones
          </div>
        </div>

        {/* KPI 2: Margen Bruto & Ganancia Estimada */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 relative overflow-hidden shadow-lg group hover:border-purple-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Utilidad Bruta Est.
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-0.5 font-mono">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl lg:text-3xl font-extrabold text-purple-300 tracking-tight">
                {formatUSD(financialMetrics.gananciaBruta)}
              </span>
              <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded font-sans">
                {financialMetrics.margenBrutoPorcentaje.toFixed(1)}%
              </span>
            </div>
            <div className="text-sm font-bold text-purple-300">
              {formatBs(financialMetrics.gananciaBruta, empresaConfig.tasaCambio)}
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${financialMetrics.totalIngresos > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>
              {financialMetrics.totalIngresos > 0
                ? 'Retorno operativo saludable'
                : 'Sin movimientos en el período'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-800/80">
            Costo de mercadería: {formatDual(financialMetrics.costoTotalMercaderia, empresaConfig.tasaCambio)}
          </div>
        </div>

        {/* KPI 3: Ticket Promedio y Volumen */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 relative overflow-hidden shadow-lg group hover:border-blue-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Ticket Promedio
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-0.5 font-mono">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                {formatUSD(financialMetrics.ticketPromedio)}
              </span>
              <span className="text-xs font-normal text-slate-400 font-sans">/ venta</span>
            </div>
            <div className="text-sm font-bold text-blue-400">
              {formatBs(financialMetrics.ticketPromedio, empresaConfig.tasaCambio)}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium">
            <Layers className="w-3.5 h-3.5" />
            <span>{financialMetrics.totalUnidadesVendidas} unidades despachadas</span>
          </div>
          <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-800/80">
            Promedio{' '}
            {financialMetrics.totalTransacciones > 0
              ? (financialMetrics.totalUnidadesVendidas / financialMetrics.totalTransacciones).toFixed(1)
              : '0.0'}{' '}
            ítems por carrito
          </div>
        </div>

        {/* KPI 4: Valorización de Inventario & Existencias */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 relative overflow-hidden shadow-lg group hover:border-amber-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Activo en Inventario
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-0.5 font-mono">
            <div className="text-2xl lg:text-3xl font-extrabold text-amber-300 tracking-tight">
              {formatUSD(financialMetrics.valorizacionTotalInventario)}
            </div>
            <div className="text-sm font-bold text-amber-400">
              {formatBs(financialMetrics.valorizacionTotalInventario, empresaConfig.tasaCambio)}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>{financialMetrics.stockTotalUnidades.toLocaleString()} un. en stock</span>
            {financialMetrics.stockTotalUnidades === 0 ? (
              <span className="text-slate-500 font-semibold">0 productos</span>
            ) : financialMetrics.stockCriticoCount > 0 ? (
              <span className="text-rose-400 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {financialMetrics.stockCriticoCount} alertas
              </span>
            ) : (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Stock Óptimo
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-800/80">
            Distribución en {sucursales.length} centros logísticos
          </div>
        </div>

        {/* KPI 5: Compras a Proveedores */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 relative overflow-hidden shadow-lg group hover:border-cyan-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Compras Facturadas
            </span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-0.5 font-mono">
            <div className="text-2xl lg:text-3xl font-extrabold text-cyan-300 tracking-tight">
              {formatUSD(comprasMetrics.totalCompras)}
            </div>
            <div className="text-sm font-bold text-cyan-400">
              {formatBs(comprasMetrics.totalCompras, empresaConfig.tasaCambio)}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-cyan-300 font-medium">
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              {comprasMetrics.totalFacturas} {comprasMetrics.totalFacturas === 1 ? 'factura' : 'facturas'}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              +{comprasMetrics.totalUnidades.toFixed(comprasMetrics.totalUnidades % 1 === 0 ? 0 : 2)} un.
            </span>
          </div>
          <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-800/80">
            Créd: {formatUSD(comprasMetrics.totalCredito)} | Cont: {formatUSD(comprasMetrics.totalContado)}
          </div>
        </div>
      </div>

      {/* SECCIÓN PRINCIPAL: GRÁFICAS ESTRATÉGICAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* GRÁFICA 1: Evolución Temporal de Ingresos y Ganancia (2/3 ancho) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                Evolución de Ingresos y Utilidad Neta
              </h3>
              <p className="text-xs text-slate-400">
                Curva de rendimiento financiero en el período seleccionado ({period.toUpperCase()})
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Ingresos ($)
              </span>
              <span className="flex items-center gap-1 text-purple-400 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block"></span> Utilidad Est. ($)
              </span>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTimelineData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorGanancia" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="Ingresos"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorIngresos)"
                />
                <Area
                  type="monotone"
                  dataKey="Ganancia"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorGanancia)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICA 2: Participación de Ventas por Sucursal (1/3 ancho) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-blue-400" />
              Mix de Ingresos por Tienda
            </h3>
            <p className="text-xs text-slate-400">Distribución porcentual de facturación</p>
          </div>

          <div className="h-56 w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                  formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'Ventas']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center pointer-events-none">
              <span className="text-xs text-slate-400 block">Total</span>
              <span className="text-sm font-extrabold text-white">
                ${branchComparisonData.reduce((sum, b) => sum + b.Ventas, 0).toFixed(0)}
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-1 border-t border-slate-800/80">
            {pieDistributionData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                  {item.name}
                </span>
                <span className="font-bold text-white">${item.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PESTAÑAS DE PROFUNDIZACIÓN ESTRATÉGICA */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTabSub('kpis')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTabSub === 'kpis'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              🏢 Comparativa de Sucursales
            </button>
            <button
              onClick={() => setActiveTabSub('productos')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTabSub === 'productos'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              📦 Top Productos & Rentabilidad
            </button>
            <button
              onClick={() => setActiveTabSub('cajeros')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTabSub === 'cajeros'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              👥 Rendimiento por Cajero/Usuario
            </button>
          </div>

          <span className="text-[11px] text-slate-400 font-mono">
            Auditoría Ejecutiva • Sistema en Tiempo Real
          </span>
        </div>

        {/* CONTENIDO 1: COMPARATIVA DE SUCURSALES */}
        {activeTabSub === 'kpis' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branchComparisonData.map((branch, idx) => (
              <div key={branch.id || idx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Store
                      className={`w-4 h-4 ${
                        idx % 3 === 0 ? 'text-emerald-400' : idx % 3 === 1 ? 'text-blue-400' : 'text-amber-400'
                      }`}
                    />
                    <h4 className="font-bold text-white text-sm">{branch.nombre}</h4>
                  </div>
                  <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                    Sucursal #{branch.id || idx + 1}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Facturación Período:</span>
                    <span className="text-base font-extrabold text-white block">{formatUSD(branch.Ventas)}</span>
                    <span className="text-[11px] font-bold text-emerald-400 font-mono">
                      {formatBs(branch.Ventas, empresaConfig.tasaCambio)}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Transacciones Realizadas:</span>
                    <span className="text-base font-extrabold text-slate-200">{branch.Transacciones} ventas</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Ticket Promedio:</span>
                    <span className="text-base font-extrabold text-emerald-400 block">{formatUSD(branch.TicketPromedio)}</span>
                    <span className="text-[11px] font-bold text-blue-400 font-mono">
                      {formatBs(branch.TicketPromedio, empresaConfig.tasaCambio)}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Stock Disponible:</span>
                    <span className="text-base font-extrabold text-amber-300">{branch.StockUnidades} unidades</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CONTENIDO 2: TOP PRODUCTOS */}
        {activeTabSub === 'productos' && (
          topProductsData.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl">
              Sin ventas de productos registradas en este período.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProductsData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} interval={0} angle={-10} textAnchor="end" />
                    <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Bar dataKey="TotalIngresos" fill="#10b981" name="Ingresos Generados ($)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Unidades" fill="#3b82f6" name="Unidades Vendidas" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Ranking</th>
                      <th className="p-3">Producto</th>
                      <th className="p-3 text-right">Unidades Vendidas</th>
                      <th className="p-3 text-right">Facturación ($ y Bs.)</th>
                      <th className="p-3 text-right">Margen Estimado (35%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/50">
                    {topProductsData.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono font-bold text-purple-400">#{idx + 1}</td>
                        <td className="p-3 font-semibold text-white">{p.name}</td>
                        <td className="p-3 text-right font-mono text-slate-300">{p.Unidades} un.</td>
                        <td className="p-3 text-right font-mono">
                          <span className="font-bold text-emerald-400 block">{formatUSD(p.TotalIngresos)}</span>
                          <span className="text-[11px] text-slate-400">{formatBs(p.TotalIngresos, empresaConfig.tasaCambio)}</span>
                        </td>
                        <td className="p-3 text-right font-mono">
                          <span className="font-bold text-purple-300 block">{formatUSD(p.TotalIngresos * 0.35)}</span>
                          <span className="text-[11px] text-slate-400">{formatBs(p.TotalIngresos * 0.35, empresaConfig.tasaCambio)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* CONTENIDO 3: RENDIMIENTO POR CAJERO */}
        {activeTabSub === 'cajeros' && (
          cashiersPerformance.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl">
              Sin cajeros ni ventas registradas en este período.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Colaborador / Cajero</th>
                    <th className="p-3">Sucursal Asignada</th>
                    <th className="p-3">Cargo Operativo</th>
                    <th className="p-3 text-right">Tickets Procesados</th>
                    <th className="p-3 text-right">Ticket Promedio</th>
                    <th className="p-3 text-right">Total Recaudado ($ y Bs.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 bg-slate-900/50">
                  {cashiersPerformance.map((c, idx) => (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-semibold text-white flex items-center gap-2">
                        {idx === 0 && c.total > 0 && <Award className="w-4 h-4 text-amber-400" />}
                        {c.nombre}
                      </td>
                      <td className="p-3 text-slate-300">{c.tienda}</td>
                      <td className="p-3 text-slate-400">{c.cargo}</td>
                      <td className="p-3 text-right font-mono text-slate-300">{c.tickets}</td>
                      <td className="p-3 text-right font-mono text-slate-300">{formatUSD(c.ticketPromedio)}</td>
                      <td className="p-3 text-right font-mono">
                        <span className="font-bold text-emerald-400 block">{formatUSD(c.total)}</span>
                        <span className="text-[11px] text-slate-400">{formatBs(c.total, empresaConfig.tasaCambio)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
};
