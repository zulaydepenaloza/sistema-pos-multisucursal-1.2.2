import React, { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  Receipt,
  ShoppingBag,
  Printer,
  Eye,
  Search,
  Calendar,
  Building2,
  Download,
  FileSpreadsheet,
  TrendingUp,
  ArrowUpDown,
  X,
  CheckCircle2,
  DollarSign,
  Layers,
  Filter,
} from 'lucide-react';
import { Compra, EmpresaConfig, Proveedor, Sucursal, Usuario, Venta } from '../types';
import { formatUSD, formatBs } from '../lib/currency';
import {
  ThermalPaperWidth,
  getSavedPaperWidth,
  setSavedPaperWidth,
  printTicketViaIframe,
  ventaToPrintableTicket,
  printVentaLetterViaIframe,
  printCompraViaIframe,
} from '../lib/ticketPrinter';

interface SalesPurchasesReportViewProps {
  ventas?: Venta[];
  compras?: Compra[];
  sucursales?: Sucursal[];
  proveedores?: Proveedor[];
  empresaConfig?: EmpresaConfig;
  currentUser?: Usuario | null;
}

type ReportSubTab = 'ventas' | 'compras' | 'consolidado';
type QuickPeriod = 'all' | 'today' | '7days' | '30days' | 'custom';

