import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Check,
  CreditCard,
  Banknote,
  Coins,
  Smartphone,
  Layers,
  Fingerprint,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { EmpresaConfig, DetallePagoVenta } from '../types';
import { formatUSD, formatBs } from '../lib/currency';

interface PosPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalUsd: number;
  empresaConfig: EmpresaConfig;
  clienteNombre: string;
  clienteRif: string;
  onConfirmPayment: (detallePago: DetallePagoVenta) => void;
}

type MetodoPagoKey =
  | 'tarjeta'
  | 'biopago'
  | 'efectivo_usd'
  | 'efectivo_bs'
  | 'pago_movil'
  | 'tarjeta_credito'
  | 'zelle';

const EMPTY_PAGO_ROWS: Record<MetodoPagoKey, number> = {
  tarjeta: 0,
  biopago: 0,
  efectivo_usd: 0,
  efectivo_bs: 0,
  pago_movil: 0,
  tarjeta_credito: 0,
  zelle: 0,
};

const METHOD_LABELS: Record<MetodoPagoKey, string> = {
  tarjeta: 'TARJETA DÉBITO',
  biopago: 'BIOPAGO',
  efectivo_usd: 'EFECTIVO USD',
  efectivo_bs: 'EFECTIVO BS',
  pago_movil: 'PAGO MÓVIL',
  zelle: 'ZELLE USD',
  tarjeta_credito: 'TARJETA CRÉDITO',
};

