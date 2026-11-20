import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Barcode, 
  Trash2, 
  Plus, 
  Minus, 
  Store, 
  Lock, 
  Printer, 
  Receipt, 
  X,
  User,
  Users,
  Search,
  UserPlus,
  Scale,
  RotateCcw,
  Clock,
  Calculator,
  Tag,
  Monitor,
  CheckCircle,
  AlertCircle,
  Keyboard,
  ArrowRight,
  ShieldCheck,
  Package,
  Maximize
} from 'lucide-react';
import { 
  Sucursal, 
  Producto, 
  InventarioItem, 
  Venta, 
  Usuario, 
  EmpresaConfig, 
  Cliente,
  DetallePagoVenta 
} from '../types';
import { formatUSD, formatBs, formatDual } from '../lib/currency';
import { FiscalCortesView } from './FiscalCortesView';
import { PosPaymentModal1Sistema } from './PosPaymentModal1Sistema';
import { PosProductSearchModal } from './PosProductSearchModal';
import { PosTicketHoldModal, ParkedTicket } from './PosTicketHoldModal';
import { PriceTagsPrintModal } from './PriceTagsPrintModal';
import { BarcodeSvg } from './BarcodeSvg';
import { AITechFooter } from './AITechFooter';
import {
  printTicketViaIframe,
  ThermalPaperWidth,
  getSavedPaperWidth,
  setSavedPaperWidth,
} from '../lib/ticketPrinter';
import {
  normalizeSearchText,
  matchesNormalizedSearch,
  playPosAlertSound,
} from '../lib/text';

const POS_DRAFT_STORAGE_KEY = 'pos_app_pos_draft_v1';

interface StoredPosDraft {
  sucursalId?: number;
  cart?: {
    producto: Producto;
    cantidad: number;
    stockDisponible: number;
    precioUnitarioBs: number;
    subtotalBs: number;
  }[];
  selectedCliente?: {
    id: number | null;
    nombre: string;
    rif: string;
    direccion?: string;
    telefono?: string;
  };
  parkedTickets?: ParkedTicket[];
  pendingMultiplier?: number;
}

function readStoredPosDraft(): StoredPosDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(POS_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredPosDraft;
  } catch {
    return null;
  }
}

interface PosSimulatorProps {
  sucursales: Sucursal[];
  productos: Producto[];
  inventario: InventarioItem[];
  currentUser: Usuario | null;
  empresaConfig: EmpresaConfig;
  clientes: Cliente[];
  onRegistrarVenta: (
    sucursalId: number, 
    items: { producto: Producto; cantidad: number }[],
    cliente: { id: number | null; nombre: string; rif: string },
    pagoDetalle: DetallePagoVenta
  ) => Promise<boolean> | boolean | void;
  onAddCliente?: (cliente: Omit<Cliente, 'id' | 'saldoPendiente' | 'fechaRegistro'>) => Cliente | void;
  onUpdateCliente?: (cliente: Cliente) => void;
  ventas: Venta[];
}