export const SalesPurchasesReportView: React.FC<SalesPurchasesReportViewProps> = ({
  ventas = [],
  compras = [],
  sucursales = [],
  proveedores = [],
  empresaConfig = {
    nombreEmpresa: 'Corporación Multi-Tienda C.A.',
    rif: 'J-50123456-7',
    direccionFiscal: 'Av. Libertador, Edif. Centro, Piso 1, Caracas',
    telefono: '+58 212-5551234',
    nombreTienda1: 'Tienda 1 - Centro',
    nombreTienda2: 'Tienda 2 - Norte',
    nombreOficina: 'Oficina Central (Almacén)',
    tasaCambio: 45.5,
    fechaTasa: new Date().toISOString().split('T')[0],
  },
}) => {
  const [subTab, setSubTab] = useState<ReportSubTab>('ventas');
  const [period, setPeriod] = useState<QuickPeriod>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [paperWidth, setPaperWidth] = useState<ThermalPaperWidth>(() => getSavedPaperWidth());

  const [previewVenta, setPreviewVenta] = useState<Venta | null>(null);
  const [previewCompra, setPreviewCompra] = useState<Compra | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const tasaActual = empresaConfig.tasaCambio || 45.5;

  const getBranchName = (sucursalId: number) => {
    const found = sucursales.find((s) => s.id === sucursalId);
    if (found) return found.nombre;
    if (sucursalId === 1) return empresaConfig.nombreTienda1;
    if (sucursalId === 2) return empresaConfig.nombreTienda2;
    if (sucursalId === 3) return empresaConfig.nombreOficina || 'Almacén Central';
    return `Sucursal #${sucursalId}`;
  };

  const matchesDateRange = (dateString: string): boolean => {
    if (period === 'all') return true;
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return true;
    const now = new Date();

    if (period === 'today') {
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    }
    if (period === '7days') {
      return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) <= 7;
    }
    if (period === '30days') {
      return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) <= 30;
    }
    if (period === 'custom') {
      if (dateFrom) {
        const fromD = new Date(`${dateFrom}T00:00:00`);
        if (d < fromD) return false;
      }
      if (dateTo) {
        const toD = new Date(`${dateTo}T23:59:59`);
        if (d > toD) return false;
      }
    }
    return true;
  };

  const filteredVentas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...ventas]
      .filter((v) => {
        if (selectedBranch !== 'all' && v.sucursal_id !== Number(selectedBranch)) return false;
        if (!matchesDateRange(v.fecha)) return false;
        if (q) {
          const invNum = String(v.id || '').padStart(8, '0');
          const matchesId = invNum.includes(q) || String(v.id).includes(q);
          const matchesClient = (v.cliente_nombre || '').toLowerCase().includes(q);
          const matchesRif = (v.cliente_rif || '').toLowerCase().includes(q);
          const matchesCashier = (v.usuario_nombre || '').toLowerCase().includes(q);
          if (!matchesId && !matchesClient && !matchesRif && !matchesCashier) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [ventas, selectedBranch, period, dateFrom, dateTo, searchTerm]);

  const filteredCompras = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...compras]
      .filter((c) => {
        if (selectedBranch !== 'all' && c.sucursalId !== Number(selectedBranch)) return false;
        if (!matchesDateRange(c.fecha)) return false;
        if (q) {
          const prov = proveedores.find((p) => p.id === c.proveedorId);
          const rif = (c.proveedorRif || prov?.rif || '').toLowerCase();
          const matchesFact = (c.numeroFactura || String(c.id)).toLowerCase().includes(q);
          const matchesCtrl = (c.numeroControl || '').toLowerCase().includes(q);
          const matchesProv = (c.proveedorNombre || '').toLowerCase().includes(q);
          const matchesRif = rif.includes(q);
          const matchesUser = (c.usuarioNombre || '').toLowerCase().includes(q);
          if (!matchesFact && !matchesCtrl && !matchesProv && !matchesRif && !matchesUser) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [compras, proveedores, selectedBranch, period, dateFrom, dateTo, searchTerm]);

  const summary = useMemo(() => {
    const totalVentasUsd = filteredVentas.reduce((s, v) => s + (v.total || 0), 0);
    const totalIvaVentas = filteredVentas.reduce((s, v) => s + (v.monto_iva || 0), 0);
    const baseImpVentas = filteredVentas.reduce((s, v) => s + (v.base_imponible || 0), 0);
    const exentoVentas = filteredVentas.reduce((s, v) => s + (v.monto_exento || 0), 0);

    const totalComprasUsd = filteredCompras.reduce((s, c) => s + (c.total || 0), 0);
    const totalComprasBs = filteredCompras.reduce(
      (s, c) => s + (c.total || 0) * (c.tasaRecepcion || tasaActual),
      0
    );
    const totalIvaCompras = filteredCompras.reduce((s, c) => s + (c.montoIva || 0), 0);
    const baseImpCompras = filteredCompras.reduce((s, c) => s + (c.baseImponible || 0), 0);
    const exentoCompras = filteredCompras.reduce((s, c) => s + (c.montoExento || 0), 0);

    return {
      totalVentasUsd,
      totalVentasBs: totalVentasUsd * tasaActual,
      totalIvaVentas,
      baseImpVentas,
      exentoVentas,
      totalComprasUsd,
      totalComprasBs,
      totalIvaCompras,
      baseImpCompras,
      exentoCompras,
      diferenciaNetaUsd: totalVentasUsd - totalComprasUsd,
      diferenciaIvaUsd: totalIvaVentas - totalIvaCompras,
    };
  }, [filteredVentas, filteredCompras, tasaActual]);

  const branchSummary = useMemo(() => {
    const ids = sucursales.length > 0 ? sucursales.map((s) => s.id) : [1, 2, 3];
    return ids.map((id) => {
      const vBranch = filteredVentas.filter((v) => v.sucursal_id === id);
      const cBranch = filteredCompras.filter((c) => c.sucursalId === id);
      const vTotal = vBranch.reduce((s, v) => s + (v.total || 0), 0);
      const cTotal = cBranch.reduce((s, c) => s + (c.total || 0), 0);
      return {
        id,
        nombre: getBranchName(id),
        ventasCount: vBranch.length,
        ventasUsd: vTotal,
        comprasCount: cBranch.length,
        comprasUsd: cTotal,
        netoUsd: vTotal - cTotal,
      };
    });
  }, [filteredVentas, filteredCompras, sucursales, empresaConfig]);

  const handlePaperWidthChange = (width: ThermalPaperWidth) => {
    setPaperWidth(width);
    setSavedPaperWidth(width);
  };

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleReprintVentaThermal = async (venta: Venta) => {
    const ticket = ventaToPrintableTicket(venta, sucursales, empresaConfig);
    await printTicketViaIframe(ticket, empresaConfig, paperWidth);
    notify(`Ticket #${ticket.numeroFactura} enviado a impresión térmica (${paperWidth}).`);
  };

  const handleReprintVentaLetter = async (venta: Venta) => {
    await printVentaLetterViaIframe(venta, sucursales, empresaConfig);
    notify(`Factura de Venta #${String(venta.id).padStart(8, '0')} enviada a impresión Carta/A4.`);
  };

  const handleReprintCompra = async (compra: Compra) => {
    await printCompraViaIframe(compra, getBranchName(compra.sucursalId), empresaConfig);
    notify(`Factura de Compra #${compra.numeroFactura || compra.id} enviada a impresión.`);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 16;

    const ensureSpace = (needed: number) => {
      if (y + needed > 278) {
        doc.addPage();
        y = 16;
      }
    };

    doc.setFillColor(15, 23, 42);
    doc.rect(margin, y, pageW - margin * 2, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`REPORTE DE COMPRAS Y VENTAS — ${empresaConfig.nombreEmpresa}`, margin + 5, y + 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(167, 243, 208);
    doc.text(
      `RIF: ${empresaConfig.rif} | Tasa Ref: Bs. ${tasaActual.toFixed(2)} | Generado: ${new Date().toLocaleString('es-VE')}`,
      margin + 5,
      y + 17
    );
    y += 30;

    // Resumen Financiero
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Resumen Comparativo del Período Filtrado', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `Ventas (${filteredVentas.length} fact.): $${summary.totalVentasUsd.toFixed(2)} (Bs. ${summary.totalVentasBs.toFixed(2)}) | IVA Débito: $${summary.totalIvaVentas.toFixed(2)}`,
      margin,
      y
    );
    y += 5;
    doc.text(
      `Compras (${filteredCompras.length} fact.): $${summary.totalComprasUsd.toFixed(2)} (Bs. ${summary.totalComprasBs.toFixed(2)}) | IVA Crédito: $${summary.totalIvaCompras.toFixed(2)}`,
      margin,
      y
    );
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Balance Comercial Neto (Ventas - Compras): $${summary.diferenciaNetaUsd.toFixed(2)}`,
      margin,
      y
    );
    y += 9;

    // Ventas list
    doc.setFontSize(10.5);
    doc.setTextColor(16, 185, 129);
    doc.text(`1. Libro de Facturas de Ventas (${filteredVentas.length})`, margin, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Factura | Fecha | Cliente | Sucursal | Método | Total USD', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);

    filteredVentas.slice(0, 60).forEach((v) => {
      ensureSpace(6);
      const line = `#${String(v.id).padStart(8, '0')} | ${new Date(v.fecha).toLocaleDateString('es-VE')} | ${(v.cliente_nombre || 'Mostrador').slice(0, 24)} | ${getBranchName(v.sucursal_id).slice(0, 16)} | ${(v.metodo_pago || 'usd').slice(0, 12)} | $${v.total.toFixed(2)}`;
      doc.text(line, margin, y);
      y += 4.5;
    });

    y += 6;
    ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(6, 182, 212);
    doc.text(`2. Libro de Facturas de Compras (${filteredCompras.length})`, margin, y);
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Factura | Fecha | Proveedor | Condición | Tasa | Total USD', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);

    filteredCompras.slice(0, 60).forEach((c) => {
      ensureSpace(6);
      const rate = c.tasaRecepcion || tasaActual;
      const line = `#${(c.numeroFactura || String(c.id)).slice(0, 14)} | ${new Date(c.fecha).toLocaleDateString('es-VE')} | ${(c.proveedorNombre || '').slice(0, 26)} | ${c.condicionPago === 'contado' ? 'Contado' : 'Crédito'} | Bs.${rate.toFixed(2)} | $${c.total.toFixed(2)}`;
      doc.text(line, margin, y);
      y += 4.5;
    });

    doc.save(`Reporte_Compras_y_Ventas_${new Date().toISOString().split('T')[0]}.pdf`);
    notify('PDF de Compras y Ventas descargado.');
  };

  const handleExportCsv = () => {
    const lines: string[] = [
      'Tipo,Documento,Fecha,Sucursal,Tercero,RIF_Cedula,Condicion_Metodo,Tasa,Base_Imponible_USD,Exento_USD,IVA_USD,Total_USD,Total_Bs',
    ];
    filteredVentas.forEach((v) => {
      lines.push(
        [
          'VENTA',
          `#${String(v.id).padStart(8, '0')}`,
          new Date(v.fecha).toISOString(),
          `"${getBranchName(v.sucursal_id)}"`,
          `"${(v.cliente_nombre || 'Cliente de Mostrador').replace(/"/g, '""')}"`,
          `"${v.cliente_rif || 'V-00000000'}"`,
          `"${v.metodo_pago || 'efectivo_usd'}"`,
          tasaActual.toFixed(2),
          (v.base_imponible || 0).toFixed(2),
          (v.monto_exento || 0).toFixed(2),
          (v.monto_iva || 0).toFixed(2),
          v.total.toFixed(2),
          (v.total * tasaActual).toFixed(2),
        ].join(',')
      );
    });
    filteredCompras.forEach((c) => {
      const rate = c.tasaRecepcion || tasaActual;
      const prov = proveedores.find((p) => p.id === c.proveedorId);
      lines.push(
        [
          'COMPRA',
          `"${(c.numeroFactura || String(c.id)).replace(/"/g, '""')}"`,
          new Date(c.fecha).toISOString(),
          `"${getBranchName(c.sucursalId)}"`,
          `"${(c.proveedorNombre || '').replace(/"/g, '""')}"`,
          `"${c.proveedorRif || prov?.rif || ''}"`,
          `"${c.condicionPago === 'contado' ? 'contado' : 'credito'}"`,
          rate.toFixed(2),
          (c.baseImponible || 0).toFixed(2),
          (c.montoExento || 0).toFixed(2),
          (c.montoIva || 0).toFixed(2),
          c.total.toFixed(2),
          (c.total * rate).toFixed(2),
        ].join(',')
      );
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Libro_Compras_y_Ventas_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Archivo CSV (Excel) de Compras y Ventas descargado.');
  };

  return (
    <div className="space-y-5">
      {toastMsg && (
        <div className="bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* TOP FILTER & EXPORT TOOLBAR */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-emerald-400" />
              Libro de Ventas, Compras y Reimpresión de Facturas
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Consulta, filtra, exporta y reimprime cualquier factura emitida de Venta (Térmica 58/80mm o Carta) o Factura de Compra a Proveedor.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Paper width selector for quick thermal reprinting */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-[11px]">
              <Printer className="w-3.5 h-3.5 text-slate-400 mr-1" />
              <span className="text-slate-400">Térmica:</span>
              {(['58mm', '80mm'] as ThermalPaperWidth[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => handlePaperWidthChange(w)}
                  className={`px-2 py-0.5 rounded-lg font-mono font-bold cursor-pointer transition-colors ${
                    paperWidth === w
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Exportar CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF Compras & Ventas</span>
            </button>
          </div>
        </div>

        {/* Search + Date + Branch Filters */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-2 border-t border-slate-800/80">
          <div className="md:col-span-4 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar # factura, cliente, proveedor, RIF/CI..."
              className="w-full bg-slate-900 border border-slate-700 text-white text-xs pl-8 pr-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="md:col-span-3 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-2.5 py-2 rounded-xl focus:border-emerald-500 focus:outline-none cursor-pointer"
            >
              <option value="all">Todas las Sucursales</option>
              {sucursales.length > 0 ? (
                sucursales.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.nombre}
                  </option>
                ))
              ) : (
                <>
                  <option value="1">{empresaConfig.nombreTienda1}</option>
                  <option value="2">{empresaConfig.nombreTienda2}</option>
                  <option value="3">{empresaConfig.nombreOficina || 'Oficina Central (Almacén)'}</option>
                </>
              )}
            </select>
          </div>

          <div className="md:col-span-5 flex flex-wrap items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {(
              [
                { id: 'all', label: 'Todo' },
                { id: 'today', label: 'Hoy' },
                { id: '7days', label: '7 Días' },
                { id: '30days', label: '30 Días' },
                { id: 'custom', label: 'Rango' },
              ] as { id: QuickPeriod; label: string }[]
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                  period === p.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
            {period === 'custom' && (
              <div className="flex items-center gap-1.5 ml-auto">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white text-[11px] px-2 py-1 rounded-lg font-mono"
                />
                <span className="text-slate-500 text-xs">-</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white text-[11px] px-2 py-1 rounded-lg font-mono"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DUAL CURRENCY KPI STRIP (VENTAS vs COMPRAS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
            <span>TOTAL VENTAS</span>
            <Receipt className="w-4 h-4" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {formatUSD(summary.totalVentasUsd)}
          </div>
          <div className="text-xs font-bold text-emerald-400 font-mono">
            {formatBs(summary.totalVentasUsd, tasaActual)}
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 flex justify-between">
            <span>{filteredVentas.length} facturas</span>
            <span>IVA: {formatUSD(summary.totalIvaVentas)}</span>
          </div>
        </div>

        <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-cyan-400 font-semibold">
            <span>TOTAL COMPRAS</span>
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {formatUSD(summary.totalComprasUsd)}
          </div>
          <div className="text-xs font-bold text-cyan-400 font-mono">
            Bs. {summary.totalComprasBs.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 flex justify-between">
            <span>{filteredCompras.length} facturas</span>
            <span>IVA Créd: {formatUSD(summary.totalIvaCompras)}</span>
          </div>
        </div>

        <div className="bg-slate-950 border border-purple-500/30 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-purple-400 font-semibold">
            <span>DIFERENCIA (VENTAS − COMPRAS)</span>
            <TrendingUp className="w-4 h-4" />
          </div>
          <div
            className={`text-2xl font-extrabold font-mono ${
              summary.diferenciaNetaUsd >= 0 ? 'text-purple-300' : 'text-rose-400'
            }`}
          >
            {summary.diferenciaNetaUsd >= 0 ? '+' : ''}
            {formatUSD(summary.diferenciaNetaUsd)}
          </div>
          <div className="text-xs font-bold text-purple-300 font-mono">
            {formatBs(summary.diferenciaNetaUsd, tasaActual)}
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 flex justify-between">
            <span>Balance IVA:</span>
            <span className="font-mono">{formatUSD(summary.diferenciaIvaUsd)}</span>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-amber-400 font-semibold">
            <span>FACTURAS PARA REIMPRESIÓN</span>
            <Printer className="w-4 h-4" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {filteredVentas.length + filteredCompras.length} docs
          </div>
          <div className="text-xs text-slate-300">
            {filteredVentas.length} Ventas · {filteredCompras.length} Compras
          </div>
          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
            Usa los botones Reimprimir en cada fila
          </div>
        </div>
      </div>

      {/* SUB-TABS: VENTAS / COMPRAS / CONSOLIDADO */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setSubTab('ventas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
            subTab === 'ventas'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Facturas de Ventas & Reimpresión ({filteredVentas.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('compras')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
            subTab === 'compras'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Facturas de Compras & Reimpresión ({filteredCompras.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('consolidado')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
            subTab === 'consolidado'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Consolidado por Sucursal (Ventas vs Compras)</span>
        </button>
      </div>

      {/* TAB 1: VENTAS & REIMPRESIÓN */}
      {subTab === 'ventas' && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
          {filteredVentas.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-xs space-y-2">
              <Filter className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="font-semibold text-slate-300">No hay facturas de venta que coincidan con el filtro.</p>
              <p>Prueba seleccionando el período "Todo" o limpiando el buscador.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase text-[10px] font-mono">
                  <tr>
                    <th className="py-3 px-3">Nº Factura</th>
                    <th className="py-3 px-3">Fecha y Hora</th>
                    <th className="py-3 px-3">Sucursal</th>
                    <th className="py-3 px-3">Cliente / RIF</th>
                    <th className="py-3 px-3">Cajero</th>
                    <th className="py-3 px-3">Pago</th>
                    <th className="py-3 px-3 text-right">Total ($ / Bs)</th>
                    <th className="py-3 px-3 text-center">Reimpresión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredVentas.map((venta) => {
                    const invNum = String(venta.id || '').padStart(8, '0');
                    const parsedDate = new Date(venta.fecha);
                    return (
                      <tr key={venta.id} className="hover:bg-slate-900/60 transition-colors text-slate-200">
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                          #{invNum}
                          <div className="text-[10px] text-slate-500 font-normal">
                            {(venta.detalles || []).length} ítems
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                          {isNaN(parsedDate.getTime())
                            ? venta.fecha
                            : parsedDate.toLocaleString('es-VE')}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-[11px] text-slate-300">
                            {getBranchName(venta.sucursal_id)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-white">
                            {venta.cliente_nombre || 'Cliente de Mostrador'}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {venta.cliente_rif || 'V-00000000'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {venta.usuario_nombre || 'Cajero'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
                            {(venta.metodo_pago || 'efectivo_usd').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <div className="font-bold text-white">{formatUSD(venta.total)}</div>
                          <div className="text-[10px] text-emerald-400">
                            {formatBs(venta.total, tasaActual)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPreviewVenta(venta)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 cursor-pointer transition-colors flex items-center gap-1 text-[11px]"
                              title="Ver detalle e imprimir"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-400" />
                              <span>Ver</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReprintVentaThermal(venta)}
                              className="p-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer transition-colors flex items-center gap-1 text-[11px] font-bold"
                              title={`Reimprimir Ticket Térmico (${paperWidth})`}
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Reimprimir</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: COMPRAS & REIMPRESIÓN */}
      {subTab === 'compras' && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
          {filteredCompras.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-xs space-y-2">
              <Filter className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="font-semibold text-slate-300">No hay facturas de compra que coincidan con el filtro.</p>
              <p>Prueba seleccionando el período "Todo" o registrando una nueva compra.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase text-[10px] font-mono">
                  <tr>
                    <th className="py-3 px-3">Nº Factura</th>
                    <th className="py-3 px-3">Fecha</th>
                    <th className="py-3 px-3">Proveedor / RIF</th>
                    <th className="py-3 px-3">Sucursal Destino</th>
                    <th className="py-3 px-3">Condición / Tasa</th>
                    <th className="py-3 px-3 text-right">Total ($ / Bs)</th>
                    <th className="py-3 px-3 text-center">Reimpresión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredCompras.map((compra) => {
                    const prov = proveedores.find((p) => p.id === compra.proveedorId);
                    const rif = compra.proveedorRif || prov?.rif;
                    const rate = compra.tasaRecepcion || tasaActual;
                    const parsedDate = new Date(compra.fecha);
                    return (
                      <tr key={compra.id} className="hover:bg-slate-900/60 transition-colors text-slate-200">
                        <td className="py-2.5 px-3 font-mono font-bold text-cyan-400">
                          #{compra.numeroFactura || `FAC-${compra.id}`}
                          {compra.numeroControl && (
                            <div className="text-[10px] text-slate-500 font-normal">
                              Ctrl: {compra.numeroControl}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                          {isNaN(parsedDate.getTime())
                            ? compra.fecha
                            : parsedDate.toLocaleDateString('es-VE')}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-white">{compra.proveedorNombre}</div>
                          {rif && <div className="text-[10px] text-slate-400 font-mono">RIF: {rif}</div>}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-[11px] text-slate-300">
                            {getBranchName(compra.sucursalId)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              compra.condicionPago === 'contado'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {compra.condicionPago === 'contado' ? 'Contado' : 'Crédito'}
                          </span>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Tasa: Bs. {rate.toFixed(2)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <div className="font-bold text-white">{formatUSD(compra.total)}</div>
                          <div className="text-[10px] text-cyan-400">
                            {formatBs(compra.total, rate)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPreviewCompra(compra)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 cursor-pointer transition-colors flex items-center gap-1 text-[11px]"
                              title="Ver detalle completo"
                            >
                              <Eye className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Ver</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReprintCompra(compra)}
                              className="p-1.5 px-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg cursor-pointer transition-colors flex items-center gap-1 text-[11px] font-bold"
                              title="Imprimir comprobante de factura de compra"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Reimprimir</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CONSOLIDADO COMPARATIVO POR SUCURSAL */}
      {subTab === 'consolidado' && (
        <div className="space-y-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-purple-400" />
                Comparativa Consolidada por Sucursal / Almacén
              </h4>
              <span className="text-[11px] text-slate-400 font-mono">
                Tasa BCV: Bs. {tasaActual.toFixed(2)} / USD
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase text-[10px] font-mono">
                  <tr>
                    <th className="py-3 px-4">Centro Operativo</th>
                    <th className="py-3 px-4 text-right">Fact. Ventas</th>
                    <th className="py-3 px-4 text-right">Total Ventas ($)</th>
                    <th className="py-3 px-4 text-right">Fact. Compras</th>
                    <th className="py-3 px-4 text-right">Total Compras ($)</th>
                    <th className="py-3 px-4 text-right">Flujo Neto (Ventas − Compras)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {branchSummary.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-900/50 text-slate-200">
                      <td className="py-3 px-4 font-sans font-bold text-white">{row.nombre}</td>
                      <td className="py-3 px-4 text-right text-slate-300">{row.ventasCount}</td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-400">
                        {formatUSD(row.ventasUsd)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-300">{row.comprasCount}</td>
                      <td className="py-3 px-4 text-right font-bold text-cyan-400">
                        {formatUSD(row.comprasUsd)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-extrabold ${
                          row.netoUsd >= 0 ? 'text-purple-300' : 'text-rose-400'
                        }`}
                      >
                        {row.netoUsd >= 0 ? '+' : ''}
                        {formatUSD(row.netoUsd)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/90 font-mono font-extrabold text-white border-t-2 border-slate-700">
                    <td className="py-3 px-4 font-sans">TOTAL CONSOLIDADO</td>
                    <td className="py-3 px-4 text-right">{filteredVentas.length}</td>
                    <td className="py-3 px-4 text-right text-emerald-400">
                      {formatUSD(summary.totalVentasUsd)}
                    </td>
                    <td className="py-3 px-4 text-right">{filteredCompras.length}</td>
                    <td className="py-3 px-4 text-right text-cyan-400">
                      {formatUSD(summary.totalComprasUsd)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right ${
                        summary.diferenciaNetaUsd >= 0 ? 'text-purple-300' : 'text-rose-400'
                      }`}
                    >
                      {summary.diferenciaNetaUsd >= 0 ? '+' : ''}
                      {formatUSD(summary.diferenciaNetaUsd)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="font-bold text-emerald-400 uppercase text-[11px]">Desglose Fiscal Ventas</div>
              <div className="flex justify-between text-slate-300 font-mono">
                <span>Base Imponible Gravada (16%):</span>
                <span className="font-bold text-white">{formatUSD(summary.baseImpVentas)}</span>
              </div>
              <div className="flex justify-between text-slate-300 font-mono">
                <span>Monto Exento (0%):</span>
                <span className="font-bold text-amber-300">{formatUSD(summary.exentoVentas)}</span>
              </div>
              <div className="flex justify-between text-slate-300 font-mono">
                <span>IVA Débito Fiscal (16%):</span>
                <span className="font-bold text-emerald-400">{formatUSD(summary.totalIvaVentas)}</span>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="font-bold text-cyan-400 uppercase text-[11px]">Desglose Fiscal Compras</div>
              <div className="flex justify-between text-slate-300 font-mono">
                <span>Base Imponible Gravada (16%):</span>
                <span className="font-bold text-white">{formatUSD(summary.baseImpCompras)}</span>
              </div>
              <div className="flex justify-between text-slate-300 font-mono">
                <span>Monto Exento (0%):</span>
                <span className="font-bold text-amber-300">{formatUSD(summary.exentoCompras)}</span>
              </div>
              <div className="flex justify-between text-slate-300 font-mono">
                <span>IVA Crédito Fiscal (16%):</span>
                <span className="font-bold text-cyan-400">{formatUSD(summary.totalIvaCompras)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VISTA PREVIA & REIMPRESIÓN DE FACTURA DE VENTA */}
      {previewVenta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <div>
                  <h4 className="font-bold text-white text-sm">
                    Factura de Venta #{String(previewVenta.id).padStart(8, '0')}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {previewVenta.cliente_nombre || 'Cliente de Mostrador'} •{' '}
                    {previewVenta.cliente_rif || 'V-00000000'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVenta(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-400 block">Fecha:</span>
                  <span className="font-mono text-white">
                    {new Date(previewVenta.fecha).toLocaleString('es-VE')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Sucursal:</span>
                  <span className="text-emerald-400 font-semibold">
                    {getBranchName(previewVenta.sucursal_id)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Cajero:</span>
                  <span className="text-slate-200">{previewVenta.usuario_nombre || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Método:</span>
                  <span className="uppercase font-bold text-amber-300">
                    {(previewVenta.metodo_pago || 'efectivo_usd').replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">Producto</th>
                      <th className="py-2 px-2 text-right">Cant.</th>
                      <th className="py-2 px-2 text-right">Precio</th>
                      <th className="py-2 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {(previewVenta.detalles || []).map((d, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-sans font-semibold text-white">
                          {d.producto_nombre}
                        </td>
                        <td className="py-2 px-2 text-right text-emerald-400">{d.cantidad}</td>
                        <td className="py-2 px-2 text-right">${d.precio_unitario.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-bold text-white">
                          ${d.subtotal.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between font-mono">
                <div className="text-[11px] text-slate-400 space-y-0.5">
                  <div>Base Imp: {formatUSD(previewVenta.base_imponible || 0)}</div>
                  <div>Exento: {formatUSD(previewVenta.monto_exento || 0)}</div>
                  <div>IVA 16%: {formatUSD(previewVenta.monto_iva || 0)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-emerald-400">
                    {formatUSD(previewVenta.total)}
                  </div>
                  <div className="text-xs text-slate-300">
                    {formatBs(previewVenta.total, tasaActual)}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400">Ancho ticket:</span>
                {(['58mm', '80mm'] as ThermalPaperWidth[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => handlePaperWidthChange(w)}
                    className={`px-2.5 py-1 rounded-lg font-mono font-bold cursor-pointer ${
                      paperWidth === w
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleReprintVentaLetter(previewVenta)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-400" />
                  <span>Imprimir Carta/A4</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleReprintVentaThermal(previewVenta)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Reimprimir Ticket ({paperWidth})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VISTA PREVIA & REIMPRESIÓN DE FACTURA DE COMPRA */}
      {previewCompra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5 text-cyan-400" />
                <div>
                  <h4 className="font-bold text-white text-sm">
                    Factura de Compra #{previewCompra.numeroFactura || previewCompra.id}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Proveedor: <strong className="text-white">{previewCompra.proveedorNombre}</strong>
                    {previewCompra.proveedorRif ? ` • RIF: ${previewCompra.proveedorRif}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewCompra(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-400 block">Fecha:</span>
                  <span className="font-mono text-white">
                    {new Date(previewCompra.fecha).toLocaleDateString('es-VE')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Almacén Destino:</span>
                  <span className="text-cyan-400 font-semibold">
                    {getBranchName(previewCompra.sucursalId)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Condición:</span>
                  <span className="uppercase font-bold text-amber-300">
                    {previewCompra.condicionPago === 'contado' ? 'Contado' : 'Crédito'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Tasa Recepción:</span>
                  <span className="font-mono text-slate-200">
                    Bs. {(previewCompra.tasaRecepcion || tasaActual).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">Código</th>
                      <th className="py-2 px-3">Artículo</th>
                      <th className="py-2 px-2 text-center">Und</th>
                      <th className="py-2 px-2 text-right">Cant.</th>
                      <th className="py-2 px-2 text-right">Costo Unit.</th>
                      <th className="py-2 px-2 text-center">IVA</th>
                      <th className="py-2 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {(previewCompra.detalles || []).map((d, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 text-slate-400 text-[11px]">
                          {d.codigo_barras || `SKU-${d.productoId}`}
                        </td>
                        <td className="py-2 px-3 font-sans font-semibold text-white">
                          {d.productoNombre}
                        </td>
                        <td className="py-2 px-2 text-center text-amber-300">
                          {d.unidad_medida || 'UND'}
                        </td>
                        <td className="py-2 px-2 text-right text-cyan-400 font-bold">{d.cantidad}</td>
                        <td className="py-2 px-2 text-right">${d.costoUnitario.toFixed(2)}</td>
                        <td className="py-2 px-2 text-center">
                          {d.exentoIva ? 'EXENTO' : '16%'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-white">
                          ${d.subtotal.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between font-mono">
                <div className="text-[11px] text-slate-400 space-y-0.5">
                  <div>Base Imp: {formatUSD(previewCompra.baseImponible || 0)}</div>
                  <div>Exento: {formatUSD(previewCompra.montoExento || 0)}</div>
                  <div>IVA 16%: {formatUSD(previewCompra.montoIva || 0)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-cyan-400">
                    {formatUSD(previewCompra.total)}
                  </div>
                  <div className="text-xs text-slate-300">
                    {formatBs(previewCompra.total, previewCompra.tasaRecepcion || tasaActual)}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreviewCompra(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => handleReprintCompra(previewCompra)}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Reimprimir Comprobante</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
