import React, { useState, useRef, useEffect } from 'react';
import {
  ShoppingBag,
  Plus,
  Truck,
  Building2,
  Calendar,
  DollarSign,
  PackageCheck,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  FileText,
  Search,
  Barcode,
  Scale,
  Trash2,
  Eye,
  X,
  PlusCircle,
  Tag,
  ArrowRight,
  Hash,
  GripHorizontal,
  Sparkles,
  FileUp,
  Percent,
  RotateCcw,
  Edit3,
  Printer,
} from 'lucide-react';
import { Compra, Proveedor, Producto, Sucursal, EmpresaConfig, Usuario, DetalleCompra } from '../types';
import { formatUSD, formatBs, formatDual } from '../lib/currency';
import { printCompraViaIframe } from '../lib/ticketPrinter';
import { CargarFacturaModal } from './CargarFacturaModal';
import { WholesalePackConverter } from './WholesalePackConverter';

interface ComprasManagerProps {
  compras: Compra[];
  proveedores: Proveedor[];
  productos: Producto[];
  sucursales: Sucursal[];
  empresaConfig: EmpresaConfig;
  currentUser: Usuario | null;
  onRegistrarCompra: (compra: Omit<Compra, 'id'>, newProducts?: Producto[]) => void;
  onAddProveedor?: (nuevoProv: Omit<Proveedor, 'id'>) => Proveedor | void;
}