export const PosSimulator: React.FC<PosSimulatorProps> = ({
  sucursales,
  productos,
  inventario,
  currentUser,
  empresaConfig,
  clientes,
  onRegistrarVenta,
  onAddCliente,
  onUpdateCliente,
  ventas,
}) => {
  const tasa = empresaConfig.tasaCambio || 36.50;
  const initialDraft = useMemo(() => readStoredPosDraft(), []);

  // Sucursal State (restored from POS draft if valid)
  const [selectedSucursalId, setSelectedSucursalId] = useState<number>(() => {
    const defaultBranch =
      currentUser?.sucursal_id && currentUser.sucursal_id <= 2 ? currentUser.sucursal_id : 1;
    if (
      initialDraft?.sucursalId &&
      sucursales.some((s) => s.id === initialDraft.sucursalId && s.tipo === 'tienda') &&
      (!currentUser || currentUser.rol === 'admin' || currentUser.sucursal_id === initialDraft.sucursalId)
    ) {
      return initialDraft.sucursalId;
    }
    return defaultBranch;
  });

  // Cart / Items on current invoice ticket (persisted across module navigation)
  const [cart, setCart] = useState<{ 
    producto: Producto; 
    cantidad: number; 
    stockDisponible: number;
    precioUnitarioBs: number;
    subtotalBs: number;
  }[]>(() => {
    if (!Array.isArray(initialDraft?.cart) || initialDraft.cart.length === 0) return [];
    const branchId = initialDraft.sucursalId || (currentUser?.sucursal_id && currentUser.sucursal_id <= 2 ? currentUser.sucursal_id : 1);
    return initialDraft.cart.map((item) => {
      const latestProd = productos.find((p) => p.id === item.producto.id) || item.producto;
      const latestInv = inventario.find((i) => i.sucursal_id === branchId && i.producto_id === latestProd.id);
      const unitBs = +(latestProd.precio * tasa).toFixed(2);
      return {
        producto: latestProd,
        cantidad: item.cantidad,
        stockDisponible: latestInv ? latestInv.stock : item.stockDisponible,
        precioUnitarioBs: unitBs,
        subtotalBs: +(item.cantidad * unitBs).toFixed(2),
      };
    });
  });

  // Selected item row index in table
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);

  // Active Barcode & Name Input Line (LN cursor input)
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Live autocomplete matching while typing in POS input
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number>(0);
  const suggestionsContainerRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxListHeight: number;
  } | null>(null);

  // Filter matching products in real-time as user types (accent-insensitive)
  const matchingProducts = useMemo(() => {
    const query = normalizeSearchText(barcodeInput);
    if (!query) return [];

    return productos
      .filter((p) => {
        const nameMatch = matchesNormalizedSearch(p.nombre, query);
        const codeMatch = normalizeSearchText(p.codigo_barras).includes(query);
        const catMatch = p.categoria ? matchesNormalizedSearch(p.categoria, query) : false;
        const idMatch = String(p.id) === query;
        return nameMatch || codeMatch || catMatch || idMatch;
      })
      .sort((a, b) => {
        const aCode = normalizeSearchText(a.codigo_barras);
        const bCode = normalizeSearchText(b.codigo_barras);
        // Exact barcode match first
        if (aCode === query && bCode !== query) return -1;
        if (bCode === query && aCode !== query) return 1;
        // Exact name match
        const aName = normalizeSearchText(a.nombre);
        const bName = normalizeSearchText(b.nombre);
        if (aName === query && bName !== query) return -1;
        if (bName === query && aName !== query) return 1;
        // Starts with name match prioritized
        const aStarts = aName.startsWith(query);
        const bStarts = bName.startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.nombre.localeCompare(b.nombre);
      })
      .slice(0, 8); // Top 8 matching items for swift navigation
  }, [productos, barcodeInput]);

  const updateDropdownPosition = useCallback(() => {
    if (!barcodeInputRef.current || !showSuggestions || !barcodeInput.trim()) {
      setDropdownPosition(null);
      return;
    }
    const rect = barcodeInputRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      setDropdownPosition(null);
      return;
    }

    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const margin = 12;
    const gap = 6;
    const spaceBelow = viewportH - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    const width = Math.min(Math.max(rect.width, 320), viewportW - margin * 2);
    const left = Math.max(margin, Math.min(rect.left, viewportW - width - margin));
    const openBelow = spaceBelow >= 230 || spaceBelow >= spaceAbove;
    const availableHeight = Math.min(360, Math.max(150, (openBelow ? spaceBelow : spaceAbove) - gap));
    const maxListHeight = Math.max(90, Math.min(280, availableHeight - 76));

    setDropdownPosition(
      openBelow
        ? { top: rect.bottom + gap, left, width, maxListHeight }
        : { bottom: viewportH - rect.top + gap, left, width, maxListHeight }
    );
  }, [showSuggestions, barcodeInput]);

  useEffect(() => {
    updateDropdownPosition();
  }, [updateDropdownPosition, cart.length, matchingProducts.length]);

  useEffect(() => {
    if (!showSuggestions || !barcodeInput.trim()) return;
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [showSuggestions, barcodeInput, updateDropdownPosition]);

  // Reset active suggestion index when matching list changes
  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [matchingProducts]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsContainerRef.current &&
        !suggestionsContainerRef.current.contains(e.target as Node) &&
        barcodeInputRef.current &&
        !barcodeInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Status & Feedback alerts
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Multiplier / Quantity prompt modal
  const [showQuantityModal, setShowQuantityModal] = useState<boolean>(false);
  const [quantityInput, setQuantityInput] = useState<string>('1');
  const [pendingMultiplier, setPendingMultiplier] = useState<number>(() =>
    typeof initialDraft?.pendingMultiplier === 'number' && initialDraft.pendingMultiplier >= 1
      ? initialDraft.pendingMultiplier
      : 1
  );

  // Weighable Scale modal (KG / L)
  const [showScaleModal, setShowScaleModal] = useState<boolean>(false);
  const [scaleWeightInput, setScaleWeightInput] = useState<string>('1.000');

  // Sub-Modals
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [showProductSearchModal, setShowProductSearchModal] = useState<boolean>(false);
  const [showHoldModal, setShowHoldModal] = useState<boolean>(false);
  const [showFiscalModal, setShowFiscalModal] = useState<boolean>(false);
  const [fiscalModalTipo, setFiscalModalTipo] = useState<'X' | 'Z'>('X');
  const [showClientModal, setShowClientModal] = useState<boolean>(false);
  const [showQuickNewClient, setShowQuickNewClient] = useState<boolean>(false);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [showPriceTagsModal, setShowPriceTagsModal] = useState<boolean>(false);
  const [showCreditLimitModal, setShowCreditLimitModal] = useState<boolean>(false);
  const [creditLimitInput, setCreditLimitInput] = useState<string>('0');
  const [creditModalNotice, setCreditModalNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Parked tickets on hold (persisted in draft)
  const [parkedTickets, setParkedTickets] = useState<ParkedTicket[]>(() =>
    Array.isArray(initialDraft?.parkedTickets) ? initialDraft.parkedTickets : []
  );

  // Default & Selected Customer
  const DEFAULT_CLIENTE = {
    id: null as number | null,
    nombre: 'CLIENTE CONTADO',
    rif: 'V-00000000',
    direccion: 'MOSTRADOR / TIENDA LOCAL',
    telefono: 'N/A',
  };
  const [selectedCliente, setSelectedCliente] = useState<{
    id: number | null;
    nombre: string;
    rif: string;
    direccion?: string;
    telefono?: string;
  }>(() => {
    const saved = initialDraft?.selectedCliente;
    if (!saved) return DEFAULT_CLIENTE;
    if (saved.id !== null) {
      const latestClient = clientes.find((c) => c.id === saved.id);
      if (latestClient) {
        return {
          id: latestClient.id,
          nombre: latestClient.nombre,
          rif: latestClient.rif_cedula,
          direccion: latestClient.direccion || 'CLIENTE REGISTRADO',
          telefono: latestClient.telefono,
        };
      }
    }
    return saved;
  });

  // Sync selected customer details if updated in Clientes module
  useEffect(() => {
    if (selectedCliente.id === null) return;
    const latest = clientes.find((c) => c.id === selectedCliente.id);
    if (
      latest &&
      (latest.nombre !== selectedCliente.nombre ||
        latest.rif_cedula !== selectedCliente.rif ||
        (latest.direccion || 'CLIENTE REGISTRADO') !== (selectedCliente.direccion || 'CLIENTE REGISTRADO') ||
        latest.telefono !== selectedCliente.telefono)
    ) {
      setSelectedCliente({
        id: latest.id,
        nombre: latest.nombre,
        rif: latest.rif_cedula,
        direccion: latest.direccion || 'CLIENTE REGISTRADO',
        telefono: latest.telefono,
      });
    }
  }, [clientes, selectedCliente]);

  // Recalculate cart Bs amounts if exchange rate updates
  useEffect(() => {
    setCart((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((it) => {
        const unitBs = +(it.producto.precio * tasa).toFixed(2);
        const subBs = +(it.cantidad * unitBs).toFixed(2);
        if (it.precioUnitarioBs !== unitBs || it.subtotalBs !== subBs) {
          changed = true;
          return { ...it, precioUnitarioBs: unitBs, subtotalBs: subBs };
        }
        return it;
      });
      return changed ? next : prev;
    });
  }, [tasa]);

  // Persist POS active sale draft so navigating to Clientes or other modules never loses the ticket
  useEffect(() => {
    try {
      const payload: StoredPosDraft = {
        sucursalId: selectedSucursalId,
        cart,
        selectedCliente,
        parkedTickets,
        pendingMultiplier,
      };
      localStorage.setItem(POS_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors
    }
  }, [selectedSucursalId, cart, selectedCliente, parkedTickets, pendingMultiplier]);

  // Fast Cédula input
  const [fastCedulaInput, setFastCedulaInput] = useState<string>('');
  const [clientSearch, setClientSearch] = useState<string>('');
  const [newClientData, setNewClientData] = useState({
    nombre: '',
    rif_cedula: '',
    telefono: '',
    email: '',
    direccion: '',
    limiteCredito: 0,
  });

  // Last Completed Ticket for printing
  const [lastCompletedTicket, setLastCompletedTicket] = useState<{
    numeroFactura: string;
    sucursalNombre: string;
    cajeroNombre: string;
    clienteNombre: string;
    clienteRif: string;
    items: { producto: Producto; cantidad: number }[];
    subtotalNeto: number;
    baseImponible: number;
    montoExento: number;
    montoIva: number;
    totalUsd: number;
    tasa: number;
    fecha: string;
    pagoDetalle: DetallePagoVenta;
  } | null>(null);
  const [ticketPaperWidth, setTicketPaperWidth] = useState<ThermalPaperWidth>(() => getSavedPaperWidth());

  const handleChangePaperWidth = (width: ThermalPaperWidth) => {
    setTicketPaperWidth(width);
    setSavedPaperWidth(width);
  };

  // Live Clock
  const [liveTime, setLiveTime] = useState<string>(() => new Date().toLocaleTimeString('es-VE'));
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(new Date().toLocaleTimeString('es-VE'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Invoice Number (Next sequential number starting at 00000001)
  const nextInvoiceNumber = useMemo(() => {
    const maxId = ventas.reduce((max, v) => Math.max(max, Number(v.id) || 0), 0);
    const count = Math.max(ventas.length + 1, maxId + 1);
    return String(count).padStart(8, '0');
  }, [ventas]);

  useEffect(() => {
    if (ventas.length === 0 && lastCompletedTicket !== null) {
      setLastCompletedTicket(null);
      setShowReceiptModal(false);
    }
  }, [ventas.length, lastCompletedTicket]);

  const tiendaActual = sucursales.find((s) => s.id === selectedSucursalId) || sucursales[0];

  // Authorization check
  const isBranchAuthorized = () => {
    if (!currentUser) return false;
    if (currentUser.rol === 'admin') return true;
    if (currentUser.sucursal_id === selectedSucursalId) return true;
    return false;
  };

  // Financial calculations
  const subtotalNetoUsd = cart.reduce((sum, it) => sum + (it.producto.precio * it.cantidad), 0);
  const baseImponibleUsd = cart
    .filter((it) => !it.producto.exento_iva)
    .reduce((sum, it) => sum + (it.producto.precio * it.cantidad), 0);
  const montoExentoUsd = cart
    .filter((it) => !!it.producto.exento_iva)
    .reduce((sum, it) => sum + (it.producto.precio * it.cantidad), 0);
  const montoIvaUsd = +(baseImponibleUsd * 0.16).toFixed(2);
  const totalUsd = +(baseImponibleUsd + montoIvaUsd + montoExentoUsd).toFixed(2);

  const subtotalNetoBs = +(subtotalNetoUsd * tasa).toFixed(2);
  const baseImponibleBs = +(baseImponibleUsd * tasa).toFixed(2);
  const montoExentoBs = +(montoExentoUsd * tasa).toFixed(2);
  const montoIvaBs = +(montoIvaUsd * tasa).toFixed(2);
  const totalBs = +(totalUsd * tasa).toFixed(2);

  // Auto-focus barcode input
  useEffect(() => {
    if (
      !showPaymentModal &&
      !showProductSearchModal &&
      !showHoldModal &&
      !showFiscalModal &&
      !showClientModal &&
      !showReceiptModal &&
      !showQuantityModal &&
      !showScaleModal &&
      !showPriceTagsModal &&
      !showCreditLimitModal
    ) {
      barcodeInputRef.current?.focus();
    }
  }, [
    cart,
    showPaymentModal,
    showProductSearchModal,
    showHoldModal,
    showFiscalModal,
    showClientModal,
    showReceiptModal,
    showQuantityModal,
    showScaleModal,
    showPriceTagsModal,
    showCreditLimitModal,
  ]);

  // Barcode / Scanner item scan handler
  const handleScanBarcode = (codeToScan?: string, customQty?: number) => {
    const code = (codeToScan || barcodeInput).trim();
    if (!code) return;

    const effectiveQty = customQty !== undefined ? customQty : pendingMultiplier;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (!isBranchAuthorized()) {
      playPosAlertSound('error');
      setErrorMsg(`Acceso denegado: ${currentUser?.nombre_completo || 'Usuario'} no está asignado a ${tiendaActual.nombre}.`);
      setBarcodeInput('');
      return;
    }

    // Find product by barcode, SKU or typed product name (accent-insensitive)
    const query = normalizeSearchText(code);
    let prod = productos.find(
      (p) => normalizeSearchText(p.codigo_barras) === query || String(p.id) === query
    );

    // If not exact barcode, find by normalized name matching
    if (!prod) {
      prod =
        productos.find((p) => normalizeSearchText(p.nombre) === query) ||
        productos.find((p) => normalizeSearchText(p.nombre).startsWith(query)) ||
        productos.find((p) => matchesNormalizedSearch(p.nombre, query));
    }

    if (!prod) {
      playPosAlertSound('not_found');
      setErrorMsg(`Artículo o código '${code}' no encontrado.`);
      setBarcodeInput('');
      setShowSuggestions(false);
      return;
    }

    // Check branch inventory stock
    const inv = inventario.find((i) => i.sucursal_id === selectedSucursalId && i.producto_id === prod.id);
    const currentStock = inv ? inv.stock : 0;

    const existingInCart = cart.find((item) => item.producto.id === prod.id);
    const existingQty = existingInCart ? existingInCart.cantidad : 0;
    const requestedQty = existingQty + effectiveQty;

    if (currentStock <= 0 || requestedQty > currentStock) {
      playPosAlertSound('no_stock');
      setErrorMsg(
        currentStock <= 0
          ? `Artículo sin existencia: '${prod.nombre}' tiene stock 0 en ${tiendaActual.nombre}.`
          : `Stock insuficiente de '${prod.nombre}'. Disponible: ${currentStock}`
      );
      setBarcodeInput('');
      setShowSuggestions(false);
      return;
    }

    const unitPriceBs = +(prod.precio * tasa).toFixed(2);

    if (existingInCart) {
      setCart(
        cart.map((item) => {
          if (item.producto.id === prod.id) {
            const nextQty = +(item.cantidad + effectiveQty).toFixed(3);
            return {
              ...item,
              cantidad: nextQty,
              subtotalBs: +(nextQty * unitPriceBs).toFixed(2),
            };
          }
          return item;
        })
      );
    } else {
      setCart([
        ...cart,
        {
          producto: prod,
          cantidad: effectiveQty,
          stockDisponible: currentStock,
          precioUnitarioBs: unitPriceBs,
          subtotalBs: +(effectiveQty * unitPriceBs).toFixed(2),
        },
      ]);
    }

    setPendingMultiplier(1);
    setQuantityInput('1');
    setBarcodeInput('');
    setShowSuggestions(false);
    setSelectedRowIndex(existingInCart ? cart.findIndex((c) => c.producto.id === prod.id) : cart.length);
  };

  const handleOpenCreditLimitModal = useCallback(() => {
    const registeredClient = selectedCliente.id
      ? clientes.find((c) => c.id === selectedCliente.id)
      : undefined;
    setCreditLimitInput(registeredClient ? String(registeredClient.limiteCredito || 0) : '0');
    setCreditModalNotice(null);
    setShowCreditLimitModal(true);
  }, [clientes, selectedCliente.id]);

  // Keyboard Navigation & Shortcut Keys (F1 - F12) in capture phase so browser F3 Find is prevented
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const key = e.key || e.code;

      // Always prevent browser native Find dialog on F3 while inside POS
      if (key === 'F3' || e.code === 'F3') {
        e.preventDefault();
        e.stopPropagation();
        if (
          !showPaymentModal &&
          !showProductSearchModal &&
          !showClientModal &&
          !showFiscalModal &&
          !showQuantityModal &&
          !showScaleModal &&
          !showHoldModal &&
          !showReceiptModal &&
          !showPriceTagsModal &&
          !showCreditLimitModal
        ) {
          handleOpenCreditLimitModal();
        }
        return;
      }

      if (key === 'Escape' && showCreditLimitModal) {
        e.preventDefault();
        setShowCreditLimitModal(false);
        return;
      }

      // Don't intercept other shortcuts if an input modal is open
      if (
        showPaymentModal ||
        showProductSearchModal ||
        showClientModal ||
        showFiscalModal ||
        showQuantityModal ||
        showScaleModal ||
        showHoldModal ||
        showReceiptModal ||
        showPriceTagsModal ||
        showCreditLimitModal
      ) {
        return;
      }

      if (key === 'F2' || e.code === 'F2') {
        e.preventDefault();
        setShowProductSearchModal(true);
      } else if (key === 'F4' || e.code === 'F4') {
        e.preventDefault();
        setShowQuantityModal(true);
      } else if (key === 'F6' || e.code === 'F6') {
        e.preventDefault();
        handleDevolucionUltimoItem();
      } else if (key === 'F7' || e.code === 'F7') {
        e.preventDefault();
        handleHoldOrOpenHoldModal();
      } else if (key === 'F8' || e.code === 'F8') {
        e.preventDefault();
        if (cart.length > 0) setShowPaymentModal(true);
      } else if (key === 'F10' || e.code === 'F10') {
        e.preventDefault();
        setFiscalModalTipo('X');
        setShowFiscalModal(true);
      } else if (key === 'F12' || e.code === 'F12') {
        e.preventDefault();
        setShowClientModal(true);
      }
      // Note: F11 is not intercepted so the browser can natively toggle full screen
      // Note: F9 is handled globally for the Commercial Calculator
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [
    cart,
    showPaymentModal,
    showProductSearchModal,
    showClientModal,
    showFiscalModal,
    showQuantityModal,
    showScaleModal,
    showHoldModal,
    showReceiptModal,
    showPriceTagsModal,
    showCreditLimitModal,
    selectedCliente,
    handleOpenCreditLimitModal,
  ]);

  // Action: F6 Void / Devolución item
  const handleDevolucionUltimoItem = () => {
    if (cart.length === 0) return;
    const targetIndex = selectedRowIndex >= 0 ? selectedRowIndex : cart.length - 1;
    const item = cart[targetIndex];
    if (!item) return;

    if (item.cantidad > 1) {
      setCart(
        cart.map((it, idx) =>
          idx === targetIndex
            ? {
                ...it,
                cantidad: it.cantidad - 1,
                subtotalBs: +((it.cantidad - 1) * it.precioUnitarioBs).toFixed(2),
              }
            : it
        )
      );
    } else {
      setCart(cart.filter((_, idx) => idx !== targetIndex));
      setSelectedRowIndex(-1);
    }
  };

  // Action: F7 Hold / Park current ticket
  const handleHoldOrOpenHoldModal = () => {
    if (cart.length > 0) {
      const newParked: ParkedTicket = {
        id: `hold_${Date.now()}`,
        hora: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
        cliente: {
          id: selectedCliente.id,
          nombre: selectedCliente.nombre,
          rif: selectedCliente.rif,
        },
        items: [...cart],
        totalUsd,
      };
      setParkedTickets([newParked, ...parkedTickets]);
      setCart([]);
      setSelectedCliente(DEFAULT_CLIENTE);
      setSuccessMsg(`Ticket pausado y colocado en espera (${cart.length} artículos).`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setShowHoldModal(true);
    }
  };

  // Action: Restore held ticket
  const handleRestoreTicket = (t: ParkedTicket) => {
    setCart(t.items);
    setSelectedCliente({
      id: t.cliente.id,
      nombre: t.cliente.nombre,
      rif: t.cliente.rif,
      direccion: 'CLIENTE EN ESPERA',
    });
    setParkedTickets(parkedTickets.filter((item) => item.id !== t.id));
    setSuccessMsg(`Ticket recuperado: ${t.cliente.nombre} (${t.items.length} ítems).`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Action: F9 Suspender / Cancel entire ticket
  const handleSuspenderVenta = () => {
    if (cart.length === 0) return;
    if (confirm('¿Deseas anular y limpiar completamente el ticket actual en caja?')) {
      setCart([]);
      setSelectedCliente(DEFAULT_CLIENTE);
      setSelectedRowIndex(-1);
    }
  };

  // Complete Payment Submission from PosPaymentModal1Sistema
  const handleConfirmSaleExecution = async (detallePago: DetallePagoVenta) => {
    if (cart.length === 0) return;

    const saleItems = cart.map((c) => ({
      producto: c.producto,
      cantidad: c.cantidad,
    }));

    const result = await onRegistrarVenta(
      selectedSucursalId,
      saleItems,
      {
        id: selectedCliente.id,
        nombre: selectedCliente.nombre,
        rif: selectedCliente.rif,
      },
      detallePago
    );

    // If sale failed due to concurrency conflict or stock depletion, keep cart intact
    if (result === false) {
      return;
    }

    const descuentoAplicado = Math.max(0, Number(detallePago.descuento_usd || 0));
    const finalTotalUsd = +(Math.max(0, totalUsd - descuentoAplicado)).toFixed(2);
    const finalTotalBs = +(finalTotalUsd * tasa).toFixed(2);

    const completed = {
      numeroFactura: nextInvoiceNumber,
      sucursalNombre: tiendaActual.nombre,
      cajeroNombre: currentUser?.nombre_completo || 'Cajero de Turno',
      clienteNombre: selectedCliente.nombre,
      clienteRif: selectedCliente.rif,
      items: saleItems,
      subtotalNeto: subtotalNetoUsd,
      baseImponible: baseImponibleUsd,
      montoExento: montoExentoUsd,
      montoIva: montoIvaUsd,
      totalUsd: finalTotalUsd,
      tasa,
      fecha: new Date().toLocaleString('es-VE'),
      pagoDetalle: detallePago,
    };

    setLastCompletedTicket(completed);
    setCart([]);
    setSelectedCliente(DEFAULT_CLIENTE);
    setSelectedRowIndex(-1);
    setShowPaymentModal(false);
    setShowReceiptModal(true);
    setSuccessMsg(`¡Factura #${nextInvoiceNumber} emitida con éxito por ${formatBs(finalTotalBs, 1)} ($${finalTotalUsd.toFixed(2)})!`);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // Open & Reprint the last ticket
  const handleOpenLastTicket = () => {
    if (lastCompletedTicket) {
      setShowReceiptModal(true);
      return;
    }
    // If not in state, look up the last sale in this branch
    const branchSales = ventas.filter((v) => v.sucursal_id === selectedSucursalId);
    const lastSale = branchSales.length > 0 ? branchSales[branchSales.length - 1] : ventas[ventas.length - 1];
    if (lastSale) {
      const derivedTicket = {
        numeroFactura:
          (lastSale as any).numeroFactura ||
          (lastSale.id ? String(lastSale.id).padStart(8, '0') : '00000001'),
        sucursalNombre: tiendaActual.nombre,
        cajeroNombre: lastSale.usuario_nombre || currentUser?.nombre_completo || 'Cajero de Turno',
        clienteNombre: lastSale.cliente_nombre || 'Cliente de Mostrador',
        clienteRif: lastSale.cliente_rif || 'V-00000000',
        items: (lastSale.detalles || []).map((d) => ({
          producto: {
            id: d.producto_id,
            nombre: d.producto_nombre,
            precio: d.precio_unitario,
            codigo_barras: d.codigo_barras || '',
            categoria: '',
            activo: true,
            unidad_medida: (d.unidad_medida as any) || 'UND',
            costo: 0,
            margen_ganancia: 0,
            aplica_iva: !(d.exento_iva),
            stock_por_sucursal: {}
          } as Producto,
          cantidad: d.cantidad,
        })),
        subtotalNeto: lastSale.subtotal_neto || lastSale.total,
        baseImponible: lastSale.base_imponible || 0,
        montoExento: lastSale.monto_exento || 0,
        montoIva: lastSale.monto_iva || 0,
        totalUsd: lastSale.total,
        tasa,
        fecha: lastSale.fecha,
        pagoDetalle: (lastSale.pago_detalle as any) || {
          metodo: (lastSale.metodo_pago as any) || 'efectivo_usd',
          monto_usd: lastSale.total,
          monto_bs: lastSale.total * tasa,
        },
      };
      setLastCompletedTicket(derivedTicket);
      setShowReceiptModal(true);
    } else {
      setSuccessMsg('Aún no se han emitido ventas en esta sesión.');
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  // Dedicated thermal iframe print handler
  const handlePrintTicket = async () => {
    if (!lastCompletedTicket) return;
    const ticketData = {
      numeroFactura: lastCompletedTicket.numeroFactura,
      sucursalNombre: lastCompletedTicket.sucursalNombre,
      cajeroNombre: lastCompletedTicket.cajeroNombre,
      clienteNombre: lastCompletedTicket.clienteNombre,
      clienteRif: lastCompletedTicket.clienteRif,
      items: lastCompletedTicket.items.map((it) => ({
        nombre: it.producto.nombre,
        cantidad: it.cantidad,
        precio: it.producto.precio,
        codigo_barras: it.producto.codigo_barras,
        unidad_medida: it.producto.unidad_medida,
      })),
      subtotalNeto: lastCompletedTicket.subtotalNeto,
      baseImponible: lastCompletedTicket.baseImponible,
      montoExento: lastCompletedTicket.montoExento,
      montoIva: lastCompletedTicket.montoIva,
      totalUsd: lastCompletedTicket.totalUsd,
      tasa: lastCompletedTicket.tasa,
      fecha: lastCompletedTicket.fecha,
      pagoDetalle: lastCompletedTicket.pagoDetalle,
    };

    await printTicketViaIframe(ticketData, empresaConfig, ticketPaperWidth);
  };

  // Client Selection / Fast Cédula
  const handleFastCedulaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanVal = fastCedulaInput.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!cleanVal) return;

    const match = clientes.find((c) => {
      const cleanRif = c.rif_cedula.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return cleanRif === cleanVal || cleanRif.endsWith(cleanVal);
    });

    if (match) {
      setSelectedCliente({
        id: match.id,
        nombre: match.nombre,
        rif: match.rif_cedula,
        direccion: match.direccion || 'CLIENTE REGISTRADO',
        telefono: match.telefono,
      });
      setFastCedulaInput('');
      setSuccessMsg(`Cliente seleccionado: ${match.nombre}`);
      setTimeout(() => setSuccessMsg(null), 2500);
    } else {
      setNewClientData((prev) => ({ ...prev, rif_cedula: fastCedulaInput }));
      setShowQuickNewClient(true);
      setShowClientModal(true);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-[560px] bg-slate-950 text-slate-100 font-sans select-none overflow-hidden rounded-2xl border border-slate-800 shadow-2xl">
      
      {/* ========================================================================= */}
      {/* MAIN POS WORKSPACE: 75% LEFT (SCAN, GRID, FUNCTION KEYS) | 25% RIGHT PANEL */}
      {/* ========================================================================= */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">

        {/* ----------------------------------------------------------------------- */}
        {/* LEFT 75%: ALERTS, SCAN BAR, ITEMS TABLE & FUNCTION KEYS                 */}
        {/* ----------------------------------------------------------------------- */}
        <div className="w-full lg:w-[75%] flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-800">
          
          {/* Feedback Alerts */}
          {errorMsg && (
            <div className="bg-rose-950/90 border-b border-rose-500/50 px-4 py-1.5 text-xs text-rose-200 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <strong>{errorMsg}</strong>
              </span>
              <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-950/90 border-b border-emerald-500/50 px-4 py-1.5 text-xs text-emerald-200 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <strong>{successMsg}</strong>
              </span>
              <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* PINNED BARCODE & ARTICLE SEARCH BAR */}
          <div className="bg-slate-900/80 border-b border-slate-800 px-3 py-2 flex items-center gap-2 shrink-0">
            <span className="px-2 py-1.5 rounded-lg bg-slate-950 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-xs shrink-0">
              LN {String(cart.length + 1).padStart(2, '0')}
            </span>

            {pendingMultiplier > 1 && (
              <button
                type="button"
                onClick={() => {
                  setPendingMultiplier(1);
                  setQuantityInput('1');
                }}
                className="px-2 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-black text-xs flex items-center gap-1 shrink-0 cursor-pointer"
                title="Multiplicador de cantidad activo (clic para restablecer a 1x)"
              >
                <span>{pendingMultiplier}x</span>
                <X className="w-3 h-3" />
              </button>
            )}

            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => {
                  setBarcodeInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => {
                  if (barcodeInput.trim().length > 0) {
                    setShowSuggestions(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (showSuggestions && matchingProducts.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActiveSuggestionIndex((prev) => (prev + 1) % matchingProducts.length);
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveSuggestionIndex((prev) => (prev - 1 + matchingProducts.length) % matchingProducts.length);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowSuggestions(false);
                      return;
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const selectedProd = matchingProducts[activeSuggestionIndex] || matchingProducts[0];
                      if (selectedProd) {
                        handleScanBarcode(selectedProd.codigo_barras);
                        setShowSuggestions(false);
                        return;
                      }
                    }
                  }

                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScanBarcode();
                    setShowSuggestions(false);
                  }
                }}
                placeholder="Escanea código de barras o escribe el nombre del artículo (ej: cafe)..."
                className="w-full bg-slate-950 border border-slate-700 text-emerald-300 font-mono text-xs sm:text-sm pl-9 pr-8 py-2 rounded-lg focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40 focus:outline-none placeholder:text-slate-500 tracking-wide shadow-inner"
              />
              {barcodeInput && (
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeInput('');
                    setShowSuggestions(false);
                    barcodeInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                  title="Limpiar búsqueda"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* LIVE MATCHING SUGGESTIONS DROPDOWN (Portal) */}
              {showSuggestions && barcodeInput.trim().length > 0 && dropdownPosition &&
                createPortal(
                  <div
                    ref={suggestionsContainerRef}
                    className="bg-slate-900 border-2 border-emerald-500/80 shadow-2xl rounded-2xl overflow-hidden font-sans backdrop-blur-md"
                    style={{
                      position: 'fixed',
                      zIndex: 9999,
                      left: dropdownPosition.left,
                      width: dropdownPosition.width,
                      ...(dropdownPosition.top !== undefined
                        ? { top: dropdownPosition.top }
                        : { bottom: dropdownPosition.bottom }),
                    }}
                  >
                    <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span className="font-bold text-white text-[11px] uppercase tracking-wide">
                          Coincidencias en tiempo real
                        </span>
                        <span className="bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-500/30">
                          {matchingProducts.length} artículo(s)
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                        Usa [↑] [↓] y [Enter] o clic
                      </span>
                    </div>

                    {matchingProducts.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 text-xs space-y-1">
                        <p className="font-semibold text-slate-300">
                          No hay artículos que coincidan con &ldquo;{barcodeInput}&rdquo;
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Verifica el nombre o pulsa <strong>[F2 Buscar]</strong> para revisar todo el catálogo.
                        </p>
                      </div>
                    ) : (
                      <div
                        className="overflow-y-auto divide-y divide-slate-800/80 custom-scrollbar"
                        style={{ maxHeight: dropdownPosition.maxListHeight }}
                      >
                        {matchingProducts.map((p, idx) => {
                          const isHighlighted = idx === activeSuggestionIndex;
                          const invItem = inventario.find(
                            (i) => i.sucursal_id === selectedSucursalId && i.producto_id === p.id
                          );
                          const stockDisp = invItem ? invItem.stock : 0;
                          const hasStock = stockDisp > 0;
                          const precioBs = +(p.precio * tasa).toFixed(2);

                          return (
                            <div
                              key={p.id}
                              onMouseEnter={() => setActiveSuggestionIndex(idx)}
                              onClick={() => {
                                handleScanBarcode(p.codigo_barras);
                                setShowSuggestions(false);
                                barcodeInputRef.current?.focus();
                              }}
                              className={`p-2.5 flex items-center justify-between gap-3 cursor-pointer transition-all ${
                                isHighlighted
                                  ? 'bg-emerald-950/80 border-l-4 border-emerald-400 pl-2 shadow-inner'
                                  : 'bg-slate-900/95 hover:bg-slate-800/80'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                                    isHighlighted
                                      ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/60 shadow-md'
                                      : 'bg-slate-800 text-slate-400 border-slate-700/80'
                                  }`}
                                >
                                  <Package className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-black text-xs text-white uppercase truncate flex items-center gap-2">
                                    <span>{p.nombre}</span>
                                    {p.exento_iva ? (
                                      <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.5 rounded font-mono font-bold">
                                        (E) EXENTO
                                      </span>
                                    ) : (
                                      <span className="text-[9px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded font-mono">
                                        IVA 16%
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                                    <span className="text-emerald-400 font-bold tracking-wider">
                                      {p.codigo_barras}
                                    </span>
                                    <span>•</span>
                                    <span className="text-slate-300 truncate">
                                      {p.categoria || 'General'}
                                    </span>
                                    <span>•</span>
                                    <span
                                      className={`font-bold px-1.5 py-0.2 rounded ${
                                        hasStock
                                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                          : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                      }`}
                                    >
                                      {hasStock
                                        ? `Stock: ${stockDisp} ${p.unidad_medida || 'UND'}`
                                        : 'Sin stock (0)'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-right shrink-0 flex flex-col items-end">
                                <div className="text-sm font-black text-emerald-400 font-mono">
                                  $ {p.precio.toFixed(2)}
                                </div>
                                <div className="text-[11px] font-bold text-slate-200 font-mono">
                                  {formatBs(precioBs, 1)}
                                </div>
                                <span
                                  className={`text-[9px] font-bold mt-1 px-2 py-0.5 rounded-md inline-flex items-center gap-1 transition-colors ${
                                    isHighlighted
                                      ? 'bg-emerald-500 text-slate-950 shadow'
                                      : 'bg-slate-800 text-emerald-400'
                                  }`}
                                >
                                  <Plus className="w-3 h-3 stroke-[3]" />
                                  Agregar
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="bg-slate-950 px-3 py-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>Selecciona con clic o presiona Enter para agregar</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSuggestions(false);
                          setShowProductSearchModal(true);
                        }}
                        className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                      >
                        Abrir catálogo completo [F2] →
                      </button>
                    </div>
                  </div>,
                  document.body
                )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (matchingProducts.length > 0) {
                  const targetProd = matchingProducts[activeSuggestionIndex] || matchingProducts[0];
                  handleScanBarcode(targetProd.codigo_barras);
                } else {
                  handleScanBarcode();
                }
                setShowSuggestions(false);
              }}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg cursor-pointer flex items-center gap-1.5 shadow transition-colors shrink-0"
              title="Agregar artículo al ticket [Enter]"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Enter</span>
            </button>
          </div>

          {/* MAIN FISCAL ITEMS DATA TABLE */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-slate-950 p-2 custom-scrollbar">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="bg-rose-950/70 text-rose-200 border-b-2 border-rose-700/60 uppercase text-[11px] font-bold tracking-wider sticky top-0 z-10">
                  <th className="py-2 px-2 text-center w-11">LN</th>
                  <th className="py-2 px-2.5 w-32">CÓDIGO</th>
                  <th className="py-2 px-2.5">DESCRIPCIÓN</th>
                  <th className="py-2 px-2.5 text-center w-16">CANT.</th>
                  <th className="py-2 px-2.5 text-right w-24">PRECIO</th>
                  <th className="py-2 px-2.5 text-right w-28">TOTAL</th>
                  <th className="py-2 px-2 text-center w-14">IVA</th>
                  <th className="py-2 px-2 text-center w-24">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {cart.map((item, index) => {
                  const lnNumber = index + 1;
                  const isSelected = selectedRowIndex === index;
                  const isExento = !!item.producto.exento_iva;
                  const unit = item.producto.unidad_medida || 'UND';

                  return (
                    <tr
                      key={`${item.producto.id}-${index}`}
                      onClick={() => setSelectedRowIndex(index)}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600/25 text-white font-semibold'
                          : index % 2 === 0
                          ? 'bg-slate-900/40 text-slate-200 hover:bg-slate-800/40'
                          : 'bg-slate-950 text-slate-300 hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2 px-2 text-center font-bold text-slate-400 text-xs">
                        {String(lnNumber).padStart(2, '0')}
                      </td>

                      <td className="py-2 px-2.5 text-emerald-400 font-mono font-bold truncate">
                        {item.producto.codigo_barras}
                      </td>

                      <td className="py-2 px-2.5 font-bold uppercase text-white truncate max-w-[240px]">
                        {item.producto.nombre}
                        <span className="text-[10px] text-slate-500 font-normal ml-1.5 font-sans">
                          ({unit})
                        </span>
                      </td>

                      <td className="py-2 px-2.5 text-center font-bold text-white">
                        {item.cantidad % 1 === 0 ? item.cantidad : item.cantidad.toFixed(3)}
                      </td>

                      <td className="py-2 px-2.5 text-right text-slate-300">
                        {formatBs(item.precioUnitarioBs, 1)}
                      </td>

                      <td className="py-2 px-2.5 text-right font-black text-emerald-300">
                        {formatBs(item.subtotalBs, 1)}
                      </td>

                      <td className="py-2 px-2 text-center">
                        {isExento ? (
                          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 px-1 py-0.5 rounded">
                            (E)
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-1 py-0.5 rounded">
                            16%
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (item.cantidad > 1) {
                                setCart(
                                  cart.map((it, idx) =>
                                    idx === index
                                      ? {
                                          ...it,
                                          cantidad: it.cantidad - 1,
                                          subtotalBs: +((it.cantidad - 1) * it.precioUnitarioBs).toFixed(2),
                                        }
                                      : it
                                  )
                                );
                              } else {
                                setCart(cart.filter((_, idx) => idx !== index));
                              }
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                            title="Disminuir 1 unidad"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (item.cantidad + 1 <= item.stockDisponible) {
                                setCart(
                                  cart.map((it, idx) =>
                                    idx === index
                                      ? {
                                          ...it,
                                          cantidad: it.cantidad + 1,
                                          subtotalBs: +((it.cantidad + 1) * it.precioUnitarioBs).toFixed(2),
                                        }
                                      : it
                                  )
                                );
                              } else {
                                playPosAlertSound('no_stock');
                                setErrorMsg(`Stock máximo disponible alcanzado (${item.stockDisponible})`);
                              }
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                            title="Aumentar 1 unidad"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCart(cart.filter((_, idx) => idx !== index))}
                            className="p-1 rounded bg-rose-950/50 hover:bg-rose-900 text-rose-400 cursor-pointer"
                            title="Eliminar línea"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {cart.length === 0 && (
              <div className="py-16 text-center text-slate-600 text-xs space-y-1.5 font-mono">
                <Barcode className="w-10 h-10 mx-auto text-slate-700 stroke-[1.5]" />
                <p className="text-slate-400 font-bold">PUNTO DE VENTA LISTO</p>
                <p className="text-[11px] text-slate-500">
                  Escanea productos con el lector o escribe el nombre arriba. Pulsa <strong>[F2 Buscar]</strong> para ver todo el catálogo.
                </p>
              </div>
            )}
          </div>

          {/* BOTTOM FUNCTION KEYS TOOLBAR */}
          <div className="bg-slate-900 border-t border-slate-800 p-2 shrink-0">
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 text-center font-mono">
              
              {/* F2 Buscar */}
              <button
                type="button"
                onClick={() => setShowProductSearchModal(true)}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-blue-600/30 hover:border-blue-500 border border-slate-700/80 text-slate-200 transition-all flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 shadow-sm"
              >
                <Search className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-bold text-white">F2 Buscar</span>
                <span className="text-[8px] text-slate-400 hidden sm:inline font-sans">Catálogo</span>
              </button>

              {/* F3 Límite */}
              <button
                type="button"
                onClick={handleOpenCreditLimitModal}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-200 transition-all flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 shadow-sm"
              >
                <ShieldCheck className="w-4 h-4 text-slate-400" />
                <span className="text-[10px] font-bold text-white">F3 Límite</span>
                <span className="text-[8px] text-slate-400 hidden sm:inline font-sans">Crédito</span>
              </button>

              {/* F4 Cantidad */}
              <button
                type="button"
                onClick={() => setShowQuantityModal(true)}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-200 transition-all flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 shadow-sm"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-bold text-white">F4 Cantidad</span>
                <span className="text-[8px] text-slate-400 hidden sm:inline font-sans">Multiplicar</span>
              </button>

              {/* F6 Reintegro */}
              <button
                type="button"
                onClick={handleDevolucionUltimoItem}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-200 transition-all flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 shadow-sm"
              >
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] font-bold text-white">F6 Reintegro</span>
                <span className="text-[8px] text-slate-400 hidden sm:inline font-sans">-1 Item</span>
              </button>

              {/* F7 En Espera */}
              <button
                type="button"
                onClick={handleHoldOrOpenHoldModal}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-amber-600/30 hover:border-amber-500 border border-slate-700/80 text-slate-200 transition-all flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 shadow-sm relative"
              >
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] font-bold text-white">F7 Espera</span>
                <span className="text-[8px] text-slate-400 hidden sm:inline font-sans">Hold</span>
                {parkedTickets.length > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-black text-[9px] flex items-center justify-center">
                    {parkedTickets.length}
                  </span>
                )}
              </button>

              {/* F8 Totalizar / Cobrar (Primary Action) */}
              <button
                type="button"
                onClick={() => {
                  if (cart.length > 0) setShowPaymentModal(true);
                }}
                disabled={cart.length === 0}
                className={`p-2 rounded-xl border text-slate-200 transition-all flex flex-col items-center gap-0.5 active:scale-95 shadow-md ${
                  cart.length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black border-emerald-400 cursor-pointer shadow-emerald-950/60'
                    : 'bg-slate-800/50 border-slate-800 text-slate-600 cursor-not-allowed'
                }`}
              >
                <Calculator className={`w-4 h-4 ${cart.length > 0 ? 'text-slate-950 stroke-[2.5]' : 'text-slate-600'}`} />
                <span className={`text-[10px] font-black ${cart.length > 0 ? 'text-slate-950' : 'text-slate-500'}`}>
                  F8 Totalizar
                </span>
                <span className={`text-[8px] hidden sm:inline font-sans ${cart.length > 0 ? 'text-slate-900 font-bold' : 'text-slate-600'}`}>
                  Cobrar
                </span>
              </button>

              {/* Anular / Limpiar Ticket */}
              <button
                type="button"
                onClick={handleSuspenderVenta}
                disabled={cart.length === 0}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-rose-950/50 hover:border-rose-500 border border-slate-700/80 text-slate-200 transition-all flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span className="text-[10px] font-bold text-white">Anular</span>
                <span className="text-[8px] text-slate-400 hidden sm:inline font-sans">Limpiar</span>
              </button>

              {/* F12 Clientes */}
              <button
                type="button"
                onClick={() => setShowClientModal(true)}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-indigo-600/30 hover:border-indigo-500 border border-slate-700/80 text-slate-200 transition-all flex flex-col items-center gap-0.5 cursor-pointer active:scale-95 shadow-sm"
              >
                <Users className="w-4 h-4 text-indigo-400" />
                <span className="text-[10px] font-bold text-white">F12 Clientes</span>
                <span className="text-[8px] text-slate-400 hidden sm:inline font-sans">Directorio</span>
              </button>

            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* RIGHT 25% LATERAL PANEL: TOTALES -> CLIENTE -> TIENDA / FACTURA / FECHA / CORTES */}
        {/* ----------------------------------------------------------------------- */}
        <aside className="w-full lg:w-[25%] bg-slate-900/55 p-2.5 flex flex-col gap-2.5 overflow-y-auto custom-scrollbar shrink-0">

          {/* 1. TOTALES (ARRIBA) */}
          <div className="bg-slate-950/90 rounded-xl border border-slate-700/90 p-3 space-y-2 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Total a Pagar (Bs.)
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {cart.length} ítem(s)
              </span>
            </div>

            <div className="text-right">
              <div className="text-2xl xl:text-3xl font-black text-rose-500 font-mono tracking-tight leading-none">
                {formatBs(totalBs, 1)}
              </div>
              <div className="text-base xl:text-lg font-black text-emerald-400 font-mono mt-1">
                $ {totalUsd.toFixed(2)}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 space-y-1 font-mono text-[11px] text-slate-300">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Subtotal:</span>
                <span className="font-bold text-slate-200">{formatBs(subtotalNetoBs, 1)}</span>
              </div>
              {montoExentoBs > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-sans">Exento (E):</span>
                  <span className="font-bold text-amber-300">{formatBs(montoExentoBs, 1)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">IVA (16%):</span>
                <span className="font-bold text-slate-200">{formatBs(montoIvaBs, 1)}</span>
              </div>
            </div>
          </div>

          {/* 2. INFORMACIÓN DEL CLIENTE */}
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Cliente
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {selectedCliente.id && (
                  <button
                    type="button"
                    onClick={() => setSelectedCliente(DEFAULT_CLIENTE)}
                    className="px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold cursor-pointer"
                    title="Volver a Cliente Contado"
                  >
                    Contado
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowClientModal(true)}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 cursor-pointer inline-flex items-center gap-1 text-[10px] font-semibold transition-colors"
                  title="Abrir directorio de clientes [F12]"
                >
                  <Users className="w-3 h-3 text-indigo-400" />
                  <span>[F12]</span>
                </button>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <div className="font-mono text-emerald-300 font-bold tracking-wider bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded text-[11px] inline-block">
                {selectedCliente.rif || 'V-00000000'}
              </div>
              <div className="font-bold text-white uppercase truncate text-xs" title={selectedCliente.nombre}>
                {selectedCliente.nombre}
              </div>
              <div className="text-slate-400 text-[10px] truncate" title={selectedCliente.direccion || 'MOSTRADOR / TIENDA LOCAL'}>
                {selectedCliente.direccion || 'MOSTRADOR / TIENDA LOCAL'}
              </div>
            </div>

            {/* Fast RIF/Cédula Lookup */}
            <form onSubmit={handleFastCedulaSubmit} className="flex items-center gap-1.5 pt-1.5 border-t border-slate-800/80">
              <input
                type="text"
                value={fastCedulaInput}
                onChange={(e) => setFastCedulaInput(e.target.value)}
                placeholder="Cédula/RIF + Enter"
                className="bg-slate-950 border border-slate-700 focus:border-emerald-500 text-[11px] text-white font-mono px-2 py-1 rounded-lg focus:outline-none flex-1 min-w-0"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold rounded-lg cursor-pointer shrink-0"
              >
                Buscar
              </button>
            </form>
          </div>

          {/* 3. TIENDA, FACTURA Nº, FECHA Y HORA */}
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-2.5 space-y-2 text-xs">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Tienda / Sucursal
              </label>
              <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                <Store className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <select
                  value={selectedSucursalId}
                  onChange={(e) => {
                    setSelectedSucursalId(Number(e.target.value));
                    setCart([]);
                  }}
                  className="bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer w-full min-w-0"
                >
                  {sucursales.filter((s) => s.tipo === 'tienda').map((suc) => (
                    <option key={suc.id} value={suc.id} className="bg-slate-900 text-white">
                      {suc.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono">
              <div className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                <span className="text-[9px] text-slate-400 uppercase block font-sans">Factura Nº</span>
                <span className="text-xs font-black text-white tracking-wider">{nextInvoiceNumber}</span>
              </div>
              <div className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-right">
                <span className="text-[9px] text-slate-400 uppercase block font-sans">Fecha / Hora</span>
                <span className="text-[10px] text-slate-300 font-bold block leading-tight">
                  {new Date().toLocaleDateString('es-VE')}
                </span>
                <span className="text-[11px] text-emerald-400 font-black block leading-tight">
                  {liveTime}
                </span>
              </div>
            </div>
          </div>

          {/* 4. CORTES X / Z, HABLADORES / ANAQUEL Y ÚLTIMO TICKET */}
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-2.5 space-y-2 mt-auto">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setFiscalModalTipo('X');
                  setShowFiscalModal(true);
                }}
                className="py-1.5 px-2 rounded-lg bg-slate-950 hover:bg-sky-500/15 border border-slate-800 hover:border-sky-500/40 text-sky-400 text-[11px] font-bold transition-all cursor-pointer"
                title="Corte X (Parcial de Turno)"
              >
                Corte X
              </button>
              <button
                type="button"
                onClick={() => {
                  setFiscalModalTipo('Z');
                  setShowFiscalModal(true);
                }}
                className="py-1.5 px-2 rounded-lg bg-slate-950 hover:bg-rose-500/15 border border-slate-800 hover:border-rose-500/40 text-rose-400 text-[11px] font-bold transition-all cursor-pointer"
                title="Corte Z (Cierre Fiscal Diario)"
              >
                Corte Z
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => setShowPriceTagsModal(true)}
                className="w-full flex items-center justify-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                title="Diseñar e imprimir etiquetas de precios para anaqueles y estantes"
              >
                <Tag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Habladores / Anaquel</span>
              </button>

              <button
                type="button"
                onClick={handleOpenLastTicket}
                className="w-full flex items-center justify-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                title="Ver y reimprimir el último ticket de venta emitido"
              >
                <Receipt className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Último Ticket</span>
              </button>
            </div>
          </div>

        </aside>
      </div>

      {/* Footer Corporativo Oficial AITech Soluciones, C. A. en POS */}
      <AITechFooter variant="pos" />

      {/* ========================================================================= */}
      {/* 6. MODALS                                                                 */}
      {/* ========================================================================= */}

      {/* Payment Modal (Image 2 style with split payments, numpad & dual calculations) */}
      <PosPaymentModal1Sistema
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        totalUsd={totalUsd}
        empresaConfig={empresaConfig}
        clienteNombre={selectedCliente.nombre}
        clienteRif={selectedCliente.rif}
        onConfirmPayment={handleConfirmSaleExecution}
      />

      {/* [F2] Product Search Modal */}
      <PosProductSearchModal
        isOpen={showProductSearchModal}
        onClose={() => setShowProductSearchModal(false)}
        productos={productos}
        inventario={inventario}
        selectedSucursalId={selectedSucursalId}
        empresaConfig={empresaConfig}
        onSelectProduct={(p) => handleScanBarcode(p.codigo_barras)}
      />

      {/* [F7] Held Tickets Modal */}
      <PosTicketHoldModal
        isOpen={showHoldModal}
        onClose={() => setShowHoldModal(false)}
        parkedTickets={parkedTickets}
        empresaConfig={empresaConfig}
        onRestoreTicket={handleRestoreTicket}
        onDeleteTicket={(id) => setParkedTickets(parkedTickets.filter((p) => p.id !== id))}
      />

      {/* [F4] Quantity Multiplier Prompt Modal */}
      {showQuantityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white font-mono uppercase">
                [F4] Multiplicar Cantidad
              </h3>
              <button onClick={() => setShowQuantityModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Ingresa la cantidad a facturar para el próximo artículo a escanear:
            </p>
            <input
              type="number"
              min="1"
              max="999"
              step="1"
              value={quantityInput}
              onChange={(e) => setQuantityInput(e.target.value)}
              className="w-full bg-slate-950 border-2 border-emerald-500 text-center font-mono font-black text-2xl text-emerald-400 py-2 rounded-xl focus:outline-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const q = Math.max(1, parseInt(quantityInput, 10) || 1);
                  setPendingMultiplier(q);
                  setShowQuantityModal(false);
                  barcodeInputRef.current?.focus();
                  setSuccessMsg(`Multiplicador fijado: ${q}x para el próximo producto.`);
                  setTimeout(() => setSuccessMsg(null), 3000);
                }}
                className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl cursor-pointer"
              >
                Aceptar
              </button>
              <button
                type="button"
                onClick={() => setShowQuantityModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* [F5] Balanza / Scale Weight Prompt Modal */}
      {showScaleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white font-mono uppercase flex items-center gap-2">
                <Scale className="w-4 h-4 text-cyan-400" />
                <span>[F5] Balanza Electrónica / Peso</span>
              </h3>
              <button onClick={() => setShowScaleModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Lectura de peso o fracción a granel (Kilogramos / Litros):
            </p>
            <div className="relative">
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={scaleWeightInput}
                onChange={(e) => setScaleWeightInput(e.target.value)}
                className="w-full bg-slate-950 border-2 border-cyan-500 text-center font-mono font-black text-2xl text-cyan-400 py-2 rounded-xl focus:outline-none"
                autoFocus
              />
              <span className="absolute right-3 top-3 text-slate-500 font-mono text-sm font-bold">KG</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const w = parseFloat(scaleWeightInput) || 1.0;
                  setShowScaleModal(false);
                  // Apply to currently selected row if any
                  if (selectedRowIndex >= 0 && cart[selectedRowIndex]) {
                    setCart(
                      cart.map((it, idx) =>
                        idx === selectedRowIndex
                          ? {
                              ...it,
                              cantidad: +w.toFixed(3),
                              subtotalBs: +(w * it.precioUnitarioBs).toFixed(2),
                            }
                          : it
                      )
                    );
                  }
                  setSuccessMsg(`Peso fijado: ${w.toFixed(3)} KG`);
                  setTimeout(() => setSuccessMsg(null), 3000);
                }}
                className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl cursor-pointer"
              >
                Aplicar Peso
              </button>
              <button
                type="button"
                onClick={() => setShowScaleModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* [F3] Credit Limit Inspection & Quick Assignment Modal */}
      {showCreditLimitModal && (() => {
        const registeredClient = selectedCliente.id
          ? clientes.find((c) => c.id === selectedCliente.id)
          : undefined;
        const canEditCreditLimit = Boolean(
          onUpdateCliente &&
            (!currentUser ||
              currentUser.rol === 'admin' ||
              currentUser.rol === 'supervisor' ||
              currentUser.permisos?.clientes)
        );
        const limite = Number(registeredClient?.limiteCredito || 0);
        const saldo = Number(registeredClient?.saldoPendiente || 0);
        const disponible = Math.max(0, +(limite - saldo).toFixed(2));
        const parsedInput = parseFloat(creditLimitInput);
        const previewLimit = Number.isFinite(parsedInput) && parsedInput >= 0 ? parsedInput : 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans">
            <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-white text-sm font-mono uppercase">
                    [F3] Límite de Crédito
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreditLimitModal(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!registeredClient ? (
                <div className="space-y-4">
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs space-y-1.5">
                    <div className="text-slate-400 uppercase text-[10px] font-bold">
                      Cliente Actual en Caja
                    </div>
                    <div className="text-white font-bold text-sm">{selectedCliente.nombre}</div>
                    <div className="text-slate-400 font-mono">{selectedCliente.rif}</div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 leading-relaxed">
                    El cliente de mostrador (<strong>CLIENTE CONTADO</strong>) no posee línea de crédito asignada. Selecciona o registra un cliente del directorio para consultar o asignar un límite de crédito sin perder tu venta actual.
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreditLimitModal(false);
                        setShowClientModal(true);
                      }}
                      className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-4 h-4" />
                      <span>Seleccionar Cliente [F12]</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreditLimitModal(false)}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-white text-sm truncate">
                        {registeredClient.nombre}
                      </div>
                      <div className="text-[11px] text-indigo-400 font-mono">
                        {registeredClient.rif_cedula}
                        {registeredClient.telefono ? ` • ${registeredClient.telefono}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreditLimitModal(false);
                        setShowClientModal(true);
                      }}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer"
                    >
                      Cambiar [F12]
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center font-mono">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 uppercase block font-sans">
                        Límite
                      </span>
                      <span className="text-sm font-black text-white block mt-0.5">
                        {formatUSD(limite)}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {formatBs(limite * tasa, 1)}
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 uppercase block font-sans">
                        Deuda Actual
                      </span>
                      <span
                        className={`text-sm font-black block mt-0.5 ${
                          saldo > 0 ? 'text-amber-400' : 'text-slate-300'
                        }`}
                      >
                        {formatUSD(saldo)}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {formatBs(saldo * tasa, 1)}
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 uppercase block font-sans">
                        Disponible
                      </span>
                      <span
                        className={`text-sm font-black block mt-0.5 ${
                          disponible > 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatUSD(disponible)}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {formatBs(disponible * tasa, 1)}
                      </span>
                    </div>
                  </div>

                  {totalUsd > 0 && (
                    <div
                      className={`rounded-xl p-2.5 border text-xs flex items-start gap-2 ${
                        limite <= 0
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                          : totalUsd > disponible
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      }`}
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        {limite <= 0 ? (
                          <span>
                            Este cliente no tiene límite de crédito asignado. Ticket actual:{' '}
                            <strong>{formatUSD(totalUsd)}</strong> ({formatBs(totalBs, 1)}).
                          </span>
                        ) : totalUsd > disponible ? (
                          <span>
                            El ticket actual (<strong>{formatUSD(totalUsd)}</strong>) supera el crédito disponible por{' '}
                            <strong>{formatUSD(totalUsd - disponible)}</strong>.
                          </span>
                        ) : (
                          <span>
                            Crédito disponible suficiente para cubrir el ticket actual (
                            <strong>{formatUSD(totalUsd)}</strong>).
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {creditModalNotice && (
                    <div
                      className={`rounded-xl p-2.5 border text-xs flex items-center gap-2 ${
                        creditModalNotice.type === 'success'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                          : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                      }`}
                    >
                      {creditModalNotice.type === 'success' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>{creditModalNotice.text}</span>
                    </div>
                  )}

                  {canEditCreditLimit ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const val = parseFloat(creditLimitInput);
                        if (!Number.isFinite(val) || val < 0) {
                          setCreditModalNotice({
                            type: 'error',
                            text: 'Ingresa un monto válido mayor o igual a $0.00.',
                          });
                          return;
                        }
                        const rounded = +val.toFixed(2);
                        onUpdateCliente?.({
                          ...registeredClient,
                          limiteCredito: rounded,
                        });
                        setCreditModalNotice({
                          type: 'success',
                          text: `Límite actualizado a ${formatUSD(rounded)} para ${registeredClient.nombre}.`,
                        });
                      }}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <label className="text-slate-300 font-bold">
                          Asignar / Modificar Límite (USD)
                        </label>
                        <span className="text-[11px] text-slate-400 font-mono">
                          ≈ {formatBs(previewLimit * tasa, 1)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={creditLimitInput}
                          onChange={(e) => {
                            setCreditLimitInput(e.target.value);
                            if (creditModalNotice) setCreditModalNotice(null);
                          }}
                          className="flex-1 bg-slate-900 border border-emerald-500/60 text-white font-mono font-bold text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-400"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl cursor-pointer shrink-0"
                        >
                          Guardar Límite
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs text-slate-400">
                      Tu usuario no tiene permisos para modificar límites de crédito. Puedes ir al módulo de Clientes con un perfil autorizado sin perder tu venta actual.
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowCreditLimitModal(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Cerrar (Esc)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* [F12] Client Directory & Selection Modal */}
      {showClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-base font-mono">
                  [F12] Directorio de Clientes
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowClientModal(false);
                  setShowQuickNewClient(false);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!showQuickNewClient ? (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Buscar por Nombre, Cédula o RIF..."
                    className="w-full bg-slate-950 border border-slate-700 pl-9 pr-4 py-2 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                    autoFocus
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-slate-950/60 custom-scrollbar">
                  {/* Option: Cliente Contado */}
                  <div
                    onClick={() => {
                      setSelectedCliente(DEFAULT_CLIENTE);
                      setShowClientModal(false);
                    }}
                    className="p-2.5 hover:bg-slate-800/60 cursor-pointer flex justify-between items-center transition-colors"
                  >
                    <div>
                      <span className="font-bold text-white text-xs block">CLIENTE CONTADO</span>
                      <span className="text-[11px] text-slate-400 font-mono">V-00000000 • Mostrador</span>
                    </div>
                    <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                      Por Defecto
                    </span>
                  </div>

                  {clientes
                    .filter(
                      (c) =>
                        matchesNormalizedSearch(c.nombre, clientSearch) ||
                        normalizeSearchText(c.rif_cedula).includes(normalizeSearchText(clientSearch))
                    )
                    .map((cl) => (
                      <div
                        key={cl.id}
                        onClick={() => {
                          setSelectedCliente({
                            id: cl.id,
                            nombre: cl.nombre,
                            rif: cl.rif_cedula,
                            direccion: cl.direccion,
                            telefono: cl.telefono,
                          });
                          setShowClientModal(false);
                        }}
                        className="p-2.5 hover:bg-slate-800/60 cursor-pointer flex justify-between items-center transition-colors"
                      >
                        <div>
                          <span className="font-bold text-white text-xs block">{cl.nombre}</span>
                          <span className="text-[11px] text-indigo-400 font-mono">
                            {cl.rif_cedula} {cl.telefono && `• ${cl.telefono}`}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">Seleccionar</span>
                      </div>
                    ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowQuickNewClient(true)}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>+ Registrar Nuevo Cliente</span>
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newClientData.nombre.trim() || !newClientData.rif_cedula.trim()) return;
                  const created = onAddCliente
                    ? onAddCliente({
                        nombre: newClientData.nombre.trim(),
                        rif_cedula: newClientData.rif_cedula.trim(),
                        telefono: newClientData.telefono.trim() || '+58 000-0000000',
                        direccion: newClientData.direccion.trim() || 'Mostrador',
                        limiteCredito: 0,
                      })
                    : undefined;
                  setSelectedCliente({
                    id: created && typeof created === 'object' ? created.id : null,
                    nombre: newClientData.nombre.trim(),
                    rif: newClientData.rif_cedula.trim(),
                    direccion: newClientData.direccion.trim(),
                    telefono: newClientData.telefono.trim(),
                  });
                  setNewClientData({
                    nombre: '',
                    rif_cedula: '',
                    telefono: '',
                    email: '',
                    direccion: '',
                    limiteCredito: 0,
                  });
                  setFastCedulaInput('');
                  setShowQuickNewClient(false);
                  setShowClientModal(false);
                }}
                className="space-y-3 text-xs"
              >
                <div>
                  <label className="text-slate-300 font-bold block mb-1">Nombre o Razón Social *</label>
                  <input
                    type="text"
                    required
                    value={newClientData.nombre}
                    onChange={(e) => setNewClientData({ ...newClientData, nombre: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-300 font-bold block mb-1">Cédula / RIF *</label>
                    <input
                      type="text"
                      required
                      value={newClientData.rif_cedula}
                      onChange={(e) => setNewClientData({ ...newClientData, rif_cedula: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 text-white font-mono px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 font-bold block mb-1">Teléfono</label>
                    <input
                      type="text"
                      value={newClientData.telefono}
                      onChange={(e) => setNewClientData({ ...newClientData, telefono: e.target.value })}
                      placeholder="+58 412 1234567"
                      className="w-full bg-slate-950 border border-slate-700 text-white font-mono px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-slate-300 font-bold block mb-1">Dirección</label>
                  <input
                    type="text"
                    value={newClientData.direccion}
                    onChange={(e) => setNewClientData({ ...newClientData, direccion: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-white px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Guardar y Asignar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQuickNewClient(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    Volver
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Fiscal Cortes Modal (X / Z) */}
      {showFiscalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl max-w-4xl w-full p-5 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="font-bold text-white text-base font-mono uppercase">
                Módulo de Cortes Fiscales y Cierre de Caja
              </h3>
              <button onClick={() => setShowFiscalModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <FiscalCortesView
              tipoInicial={fiscalModalTipo}
              ventas={ventas}
              empresaConfig={empresaConfig}
              currentUser={currentUser}
              sucursalNombre={tiendaActual.nombre}
            />
          </div>
        </div>
      )}

      {/* Ticket / Invoice Receipt Modal Preview */}
      {showReceiptModal && lastCompletedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-sm animate-fade-in font-sans no-print">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-3.5 text-slate-100">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
              <h3 className="font-bold text-white text-sm font-mono flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <span>Ticket Fiscal Emitido #{lastCompletedTicket.numeroFactura}</span>
              </h3>
              <button onClick={() => setShowReceiptModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Paper Roll Width Selector (58mm vs 80mm) */}
            <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs">
              <span className="text-slate-300 font-semibold">Ancho de Papel Térmico:</span>
              <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-700">
                <button
                  type="button"
                  onClick={() => handleChangePaperWidth('58mm')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    ticketPaperWidth === '58mm'
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  58 mm (Mini)
                </button>
                <button
                  type="button"
                  onClick={() => handleChangePaperWidth('80mm')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    ticketPaperWidth === '80mm'
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  80 mm (Estándar)
                </button>
              </div>
            </div>

            {/* Thermal Receipt Paper representation (calibrated visually to 58mm or 80mm) */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 max-h-[58vh] overflow-y-auto custom-scrollbar flex justify-center">
              <div
                className={`bg-white text-black p-3.5 rounded-lg font-sans space-y-1.5 shadow-inner tabular-nums w-full transition-all font-normal ${
                  ticketPaperWidth === '58mm' ? 'max-w-[235px] text-[9.5px]' : 'max-w-[330px] text-[10.5px]'
                }`}
              >
                <div className="text-center">
                  <div className="text-[11.5px] font-bold uppercase leading-tight">
                    {empresaConfig.nombreEmpresa}
                  </div>
                  <div className="text-[9.5px] font-bold">RIF: {empresaConfig.rif}</div>
                  {(empresaConfig.direccionFiscal || (empresaConfig as any).direccion) && (
                    <div className="text-[8.8px] font-normal text-black leading-snug mt-0.5">
                      {empresaConfig.direccionFiscal || (empresaConfig as any).direccion}
                    </div>
                  )}
                  {empresaConfig.telefono && (
                    <div className="text-[8.8px] font-normal text-black">
                      TELF: {empresaConfig.telefono}
                    </div>
                  )}
                  <div className="text-[9px] font-bold text-black mt-1">
                    SUCURSAL: {lastCompletedTicket.sucursalNombre}
                  </div>
                  <div className="text-[10px] border border-black text-black px-2 py-0.5 inline-block mt-1 font-bold">
                    FACTURA FISCAL: #{lastCompletedTicket.numeroFactura}
                  </div>
                </div>

                <div className="border-t border-dashed border-black my-1.5" />

                <div className="text-[9px] font-normal space-y-0.5 leading-tight text-black">
                  <div><strong className="font-bold">FECHA:</strong> {lastCompletedTicket.fecha}</div>
                  <div><strong className="font-bold">CLIENTE:</strong> {lastCompletedTicket.clienteNombre}</div>
                  <div><strong className="font-bold">RIF/CÉDULA:</strong> {lastCompletedTicket.clienteRif}</div>
                  {lastCompletedTicket.cajeroNombre && (
                    <div><strong className="font-bold">CAJERO:</strong> {lastCompletedTicket.cajeroNombre}</div>
                  )}
                </div>

                <div className="border-t border-dashed border-black my-1.5" />

                <div className="flex justify-between text-[9px] font-bold uppercase border-b border-black pb-0.5">
                  <span>CANT / DESCRIPCIÓN</span>
                  <span>TOTAL</span>
                </div>

                <div className="space-y-1">
                  {lastCompletedTicket.items.map((it, idx) => (
                    <div key={idx} className="border-b border-dashed border-black pb-1 last:border-b-0 last:pb-0">
                      <div className="flex justify-between items-start gap-1.5 text-[9.5px] leading-tight">
                        <span className="flex-1 min-w-0 font-normal break-words">
                          {it.cantidad}x {it.producto.nombre}
                        </span>
                        <span className="shrink-0 whitespace-nowrap font-bold text-right">
                          ${(it.producto.precio * it.cantidad).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between flex-wrap gap-x-1.5 text-[8.3px] text-black font-normal mt-0.5">
                        <span>${it.producto.precio.toFixed(2)} c/u</span>
                        <span className="whitespace-nowrap">
                          Bs.{(it.producto.precio * it.cantidad * lastCompletedTicket.tasa).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-dashed border-black my-1.5" />

                <div className="space-y-0.5 font-normal text-[9.5px] text-black">
                  <div className="flex justify-between gap-2">
                    <span className="whitespace-nowrap">SUBTOTAL:</span>
                    <span className="whitespace-nowrap">${lastCompletedTicket.subtotalNeto.toFixed(2)}</span>
                  </div>
                  {lastCompletedTicket.montoExento > 0 && (
                    <div className="flex justify-between gap-2">
                      <span className="whitespace-nowrap">EXENTO (E 0%):</span>
                      <span className="whitespace-nowrap">${lastCompletedTicket.montoExento.toFixed(2)}</span>
                    </div>
                  )}
                  {lastCompletedTicket.baseImponible > 0 && (
                    <div className="flex justify-between gap-2">
                      <span className="whitespace-nowrap">BASE IMP. (G 16%):</span>
                      <span className="whitespace-nowrap">${lastCompletedTicket.baseImponible.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="whitespace-nowrap">IVA (16%):</span>
                    <span className="whitespace-nowrap">+${lastCompletedTicket.montoIva.toFixed(2)}</span>
                  </div>

                  <div className="border-t border-black pt-1 mt-1 space-y-0.5">
                    <div className="flex justify-between items-baseline gap-1 text-[11px] font-bold">
                      <span className="whitespace-nowrap">TOTAL USD:</span>
                      <span className="whitespace-nowrap">${lastCompletedTicket.totalUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-baseline gap-1 text-[11px] font-bold">
                      <span className="whitespace-nowrap">TOTAL BS:</span>
                      <span className="whitespace-nowrap">
                        Bs. {(lastCompletedTicket.totalUsd * lastCompletedTicket.tasa).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-right text-[8.5px] font-normal text-black">
                      Tasa BCV: Bs. {lastCompletedTicket.tasa.toFixed(2)} / USD
                    </div>
                  </div>
                </div>

                {/* Barcode of Invoice */}
                <div className="border-t border-dashed border-black pt-2 pb-1 text-center">
                  <div className="text-[9px] uppercase font-bold text-black mb-1">
                    VALIDACIÓN DE FACTURA
                  </div>
                  <div className="bg-white p-0.5 flex justify-center">
                    <BarcodeSvg
                      value={`FAC-${lastCompletedTicket.numeroFactura}-${lastCompletedTicket.clienteRif.replace(/[^A-Za-z0-9]/g, '')}`}
                      height={34}
                      showText={true}
                      color="#000000"
                      className="w-full max-w-[200px] mx-auto"
                    />
                  </div>
                  <div className="text-[9px] font-bold text-black mt-1">
                    *** GRACIAS POR SU COMPRA ***
                  </div>
                  <div className="text-[8.2px] font-normal text-black mt-0.5">
                    {empresaConfig.piePaginaTicket || 'Conserve este ticket para devoluciones o reclamos'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handlePrintTicket}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all"
                title={`Imprime en formato ${ticketPaperWidth} con alto contraste térmico`}
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Ticket ({ticketPaperWidth})</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
                title="Impresión alternativa con el diálogo estándar del navegador"
              >
                <span>Navegador</span>
              </button>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Native Browser Print Isolation & Layout for Sales Ticket (when clicking "Navegador") */}
      {showReceiptModal && lastCompletedTicket && (
        <>
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #printable-ticket-area, #printable-ticket-area * {
                visibility: visible !important;
                color: #000000 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              #printable-ticket-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: ${ticketPaperWidth === '58mm' ? '47mm' : '71mm'} !important;
                max-width: 100% !important;
                margin: 0 auto !important;
                padding: 1mm 0.5mm 7mm 0.5mm !important;
                background: #ffffff !important;
                font-family: 'Segoe UI', 'Calibri', 'Tahoma', Arial, Helvetica, sans-serif !important;
                font-variant-numeric: tabular-nums !important;
                font-weight: 400 !important;
              }
              @page {
                size: ${ticketPaperWidth} auto;
                margin: 1mm 1mm;
              }
            }
          `}</style>
          <div id="printable-ticket-area" className="hidden print:block text-black bg-white font-sans font-normal tabular-nums">
            <div className="text-center">
              <div className="text-[11.5px] font-bold uppercase leading-tight">{empresaConfig.nombreEmpresa}</div>
              <div className="text-[9.5px] font-bold">RIF: {empresaConfig.rif}</div>
              {(empresaConfig.direccionFiscal || (empresaConfig as any).direccion) && (
                <div className="text-[8.8px] font-normal">{empresaConfig.direccionFiscal || (empresaConfig as any).direccion}</div>
              )}
              {empresaConfig.telefono && (
                <div className="text-[8.8px] font-normal">TELF: {empresaConfig.telefono}</div>
              )}
              <div className="text-[9px] font-bold mt-1">SUCURSAL: {lastCompletedTicket.sucursalNombre}</div>
              <div className="text-[10px] mt-1 font-bold border border-black px-1.5 py-0.5 inline-block">
                FACTURA FISCAL: #{lastCompletedTicket.numeroFactura}
              </div>
            </div>

            <div className="border-t border-dashed border-black my-1.5" />

            <div className="text-[9px] font-normal space-y-0.5 leading-tight">
              <div><strong className="font-bold">FECHA:</strong> {lastCompletedTicket.fecha}</div>
              <div><strong className="font-bold">CLIENTE:</strong> {lastCompletedTicket.clienteNombre}</div>
              <div><strong className="font-bold">RIF/CÉDULA:</strong> {lastCompletedTicket.clienteRif}</div>
              {lastCompletedTicket.cajeroNombre && <div><strong className="font-bold">CAJERO:</strong> {lastCompletedTicket.cajeroNombre}</div>}
            </div>

            <div className="border-t border-dashed border-black my-1.5" />

            <div className="text-[9px] font-bold flex justify-between uppercase border-b border-black pb-0.5 mb-1">
              <span>CANT / DESCRIPCIÓN</span>
              <span>TOTAL</span>
            </div>

            <div className="space-y-1 mb-1.5">
              {lastCompletedTicket.items.map((it, idx) => (
                <div key={idx} className="border-b border-dashed border-black pb-1 last:border-b-0">
                  <div className="flex justify-between items-start gap-1.5 font-normal text-[9.5px] leading-tight">
                    <span className="flex-1 min-w-0 break-words">{it.cantidad}x {it.producto.nombre}</span>
                    <span className="shrink-0 whitespace-nowrap font-bold">${(it.producto.precio * it.cantidad).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between flex-wrap gap-x-1 text-[8.3px] font-normal">
                    <span>${it.producto.precio.toFixed(2)} c/u</span>
                    <span className="whitespace-nowrap">Bs.{(it.producto.precio * it.cantidad * lastCompletedTicket.tasa).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-black my-1.5" />

            <div className="space-y-0.5 font-normal text-[9.5px]">
              <div className="flex justify-between gap-2">
                <span className="whitespace-nowrap">SUBTOTAL:</span>
                <span className="whitespace-nowrap">${lastCompletedTicket.subtotalNeto.toFixed(2)}</span>
              </div>
              {lastCompletedTicket.montoExento > 0 && (
                <div className="flex justify-between gap-2">
                  <span className="whitespace-nowrap">EXENTO (E 0%):</span>
                  <span className="whitespace-nowrap">${lastCompletedTicket.montoExento.toFixed(2)}</span>
                </div>
              )}
              {lastCompletedTicket.baseImponible > 0 && (
                <div className="flex justify-between gap-2">
                  <span className="whitespace-nowrap">BASE IMP. (G 16%):</span>
                  <span className="whitespace-nowrap">${lastCompletedTicket.baseImponible.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="whitespace-nowrap">IVA (16%):</span>
                <span className="whitespace-nowrap">+${lastCompletedTicket.montoIva.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline gap-1 text-[11px] font-bold pt-1 border-t border-black">
                <span className="whitespace-nowrap">TOTAL USD:</span>
                <span className="whitespace-nowrap">${lastCompletedTicket.totalUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline gap-1 text-[11px] font-bold">
                <span className="whitespace-nowrap">TOTAL BS:</span>
                <span className="whitespace-nowrap">Bs. {(lastCompletedTicket.totalUsd * lastCompletedTicket.tasa).toFixed(2)}</span>
              </div>
              <div className="text-right text-[8.5px] font-normal">
                Tasa BCV: Bs. {lastCompletedTicket.tasa.toFixed(2)} / USD
              </div>
            </div>

            <div className="border-t border-dashed border-black my-1.5" />

            <div className="text-center pt-1">
              <div className="text-[9px] uppercase font-bold mb-1">
                VALIDACIÓN DE FACTURA
              </div>
              <BarcodeSvg
                value={`FAC-${lastCompletedTicket.numeroFactura}-${lastCompletedTicket.clienteRif.replace(/[^A-Za-z0-9]/g, '')}`}
                height={34}
                showText={true}
                color="#000000"
                className="w-full max-w-[44mm] mx-auto"
              />
              <div className="text-[9px] font-bold mt-1">
                *** GRACIAS POR SU COMPRA ***
              </div>
              <div className="text-[8.2px] font-normal">
                {empresaConfig.piePaginaTicket || 'Conserve este ticket para devoluciones o reclamos'}
              </div>
            </div>
          </div>
        </>
      )}


      {/* Price Tags & Shelf Labels Modal */}
      <PriceTagsPrintModal
        isOpen={showPriceTagsModal}
        onClose={() => setShowPriceTagsModal(false)}
        productos={productos}
        empresaConfig={empresaConfig}
      />

    </div>
  );
};