export const PosPaymentModal1Sistema: React.FC<PosPaymentModalProps> = ({
  isOpen,
  onClose,
  totalUsd,
  empresaConfig,
  clienteNombre,
  clienteRif,
  onConfirmPayment,
}) => {
  const tasa = empresaConfig.tasaCambio || 36.50;

  // Discount state kept as raw string so user can freely type/edit decimals
  const [descuentoInput, setDescuentoInput] = useState<string>('');
  const parsedDescuento = parseFloat(descuentoInput.replace(',', '.'));
  const descuentoUsd =
    Number.isFinite(parsedDescuento) && parsedDescuento > 0
      ? Math.min(totalUsd, +parsedDescuento.toFixed(2))
      : 0;

  const totalNetoUsd = Math.max(0, +(totalUsd - descuentoUsd).toFixed(2));
  const totalNetoBs = +(totalNetoUsd * tasa).toFixed(2);

  // Active selected payment method row in table (null until user chooses one)
  const [selectedMethod, setSelectedMethod] = useState<MetodoPagoKey | null>(null);

  // Input value in the numpad (in active currency: Bs or USD)
  const [numpadValue, setNumpadValue] = useState<string>('');
  const [referenciaInput, setReferenciaInput] = useState<string>('');
  const [bancoInput, setBancoInput] = useState<string>('0102 - Banco de Venezuela');
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Multi-tender / Forma de pago breakdown table (starts completely empty)
  const [pagoRows, setPagoRows] = useState<Record<MetodoPagoKey, number>>({
    ...EMPTY_PAGO_ROWS,
  });

  // Calculate sum of payments converted to USD and Bs
  const totalPagadoUsd = +(
    pagoRows.tarjeta / tasa +
    pagoRows.biopago / tasa +
    pagoRows.efectivo_usd +
    pagoRows.efectivo_bs / tasa +
    pagoRows.pago_movil / tasa +
    pagoRows.tarjeta_credito / tasa +
    pagoRows.zelle
  ).toFixed(2);

  const totalPagadoBs = +(
    pagoRows.tarjeta +
    pagoRows.biopago +
    pagoRows.efectivo_usd * tasa +
    pagoRows.efectivo_bs +
    pagoRows.pago_movil +
    pagoRows.tarjeta_credito +
    pagoRows.zelle * tasa
  ).toFixed(2);

  const diferenciaBs = +(totalPagadoBs - totalNetoBs).toFixed(2);
  const diferenciaUsd = +(totalPagadoUsd - totalNetoUsd).toFixed(2);
  const esCubierto = totalPagadoBs >= totalNetoBs - 0.05;

  // Reset cleanly ONLY when opening the modal (never preload any payment method)
  useEffect(() => {
    if (isOpen) {
      setDescuentoInput('');
      setSelectedMethod(null);
      setNumpadValue('');
      setReferenciaInput('');
      setErrorNotice(null);
      setPagoRows({ ...EMPTY_PAGO_ROWS });
    }
  }, [isOpen]);

  const isUsdMethod = (key: MetodoPagoKey | null) =>
    key === 'efectivo_usd' || key === 'zelle';

  const updateActiveRowAmount = (method: MetodoPagoKey, val: number) => {
    setPagoRows((prev) => ({
      ...prev,
      [method]: val,
    }));
  };

  // Handle selecting a payment row
  const handleSelectRow = (key: MetodoPagoKey) => {
    setSelectedMethod(key);
    setErrorNotice(null);
    const currentRowVal = pagoRows[key] || 0;
    if (currentRowVal > 0) {
      setNumpadValue(currentRowVal.toFixed(2));
    } else {
      // Leave input empty so the user enters or clicks Exacto/Quick bills explicitly
      setNumpadValue('');
    }
  };

  // Numpad key press
  const handleNumpadPress = (char: string) => {
    if (!selectedMethod) {
      setErrorNotice('Selecciona primero una forma de pago de la lista de la izquierda.');
      return;
    }
    setErrorNotice(null);

    if (char === 'C') {
      setNumpadValue('');
      updateActiveRowAmount(selectedMethod, 0);
      return;
    }
    if (char === 'BACK') {
      const newVal = numpadValue.slice(0, -1);
      setNumpadValue(newVal);
      updateActiveRowAmount(selectedMethod, parseFloat(newVal) || 0);
      return;
    }
    if (char === '.' && numpadValue.includes('.')) return;

    let nextVal: string;
    if (numpadValue === '0' || numpadValue === '') {
      nextVal = char === '.' ? '0.' : char === '00' ? '0' : char;
    } else {
      nextVal = numpadValue + char;
    }
    setNumpadValue(nextVal);
    updateActiveRowAmount(selectedMethod, parseFloat(nextVal) || 0);
  };

  // Quick bills
  const handleSetQuickBill = (amountUsd: number) => {
    if (!selectedMethod) {
      setErrorNotice('Selecciona primero una forma de pago de la lista de la izquierda.');
      return;
    }
    setErrorNotice(null);

    if (isUsdMethod(selectedMethod)) {
      setNumpadValue(amountUsd.toFixed(2));
      updateActiveRowAmount(selectedMethod, amountUsd);
    } else {
      const valBs = +(amountUsd * tasa).toFixed(2);
      setNumpadValue(valBs.toFixed(2));
      updateActiveRowAmount(selectedMethod, valBs);
    }
  };

  const handleSetExact = () => {
    if (!selectedMethod) {
      setErrorNotice('Selecciona primero una forma de pago de la lista de la izquierda.');
      return;
    }
    setErrorNotice(null);

    if (isUsdMethod(selectedMethod)) {
      const otherPaidUsd = totalPagadoUsd - (pagoRows[selectedMethod] || 0);
      const remainingUsd = Math.max(0, +(totalNetoUsd - otherPaidUsd).toFixed(2));
      setNumpadValue(remainingUsd.toFixed(2));
      updateActiveRowAmount(selectedMethod, remainingUsd);
    } else {
      const otherPaidBs = totalPagadoBs - (pagoRows[selectedMethod] || 0);
      const remainingBs = Math.max(0, +(totalNetoBs - otherPaidBs).toFixed(2));
      setNumpadValue(remainingBs.toFixed(2));
      updateActiveRowAmount(selectedMethod, remainingBs);
    }
  };

  // Final Confirmation
  const handleFinalConfirm = useCallback(() => {
    if (!esCubierto) {
      setErrorNotice(
        `El monto ingresado es insuficiente. Faltan ${formatBs(Math.abs(diferenciaBs), 1)} (${formatUSD(Math.abs(diferenciaUsd))}).`
      );
      return;
    }

    if (pagoRows.pago_movil > 0 && !referenciaInput.trim()) {
      setErrorNotice('Por favor indica el número de referencia del Pago Móvil o Transferencia.');
      return;
    }

    const activeMethods = (Object.entries(pagoRows) as [MetodoPagoKey, number][]).filter(
      ([_, val]) => val > 0
    );
    const isMultiple = activeMethods.length > 1;

    let primaryMetodo: DetallePagoVenta['metodo'] = 'tarjeta';
    if (!isMultiple && activeMethods.length === 1) {
      const [onlyKey] = activeMethods[0];
      if (onlyKey === 'pago_movil') primaryMetodo = 'pago_movil';
      else if (onlyKey === 'efectivo_usd' || onlyKey === 'zelle') primaryMetodo = 'efectivo_usd';
      else if (onlyKey === 'efectivo_bs') primaryMetodo = 'efectivo_bs';
      else if (onlyKey === 'biopago') primaryMetodo = 'biopago';
      else primaryMetodo = 'tarjeta';
    } else {
      primaryMetodo = 'mixto';
    }

    const combinedTarjetaBs = +(pagoRows.tarjeta + pagoRows.tarjeta_credito).toFixed(2);
    const efectivoBsTotal = pagoRows.efectivo_bs > 0 ? pagoRows.efectivo_bs : undefined;

    const detalle: DetallePagoVenta = {
      metodo: primaryMetodo,
      monto_usd: totalNetoUsd,
      monto_bs: totalNetoBs,
      descuento_usd: descuentoUsd > 0 ? descuentoUsd : undefined,
      referencia_pago_movil: referenciaInput.trim() || undefined,
      pago_movil_monto_bs: pagoRows.pago_movil > 0 ? pagoRows.pago_movil : undefined,
      biopago_monto_bs: pagoRows.biopago > 0 ? pagoRows.biopago : undefined,
      efectivo_usd_recibido: pagoRows.efectivo_usd > 0 ? pagoRows.efectivo_usd : undefined,
      zelle_monto_usd: pagoRows.zelle > 0 ? pagoRows.zelle : undefined,
      efectivo_bs_recibido: efectivoBsTotal,
      tarjeta_monto_bs: combinedTarjetaBs > 0 ? combinedTarjetaBs : undefined,
      tarjeta_tipo:
        pagoRows.tarjeta_credito > 0 && pagoRows.tarjeta === 0 ? 'credito' : 'debito',
      tarjeta_banco: bancoInput,
      tarjeta_referencia: referenciaInput.trim() || undefined,
      vuelto_bs: diferenciaBs > 0 ? diferenciaBs : 0,
      vuelto_usd: diferenciaUsd > 0 ? diferenciaUsd : 0,
    };

    onConfirmPayment(detalle);
  }, [
    bancoInput,
    descuentoUsd,
    diferenciaBs,
    diferenciaUsd,
    esCubierto,
    onConfirmPayment,
    pagoRows,
    referenciaInput,
    totalNetoBs,
    totalNetoUsd,
  ]);

  // Keyboard shortcut listener (ESC to close, F8 / Ctrl+Enter to submit)
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'F8' || (e.key === 'Enter' && e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        handleFinalConfirm();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [isOpen, onClose, handleFinalConfirm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-sm animate-fade-in font-sans select-none">
      <div className="bg-slate-900 border-2 border-slate-700/80 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col text-slate-100 max-h-[95vh] overflow-y-auto custom-scrollbar">
        {/* Modal Window Header */}
        <div className="bg-slate-950 px-5 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
              <span>Pago / Totalizar Factura</span>
              <span className="text-xs text-slate-400 font-sans font-normal">
                [Cliente: <strong className="text-emerald-300">{clienteNombre}</strong> ({clienteRif})]
              </span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cerrar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top 3 KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-950/60 border-b border-slate-800 shrink-0">
          {/* Card 1: Green Total $ & Total Bs */}
          <div className="bg-gradient-to-br from-emerald-900/60 to-emerald-950 border border-emerald-500/50 rounded-xl p-3 text-center shadow-inner">
            <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wide">
              Total Factura{' '}
              <span className="font-mono text-white text-xs">{formatUSD(totalUsd)}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono tracking-tight mt-0.5">
              {formatBs(totalUsd * tasa, 1)}
            </div>
          </div>

          {/* Card 2: Yellow/Amber Editable Descuento ($) */}
          <div className="bg-gradient-to-br from-amber-950/60 to-slate-950 border border-amber-500/50 rounded-xl p-3 text-center shadow-inner flex flex-col justify-center">
            <label
              htmlFor="pos-payment-discount-input"
              className="text-[11px] font-bold text-amber-300 uppercase tracking-wide cursor-pointer"
            >
              Descuento ($)
            </label>
            <div className="flex items-center justify-center gap-2 mt-0.5">
              <input
                id="pos-payment-discount-input"
                type="text"
                inputMode="decimal"
                value={descuentoInput}
                placeholder="0.00"
                onChange={(e) => {
                  const normalized = e.target.value.replace(',', '.');
                  if (normalized === '' || /^\d*\.?\d{0,2}$/.test(normalized)) {
                    setDescuentoInput(normalized);
                  }
                }}
                onBlur={() => {
                  if (!descuentoInput) return;
                  const num = parseFloat(descuentoInput);
                  if (!Number.isFinite(num) || num <= 0) {
                    setDescuentoInput('');
                  } else {
                    const clamped = Math.min(totalUsd, +num.toFixed(2));
                    setDescuentoInput(clamped.toFixed(2));
                  }
                }}
                className="w-28 bg-slate-900 border border-amber-500/50 text-amber-300 text-xl font-black font-mono text-center rounded-lg py-0.5 px-2 focus:outline-none focus:border-amber-400 select-text"
              />
              <span className="text-xs font-mono text-amber-400/80">USD</span>
            </div>
          </div>

          {/* Card 3: Total Neto a Pagar */}
          <div
            className={`rounded-xl p-3 text-center shadow-inner border transition-all ${
              esCubierto
                ? 'bg-gradient-to-br from-teal-950/80 to-slate-950 border-teal-500/60'
                : 'bg-gradient-to-br from-rose-950/80 to-slate-950 border-rose-500/60'
            }`}
          >
            <div
              className={`text-[11px] font-bold uppercase tracking-wide ${
                esCubierto ? 'text-teal-300' : 'text-rose-300'
              }`}
            >
              Total Pago (Monto a Pagar)
            </div>
            <div
              className={`text-2xl sm:text-3xl font-black font-mono tracking-tight mt-0.5 ${
                esCubierto ? 'text-teal-300' : 'text-rose-400'
              }`}
            >
              {formatBs(totalNetoBs, 1)}
            </div>
            <div className="text-[11px] font-mono text-slate-300/80">
              ({formatUSD(totalNetoUsd)})
            </div>
          </div>
        </div>

        {/* Inline Validation Notice */}
        {errorNotice && (
          <div className="mx-4 mt-3 bg-rose-950/80 border border-rose-500/50 rounded-xl px-3.5 py-2 text-xs text-rose-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorNotice(null)}
              className="text-rose-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Middle Body: Left Side (Formas de Pago Table) & Right Side (Numpad + Quick Bills) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 flex-1">
          {/* Left Column (col-span-7): Table of Payment Methods */}
          <div className="md:col-span-7 flex flex-col justify-between space-y-3">
            <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800/90 text-slate-300 uppercase text-[10px] font-bold tracking-wider border-b border-slate-700 font-mono">
                    <th className="py-2 px-3">Forma de pago</th>
                    <th className="py-2 px-3 text-center">Tasa</th>
                    <th className="py-2 px-3 text-right">Su Pago</th>
                    <th className="py-2 px-3 text-right">Equivalente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono">
                  {/* 1. Tarjeta de Débito (Punto POS) */}
                  <tr
                    onClick={() => handleSelectRow('tarjeta')}
                    className={`cursor-pointer transition-colors ${
                      selectedMethod === 'tarjeta'
                        ? 'bg-blue-600/30 text-white font-bold border-l-4 border-blue-500'
                        : 'hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <td className="py-2 px-3 flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                      <span>Tarjeta de Débito</span>
                    </td>
                    <td className="py-2 px-3 text-center text-slate-400">1.00</td>
                    <td className="py-2 px-3 text-right font-bold text-blue-300">
                      {pagoRows.tarjeta > 0 ? formatBs(pagoRows.tarjeta, 1) : '0.00'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">
                      {pagoRows.tarjeta > 0 ? formatUSD(pagoRows.tarjeta / tasa) : '0.00'}
                    </td>
                  </tr>

                  {/* 2. BioPago */}
                  <tr
                    onClick={() => handleSelectRow('biopago')}
                    className={`cursor-pointer transition-colors ${
                      selectedMethod === 'biopago'
                        ? 'bg-teal-600/30 text-white font-bold border-l-4 border-teal-500'
                        : 'hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <td className="py-2 px-3 flex items-center gap-2">
                      <Fingerprint className="w-3.5 h-3.5 text-teal-400" />
                      <span>BioPago</span>
                    </td>
                    <td className="py-2 px-3 text-center text-slate-400">1.00</td>
                    <td className="py-2 px-3 text-right font-bold text-teal-300">
                      {pagoRows.biopago > 0 ? formatBs(pagoRows.biopago, 1) : '0.00'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">
                      {pagoRows.biopago > 0 ? formatUSD(pagoRows.biopago / tasa) : '0.00'}
                    </td>
                  </tr>

                  {/* 3. Efectivo USD */}
                  <tr
                    onClick={() => handleSelectRow('efectivo_usd')}
                    className={`cursor-pointer transition-colors ${
                      selectedMethod === 'efectivo_usd'
                        ? 'bg-emerald-600/30 text-white font-bold border-l-4 border-emerald-500'
                        : 'hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <td className="py-2 px-3 flex items-center gap-2">
                      <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Efectivo ($ USD)</span>
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">{tasa.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-300">
                      {pagoRows.efectivo_usd > 0 ? formatUSD(pagoRows.efectivo_usd) : '0.00'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">
                      {pagoRows.efectivo_usd > 0 ? formatBs(pagoRows.efectivo_usd * tasa, 1) : '0.00'}
                    </td>
                  </tr>

                  {/* 4. Efectivo Bs */}
                  <tr
                    onClick={() => handleSelectRow('efectivo_bs')}
                    className={`cursor-pointer transition-colors ${
                      selectedMethod === 'efectivo_bs'
                        ? 'bg-amber-600/30 text-white font-bold border-l-4 border-amber-500'
                        : 'hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <td className="py-2 px-3 flex items-center gap-2">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>Efectivo (Bs)</span>
                    </td>
                    <td className="py-2 px-3 text-center text-slate-400">1.00</td>
                    <td className="py-2 px-3 text-right font-bold text-amber-300">
                      {pagoRows.efectivo_bs > 0 ? formatBs(pagoRows.efectivo_bs, 1) : '0.00'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">
                      {pagoRows.efectivo_bs > 0 ? formatUSD(pagoRows.efectivo_bs / tasa) : '0.00'}
                    </td>
                  </tr>

                  {/* 5. Pago Móvil / Transferencia */}
                  <tr
                    onClick={() => handleSelectRow('pago_movil')}
                    className={`cursor-pointer transition-colors ${
                      selectedMethod === 'pago_movil'
                        ? 'bg-cyan-600/30 text-white font-bold border-l-4 border-cyan-500'
                        : 'hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <td className="py-2 px-3 flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Pago Móvil / Transf.</span>
                    </td>
                    <td className="py-2 px-3 text-center text-slate-400">1.00</td>
                    <td className="py-2 px-3 text-right font-bold text-cyan-300">
                      {pagoRows.pago_movil > 0 ? formatBs(pagoRows.pago_movil, 1) : '0.00'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">
                      {pagoRows.pago_movil > 0 ? formatUSD(pagoRows.pago_movil / tasa) : '0.00'}
                    </td>
                  </tr>

                  {/* 6. Zelle */}
                  <tr
                    onClick={() => handleSelectRow('zelle')}
                    className={`cursor-pointer transition-colors ${
                      selectedMethod === 'zelle'
                        ? 'bg-purple-600/30 text-white font-bold border-l-4 border-purple-500'
                        : 'hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <td className="py-2 px-3 flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>Zelle (USD)</span>
                    </td>
                    <td className="py-2 px-3 text-center text-purple-400">{tasa.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-bold text-purple-300">
                      {pagoRows.zelle > 0 ? formatUSD(pagoRows.zelle) : '0.00'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">
                      {pagoRows.zelle > 0 ? formatBs(pagoRows.zelle * tasa, 1) : '0.00'}
                    </td>
                  </tr>

                  {/* 7. Tarjeta de Crédito / Internacional */}
                  <tr
                    onClick={() => handleSelectRow('tarjeta_credito')}
                    className={`cursor-pointer transition-colors ${
                      selectedMethod === 'tarjeta_credito'
                        ? 'bg-indigo-600/30 text-white font-bold border-l-4 border-indigo-500'
                        : 'hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <td className="py-2 px-3 flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Tarjeta de Crédito</span>
                    </td>
                    <td className="py-2 px-3 text-center text-slate-400">1.00</td>
                    <td className="py-2 px-3 text-right font-bold text-indigo-300">
                      {pagoRows.tarjeta_credito > 0 ? formatBs(pagoRows.tarjeta_credito, 1) : '0.00'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">
                      {pagoRows.tarjeta_credito > 0 ? formatUSD(pagoRows.tarjeta_credito / tasa) : '0.00'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Reference & Bank Input */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Nº Referencia / Aprobación:
                  </label>
                  <input
                    type="text"
                    value={referenciaInput}
                    onChange={(e) => setReferenciaInput(e.target.value)}
                    placeholder="Ej: 489201..."
                    className="w-full bg-slate-900 border border-slate-700 text-white font-mono text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500 select-text"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Banco / Terminal:
                  </label>
                  <select
                    value={bancoInput}
                    onChange={(e) => setBancoInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
                  >
                    <option value="0102 - Banco de Venezuela">0102 - Banco de Venezuela</option>
                    <option value="0134 - Banesco">0134 - Banesco</option>
                    <option value="0105 - Mercantil">0105 - Mercantil</option>
                    <option value="0108 - Provincial">0108 - Provincial</option>
                    <option value="0172 - Bancamiga">0172 - Bancamiga</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Bottom Difference & Vuelto Indicators */}
            <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono">
              <div>
                <span className="text-[10px] text-slate-400 block font-sans uppercase">
                  Su Pago Total:
                </span>
                <span className="text-sm sm:text-base font-bold text-white">
                  {formatBs(totalPagadoBs, 1)}
                </span>
                <span className="text-[11px] text-slate-400 block font-normal">
                  ({formatUSD(totalPagadoUsd)})
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-sans uppercase">
                  {diferenciaBs >= 0 ? 'Cambio / Vuelto (Bs):' : 'Faltante por Pagar:'}
                </span>
                <span
                  className={`text-base sm:text-lg font-black ${
                    diferenciaBs >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {diferenciaBs >= 0
                    ? `+${formatBs(diferenciaBs, 1)}`
                    : `-${formatBs(Math.abs(diferenciaBs), 1)}`}
                </span>
                <span className="text-[11px] text-slate-400 block font-normal">
                  ({formatUSD(Math.abs(diferenciaUsd))})
                </span>
              </div>
            </div>
          </div>

          {/* Right Column (col-span-5): Virtual Numpad & Quick Input */}
          <div className="md:col-span-5 bg-slate-950 rounded-xl border border-slate-800 p-3.5 flex flex-col justify-between space-y-3">
            {/* Input Display Box */}
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold mb-1">
                <span className="uppercase">
                  {selectedMethod
                    ? `Monto ${isUsdMethod(selectedMethod) ? '($ USD)' : '(Bs.)'}:`
                    : 'Monto:'}
                </span>
                <span
                  className={`font-mono ${
                    selectedMethod ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {selectedMethod
                    ? METHOD_LABELS[selectedMethod]
                    : 'SELECCIONA FORMA DE PAGO'}
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={numpadValue || (selectedMethod ? '0' : '—')}
                  className={`w-full bg-slate-900 border-2 text-right text-2xl font-black font-mono px-3 py-2 rounded-xl focus:outline-none shadow-inner ${
                    selectedMethod
                      ? 'border-emerald-500/60 text-emerald-400'
                      : 'border-slate-700 text-slate-500'
                  }`}
                />
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="grid grid-cols-3 gap-1.5 text-xs font-mono font-bold">
              <button
                type="button"
                onClick={handleSetExact}
                className="py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg cursor-pointer transition-colors"
              >
                Exacto
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickBill(10)}
                className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                $10
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickBill(20)}
                className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                $20
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickBill(50)}
                className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                $50
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickBill(100)}
                className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                $100
              </button>
              <button
                type="button"
                onClick={() => handleNumpadPress('C')}
                className="py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-500/30 rounded-lg cursor-pointer transition-colors flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpiar</span>
              </button>
            </div>

            {/* Touch Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 font-mono font-bold text-lg">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', '.'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleNumpadPress(k)}
                  className="py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl border border-slate-800 hover:border-slate-700 cursor-pointer transition-all active:scale-95 shadow-sm"
                >
                  {k}
                </button>
              ))}
            </div>

            {/* Big Action Button: Process & Print Invoice */}
            <button
              type="button"
              onClick={handleFinalConfirm}
              disabled={!esCubierto}
              className={`w-full py-3 px-4 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                esCubierto
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/60 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
              }`}
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>Confirmar e Imprimir [F8]</span>
            </button>
          </div>
        </div>

        {/* Modal Footer Hotkeys Hint */}
        <div className="bg-slate-950/90 px-5 py-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <div className="flex items-center gap-4">
            <span>
              <strong>[F8 / Ctrl+Enter]</strong> Procesar Cobro
            </span>
            <span>
              <strong>[Esc]</strong> Cancelar y volver al ticket
            </span>
          </div>
          <div className="font-mono text-emerald-400">
            Tasa BCV: 1$ = {tasa.toFixed(2)} Bs.
          </div>
        </div>
      </div>
    </div>
  );
};