export const ComprasManager: React.FC<ComprasManagerProps> = ({
  compras,
  proveedores,
  productos,
  sucursales,
  empresaConfig,
  currentUser,
  onRegistrarCompra,
  onAddProveedor,
}) => {
  const [showNewModal, setShowNewModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [selectedCompraDetail, setSelectedCompraDetail] = useState<Compra | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Draggable Modal State
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [isDraggingModal, setIsDraggingModal] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    setIsDraggingModal(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: modalPos.x,
      initialY: modalPos.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingModal) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      setModalPos({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy,
      });
    };
    const handleMouseUp = () => {
      if (isDraggingModal) setIsDraggingModal(false);
    };
    if (isDraggingModal) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingModal]);

  // New Purchase Invoice Form State
  const [proveedorId, setProveedorId] = useState<number>(proveedores[0]?.id || 1);
  const [extraProveedor, setExtraProveedor] = useState<Proveedor | null>(null);
  const [rifSearchInput, setRifSearchInput] = useState<string>(proveedores[0]?.rif || '');
  const [rifFeedback, setRifFeedback] = useState<{
    type: 'success' | 'info' | 'not_found';
    text: string;
  } | null>(null);
  const [showQuickNewProveedor, setShowQuickNewProveedor] = useState(false);
  const [newProvForm, setNewProvForm] = useState({
    nombre: '',
    rif: '',
    contacto: '',
    telefono: '',
    direccion: '',
  });

  const [sucursalDestinoId, setSucursalDestinoId] = useState<number>(3); // Default to Central Warehouse/Store
  const [numeroFactura, setNumeroFactura] = useState('');
  const [numeroControl, setNumeroControl] = useState('');
  const [fechaFactura, setFechaFactura] = useState(new Date().toISOString().split('T')[0]);
  const [diasCredito, setDiasCredito] = useState<number>(7);
  const [fechaVencimiento, setFechaVencimiento] = useState(
    new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [condicionPago, setCondicionPago] = useState<'credito' | 'contado'>('credito');
  const [tasaRecepcionInput, setTasaRecepcionInput] = useState<string>(
    String(empresaConfig.tasaCambio || 1)
  );
  const [pagarATasaRecepcion, setPagarATasaRecepcion] = useState<boolean>(false);

  const tasaRecepcionNum =
    parseFloat(tasaRecepcionInput) > 0 ? parseFloat(tasaRecepcionInput) : empresaConfig.tasaCambio;

  // Invoiced line items
  const [itemsCompra, setItemsCompra] = useState<DetalleCompra[]>([]);
  const [newlyCreatedProducts, setNewlyCreatedProducts] = useState<Producto[]>([]);

  // Item input row state
  const [selectedProdId, setSelectedProdId] = useState<number | 'new'>('new');
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [productNameInput, setProductNameInput] = useState<string>('');
  const [unidadMedidaInput, setUnidadMedidaInput] = useState<'UND' | 'KG' | 'L' | 'PQ' | string>('UND');
  const [cantidadInput, setCantidadInput] = useState<string>('1');
  const [costoInput, setCostoInput] = useState<string>('1.00');
  const [costoBsInput, setCostoBsInput] = useState<string>(() =>
    (1 * (empresaConfig.tasaCambio || 1)).toFixed(2)
  );
  const [margenPctInput, setMargenPctInput] = useState<string>('30');
  const [pvpInput, setPvpInput] = useState<string>('1.30');
  const [pvpBsInput, setPvpBsInput] = useState<string>(() =>
    (1.3 * (empresaConfig.tasaCambio || 1)).toFixed(2)
  );
  const [pvpManualOverride, setPvpManualOverride] = useState<boolean>(false);
  const [itemExentoInput, setItemExentoInput] = useState<boolean>(false);
  const [editingCell, setEditingCell] = useState<{
    idx: number;
    field: 'costUsd' | 'costBs' | 'pvpUsd' | 'pvpBs' | 'qty';
    raw: string;
  } | null>(null);
  const [showDescSuggestions, setShowDescSuggestions] = useState<boolean>(false);
  const [descHighlightIndex, setDescHighlightIndex] = useState<number>(0);
  const [showRifSuggestions, setShowRifSuggestions] = useState<boolean>(false);
  const [rifHighlightIndex, setRifHighlightIndex] = useState<number>(0);

  const barcodeFieldRef = useRef<HTMLInputElement | null>(null);
  const descBoxRef = useRef<HTMLDivElement | null>(null);
  const rifBoxRef = useRef<HTMLDivElement | null>(null);

  const allProveedores = React.useMemo(
    () =>
      extraProveedor && !proveedores.some((p) => p.id === extraProveedor.id)
        ? [...proveedores, extraProveedor]
        : proveedores,
    [proveedores, extraProveedor]
  );

  const rifSuggestions = React.useMemo(() => {
    const raw = rifSearchInput.trim().toUpperCase();
    const cleanVal = raw.replace(/[^A-Z0-9]/g, '');
    if (!cleanVal) return [];
    return allProveedores.filter((p) => {
      const rawRif = (p.rif || '').toUpperCase();
      const cleanRif = rawRif.replace(/[^A-Z0-9]/g, '');
      return cleanRif.includes(cleanVal) || rawRif.includes(raw);
    });
  }, [allProveedores, rifSearchInput]);

  const allCatalogProducts = React.useMemo(() => {
    const merged = [...productos];
    newlyCreatedProducts.forEach((np) => {
      if (!merged.some((p) => p.id === np.id || (p.codigo_barras && p.codigo_barras === np.codigo_barras))) {
        merged.push(np);
      }
    });
    return merged;
  }, [productos, newlyCreatedProducts]);

  const descSuggestions = React.useMemo(() => {
    const q = productNameInput.trim().toLowerCase();
    if (!q) return [];
    return allCatalogProducts
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          (p.codigo_barras || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [allCatalogProducts, productNameInput]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (descBoxRef.current && !descBoxRef.current.contains(e.target as Node)) {
        setShowDescSuggestions(false);
      }
      if (rifBoxRef.current && !rifBoxRef.current.contains(e.target as Node)) {
        setShowRifSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
    const costUsd = parseFloat(costoInput);
    if (!isNaN(costUsd) && costUsd >= 0) {
      setCostoBsInput((costUsd * rate).toFixed(2));
    }
    const pvpUsd = parseFloat(pvpInput);
    if (!isNaN(pvpUsd) && pvpUsd >= 0) {
      setPvpBsInput((pvpUsd * rate).toFixed(2));
    }
  }, [tasaRecepcionNum]);

  const computeAutoPvpFromCostAndMargin = (
    costUsdVal: number,
    marginVal: number,
    rate: number
  ) => {
    const safeCost = Math.max(0, costUsdVal);
    const safeMargin = isNaN(marginVal) ? 30 : Math.max(0, marginVal);
    const autoPvpUsd = +(safeCost * (1 + safeMargin / 100)).toFixed(2);
    const autoPvpBs = +(autoPvpUsd * rate).toFixed(2);
    setPvpInput(autoPvpUsd > 0 ? autoPvpUsd.toFixed(2) : '0.00');
    setPvpBsInput(autoPvpBs > 0 ? autoPvpBs.toFixed(2) : '0.00');
  };

  const handleEntryCostoUsdChange = (val: string) => {
    setCostoInput(val);
    const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
    const costUsd = parseFloat(val);
    if (!isNaN(costUsd) && costUsd >= 0) {
      setCostoBsInput((costUsd * rate).toFixed(2));
      if (!pvpManualOverride) {
        const margin = parseFloat(margenPctInput);
        computeAutoPvpFromCostAndMargin(costUsd, isNaN(margin) ? 30 : margin, rate);
      } else {
        const curPvp = parseFloat(pvpInput);
        if (costUsd > 0 && !isNaN(curPvp)) {
          setMargenPctInput((((curPvp - costUsd) / costUsd) * 100).toFixed(1));
        }
      }
    } else {
      setCostoBsInput('');
    }
  };

  const handleEntryCostoBsChange = (val: string) => {
    setCostoBsInput(val);
    const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
    const costBs = parseFloat(val);
    if (!isNaN(costBs) && costBs >= 0) {
      const costUsd = +(costBs / rate).toFixed(4);
      setCostoInput(String(costUsd));
      if (!pvpManualOverride) {
        const margin = parseFloat(margenPctInput);
        computeAutoPvpFromCostAndMargin(costUsd, isNaN(margin) ? 30 : margin, rate);
      } else {
        const curPvp = parseFloat(pvpInput);
        if (costUsd > 0 && !isNaN(curPvp)) {
          setMargenPctInput((((curPvp - costUsd) / costUsd) * 100).toFixed(1));
        }
      }
    } else {
      setCostoInput('');
    }
  };

  const handleEntryMargenChange = (val: string) => {
    setMargenPctInput(val);
    setPvpManualOverride(false);
    const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
    const costUsd = parseFloat(costoInput);
    const margin = parseFloat(val);
    if (!isNaN(costUsd) && costUsd > 0 && !isNaN(margin)) {
      computeAutoPvpFromCostAndMargin(costUsd, margin, rate);
    }
  };

  const handleEntryPvpUsdChange = (val: string) => {
    setPvpInput(val);
    setPvpManualOverride(true);
    const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
    const pvpUsd = parseFloat(val);
    if (!isNaN(pvpUsd) && pvpUsd >= 0) {
      setPvpBsInput((pvpUsd * rate).toFixed(2));
      const costUsd = parseFloat(costoInput);
      if (!isNaN(costUsd) && costUsd > 0) {
        setMargenPctInput((((pvpUsd - costUsd) / costUsd) * 100).toFixed(1));
      }
    } else {
      setPvpBsInput('');
    }
  };

  const handleEntryPvpBsChange = (val: string) => {
    setPvpBsInput(val);
    setPvpManualOverride(true);
    const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
    const pvpBs = parseFloat(val);
    if (!isNaN(pvpBs) && pvpBs >= 0) {
      const pvpUsd = +(pvpBs / rate).toFixed(4);
      setPvpInput(String(pvpUsd));
      const costUsd = parseFloat(costoInput);
      if (!isNaN(costUsd) && costUsd > 0) {
        setMargenPctInput((((pvpUsd - costUsd) / costUsd) * 100).toFixed(1));
      }
    } else {
      setPvpInput('');
    }
  };

  const handleResetAutoPvp = () => {
    setPvpManualOverride(false);
    const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
    const costUsd = parseFloat(costoInput) || 0;
    const margin = parseFloat(margenPctInput);
    const safeMargin = !isNaN(margin) && margin >= 0 ? margin : 30;
    if (isNaN(margin) || margin < 0) setMargenPctInput('30');
    computeAutoPvpFromCostAndMargin(costUsd, safeMargin, rate);
  };

  const resetItemEntryFields = (customRate?: number) => {
    const rate = customRate && customRate > 0 ? customRate : (tasaRecepcionNum > 0 ? tasaRecepcionNum : 1);
    setSelectedProdId('new');
    setBarcodeInput('');
    setProductNameInput('');
    setUnidadMedidaInput('UND');
    setCantidadInput('1');
    setCostoInput('1.00');
    setCostoBsInput((1 * rate).toFixed(2));
    setMargenPctInput('30');
    setPvpInput('1.30');
    setPvpBsInput((1.3 * rate).toFixed(2));
    setPvpManualOverride(false);
    setItemExentoInput(false);
    setShowDescSuggestions(false);
  };

  const handleOpenNewModal = () => {
    const defaultProv = proveedores[0];
    if (defaultProv) {
      setProveedorId(defaultProv.id);
      setRifSearchInput(defaultProv.rif || '');
    } else {
      setRifSearchInput('');
    }
    setRifFeedback(null);
    setShowQuickNewProveedor(false);
    const rateHoy = empresaConfig.tasaCambio || 1;
    setTasaRecepcionInput(String(rateHoy));
    setPagarATasaRecepcion(false);
    setEditingCell(null);
    resetItemEntryFields(rateHoy);
    setModalPos({ x: 0, y: 0 });
    setShowNewModal(true);
  };

  const handleApplyParsedToManual = (data: {
    proveedorId: number;
    proveedorNombre: string;
    sucursalId: number;
    numeroFactura: string;
    numeroControl: string;
    fechaFactura: string;
    fechaVencimiento?: string;
    diasCredito?: number;
    condicionPago: 'credito' | 'contado';
    items: DetalleCompra[];
    newProducts: Producto[];
  }) => {
    setProveedorId(data.proveedorId);
    const matchedProv = proveedores.find((p) => p.id === data.proveedorId);
    setRifSearchInput(matchedProv?.rif || '');
    setRifFeedback(
      matchedProv ? { type: 'success', text: `✓ Proveedor: ${matchedProv.nombre}` } : null
    );
    setShowQuickNewProveedor(false);
    setSucursalDestinoId(data.sucursalId);
    setNumeroFactura(data.numeroFactura);
    setNumeroControl(data.numeroControl);
    setFechaFactura(data.fechaFactura);
    setCondicionPago(data.condicionPago);
    setTasaRecepcionInput(String(empresaConfig.tasaCambio || 1));
    setPagarATasaRecepcion(false);

    const days = data.diasCredito || 7;
    setDiasCredito(days);

    if (data.fechaVencimiento) {
      setFechaVencimiento(data.fechaVencimiento);
    } else if (data.fechaFactura) {
      const base = new Date(data.fechaFactura + 'T12:00:00Z');
      const vcto = new Date(base.getTime() + days * 24 * 3600 * 1000);
      setFechaVencimiento(vcto.toISOString().split('T')[0]);
    }

    setItemsCompra(data.items);
    setNewlyCreatedProducts(data.newProducts);
    resetItemEntryFields();
    setModalPos({ x: 0, y: 0 });
    setShowScanModal(false);
    setShowNewModal(true);
  };

  const selectMatchedProveedor = (prov: Proveedor) => {
    setProveedorId(prov.id);
    setRifSearchInput(prov.rif);
    setShowRifSuggestions(false);
    setShowQuickNewProveedor(false);
    setRifFeedback({ type: 'success', text: `✓ Proveedor seleccionado: ${prov.nombre}` });
  };

  // Fast RIF Search (partial sequence matching + POS-style exact/Enter lookup)
  const handleFastRifChange = (value: string) => {
    setRifSearchInput(value);
    const raw = value.trim().toUpperCase();
    const cleanVal = raw.replace(/[^A-Z0-9]/g, '');
    if (!cleanVal) {
      setRifFeedback(null);
      setShowRifSuggestions(false);
      return;
    }

    setRifHighlightIndex(0);

    const exactMatch = allProveedores.find((p) => {
      const cleanRif = (p.rif || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return cleanRif === cleanVal;
    });

    if (exactMatch) {
      setProveedorId(exactMatch.id);
      setShowQuickNewProveedor(false);
      setShowRifSuggestions(false);
      setRifFeedback({ type: 'success', text: `✓ Proveedor: ${exactMatch.nombre}` });
    } else {
      setShowRifSuggestions(true);
      setRifFeedback(null);
    }
  };

  const handleFastRifSearch = (customRif?: string) => {
    const raw = (customRif ?? rifSearchInput).trim();
    const rawUpper = raw.toUpperCase();
    const cleanVal = rawUpper.replace(/[^A-Z0-9]/g, '');
    if (!cleanVal) {
      setShowRifSuggestions(false);
      setRifFeedback({ type: 'info', text: 'Ingresa un RIF o parte de él (ej: 940) para buscar.' });
      return;
    }

    const exactOrSuffix = allProveedores.find((p) => {
      const cleanRif = (p.rif || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return cleanRif === cleanVal || cleanRif.endsWith(cleanVal);
    });

    const partialMatches = allProveedores.filter((p) => {
      const rawRif = (p.rif || '').toUpperCase();
      const cleanRif = rawRif.replace(/[^A-Z0-9]/g, '');
      return cleanRif.includes(cleanVal) || rawRif.includes(rawUpper);
    });

    if (exactOrSuffix && partialMatches.length <= 1) {
      selectMatchedProveedor(exactOrSuffix);
    } else if (partialMatches.length === 1) {
      selectMatchedProveedor(partialMatches[0]);
    } else if (partialMatches.length > 1) {
      setShowRifSuggestions(true);
      setShowQuickNewProveedor(false);
      setRifFeedback({
        type: 'info',
        text: `Se encontraron ${partialMatches.length} proveedores con "${rawUpper}". Selecciona uno de la lista.`,
      });
    } else {
      setShowRifSuggestions(false);
      setNewProvForm({
        nombre: '',
        rif: rawUpper,
        contacto: '',
        telefono: '',
        direccion: '',
      });
      setShowQuickNewProveedor(true);
      setRifFeedback({
        type: 'not_found',
        text: `RIF "${rawUpper}" no encontrado. Regístralo rápido aquí.`,
      });
    }
  };

  const handleQuickCreateProveedor = () => {
    const nombre = newProvForm.nombre.trim();
    const rif = newProvForm.rif.trim().toUpperCase();
    if (!nombre || !rif) {
      setRifFeedback({ type: 'not_found', text: 'Indica al menos RIF y Razón Social del proveedor.' });
      return;
    }

    const payload: Omit<Proveedor, 'id'> = {
      nombre,
      rif,
      contacto: newProvForm.contacto.trim() || 'Facturación',
      telefono: newProvForm.telefono.trim() || 'N/A',
      direccion: newProvForm.direccion.trim() || 'Venezuela',
      saldoPendiente: 0,
    };

    const result = onAddProveedor?.(payload);
    const createdProv: Proveedor = result || { ...payload, id: Date.now() };
    setExtraProveedor(createdProv);
    setProveedorId(createdProv.id);
    setRifSearchInput(createdProv.rif);
    setShowQuickNewProveedor(false);
    setRifFeedback({ type: 'success', text: `✓ Proveedor registrado: ${createdProv.nombre}` });
  };

  const handleSelectProviderDropdown = (id: number) => {
    setProveedorId(id);
    const allProvs =
      extraProveedor && !proveedores.some((p) => p.id === extraProveedor.id)
        ? [...proveedores, extraProveedor]
        : proveedores;
    const prov = allProvs.find((p) => p.id === id);
    if (prov) {
      setRifSearchInput(prov.rif);
      setShowQuickNewProveedor(false);
      setRifFeedback({ type: 'success', text: `✓ Proveedor: ${prov.nombre}` });
    }
  };

  const handleSetDiasCreditoManual = (days: number) => {
    const valid = Math.max(1, days);
    setDiasCredito(valid);
    const base = fechaFactura ? new Date(fechaFactura + 'T12:00:00Z') : new Date();
    const vcto = new Date(base.getTime() + valid * 24 * 3600 * 1000);
    setFechaVencimiento(vcto.toISOString().split('T')[0]);
  };

  const handleFechaVencimientoManual = (vctoStr: string) => {
    setFechaVencimiento(vctoStr);
    if (vctoStr && fechaFactura) {
      const emisionDate = new Date(fechaFactura + 'T12:00:00Z');
      const vctoDate = new Date(vctoStr + 'T12:00:00Z');
      const diffDays = Math.round((vctoDate.getTime() - emisionDate.getTime()) / (1000 * 3600 * 24));
      if (diffDays > 0) {
        setDiasCredito(diffDays);
      }
    }
  };

  const handleFechaFacturaManual = (emisionStr: string) => {
    setFechaFactura(emisionStr);
    if (emisionStr && diasCredito > 0) {
      const base = new Date(emisionStr + 'T12:00:00Z');
      const vcto = new Date(base.getTime() + diasCredito * 24 * 3600 * 1000);
      setFechaVencimiento(vcto.toISOString().split('T')[0]);
    }
  };

  const applyCatalogProduct = (prod: Producto) => {
    const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
    const costVal = prod.costo && prod.costo > 0 ? prod.costo : 1;
    const pvpVal = prod.precio && prod.precio > 0 ? prod.precio : +(costVal * 1.3).toFixed(2);
    const impliedMargin = costVal > 0 ? +(((pvpVal - costVal) / costVal) * 100).toFixed(1) : 30;

    setSelectedProdId(prod.id);
    setBarcodeInput(prod.codigo_barras || '');
    setProductNameInput(prod.nombre);
    setUnidadMedidaInput(prod.unidad_medida || 'UND');
    setItemExentoInput(!!prod.exento_iva);
    setCostoInput(String(costVal));
    setCostoBsInput((costVal * rate).toFixed(2));
    setMargenPctInput(String(Math.max(0, impliedMargin)));
    setPvpInput(pvpVal.toFixed(2));
    setPvpBsInput((pvpVal * rate).toFixed(2));
    setPvpManualOverride(false);
    setShowDescSuggestions(false);
  };

  // When user scans or types barcode -> finds product name & populates fields; if not found, activates 'new'
  const handleBarcodeChange = (code: string) => {
    setBarcodeInput(code);
    const trimmed = code.trim().toLowerCase();

    if (!trimmed) {
      if (typeof selectedProdId === 'number') {
        const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
        setSelectedProdId('new');
        setProductNameInput('');
        setUnidadMedidaInput('UND');
        setCostoInput('1.00');
        setCostoBsInput((1 * rate).toFixed(2));
        setMargenPctInput('30');
        setPvpInput('1.30');
        setPvpBsInput((1.3 * rate).toFixed(2));
        setPvpManualOverride(false);
        setItemExentoInput(false);
      }
      return;
    }

    const match = allCatalogProducts.find(
      (p) => (p.codigo_barras || '').trim().toLowerCase() === trimmed
    );

    if (match) {
      applyCatalogProduct(match);
    } else if (typeof selectedProdId === 'number') {
      const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
      // Switching from an existing catalog product to an unmatched barcode -> activate unregistered mode
      setSelectedProdId('new');
      setProductNameInput('');
      setUnidadMedidaInput('UND');
      setCostoInput('1.00');
      setCostoBsInput((1 * rate).toFixed(2));
      setMargenPctInput('30');
      setPvpInput('1.30');
      setPvpBsInput((1.3 * rate).toFixed(2));
      setPvpManualOverride(false);
      setItemExentoInput(false);
    } else {
      setSelectedProdId('new');
    }
  };

  // When user types description -> finds barcode & populates fields (or suggests matches); if not found, activates 'new'
  const handleDescriptionChange = (desc: string) => {
    setProductNameInput(desc);
    const trimmed = desc.trim().toLowerCase();

    if (!trimmed) {
      setShowDescSuggestions(false);
      if (typeof selectedProdId === 'number') {
        const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
        setSelectedProdId('new');
        setBarcodeInput('');
        setUnidadMedidaInput('UND');
        setCostoInput('1.00');
        setCostoBsInput((1 * rate).toFixed(2));
        setMargenPctInput('30');
        setPvpInput('1.30');
        setPvpBsInput((1.3 * rate).toFixed(2));
        setPvpManualOverride(false);
        setItemExentoInput(false);
      }
      return;
    }

    const exactMatch = allCatalogProducts.find(
      (p) => p.nombre.trim().toLowerCase() === trimmed
    );

    if (exactMatch) {
      applyCatalogProduct(exactMatch);
      return;
    }

    setShowDescSuggestions(true);
    setDescHighlightIndex(0);

    if (typeof selectedProdId === 'number') {
      const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
      // Previously selected catalog product no longer matches -> switch to unregistered mode and clear old barcode
      setSelectedProdId('new');
      setBarcodeInput('');
      setUnidadMedidaInput('UND');
      setCostoInput('1.00');
      setCostoBsInput((1 * rate).toFixed(2));
      setMargenPctInput('30');
      setPvpInput('1.30');
      setPvpBsInput((1.3 * rate).toFixed(2));
      setPvpManualOverride(false);
      setItemExentoInput(false);
    } else {
      setSelectedProdId('new');
    }
  };

  const handleAddItemToInvoice = () => {
    const qty = parseFloat(cantidadInput);
    const cost = parseFloat(costoInput);
    const marginFallback = parseFloat(margenPctInput);
    const safeMargin = !isNaN(marginFallback) && marginFallback >= 0 ? marginFallback : 30;
    const pvp =
      parseFloat(pvpInput) > 0
        ? parseFloat(pvpInput)
        : +(cost * (1 + safeMargin / 100)).toFixed(2);

    if (isNaN(qty) || qty <= 0) {
      alert('Por favor ingresa una cantidad válida mayor a cero (admite fracciones como 0.500, 1.250).');
      return;
    }

    if (isNaN(cost) || cost <= 0) {
      alert('Por favor ingresa un costo unitario válido mayor a cero.');
      return;
    }

    const trimmedName = productNameInput.trim();
    if (!trimmedName) {
      alert('Debes indicar la descripción o nombre del producto facturado.');
      return;
    }

    let prodId: number;
    const barcodeTrimmed = barcodeInput.trim() || `SKU-${Date.now().toString().slice(-6)}`;

    if (selectedProdId === 'new') {
      // Find if already exists by barcode in catalog or newly added items
      const existing = allCatalogProducts.find(
        (p) => (p.codigo_barras || '').trim().toLowerCase() === barcodeTrimmed.toLowerCase()
      );
      if (existing) {
        prodId = existing.id;
      } else {
        prodId = Date.now();
        const newProductObj: Producto = {
          id: prodId,
          codigo_barras: barcodeTrimmed,
          nombre: trimmedName,
          precio: pvp,
          costo: cost,
          unidad_medida: unidadMedidaInput,
          exento_iva: itemExentoInput,
        };
        setNewlyCreatedProducts((prev) => [...prev, newProductObj]);
      }
    } else {
      prodId = selectedProdId;
    }

    const subtotal = +(qty * cost).toFixed(2);
    const ivaItem = itemExentoInput ? 0 : +(subtotal * 0.16).toFixed(2);

    const existingIndex = itemsCompra.findIndex(
      (i) => i.productoId === prodId || (i.codigo_barras && i.codigo_barras === barcodeTrimmed)
    );

    if (existingIndex >= 0) {
      const updated = [...itemsCompra];
      const newQty = +(updated[existingIndex].cantidad + qty).toFixed(3);
      const newSubtotal = +(newQty * cost).toFixed(2);
      updated[existingIndex] = {
        ...updated[existingIndex],
        cantidad: newQty,
        costoUnitario: cost,
        precioVenta: pvp,
        unidad_medida: unidadMedidaInput,
        exentoIva: itemExentoInput,
        subtotal: newSubtotal,
        montoIva: itemExentoInput ? 0 : +(newSubtotal * 0.16).toFixed(2),
      };
      setItemsCompra(updated);
    } else {
      setItemsCompra([
        ...itemsCompra,
        {
          productoId: prodId,
          productoNombre: trimmedName,
          codigo_barras: barcodeTrimmed,
          unidad_medida: unidadMedidaInput,
          cantidad: qty,
          costoUnitario: cost,
          precioVenta: pvp,
          subtotal,
          exentoIva: itemExentoInput,
          montoIva: ivaItem,
        },
      ]);
    }

    // Reset line fields for next item and focus barcode
    resetItemEntryFields();
    setTimeout(() => barcodeFieldRef.current?.focus(), 0);
  };

  const handleUpdateInvoiceRow = (index: number, patch: Partial<DetalleCompra>) => {
    const targetItem = itemsCompra[index];
    if (!targetItem) return;

    const merged: DetalleCompra = { ...targetItem, ...patch };
    const qty = Math.max(0, Number(merged.cantidad) || 0);
    const cost = Math.max(0, Number(merged.costoUnitario) || 0);
    const subtotal = +(qty * cost).toFixed(2);
    const montoIva = merged.exentoIva ? 0 : +(subtotal * 0.16).toFixed(2);
    const nextItem: DetalleCompra = {
      ...merged,
      cantidad: qty,
      costoUnitario: cost,
      subtotal,
      montoIva,
    };

    setItemsCompra((prev) => prev.map((item, i) => (i === index ? nextItem : item)));

    setNewlyCreatedProducts((prev) =>
      prev.map((np) =>
        np.id === nextItem.productoId
          ? {
              ...np,
              nombre: nextItem.productoNombre,
              codigo_barras: nextItem.codigo_barras || np.codigo_barras,
              unidad_medida: nextItem.unidad_medida || np.unidad_medida,
              costo: nextItem.costoUnitario,
              precio:
                nextItem.precioVenta && nextItem.precioVenta > 0
                  ? nextItem.precioVenta
                  : np.precio,
              exento_iva: !!nextItem.exentoIva,
            }
          : np
      )
    );
  };

  const handleRemoveItem = (index: number) => {
    const removed = itemsCompra[index];
    const remaining = itemsCompra.filter((_, i) => i !== index);
    setItemsCompra(remaining);
    setEditingCell(null);
    if (removed && !remaining.some((i) => i.productoId === removed.productoId)) {
      setNewlyCreatedProducts((prev) => prev.filter((np) => np.id !== removed.productoId));
    }
  };

  // Calculations
  const subtotalNeto = itemsCompra.reduce((acc, item) => acc + item.subtotal, 0);
  const baseImponible = itemsCompra
    .filter((i) => !i.exentoIva)
    .reduce((acc, item) => acc + item.subtotal, 0);
  const montoExento = itemsCompra
    .filter((i) => i.exentoIva)
    .reduce((acc, item) => acc + item.subtotal, 0);
  const montoIva = +(baseImponible * 0.16).toFixed(2);
  const totalCompra = +(baseImponible + montoIva + montoExento).toFixed(2);

  const handleSubmitCompra = (e: React.FormEvent) => {
    e.preventDefault();
    if (itemsCompra.length === 0) {
      alert('Debes agregar al menos un artículo a la factura del proveedor.');
      return;
    }

    const invalidRowIdx = itemsCompra.findIndex(
      (it) => !it.productoNombre.trim() || it.cantidad <= 0 || it.costoUnitario <= 0
    );
    if (invalidRowIdx >= 0) {
      alert(
        `Revisa la fila #${invalidRowIdx + 1}: debe tener descripción, cantidad mayor a 0 y costo mayor a 0.`
      );
      return;
    }

    const nroFacturaFinal = numeroFactura.trim() || `FAC-${Date.now().toString().slice(-6)}`;
    const allProvs =
      extraProveedor && !proveedores.some((p) => p.id === extraProveedor.id)
        ? [...proveedores, extraProveedor]
        : proveedores;
    const prov = allProvs.find((p) => p.id === proveedorId);

    onRegistrarCompra(
      {
        proveedorId: prov ? prov.id : proveedorId,
        proveedorNombre: prov ? prov.nombre : 'Proveedor General',
        proveedorRif: prov?.rif || rifSearchInput.trim() || undefined,
        sucursalId: sucursalDestinoId,
        numeroFactura: nroFacturaFinal,
        numeroControl: numeroControl.trim() || undefined,
        fecha: fechaFactura || new Date().toISOString(),
        fechaVencimiento: condicionPago === 'credito' ? (fechaVencimiento || undefined) : undefined,
        diasCredito: condicionPago === 'credito' ? diasCredito : undefined,
        condicionPago,
        tasaRecepcion: +tasaRecepcionNum.toFixed(2),
        pagarATasaRecepcion,
        subtotalNeto: +subtotalNeto.toFixed(2),
        baseImponible: +baseImponible.toFixed(2),
        montoExento: +montoExento.toFixed(2),
        montoIva: +montoIva.toFixed(2),
        total: totalCompra,
        estado: 'completada',
        usuarioNombre: currentUser?.nombre_completo || 'Administrador',
        detalles: itemsCompra,
      },
      newlyCreatedProducts
    );

    setShowNewModal(false);
    setItemsCompra([]);
    setNewlyCreatedProducts([]);
    setNumeroFactura('');
    setNumeroControl('');
    resetItemEntryFields();
    alert(`✅ Factura de Proveedor #${nroFacturaFinal} registrada exitosamente. Se ingresaron los artículos al inventario y se actualizaron los costos y precios de venta.`);
  };

  const filteredCompras = compras.filter(
    (c) =>
      c.proveedorNombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.numeroFactura?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.usuarioNombre?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-400" /> Registro de Compras y Facturas de Proveedores
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Entrada directa a inventario con códigos de barra, presentación por unidades/kg/litros, fracciones, costos y actualización de PVP.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowScanModal(true)}
            className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/25 transition-all"
          >
            <Sparkles className="w-4 h-4 text-slate-950" />
            <span>📷 Cargar Factura (Imagen / PDF)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleOpenNewModal();
              setItemsCompra([]);
              setNewlyCreatedProducts([]);
              setNumeroFactura(`FAC-${Math.floor(1000 + Math.random() * 9000)}`);
            }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>+ Compra Manual</span>
          </button>
        </div>
      </div>

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 block font-medium">Total Compras Facturadas</span>
          <div className="text-xl font-bold text-white font-mono mt-1">
            {formatUSD(compras.reduce((acc, c) => acc + c.total, 0))}
          </div>
          <span className="text-xs text-emerald-400 font-mono block mt-0.5">
            {formatBs(compras.reduce((acc, c) => acc + c.total, 0), empresaConfig.tasaCambio)}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 block font-medium">Facturas Registradas</span>
          <div className="text-xl font-bold text-white font-mono mt-1">{compras.length} facturas</div>
          <span className="text-xs text-slate-500 block mt-0.5">Entrada automatizada a almacenes</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 block font-medium">Proveedores Registrados</span>
          <div className="text-xl font-bold text-white font-mono mt-1">{proveedores.length} empresas</div>
          <span className="text-xs text-emerald-400 block mt-0.5">Cuentas por pagar sincronizadas</span>
        </div>
      </div>

      {/* Search & Purchases Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por proveedor, factura o encargado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-white text-xs pl-9 pr-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                <th className="py-3 px-3">ID / Factura</th>
                <th className="py-3 px-3">Proveedor</th>
                <th className="py-3 px-3">Sucursal Destino</th>
                <th className="py-3 px-3">Régimen</th>
                <th className="py-3 px-3">Fecha</th>
                <th className="py-3 px-3">Artículos</th>
                <th className="py-3 px-3 text-right">Total $ USD</th>
                <th className="py-3 px-3 text-right">Total Bs</th>
                <th className="py-3 px-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredCompras.map((compra) => {
                const sucursal = sucursales.find((s) => s.id === compra.sucursalId);
                const totalUnits = (compra.detalles || []).reduce((acc, d) => acc + d.cantidad, 0);
                const isExento = (compra.detalles || []).every((d) => d.exentoIva) || (compra.montoExento && compra.montoExento > 0 && !compra.baseImponible);

                return (
                  <tr key={compra.id} className="hover:bg-slate-800/40 text-slate-200 transition-colors">
                    <td className="py-3 px-3 font-mono font-semibold">
                      <div className="text-white">#{compra.numeroFactura || `FAC-${compra.id}`}</div>
                      <div className="text-[10px] text-slate-400">ID: {compra.id}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-white">{compra.proveedorNombre}</div>
                      <div className="text-[10px] text-slate-400">Por: {compra.usuarioNombre || 'Admin'}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[11px] bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                        {sucursal?.nombre || (compra.sucursalId === 1 ? empresaConfig.nombreTienda1 : compra.sucursalId === 2 ? empresaConfig.nombreTienda2 : 'Almacén Central')}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {isExento ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          EXENTO
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          IVA 16%
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono">
                      {new Date(compra.fecha).toLocaleDateString('es-VE')}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono bg-slate-800 text-emerald-400 px-2 py-0.5 rounded text-[11px]">
                        {totalUnits.toFixed(totalUnits % 1 === 0 ? 0 : 2)} cant ({(compra.detalles || []).length} ítems)
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                      {formatUSD(compra.total)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">
                      <div>{formatBs(compra.total, compra.tasaRecepcion || empresaConfig.tasaCambio)}</div>
                      {compra.tasaRecepcion && (
                        <div className="text-[10px] text-slate-500">
                          Tasa: Bs. {compra.tasaRecepcion.toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedCompraDetail(compra)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 rounded-lg border border-slate-700 cursor-pointer transition-colors text-[11px] flex items-center gap-1"
                          title="Ver detalle completo de la factura"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const branchName =
                              sucursal?.nombre ||
                              (compra.sucursalId === 1
                                ? empresaConfig.nombreTienda1
                                : compra.sucursalId === 2
                                ? empresaConfig.nombreTienda2
                                : empresaConfig.nombreOficina || 'Almacén Central');
                            printCompraViaIframe(compra, branchName, empresaConfig);
                          }}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 rounded-lg border border-slate-700 cursor-pointer transition-colors text-[11px] flex items-center gap-1"
                          title="Reimprimir comprobante de factura"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================================= */}
      {/* MODAL: REGISTRO COMPLETO DE FACTURA DE PROVEEDOR (NUEVA COMPRA)                         */}
      {/* ========================================================================================= */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div
            style={{
              transform: `translate(${modalPos.x}px, ${modalPos.y}px)`,
              transition: isDraggingModal ? 'none' : 'transform 0.05s ease-out',
            }}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl space-y-4 max-h-[94vh] flex flex-col my-auto relative"
          >
            {/* Modal Header with Grab Drag Handle */}
            <div
              onMouseDown={handleHeaderMouseDown}
              onDoubleClick={() => setModalPos({ x: 0, y: 0 })}
              title="Arrastra con el mouse para mover la ventana. Doble clic para centrar."
              className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/90 cursor-grab active:cursor-grabbing select-none"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-sm sm:text-base">
                      Registro de Factura de Proveedor (Ingreso a Inventario)
                    </h3>
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800/70 border border-slate-700/60 px-2 py-0.5 rounded-md font-mono">
                      <GripHorizontal className="w-3 h-3 text-slate-400" /> Mover con mouse
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Cargue artículos facturados, códigos de barras, presentación (UND/KG/L), fracciones, costos y PVP al público.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmitCompra} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              {/* Scan banner shortcut inside manual purchase */}
              <div className="bg-gradient-to-r from-teal-950/40 to-emerald-950/40 border border-emerald-500/30 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-inner">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white block">¿Deseas autocompletar con una foto o PDF?</span>
                    <span className="text-slate-400 text-[11px]">
                      Gemini AI puede leer la factura y rellenar automáticamente todos los códigos de barra, artículos, costos y condición de IVA.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewModal(false);
                    setShowScanModal(true);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-1.5 rounded-lg font-bold text-xs shrink-0 flex items-center gap-1.5 cursor-pointer shadow transition-all"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Escanear con IA</span>
                </button>
              </div>

              {/* Factura Cabecera (Primer Rectángulo) */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  {/* PRIMER CAMPO: RIF del Proveedor (Búsqueda Rápida por secuencia igual al cliente) */}
                  <div className="sm:col-span-4 relative" ref={rifBoxRef}>
                    <label className="text-[11px] font-semibold text-emerald-300 block mb-1">
                      RIF del Proveedor (Búsqueda Rápida):
                    </label>
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="Ej: 940 o J-00041372-8"
                          value={rifSearchInput}
                          onChange={(e) => handleFastRifChange(e.target.value)}
                          onFocus={(e) => {
                            e.target.select();
                            if (rifSearchInput.trim() && rifSuggestions.length > 0) {
                              const currentProv = allProveedores.find((p) => p.id === proveedorId);
                              if (!currentProv || currentProv.rif.toUpperCase() !== rifSearchInput.trim().toUpperCase()) {
                                setShowRifSuggestions(true);
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if (showRifSuggestions && rifSuggestions.length > 0) {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setRifHighlightIndex((prev) => Math.min(prev + 1, rifSuggestions.length - 1));
                                return;
                              }
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setRifHighlightIndex((prev) => Math.max(prev - 1, 0));
                                return;
                              }
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const picked = rifSuggestions[rifHighlightIndex];
                                if (picked) {
                                  selectMatchedProveedor(picked);
                                } else {
                                  handleFastRifSearch();
                                }
                                return;
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowRifSuggestions(false);
                                return;
                              }
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              handleFastRifSearch();
                            }
                          }}
                          className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs pl-2.5 pr-6 py-2 rounded-xl font-mono focus:outline-none uppercase"
                        />
                        {rifSearchInput && (
                          <button
                            type="button"
                            onClick={() => {
                              setRifSearchInput('');
                              setRifFeedback(null);
                              setShowRifSuggestions(false);
                            }}
                            title="Limpiar RIF"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFastRifSearch()}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl cursor-pointer shrink-0 transition-colors"
                      >
                        Buscar
                      </button>
                    </div>

                    {showRifSuggestions && rifSearchInput.trim() !== '' && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-slate-900 border border-emerald-500/40 rounded-xl shadow-2xl max-h-52 overflow-y-auto divide-y divide-slate-800/70">
                        {rifSuggestions.length > 0 ? (
                          rifSuggestions.map((prov, idx) => (
                            <button
                              key={prov.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectMatchedProveedor(prov);
                              }}
                              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                idx === rifHighlightIndex
                                  ? 'bg-emerald-500/15 text-white'
                                  : 'hover:bg-slate-800 text-slate-200'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-bold truncate">{prov.nombre}</div>
                                <div className="text-[11px] font-mono text-emerald-400">
                                  {prov.rif} {prov.telefono ? `• ${prov.telefono}` : ''}
                                </div>
                              </div>
                              <span className="text-[10px] text-slate-400 shrink-0">Seleccionar</span>
                            </button>
                          ))
                        ) : (
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleFastRifSearch();
                            }}
                            className="w-full text-left px-3 py-2.5 text-xs text-amber-300 hover:bg-amber-500/10 cursor-pointer flex items-center justify-between gap-2"
                          >
                            <span>Sin coincidencias para "{rifSearchInput.trim().toUpperCase()}"</span>
                            <span className="font-bold underline shrink-0">+ Registrar proveedor</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Proveedor seleccionado */}
                  <div className="sm:col-span-4">
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Proveedor Emisor:
                    </label>
                    <select
                      value={proveedorId}
                      onChange={(e) => handleSelectProviderDropdown(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none"
                    >
                      {(extraProveedor && !proveedores.some((p) => p.id === extraProveedor.id)
                        ? [...proveedores, extraProveedor]
                        : proveedores
                      ).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} ({p.rif})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Nº de Factura:
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="FAC-00982"
                      value={numeroFactura}
                      onChange={(e) => setNumeroFactura(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none font-mono font-bold"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Nº Control (Opc):
                    </label>
                    <input
                      type="text"
                      placeholder="00-001234"
                      value={numeroControl}
                      onChange={(e) => setNumeroControl(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-2.5 py-2 rounded-xl focus:border-emerald-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Feedback RIF & Registro Rápido de Proveedor si el RIF no existe */}
                {rifFeedback && (
                  <div
                    className={`text-[11px] px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 ${
                      rifFeedback.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : rifFeedback.type === 'not_found'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}
                  >
                    <span>{rifFeedback.text}</span>
                    {showQuickNewProveedor && (
                      <button
                        type="button"
                        onClick={() => setShowQuickNewProveedor(false)}
                        className="text-slate-400 hover:text-white text-[10px] underline cursor-pointer shrink-0"
                      >
                        Ocultar formulario
                      </button>
                    )}
                  </div>
                )}

                {showQuickNewProveedor && (
                  <div className="bg-slate-900/90 border border-amber-500/40 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-amber-300">
                        + Registro Rápido de Proveedor (RIF no encontrado)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-3">
                        <label className="text-[10px] text-slate-400 block mb-0.5">RIF *</label>
                        <input
                          type="text"
                          value={newProvForm.rif}
                          onChange={(e) => setNewProvForm({ ...newProvForm, rif: e.target.value.toUpperCase() })}
                          placeholder="J-12345678-9"
                          className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-2.5 py-1.5 rounded-lg font-mono focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <label className="text-[10px] text-slate-400 block mb-0.5">Razón Social / Nombre *</label>
                        <input
                          type="text"
                          value={newProvForm.nombre}
                          onChange={(e) => setNewProvForm({ ...newProvForm, nombre: e.target.value })}
                          placeholder="Ej: Distribuidora El Sol C.A."
                          className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-2.5 py-1.5 rounded-lg focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-slate-400 block mb-0.5">Teléfono</label>
                        <input
                          type="text"
                          value={newProvForm.telefono}
                          onChange={(e) => setNewProvForm({ ...newProvForm, telefono: e.target.value })}
                          placeholder="0414-0000000"
                          className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-2.5 py-1.5 rounded-lg focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-3 flex items-end gap-1.5">
                        <button
                          type="button"
                          onClick={handleQuickCreateProveedor}
                          className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-colors"
                        >
                          Guardar Proveedor
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Segunda fila de Cabecera: Fecha, Destino, Tasa de Recepción y Regla de Tasa de Pago */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end pt-1 border-t border-slate-800/70">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Fecha Emisión:
                    </label>
                    <input
                      type="date"
                      value={fechaFactura}
                      onChange={(e) => handleFechaFacturaManual(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-2.5 py-2 rounded-xl focus:border-emerald-500 focus:outline-none font-mono"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Destino Inventario:
                    </label>
                    <select
                      value={sucursalDestinoId}
                      onChange={(e) => setSucursalDestinoId(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-2.5 py-2 rounded-xl focus:border-emerald-500 focus:outline-none"
                    >
                      {sucursales.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tasa de cambio a la que se recibe la factura */}
                  <div className="sm:col-span-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        Tasa Recepción (Bs./$):
                      </label>
                      {Math.abs(tasaRecepcionNum - empresaConfig.tasaCambio) > 0.001 && (
                        <button
                          type="button"
                          onClick={() => setTasaRecepcionInput(String(empresaConfig.tasaCambio))}
                          className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
                        >
                          Hoy: {empresaConfig.tasaCambio.toFixed(2)}
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={tasaRecepcionInput}
                      onChange={(e) => setTasaRecepcionInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-emerald-300 text-xs px-2.5 py-2 rounded-xl font-mono font-bold focus:outline-none"
                    />
                  </div>

                  {/* Casilla de verificación: Pagar a tasa de recepción vs tasa del día en curso */}
                  <div className="sm:col-span-4">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none bg-slate-900 border border-slate-700/80 hover:border-slate-600 px-3 py-2 rounded-xl transition-colors">
                      <input
                        type="checkbox"
                        checked={pagarATasaRecepcion}
                        onChange={(e) => setPagarATasaRecepcion(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-600 cursor-pointer shrink-0"
                      />
                      <div className="leading-tight">
                        <span className="text-[11px] font-semibold text-white block">
                          Pagar el día de liquidación a tasa de recepción
                        </span>
                        <span
                          className={`text-[10px] block mt-0.5 font-mono ${
                            pagarATasaRecepcion ? 'text-amber-300 font-semibold' : 'text-sky-300'
                          }`}
                        >
                          {pagarATasaRecepcion
                            ? `✓ Aplicará tasa de recepción (Bs. ${tasaRecepcionNum.toFixed(2)})`
                            : `Aplicará tasa del día en curso (Hoy: Bs. ${empresaConfig.tasaCambio.toFixed(2)})`}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* BARRA DE ENTRADA DE ARTÍCULO INDIVIDUAL FACTURADO (Segundo Rectángulo) */}
              <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/30 space-y-3 shadow-inner">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <PlusCircle className="w-4 h-4" /> Cargar Artículo Facturado a la Factura
                  </span>
                  <div className="flex items-center gap-2">
                    {typeof selectedProdId === 'number' ? (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-lg border bg-emerald-500/15 text-emerald-300 border-emerald-500/40 font-semibold">
                        ✓ En catálogo / inventario (ID #{selectedProdId})
                      </span>
                    ) : barcodeInput.trim() !== '' || productNameInput.trim() !== '' ? (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-lg border bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-bold">
                        + Artículo no registrado activo (se incluirá al inventario)
                      </span>
                    ) : (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-lg border bg-slate-900 text-slate-400 border-slate-800">
                        Busca por código o descripción, o registra uno nuevo
                      </span>
                    )}

                    {(barcodeInput.trim() !== '' || productNameInput.trim() !== '') && (
                      <button
                        type="button"
                        onClick={resetItemEntryFields}
                        className="text-[11px] px-2 py-0.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>

                {/* Conversor de Empaque / Bulto / Caja a Unidades de Compra */}
                <WholesalePackConverter
                  tasaCambio={tasaRecepcionNum}
                  initialMargenPct={parseFloat(margenPctInput) || 30}
                  showStockFields={true}
                  onApply={(res) => {
                    const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
                    setCostoInput(String(res.costoUnitario));
                    setCostoBsInput((res.costoUnitario * rate).toFixed(2));
                    setMargenPctInput(String(res.margenPct));
                    setPvpInput(res.precioVenta.toFixed(2));
                    setPvpBsInput((res.precioVenta * rate).toFixed(2));
                    setPvpManualOverride(false);
                    setCantidadInput(res.totalUnidades.toString());
                    if (res.tipoEmpaque === 'Saco' || res.tipoEmpaque === 'Bulto') {
                      if (unidadMedidaInput === 'UND') setUnidadMedidaInput('KG');
                    }
                    if (!productNameInput.trim()) {
                      setProductNameInput(`Artículo en ${res.tipoEmpaque} (${res.unidadesPorEmpaque} un.)`);
                    }
                  }}
                />

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  {/* PRIMER CAMPO: Código de Barras / SKU */}
                  <div className="sm:col-span-4">
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold flex items-center gap-1">
                      <Barcode className="w-3 h-3 text-indigo-400" /> Código de Barras / SKU:
                    </label>
                    <input
                      ref={barcodeFieldRef}
                      type="text"
                      placeholder="Escanea o escribe código..."
                      value={barcodeInput}
                      onChange={(e) => handleBarcodeChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-2.5 py-2 rounded-lg font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  {/* SEGUNDO CAMPO: Descripción del Artículo (con búsqueda bidireccional y autocompletado) */}
                  <div className="sm:col-span-8 relative" ref={descBoxRef}>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                      Descripción / Nombre del Artículo:
                    </label>
                    <input
                      type="text"
                      placeholder="Escribe nombre del artículo para buscar o crear nuevo..."
                      value={productNameInput}
                      onChange={(e) => handleDescriptionChange(e.target.value)}
                      onFocus={() => {
                        if (productNameInput.trim() && typeof selectedProdId !== 'number' && descSuggestions.length > 0) {
                          setShowDescSuggestions(true);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (showDescSuggestions && descSuggestions.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setDescHighlightIndex((prev) => Math.min(prev + 1, descSuggestions.length - 1));
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setDescHighlightIndex((prev) => Math.max(prev - 1, 0));
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const picked = descSuggestions[descHighlightIndex];
                            if (picked) applyCatalogProduct(picked);
                            return;
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowDescSuggestions(false);
                            return;
                          }
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-2.5 py-2 rounded-lg focus:border-emerald-500 focus:outline-none font-semibold"
                    />

                    {showDescSuggestions && descSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-slate-900 border border-emerald-500/40 rounded-xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-slate-800/70">
                        {descSuggestions.map((prod, idx) => (
                          <button
                            key={prod.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              applyCatalogProduct(prod);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                              idx === descHighlightIndex ? 'bg-emerald-500/15 text-white' : 'hover:bg-slate-800 text-slate-200'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{prod.nombre}</div>
                              <div className="text-[10px] font-mono text-slate-400">
                                Cód: {prod.codigo_barras || 'S/C'} · {prod.unidad_medida || 'UND'}
                              </div>
                            </div>
                            <div className="text-right font-mono text-[11px] shrink-0">
                              <div className="text-slate-300">Costo: ${(prod.costo || 0).toFixed(2)}</div>
                              <div className="text-emerald-400">PVP: ${prod.precio.toFixed(2)}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Fila 2: Presentación, Cantidad, Costo Unitario ($ USD y Bs.) y Exento IVA */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-1">
                  {/* Presentación / Unidad de Medida */}
                  <div className="sm:col-span-3">
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold flex items-center gap-1">
                      <Scale className="w-3 h-3 text-amber-400" /> Presentación (Unidad):
                    </label>
                    <select
                      value={unidadMedidaInput}
                      onChange={(e) => setUnidadMedidaInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-2 py-2 rounded-lg focus:border-emerald-500 focus:outline-none font-bold"
                    >
                      <option value="UND">Pieza / Unidad (UND)</option>
                      <option value="KG">Kilogramo (KG)</option>
                      <option value="L">Litro (L)</option>
                      <option value="PQ">Paquete / Bulto (PQ)</option>
                    </select>
                  </div>

                  {/* Cantidad (Soporta Fracciones) */}
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold">
                      Cantidad (Fracción):
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      placeholder="1.000"
                      value={cantidadInput}
                      onChange={(e) => setCantidadInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-emerald-400 text-xs px-2.5 py-2 rounded-lg font-mono font-bold focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  {/* Costo Unitario en Dólares */}
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-slate-300 block mb-1 font-semibold">
                      Costo Unit. ($ USD):
                    </label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-400 text-[11px] font-bold">
                        $
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0.0001"
                        placeholder="0.00"
                        value={costoInput}
                        onChange={(e) => handleEntryCostoUsdChange(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs pl-5 pr-2 py-2 rounded-lg font-mono focus:border-emerald-500 focus:outline-none font-bold"
                      />
                    </div>
                  </div>

                  {/* Costo Unitario en Bolívares */}
                  <div className="sm:col-span-3">
                    <label className="text-[10px] text-amber-300 block mb-1 font-semibold">
                      Costo Unit. (Bs. · Tasa {tasaRecepcionNum.toFixed(2)}):
                    </label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-400 text-[10px] font-bold">
                        Bs
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="0.00"
                        value={costoBsInput}
                        onChange={(e) => handleEntryCostoBsChange(e.target.value)}
                        className="w-full bg-slate-900 border border-amber-500/40 text-amber-200 text-xs pl-6 pr-2 py-2 rounded-lg font-mono focus:border-amber-400 focus:outline-none font-bold"
                      />
                    </div>
                  </div>

                  {/* Exento de IVA */}
                  <div className="sm:col-span-2">
                    <label className="flex items-center justify-center gap-1.5 cursor-pointer select-none text-[11px] bg-slate-900 border border-slate-800 hover:border-slate-700 px-2.5 py-2 rounded-lg w-full">
                      <input
                        type="checkbox"
                        checked={itemExentoInput}
                        onChange={(e) => setItemExentoInput(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-950 border-slate-700 cursor-pointer"
                      />
                      <span className={itemExentoInput ? 'text-amber-300 font-bold' : 'text-slate-400'}>
                        Exento IVA
                      </span>
                    </label>
                  </div>
                </div>

                {/* Fila 3: Margen % asignado, PVP Automático/Manual ($ USD y Bs.) y Botón Agregar */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-1 border-t border-slate-800/60">
                  {/* Porcentaje de ganancia asignado */}
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-purple-300 block mb-1 font-semibold flex items-center gap-1">
                      <Percent className="w-3 h-3 text-purple-400" /> Margen (%):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="30"
                        value={margenPctInput}
                        onChange={(e) => handleEntryMargenChange(e.target.value)}
                        className="w-full bg-slate-900 border border-purple-500/40 text-purple-200 text-xs pl-2.5 pr-6 py-2 rounded-lg font-mono font-bold focus:border-purple-400 focus:outline-none"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-400 text-[11px] font-bold">
                        %
                      </span>
                    </div>
                  </div>

                  {/* PVP Venta ($ USD) - Automático según % o ajuste manual */}
                  <div className="sm:col-span-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-emerald-300 font-semibold flex items-center gap-1">
                        <Tag className="w-3 h-3 text-emerald-400" /> PVP Venta ($ USD):
                      </label>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                          pvpManualOverride
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-300'
                        }`}
                      >
                        {pvpManualOverride ? 'Manual' : 'Auto'}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-400 text-[11px] font-bold">
                        $
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="0.00"
                        value={pvpInput}
                        onChange={(e) => handleEntryPvpUsdChange(e.target.value)}
                        className="w-full bg-slate-900 border border-emerald-500/40 text-emerald-300 text-xs pl-5 pr-2 py-2 rounded-lg font-mono focus:border-emerald-400 focus:outline-none font-bold"
                      />
                    </div>
                  </div>

                  {/* PVP Venta (Bs.) - Automático o ajuste manual en bolívares */}
                  <div className="sm:col-span-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-emerald-300 font-semibold">
                        PVP Venta (Bs. · Manual o Auto):
                      </label>
                      {pvpManualOverride && (
                        <button
                          type="button"
                          onClick={handleResetAutoPvp}
                          title="Volver a calcular PVP automático según el % de margen"
                          className="text-[10px] text-purple-300 hover:text-purple-200 flex items-center gap-0.5 cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" /> Auto
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-400 text-[10px] font-bold">
                        Bs
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="0.00"
                        value={pvpBsInput}
                        onChange={(e) => handleEntryPvpBsChange(e.target.value)}
                        className="w-full bg-slate-900 border border-emerald-500/40 text-emerald-200 text-xs pl-6 pr-2 py-2 rounded-lg font-mono focus:border-emerald-400 focus:outline-none font-bold"
                      />
                    </div>
                  </div>

                  {/* Botón Añadir a Lista */}
                  <div className="sm:col-span-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddItemToInvoice}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-md shadow-emerald-600/20"
                    >
                      <Plus className="w-4 h-4" /> Agregar a la Factura
                    </button>
                  </div>
                </div>
              </div>

              {/* TABLA DE TODOS LOS ARTÍCULOS EN LA FACTURA (EDITABLE EN LÍNEA) */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-400" /> Artículos en esta Factura ({itemsCompra.length})
                    {itemsCompra.length > 0 && (
                      <span className="text-[10px] font-normal text-sky-300 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                        <Edit3 className="w-3 h-3" /> Cada fila es editable directamente antes de enviar al inventario
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Total Unidades/Fracción:{' '}
                    <strong className="text-emerald-400 font-mono">
                      {itemsCompra.reduce((sum, item) => sum + item.cantidad, 0).toFixed(3)}
                    </strong>
                  </span>
                </div>

                {itemsCompra.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/60 rounded-xl border border-dashed border-slate-800">
                    No has agregado ningún artículo a la factura todavía. Utiliza la barra superior para registrar cada producto.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/70 max-h-72 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-xs border-collapse min-w-[820px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/90 sticky top-0 z-10">
                          <th className="py-2 px-2.5">Código</th>
                          <th className="py-2 px-2.5">Descripción (Editable)</th>
                          <th className="py-2 px-1.5 text-center">Unidad</th>
                          <th className="py-2 px-1.5 text-right">Cantidad</th>
                          <th className="py-2 px-2 text-right">Costo Unit. ($ / Bs.)</th>
                          <th className="py-2 px-2 text-right">PVP ($ / Bs.)</th>
                          <th className="py-2 px-1.5 text-center">IVA</th>
                          <th className="py-2 px-2.5 text-right">Subtotal</th>
                          <th className="py-2 px-1.5 text-center">Quitar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {itemsCompra.map((item, idx) => {
                          const rate = tasaRecepcionNum > 0 ? tasaRecepcionNum : 1;
                          const itemPvp = item.precioVenta || +(item.costoUnitario * 1.3).toFixed(2);
                          const isEditingQty = editingCell?.idx === idx && editingCell.field === 'qty';
                          const isEditingCostUsd = editingCell?.idx === idx && editingCell.field === 'costUsd';
                          const isEditingCostBs = editingCell?.idx === idx && editingCell.field === 'costBs';
                          const isEditingPvpUsd = editingCell?.idx === idx && editingCell.field === 'pvpUsd';
                          const isEditingPvpBs = editingCell?.idx === idx && editingCell.field === 'pvpBs';

                          return (
                            <tr key={`${item.productoId}-${idx}`} className="hover:bg-slate-900/60 text-slate-200 align-middle">
                              <td className="py-1.5 px-2.5 text-slate-400 text-[11px] whitespace-nowrap">
                                {item.codigo_barras || 'S/C'}
                              </td>

                              <td className="py-1.5 px-2 font-sans">
                                <input
                                  type="text"
                                  value={item.productoNombre}
                                  onChange={(e) =>
                                    handleUpdateInvoiceRow(idx, { productoNombre: e.target.value })
                                  }
                                  className="w-full min-w-[150px] bg-slate-900/70 hover:bg-slate-900 focus:bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-md px-2 py-1 text-xs font-semibold text-white focus:outline-none"
                                />
                              </td>

                              <td className="py-1.5 px-1.5 text-center">
                                <select
                                  value={item.unidad_medida || 'UND'}
                                  onChange={(e) =>
                                    handleUpdateInvoiceRow(idx, { unidad_medida: e.target.value })
                                  }
                                  className="bg-slate-900 border border-slate-700 text-amber-300 px-1.5 py-1 rounded-md text-[10px] font-bold focus:border-emerald-500 focus:outline-none cursor-pointer"
                                >
                                  <option value="UND">UND</option>
                                  <option value="KG">KG</option>
                                  <option value="L">L</option>
                                  <option value="PQ">PQ</option>
                                </select>
                              </td>

                              <td className="py-1.5 px-1.5 text-right">
                                <input
                                  type="number"
                                  step="any"
                                  min="0.001"
                                  value={isEditingQty ? editingCell.raw : String(item.cantidad)}
                                  onFocus={() =>
                                    setEditingCell({ idx, field: 'qty', raw: String(item.cantidad) })
                                  }
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setEditingCell({ idx, field: 'qty', raw });
                                    const val = parseFloat(raw);
                                    if (!isNaN(val) && val > 0) {
                                      handleUpdateInvoiceRow(idx, { cantidad: val });
                                    }
                                  }}
                                  onBlur={() => setEditingCell(null)}
                                  className="w-16 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-md px-1.5 py-1 text-right font-bold text-emerald-400 text-xs focus:outline-none"
                                />
                              </td>

                              {/* Costo Unitario editable en $ y Bs */}
                              <td className="py-1.5 px-2 text-right">
                                <div className="flex flex-col gap-1 items-end">
                                  <div className="relative w-24">
                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0.0001"
                                      value={
                                        isEditingCostUsd
                                          ? editingCell.raw
                                          : Number(item.costoUnitario).toFixed(2)
                                      }
                                      onFocus={() =>
                                        setEditingCell({
                                          idx,
                                          field: 'costUsd',
                                          raw: String(item.costoUnitario),
                                        })
                                      }
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        setEditingCell({ idx, field: 'costUsd', raw });
                                        const val = parseFloat(raw);
                                        if (!isNaN(val) && val > 0) {
                                          handleUpdateInvoiceRow(idx, { costoUnitario: val });
                                        }
                                      }}
                                      onBlur={() => setEditingCell(null)}
                                      className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-md pl-4 pr-1.5 py-0.5 text-right text-white text-[11px] focus:outline-none"
                                    />
                                  </div>
                                  <div className="relative w-24">
                                    <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-amber-400">
                                      Bs
                                    </span>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0.01"
                                      value={
                                        isEditingCostBs
                                          ? editingCell.raw
                                          : (item.costoUnitario * rate).toFixed(2)
                                      }
                                      onFocus={() =>
                                        setEditingCell({
                                          idx,
                                          field: 'costBs',
                                          raw: (item.costoUnitario * rate).toFixed(2),
                                        })
                                      }
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        setEditingCell({ idx, field: 'costBs', raw });
                                        const bs = parseFloat(raw);
                                        if (!isNaN(bs) && bs > 0) {
                                          handleUpdateInvoiceRow(idx, {
                                            costoUnitario: +(bs / rate).toFixed(4),
                                          });
                                        }
                                      }}
                                      onBlur={() => setEditingCell(null)}
                                      className="w-full bg-slate-900 border border-amber-500/30 focus:border-amber-400 rounded-md pl-5 pr-1.5 py-0.5 text-right text-amber-200 text-[11px] focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* PVP editable en $ y Bs */}
                              <td className="py-1.5 px-2 text-right">
                                <div className="flex flex-col gap-1 items-end">
                                  <div className="relative w-24">
                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-emerald-400">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0.01"
                                      value={
                                        isEditingPvpUsd
                                          ? editingCell.raw
                                          : Number(itemPvp).toFixed(2)
                                      }
                                      onFocus={() =>
                                        setEditingCell({
                                          idx,
                                          field: 'pvpUsd',
                                          raw: String(itemPvp),
                                        })
                                      }
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        setEditingCell({ idx, field: 'pvpUsd', raw });
                                        const val = parseFloat(raw);
                                        if (!isNaN(val) && val > 0) {
                                          handleUpdateInvoiceRow(idx, { precioVenta: val });
                                        }
                                      }}
                                      onBlur={() => setEditingCell(null)}
                                      className="w-full bg-slate-900 border border-emerald-500/30 focus:border-emerald-400 rounded-md pl-4 pr-1.5 py-0.5 text-right text-emerald-300 text-[11px] focus:outline-none"
                                    />
                                  </div>
                                  <div className="relative w-24">
                                    <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-emerald-400">
                                      Bs
                                    </span>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0.01"
                                      value={
                                        isEditingPvpBs
                                          ? editingCell.raw
                                          : (itemPvp * rate).toFixed(2)
                                      }
                                      onFocus={() =>
                                        setEditingCell({
                                          idx,
                                          field: 'pvpBs',
                                          raw: (itemPvp * rate).toFixed(2),
                                        })
                                      }
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        setEditingCell({ idx, field: 'pvpBs', raw });
                                        const bs = parseFloat(raw);
                                        if (!isNaN(bs) && bs > 0) {
                                          handleUpdateInvoiceRow(idx, {
                                            precioVenta: +(bs / rate).toFixed(4),
                                          });
                                        }
                                      }}
                                      onBlur={() => setEditingCell(null)}
                                      className="w-full bg-slate-900 border border-emerald-500/30 focus:border-emerald-400 rounded-md pl-5 pr-1.5 py-0.5 text-right text-emerald-200 text-[11px] focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </td>

                              <td className="py-1.5 px-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateInvoiceRow(idx, { exentoIva: !item.exentoIva })
                                  }
                                  title="Clic para cambiar entre Exento e IVA 16%"
                                  className={`text-[9px] px-1.5 py-1 rounded font-bold border cursor-pointer transition-colors ${
                                    item.exentoIva
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                                  }`}
                                >
                                  {item.exentoIva ? 'EXENTO' : '16%'}
                                </button>
                              </td>

                              <td className="py-1.5 px-2.5 text-right font-bold text-white whitespace-nowrap">
                                <div>${item.subtotal.toFixed(2)}</div>
                                <div className="text-[10px] text-slate-400 font-normal">
                                  {formatBs(item.subtotal, rate)}
                                </div>
                              </td>

                              <td className="py-1.5 px-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(idx)}
                                  className="text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-500/10 rounded cursor-pointer"
                                  title="Eliminar ítem"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* RESUMEN FISCAL Y TOTALES DE LA FACTURA */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                      Condición de Pago & Crédito:
                    </span>
                    {condicionPago === 'credito' && (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                        {diasCredito} días de crédito
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Condición:</label>
                      <select
                        value={condicionPago}
                        onChange={(e) => setCondicionPago(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-2.5 py-1.5 rounded-lg"
                      >
                        <option value="credito">Crédito (Genera CxP)</option>
                        <option value="contado">Contado</option>
                      </select>
                    </div>

                    {condicionPago === 'credito' ? (
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Fecha Vencimiento:</label>
                        <input
                          type="date"
                          value={fechaVencimiento}
                          onChange={(e) => handleFechaVencimientoManual(e.target.value)}
                          className="w-full bg-slate-900 border border-indigo-500/50 text-indigo-200 text-xs px-2 py-1.5 rounded-lg font-mono font-bold"
                        />
                      </div>
                    ) : (
                      <div className="flex items-end pb-1 text-[11px] text-emerald-400 font-semibold">
                        ✓ Pago de contado inmediato
                      </div>
                    )}
                  </div>

                  {condicionPago === 'credito' && (
                    <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-lg p-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-indigo-300 font-semibold">Plazo acordado:</span>
                        <div className="flex items-center gap-1">
                          {[7, 14, 15, 21, 30].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => handleSetDiasCreditoManual(d)}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all cursor-pointer ${
                                diasCredito === d
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {d}d
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Personalizar días:</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={diasCredito}
                            onChange={(e) => handleSetDiasCreditoManual(parseInt(e.target.value) || 1)}
                            className="w-14 bg-slate-900 border border-slate-700 text-white text-xs px-1.5 py-0.5 rounded text-center font-bold"
                          />
                          <span className="text-[10px] text-slate-400">días</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-500">
                    Al procesar, los artículos se suman inmediatamente al stock disponible en la sucursal seleccionada.
                  </p>
                </div>

                <div className="space-y-2 text-xs font-mono bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal Neto Facturado:</span>
                    <span className="text-white font-bold">{formatUSD(subtotalNeto)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Base Imponible Gravada (16%):</span>
                    <span className="text-emerald-300 font-bold">{formatUSD(baseImponible)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Total Exento de IVA (0%):</span>
                    <span className="text-amber-300 font-bold">{formatUSD(montoExento)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 pb-2 border-b border-slate-800">
                    <span>IVA Liquidado (16%):</span>
                    <span className="text-emerald-400 font-bold">+{formatUSD(montoIva)}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="text-xs text-white font-sans font-bold block">TOTAL FACTURA PROVEEDOR</span>
                      <span className="text-[10px] text-slate-400 font-sans">
                        Recepción: Bs. {tasaRecepcionNum.toFixed(2)}/$ · Pago:{' '}
                        {pagarATasaRecepcion ? 'Tasa de recepción' : 'Tasa del día en curso'}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold font-mono text-emerald-400">{formatUSD(totalCompra)}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        {formatBs(totalCompra, tasaRecepcionNum)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800 cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={itemsCompra.length === 0}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/25 transition-all"
                >
                  <PackageCheck className="w-4 h-4" />
                  <span>Procesar Factura e Ingresar a Inventario</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* MODAL: VER DETALLE COMPLETO DE FACTURA DE COMPRA                                          */}
      {/* ========================================================================================= */}
      {selectedCompraDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-white text-sm">
                    Factura de Proveedor #{selectedCompraDetail.numeroFactura || selectedCompraDetail.id}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Proveedor: <strong className="text-white">{selectedCompraDetail.proveedorNombre}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCompraDetail(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-400 block">Fecha Emisión:</span>
                  <span className="font-mono font-bold text-white">
                    {new Date(selectedCompraDetail.fecha).toLocaleDateString('es-VE')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Sucursal Destino:</span>
                  <span className="font-semibold text-emerald-400">
                    {sucursales.find((s) => s.id === selectedCompraDetail.sucursalId)?.nombre ||
                      (selectedCompraDetail.sucursalId === 1
                        ? empresaConfig.nombreTienda1
                        : selectedCompraDetail.sucursalId === 2
                        ? empresaConfig.nombreTienda2
                        : `Sucursal #${selectedCompraDetail.sucursalId}`)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Registrado por:</span>
                  <span className="text-slate-200">{selectedCompraDetail.usuarioNombre || 'Admin'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Condición:</span>
                  <span className="bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                    {selectedCompraDetail.condicionPago || 'Crédito'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-white">Detalle de Artículos Facturados:</h4>
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 bg-slate-950">
                        <th className="py-2 px-3">Código</th>
                        <th className="py-2 px-3">Artículo</th>
                        <th className="py-2 px-2 text-center">Unidad</th>
                        <th className="py-2 px-2 text-right">Cantidad</th>
                        <th className="py-2 px-2 text-right">Costo Unit.</th>
                        <th className="py-2 px-2 text-center">Régimen</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {(selectedCompraDetail.detalles || []).map((d, i) => (
                        <tr key={i} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-slate-400 text-[11px]">{d.codigo_barras || `SKU-${d.productoId}`}</td>
                          <td className="py-2 px-3 font-sans font-semibold text-white">{d.productoNombre}</td>
                          <td className="py-2 px-2 text-center text-amber-300">{d.unidad_medida || 'UND'}</td>
                          <td className="py-2 px-2 text-right font-bold text-emerald-400">{d.cantidad}</td>
                          <td className="py-2 px-2 text-right">${d.costoUnitario.toFixed(2)}</td>
                          <td className="py-2 px-2 text-center">
                            {d.exentoIva ? (
                              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.5 rounded font-bold">
                                EXENTO
                              </span>
                            ) : (
                              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 py-0.5 rounded font-bold">
                                16%
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-white">${d.subtotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center font-mono">
                <div>
                  <span className="text-slate-400 block text-xs">Total Factura:</span>
                  <span className="text-slate-500 text-[10px] block">
                    Tasa de recepción: 1$ = {formatBs(1, selectedCompraDetail.tasaRecepcion || empresaConfig.tasaCambio)}
                  </span>
                  {selectedCompraDetail.condicionPago === 'credito' && (
                    <span className="text-[10px] text-amber-300 block mt-0.5">
                      Condición de pago:{' '}
                      {selectedCompraDetail.pagarATasaRecepcion
                        ? 'Pagar a tasa de recepción'
                        : 'Pagar a tasa del día en curso'}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-emerald-400">{formatUSD(selectedCompraDetail.total)}</div>
                  <div className="text-xs text-slate-400">
                    {formatBs(selectedCompraDetail.total, selectedCompraDetail.tasaRecepcion || empresaConfig.tasaCambio)}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-slate-800 flex justify-end gap-2 bg-slate-950/50">
              <button
                type="button"
                onClick={() => {
                  const sFound = sucursales.find((s) => s.id === selectedCompraDetail.sucursalId);
                  const branchName =
                    sFound?.nombre ||
                    (selectedCompraDetail.sucursalId === 1
                      ? empresaConfig.nombreTienda1
                      : selectedCompraDetail.sucursalId === 2
                      ? empresaConfig.nombreTienda2
                      : empresaConfig.nombreOficina || 'Almacén Central');
                  printCompraViaIframe(selectedCompraDetail, branchName, empresaConfig);
                }}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Reimprimir Factura</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedCompraDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* MODAL: CARGA Y PROCESAMIENTO INTELIGENTE DE FACTURA CON IA (IMAGEN / PDF)               */}
      {/* ========================================================================================= */}
      <CargarFacturaModal
        isOpen={showScanModal}
        onClose={() => setShowScanModal(false)}
        proveedores={proveedores}
        productos={productos}
        sucursales={sucursales}
        tasaCambio={empresaConfig.tasaCambio}
        currentUser={currentUser}
        onApplyToManualCompra={handleApplyParsedToManual}
        onRegistrarCompraDirecta={onRegistrarCompra}
        onAddProveedor={onAddProveedor}
      />
    </div>
  );
};
