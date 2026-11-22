import React, { useState, useEffect } from 'react';
import { Sidebar, SidebarTab } from './components/Sidebar';
import { AuthHeader } from './components/AuthHeader';
import { PosSimulator } from './components/PosSimulator';
import { ExecutiveDashboard } from './components/ExecutiveDashboard';
import { PdfReportsCenter } from './components/PdfReportsCenter';
import { DailyRateModal } from './components/DailyRateModal';
import { CompanySettingsModal } from './components/CompanySettingsModal';
import { ComprasManager } from './components/ComprasManager';
import { InventoryManager } from './components/InventoryManager';
import { ClientesManager } from './components/ClientesManager';
import { ProveedoresManager } from './components/ProveedoresManager';
import { CxcManager } from './components/CxcManager';
import { CxpManager } from './components/CxpManager';
import { ConfiguracionView } from './components/ConfiguracionView';
import { TiendaOnlineView } from './components/TiendaOnlineView';
import { PedidosWebManager } from './components/PedidosWebManager';
import { AITechFooter } from './components/AITechFooter';

import {
  INITIAL_SUCURSALES,
  INITIAL_PRODUCTOS,
  INITIAL_INVENTARIO,
  INITIAL_VENTAS,
  INITIAL_USUARIOS,
  INITIAL_CLIENTES,
  INITIAL_PROVEEDORES,
  INITIAL_COMPRAS,
  INITIAL_CXC,
  INITIAL_CXP,
  INITIAL_TIENDA_CONFIG,
  INITIAL_PEDIDOS_ONLINE,
} from './data/mockData';
import {
  Sucursal,
  Producto,
  InventarioItem,
  Venta,
  DetalleVenta,
  Usuario,
  EmpresaConfig,
  Cliente,
  Proveedor,
  Compra,
  CuentaPorCobrar,
  CuentaPorPagar,
  DetallePagoVenta,
  RegistroAuditoria,
  PedidoOnline,
  TiendaConfig,
} from './types';
import { CommercialCalculatorModal } from './components/CommercialCalculatorModal';
import {
  testFirestoreConnection,
  subscribeToPedidosOnline,
  savePedidoOnlineToFirestore,
  updatePedidoOnlineInFirestore,
  subscribeToEmpresaConfig,
  saveEmpresaConfigToFirestore,
  getEmpresaConfigFromFirestore,
  subscribeToTiendaConfig,
  saveTiendaConfigToFirestore,
  subscribeToProductos,
  saveProductToFirestore,
  deleteProductFromFirestore,
  saveInventarioToFirestore,
  registrarVentaTransaccional,
  transferirStockTransaccional,
  registrarCompraTransaccional,
  registrarAbonoCxcTransaccional,
  saveAuditoriaLogToFirestore,
  subscribeToAuditoriaLogs,
  saveUsuariosToFirestore,
  subscribeToUsuarios,
  saveSucursalesToFirestore,
  subscribeToSucursales,
  resetSystemDataInFirestore,
  syncAllToFirestore,
  subscribeToCloudAuth,
  CloudAuthUser,
  consolidateSaleItems,
} from './lib/firebaseClient';
import {
  enqueueSyncOp,
  flushSyncQueue,
  clearPendingSyncOps,
  PendingSyncOp,
} from './lib/syncQueue';
import {
  ensurePosSessionToken,
  clearPosSessionToken,
  buildPosAuthHeaders,
} from './lib/posSession';
import { fetchApi } from './lib/apiFetch';
import {
  hashPin,
  sanitizeUserForSession,
  sanitizeUsersForStorage,
  ensureMinimumFullAdmin,
  isFullPrivilegeAdmin,
  isHashedPin,
  FULL_ADMIN_PERMISSIONS,
} from './lib/security';
import { findMatchingProveedor, deduplicateProveedoresList, normalizeSupplierRifKey } from './lib/validations';
import { getStoredEmpresaConfig, saveEmpresaConfig, hasSetTasaToday, markTasaSetToday, formatUSD, formatBs, DEFAULT_EMPRESA_CONFIG, CLEAN_EMPRESA_CONFIG, isMockDefaultPhone, cleanMobileDigits, fetchLiveBcvRate } from './lib/currency';
import { ShieldAlert, Lock, ShoppingCart, RefreshCw, Download, X, Globe, Share2, QrCode, Copy, Check, ExternalLink, ShoppingBag, PackageCheck, ArrowRight, Flame, TrendingUp } from 'lucide-react';
import { StoreQrCode } from './components/StoreQrCode';
import { StandaloneHtmlDownloader } from './components/StandaloneHtmlDownloader';
import { downloadStandaloneHtmlFile } from './lib/downloadHtml';
import { createAuditEntry, INITIAL_AUDITORIA_LOGS } from './lib/auditLogger';
import {
  getMachineFingerprint,
  validateActivationKey,
  createTrialLicenseForCurrentMachine,
  requestTrialLicenseFromServer,
  saveLicenseKey,
  getStoredLicenseKey,
  LicenseValidationResult,
} from './lib/licensing';
import { LicenseLockModal } from './components/LicenseLockModal';

function playOrderChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.4);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.15); // A5
    gain2.gain.setValueAtTime(0.25, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.6);
  } catch (e) {}
}

const STORAGE_KEY_FACTORY_RESET_AT = 'pos_factory_reset_at';
const POS_ACTIVE_OPERATOR_STORAGE_KEY = 'pos_active_operator_v1';

const CLEAN_TIENDA_CONFIG: TiendaConfig = {
  habilitada: true,
  nombreTienda: '',
  whatsappContacto: '',
  mensajeBienvenida: '¡Bienvenido a nuestra tienda virtual!',
  costoDeliveryFijo: 0,
  deliveryGratisMinimo: 0,
  permitePickup: true,
  permiteDelivery: true,
  bannerPromo: '',
  pagoMovilBanco: '',
  pagoMovilTelefono: '',
  pagoMovilRif: '',
  zelleTitular: '',
  zelleCorreo: '',
  horarioAtencion: '',
};

function parseIsoMs(raw?: string | null): number {
  if (!raw || typeof raw !== 'string') return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function getStoredFactoryResetMs(): number {
  try {
    return parseIsoMs(localStorage.getItem(STORAGE_KEY_FACTORY_RESET_AT));
  } catch {
    return 0;
  }
}

function isCreatedAfterFactoryReset(dateStr?: string): boolean {
  const resetMs = getStoredFactoryResetMs();
  if (!resetMs) return true;
  if (!dateStr) return false;
  const itemMs = new Date(dateStr).getTime();
  if (!Number.isFinite(itemMs)) return false;
  return itemMs >= resetMs;
}

export default function App() {
  // Navigation State (starts in 'ventas' or 'dashboard' if admin)
  const [activeTab, setActiveTab] = useState<SidebarTab>('ventas');
  // Sidebar Collapse State (starts collapsed on small laptop/tablet screens)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1024;
    }
    return false;
  });

  // Persistent LocalStorage State Keys
  const STORAGE_KEYS = {
    ventas: 'pos_app_ventas_v2',
    compras: 'pos_app_compras_v2',
    clientes: 'pos_app_clientes_v2',
    proveedores: 'pos_app_proveedores_v2',
    cxc: 'pos_app_cxc_v2',
    cxp: 'pos_app_cxp_v2',
    productos: 'pos_app_productos_v2',
    inventario: 'pos_app_inventario_v2',
    usuarios: 'pos_app_usuarios_v2',
    sucursales: 'pos_app_sucursales_v2',
    auditoria: 'pos_app_auditoria_v2',
    pedidos_online: 'pos_app_pedidos_online_v2',
    tienda_config: 'pos_app_tienda_config_v2',
  };

  // App State: Users (with automatic recovery guaranteeing at least one full-privilege admin)
  const [usuarios, setUsuarios] = useState<Usuario[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.usuarios);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed.map((u: Usuario) => {
            if (u.rol === 'admin') {
              return {
                ...u,
                nombre_completo: u.nombre_completo || 'Gerente General',
                cargo: u.cargo || 'Gerente General',
                sucursal_id: null,
              };
            }
            return u;
          });
          const { users: safeUsers } = ensureMinimumFullAdmin(normalized);
          return safeUsers;
        }
      }
    } catch (e) {}
    return INITIAL_USUARIOS;
  });
  const [currentUser, setCurrentUser] = useState<Usuario | null>(() => {
    try {
      const raw = sessionStorage.getItem(POS_ACTIVE_OPERATOR_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Usuario;
      if (!parsed || typeof parsed.id !== 'number') return null;
      const matched = usuarios.find((u) => u.id === parsed.id);
      return matched ? sanitizeUserForSession(matched) : null;
    } catch {
      return null;
    }
  });
  const [cloudUser, setCloudUser] = useState<CloudAuthUser | null>(null);

  useEffect(() => {
    try {
      if (currentUser) {
        sessionStorage.setItem(POS_ACTIVE_OPERATOR_STORAGE_KEY, JSON.stringify(currentUser));
      } else {
        sessionStorage.removeItem(POS_ACTIVE_OPERATOR_STORAGE_KEY);
      }
    } catch {}
  }, [currentUser]);

  useEffect(() => {
    const unsub = subscribeToCloudAuth((user) => {
      setCloudUser(user);
    });
    return () => unsub();
  }, []);

  // E-Commerce & Online Store State
  const [pedidosOnline, setPedidosOnline] = useState<PedidoOnline[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.pedidos_online);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return INITIAL_PEDIDOS_ONLINE;
  });

  const [tiendaConfig, setTiendaConfig] = useState<TiendaConfig>(() => {
    let base = { ...INITIAL_TIENDA_CONFIG };
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.tienda_config);
      if (stored) {
        const parsed = JSON.parse(stored);
        base = {
          ...INITIAL_TIENDA_CONFIG,
          ...parsed,
          deliveryGratisMinimo:
            parsed.deliveryGratisMinimo !== undefined && parsed.deliveryGratisMinimo !== null
              ? Number(parsed.deliveryGratisMinimo)
              : 30.00,
          costoDeliveryFijo:
            parsed.costoDeliveryFijo !== undefined && parsed.costoDeliveryFijo !== null
              ? Number(parsed.costoDeliveryFijo)
              : 2.50,
        };
      }
    } catch (e) {}

    // Check if URL query contains a real WhatsApp number parameter (e.g. ?vista=tienda&ws=04141234567)
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const wsParam = urlParams.get('ws');
        if (wsParam && !isMockDefaultPhone(wsParam)) {
          base.whatsappContacto = wsParam.trim();
        }
      } catch (e) {}
    }
    return base;
  });

  // Client Public Store View Mode (switch between internal POS and public web catalog)
  const [isClientStoreMode, setIsClientStoreMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return (
        urlParams.get('vista') === 'tienda' ||
        urlParams.get('tienda') === 'true' ||
        urlParams.get('cliente') === 'true' ||
        window.location.hash.toLowerCase().includes('tienda')
      );
    }
    return false;
  });

  // Flag to know if store was opened internally by merchant (from POS UI) or by public client
  const [isInternalPreview, setIsInternalPreview] = useState<boolean>(false);

  // Company and Fiscal Settings + Daily Rate
  const [empresaConfig, setEmpresaConfig] = useState<EmpresaConfig>(getStoredEmpresaConfig);
  const [showDailyRateModal, setShowDailyRateModal] = useState<boolean>(false);
  const [showCompanySettingsModal, setShowCompanySettingsModal] = useState<boolean>(false);
  const [showHtmlModal, setShowHtmlModal] = useState<boolean>(false);
  const [showStoreShareModal, setShowStoreShareModal] = useState<boolean>(false);
  const [showCalculatorModal, setShowCalculatorModal] = useState<boolean>(false);
  const [copiedStoreUrl, setCopiedStoreUrl] = useState<boolean>(false);
  const [nuevoPedidoNotificacion, setNuevoPedidoNotificacion] = useState<PedidoOnline | null>(null);
  const [bcvAutoNotice, setBcvAutoNotice] = useState<{
    tasa: number;
    fecha: string;
    fuente?: string;
  } | null>(null);

  // Business Entities State
  const [sucursales, setSucursales] = useState<Sucursal[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.sucursales);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return [
      { id: 1, nombre: empresaConfig.nombreTienda1, tipo: 'tienda' },
      { id: 2, nombre: empresaConfig.nombreTienda2, tipo: 'tienda' },
      { id: 3, nombre: empresaConfig.nombreOficina, tipo: 'oficina' },
    ];
  });

  const [productos, setProductos] = useState<Producto[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.productos);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return INITIAL_PRODUCTOS;
  });

  const [inventario, setInventario] = useState<InventarioItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.inventario);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return INITIAL_INVENTARIO;
  });

  const [ventas, setVentas] = useState<Venta[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ventas);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return INITIAL_VENTAS;
  });

  const [compras, setCompras] = useState<Compra[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.compras);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return INITIAL_COMPRAS;
  });

  const [clientes, setClientes] = useState<Cliente[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.clientes);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return INITIAL_CLIENTES;
  });

  const [proveedores, setProveedores] = useState<Proveedor[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.proveedores);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return INITIAL_PROVEEDORES;
  });

  const [cxcList, setCxcList] = useState<CuentaPorCobrar[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.cxc);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return INITIAL_CXC;
  });

  const [cxpList, setCxpList] = useState<CuentaPorPagar[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.cxp);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return INITIAL_CXP;
  });

  // Audit Logs State (Audit trail tracking user actions)
  const [auditoriaLogs, setAuditoriaLogs] = useState<RegistroAuditoria[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.auditoria);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return INITIAL_AUDITORIA_LOGS;
  });

  // Correlativos for Fiscal Cuts (X and Z)
  const [correlativoX, setCorrelativoX] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('pos_correlativo_x');
      if (stored !== null) return parseInt(stored, 10);
    } catch (e) {}
    return 0;
  });

  const [correlativoZ, setCorrelativoZ] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('pos_correlativo_z');
      if (stored !== null) return parseInt(stored, 10);
    } catch (e) {}
    return 0;
  });

  // Cryptographic Hardware License State
  const [licenseValidation, setLicenseValidation] = useState<LicenseValidationResult>(() => {
    let key = getStoredLicenseKey();
    if (!key) {
      // Auto-provision initial 15-Day Trial License for this machine (not lifetime)
      const trialKey = createTrialLicenseForCurrentMachine('Empresa Demo Evaluación', 'J-00000000-0');
      saveLicenseKey(trialKey);
      key = trialKey;
    }
    return validateActivationKey(key);
  });

  const [showLicenseLockModal, setShowLicenseLockModal] = useState<boolean>(!licenseValidation.isValid);

  const recheckLicense = () => {
    const key = getStoredLicenseKey();
    const result = validateActivationKey(key);
    setLicenseValidation(result);
    setShowLicenseLockModal(!result.isValid);

    // If paid license has company name or RIF and no pending factory reset blocks it, sync with empresaConfig
    const licEmpresa = result.license?.empresa?.trim() || '';
    const licRif = result.license?.rif?.trim() || '';
    const isDemoLicense =
      result.license?.tipo === 'demo' ||
      /demo\s+evaluaci[oó]n/i.test(licEmpresa) ||
      licRif === 'J-00000000-0';

    if (result.isValid && !isDemoLicense && (licEmpresa || licRif)) {
      const localResetMs = getStoredFactoryResetMs();
      setEmpresaConfig((prev) => {
        const fiscalMs = parseIsoMs(prev.fiscalUpdatedAt);
        if (localResetMs > 0 && fiscalMs <= localResetMs && !prev.nombreEmpresa && !prev.rif) {
          return prev;
        }
        const newName = prev.nombreEmpresa && prev.nombreEmpresa.trim() !== '' ? prev.nombreEmpresa : licEmpresa;
        const newRif = prev.rif && prev.rif.trim() !== '' ? prev.rif : licRif;
        if (newName !== prev.nombreEmpresa || newRif !== prev.rif) {
          const updated: EmpresaConfig = {
            ...prev,
            nombreEmpresa: newName,
            rif: newRif,
            fiscalUpdatedAt: new Date().toISOString(),
          };
          saveEmpresaConfig(updated);
          saveEmpresaConfigToFirestore(updated).catch(() => {});
          return updated;
        }
        return prev;
      });
    }
  };

  // Global F9 (Commercial Calculator) & Universal Esc (Close topmost dismissible modal)
  useEffect(() => {
    const handleGlobalKeyShortcuts = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        setShowCalculatorModal((prev) => !prev);
        return;
      }

      if (e.key !== 'Escape' || e.defaultPrevented) return;

      const overlays = Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0')).filter((el) => {
        const style = window.getComputedStyle(el);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          el.getBoundingClientRect().width > 0
        );
      });

      if (overlays.length === 0) return;

      const sorted = overlays
        .map((el, idx) => ({
          el,
          idx,
          z: Number.parseInt(window.getComputedStyle(el).zIndex || '0', 10) || 0,
        }))
        .sort((a, b) => (a.z !== b.z ? a.z - b.z : a.idx - b.idx));

      for (let i = sorted.length - 1; i >= 0; i--) {
        const modal = sorted[i].el;
        const buttons = Array.from(
          modal.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
        ).filter((btn) => {
          const style = window.getComputedStyle(btn);
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            btn.getBoundingClientRect().width > 0
          );
        });

        let closeBtn = buttons.find((btn) => {
          if (btn.dataset.modalClose === 'true') return true;
          const label = `${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''}`.trim();
          return (
            /^(cerrar|close)\b/i.test(label) &&
            !btn.closest('table') &&
            !btn.parentElement?.querySelector('input')
          );
        });

        if (!closeBtn) {
          closeBtn = buttons.find((btn) => {
            if (btn.closest('table')) return false;
            if (btn.parentElement?.querySelector('input')) return false;
            const txt = (btn.textContent || '').trim();
            const hasXText = txt === '×' || txt === '✕' || txt === 'X';
            const hasLucideX = Boolean(btn.querySelector('svg.lucide-x, svg[class*="lucide-x"]'));
            return hasXText || hasLucideX;
          });
        }

        if (closeBtn) {
          e.preventDefault();
          closeBtn.click();
          return;
        }
        return;
      }
    };
    window.addEventListener('keydown', handleGlobalKeyShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalKeyShortcuts);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('pos_correlativo_x', String(correlativoX)); } catch (e) {}
  }, [correlativoX]);

  useEffect(() => {
    try { localStorage.setItem('pos_correlativo_z', String(correlativoZ)); } catch (e) {}
  }, [correlativoZ]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.auditoria, JSON.stringify(auditoriaLogs)); } catch(e) {}
  }, [auditoriaLogs]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.ventas, JSON.stringify(ventas)); } catch(e) {}
  }, [ventas]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.compras, JSON.stringify(compras)); } catch(e) {}
  }, [compras]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.clientes, JSON.stringify(clientes)); } catch(e) {}
  }, [clientes]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.proveedores, JSON.stringify(proveedores)); } catch(e) {}
  }, [proveedores]);

  // Auto-merge any duplicate suppliers (same normalized RIF or business name) and remap Compras/CxP references
  useEffect(() => {
    const { proveedores: cleanProvs, idMap, mergedCount } = deduplicateProveedoresList(proveedores);
    if (mergedCount > 0) {
      setProveedores(cleanProvs);
      setCompras((prev) =>
        prev.map((c) => {
          const mappedId = idMap.get(c.proveedorId);
          if (mappedId && mappedId !== c.proveedorId) {
            const canonical = cleanProvs.find((p) => p.id === mappedId);
            return {
              ...c,
              proveedorId: mappedId,
              proveedorNombre: canonical?.nombre || c.proveedorNombre,
            };
          }
          return c;
        })
      );
      setCxpList((prev) =>
        prev.map((cxp) => {
          const mappedId = idMap.get(cxp.proveedorId);
          if (mappedId && mappedId !== cxp.proveedorId) {
            const canonical = cleanProvs.find((p) => p.id === mappedId);
            return {
              ...cxp,
              proveedorId: mappedId,
              proveedorNombre: canonical?.nombre || cxp.proveedorNombre,
            };
          }
          return cxp;
        })
      );
    }
  }, [proveedores.length]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.cxc, JSON.stringify(cxcList)); } catch(e) {}
  }, [cxcList]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.cxp, JSON.stringify(cxpList)); } catch(e) {}
  }, [cxpList]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.productos, JSON.stringify(productos)); } catch(e) {}
  }, [productos]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.inventario, JSON.stringify(inventario)); } catch(e) {}
  }, [inventario]);

  useEffect(() => {
    sanitizeUsersForStorage(usuarios).then((sanitized) => {
      try {
        localStorage.setItem(STORAGE_KEYS.usuarios, JSON.stringify(sanitized));
      } catch (e) {}
    });
  }, [usuarios]);

  const persistUsuarios = async (nextList: Usuario[]): Promise<Usuario[]> => {
    const { users: safeUsers } = ensureMinimumFullAdmin(nextList);
    const sanitized = await sanitizeUsersForStorage(safeUsers);
    setUsuarios(sanitized);
    try {
      localStorage.setItem(STORAGE_KEYS.usuarios, JSON.stringify(sanitized));
    } catch (e) {}
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const updatedActive = sanitized.find((u) => u.id === prev.id);
      return updatedActive ? sanitizeUserForSession(updatedActive) : prev;
    });
    saveUsuariosToFirestore(sanitized)
      .then((ok) => {
        if (!ok) {
          enqueueSyncOp('firestore_usuarios', 'firestore_usuarios:all', sanitized);
        }
      })
      .catch(() => {
        enqueueSyncOp('firestore_usuarios', 'firestore_usuarios:all', sanitized);
      });
    return sanitized;
  };

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.sucursales, JSON.stringify(sucursales)); } catch(e) {}
  }, [sucursales]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.pedidos_online, JSON.stringify(pedidosOnline)); } catch(e) {}
  }, [pedidosOnline]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.tienda_config, JSON.stringify(tiendaConfig)); } catch(e) {}
  }, [tiendaConfig]);

  // Sincronización en tiempo real entre Celular (Tienda) y Laptop (POS)
  useEffect(() => {
    let isMounted = true;

    if (isClientStoreMode) {
      // Public web catalog uses ONLY the sanitized public store endpoint
      fetch('/api/public/store-state')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data || !data.success || !isMounted) return;
          if (data.factoryResetAt) {
            try {
              const currentReset = getStoredFactoryResetMs();
              const serverReset = parseIsoMs(data.factoryResetAt);
              if (serverReset > currentReset) {
                localStorage.setItem(STORAGE_KEY_FACTORY_RESET_AT, data.factoryResetAt);
              }
            } catch (e) {}
          }
          if (data.empresaConfig) {
            applyEmpresaConfigUpdate(data.empresaConfig);
          }
          if (data.tiendaConfig) {
            setTiendaConfig((prev) => ({ ...prev, ...data.tiendaConfig }));
          }
          if (Array.isArray(data.sucursales) && data.sucursales.length > 0) {
            setSucursales(data.sucursales);
          }
          if (Array.isArray(data.productos)) {
            setProductos(data.productos);
          }
          if (Array.isArray(data.inventario)) {
            setInventario(data.inventario);
          }
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }

    // POS protected synchronization requires an authenticated operator session
    if (!currentUser) {
      return () => {
        isMounted = false;
      };
    }

    const fetchServerOrders = async () => {
      try {
        await ensurePosSessionToken(currentUser);
        const res = await fetch('/api/pedidos', {
          headers: buildPosAuthHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.pedidos) && isMounted) {
          const incoming = (data.pedidos as PedidoOnline[]).filter((p) =>
            isCreatedAfterFactoryReset(p.creadoEn || p.fecha)
          );
          setPedidosOnline((prev) => {
            const validPrev = prev.filter((p) => isCreatedAfterFactoryReset(p.creadoEn || p.fecha));
            const existingIds = new Set(validPrev.map((p) => p.id));
            const brandNewOrders = incoming.filter((p) => !existingIds.has(p.id));

            if (brandNewOrders.length > 0) {
              const hasPending = brandNewOrders.some((p) => p.estado === 'pendiente');
              if (hasPending) {
                playOrderChime();
                setNuevoPedidoNotificacion(brandNewOrders[0]);
              }
              const merged = [...brandNewOrders, ...validPrev];
              try {
                localStorage.setItem(STORAGE_KEYS.pedidos_online, JSON.stringify(merged));
              } catch (e) {}
              return merged;
            }

            // Sync status updates from server
            let changed = validPrev.length !== prev.length;
            const updated = validPrev.map((localP) => {
              const remote = incoming.find((p) => p.id === localP.id);
              if (remote && (remote.estado !== localP.estado || remote.ventaIdGenerada !== localP.ventaIdGenerada)) {
                changed = true;
                return { ...localP, estado: remote.estado, ventaIdGenerada: remote.ventaIdGenerada };
              }
              return localP;
            });

            return changed ? updated : prev;
          });
        }
      } catch (e) {
        // Silently ignore if offline
      }
    };

    fetchServerOrders();

    // Obtain signed POS session token and broadcast current settings & catalog from POS to server
    try {
      const clientResetStamp = localStorage.getItem(STORAGE_KEY_FACTORY_RESET_AT) || null;
      const adminPinHashes =
        currentUser?.rol === 'admin'
          ? usuarios
              .filter((u) => u.rol === 'admin' && isHashedPin(u.pin))
              .map((u) => ({ id: u.id, pinHash: u.pin }))
          : undefined;
      const userPinHashes =
        currentUser?.rol === 'admin'
          ? usuarios
              .filter((u) => isHashedPin(u.pin))
              .map((u) => ({ id: u.id, pinHash: u.pin }))
          : undefined;
      const syncPayload = {
        empresaConfig,
        tiendaConfig,
        sucursales,
        productos,
        inventario,
        pedidos: pedidosOnline,
        replacePedidos: true,
        clientFactoryResetAt: clientResetStamp,
        ...(adminPinHashes && adminPinHashes.length > 0 ? { adminPinHashes } : {}),
        ...(userPinHashes && userPinHashes.length > 0 ? { userPinHashes } : {}),
      };
      ensurePosSessionToken(currentUser)
        .then(() =>
          fetch('/api/sync/state', {
            method: 'POST',
            headers: buildPosAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(syncPayload),
          })
        )
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data || !isMounted) return;
          if (data.resetRequired && data.factoryResetAt) {
            try {
              localStorage.setItem(STORAGE_KEY_FACTORY_RESET_AT, data.factoryResetAt);
            } catch (e) {}
            if (data.empresaConfig) applyEmpresaConfigUpdate(data.empresaConfig);
            if (data.tiendaConfig) setTiendaConfig((prev) => ({ ...prev, ...data.tiendaConfig }));
            if (Array.isArray(data.sucursales) && data.sucursales.length > 0) setSucursales(data.sucursales);
          }
        })
        .catch(() => {
          enqueueSyncOp('sync_state', 'sync_state:latest', syncPayload);
        });
    } catch (e) {}

    const interval = setInterval(fetchServerOrders, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isClientStoreMode, currentUser?.id]);

  // Keep server sync state fresh whenever POS catalog or configs change
  useEffect(() => {
    if (isClientStoreMode || !currentUser) return;
    const timer = setTimeout(() => {
      try {
        const clientResetStamp = localStorage.getItem(STORAGE_KEY_FACTORY_RESET_AT) || null;
        const adminPinHashes =
          currentUser?.rol === 'admin'
            ? usuarios
                .filter((u) => u.rol === 'admin' && isHashedPin(u.pin))
                .map((u) => ({ id: u.id, pinHash: u.pin }))
            : undefined;
        const userPinHashes =
          currentUser?.rol === 'admin'
            ? usuarios
                .filter((u) => isHashedPin(u.pin))
                .map((u) => ({ id: u.id, pinHash: u.pin }))
            : undefined;
        const syncPayload = {
          empresaConfig,
          tiendaConfig,
          sucursales,
          productos,
          inventario,
          clientFactoryResetAt: clientResetStamp,
          ...(adminPinHashes && adminPinHashes.length > 0 ? { adminPinHashes } : {}),
          ...(userPinHashes && userPinHashes.length > 0 ? { userPinHashes } : {}),
        };
        ensurePosSessionToken(currentUser)
          .then(() =>
            fetchApi('/api/sync/state', {
              method: 'POST',
              headers: buildPosAuthHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify(syncPayload),
            })
          )
          .then((res) => {
            if (!res.ok) {
              enqueueSyncOp('sync_state', 'sync_state:latest', syncPayload);
              return null;
            }
            return res.json();
          })
          .then((data) => {
            if (!data || !data.resetRequired || !data.factoryResetAt) return;
            const currentReset = getStoredFactoryResetMs();
            const serverReset = parseIsoMs(data.factoryResetAt);
            if (serverReset > currentReset) {
              try {
                localStorage.setItem(STORAGE_KEY_FACTORY_RESET_AT, data.factoryResetAt);
              } catch (e) {}
              if (data.empresaConfig) applyEmpresaConfigUpdate(data.empresaConfig);
              if (data.tiendaConfig) setTiendaConfig((prev) => ({ ...prev, ...data.tiendaConfig }));
              if (Array.isArray(data.sucursales) && data.sucursales.length > 0) setSucursales(data.sucursales);
            }
          })
          .catch(() => {
            enqueueSyncOp('sync_state', 'sync_state:latest', syncPayload);
          });
      } catch (e) {}
    }, 800);
    return () => clearTimeout(timer);
  }, [isClientStoreMode, currentUser, empresaConfig, tiendaConfig, sucursales, productos, inventario, usuarios]);

  // Keep backend POS session synchronized with active user and flush offline queue on reconnect
  useEffect(() => {
    if (isClientStoreMode) return;
    if (!currentUser) {
      clearPosSessionToken();
      return;
    }

    let active = true;
    const runQueueFlush = async () => {
      if (!active || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
      await flushSyncQueue(async (op: PendingSyncOp) => {
        switch (op.type) {
          case 'sync_state': {
            await ensurePosSessionToken(currentUser);
            const r = await fetchApi('/api/sync/state', {
              method: 'POST',
              headers: buildPosAuthHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify(op.payload),
            });
            return r.ok;
          }
          case 'pedido_create': {
            const r = await fetchApi('/api/pedidos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(op.payload),
            });
            return r.ok || r.status === 400;
          }
          case 'pedido_patch': {
            await ensurePosSessionToken(currentUser);
            const r = await fetchApi(`/api/pedidos/${encodeURIComponent(op.payload.id)}`, {
              method: 'PATCH',
              headers: buildPosAuthHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify(op.payload.body),
            });
            return r.ok || r.status === 404;
          }
          case 'firestore_empresa':
            return await saveEmpresaConfigToFirestore(op.payload);
          case 'firestore_tienda':
            return await saveTiendaConfigToFirestore(op.payload);
          case 'firestore_product':
            return await saveProductToFirestore(op.payload);
          case 'firestore_delete_product':
            return await deleteProductFromFirestore(op.payload.id);
          case 'firestore_inventario':
            return await saveInventarioToFirestore(op.payload);
          case 'firestore_sucursales':
            return await saveSucursalesToFirestore(op.payload);
          case 'firestore_usuarios':
            return await saveUsuariosToFirestore(op.payload);
          case 'firestore_venta': {
            const tx = await registrarVentaTransaccional(op.payload);
            return tx.success || Boolean(tx.stockFaltante?.length);
          }
          default:
            return true;
        }
      });
    };

    void ensurePosSessionToken(currentUser).then(() => {
      void runQueueFlush();
    });

    window.addEventListener('online', runQueueFlush);
    const interval = setInterval(runQueueFlush, 15000);
    return () => {
      active = false;
      window.removeEventListener('online', runQueueFlush);
      clearInterval(interval);
    };
  }, [isClientStoreMode, currentUser]);

  // Sync URL parameter with client store view mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (isClientStoreMode) {
          url.searchParams.set('vista', 'tienda');
        } else {
          url.searchParams.delete('vista');
          url.searchParams.delete('tienda');
        }
        window.history.replaceState({}, '', url.toString());
      } catch (e) {}
    }
  }, [isClientStoreMode]);


  // RBAC Enforcement: If user changes and current tab is not allowed, switch to 'ventas'
  useEffect(() => {
    if (!currentUser) return;
    const isGeneralManager = currentUser.rol === 'admin';
    if (isGeneralManager) return;

    const allowed =
      currentUser.permisos && currentUser.permisos[activeTab] !== undefined
        ? Boolean(currentUser.permisos[activeTab])
        : activeTab === 'ventas' || (activeTab === 'pedidos_web' && currentUser.rol === 'supervisor');
    if (!allowed) {
      setActiveTab('ventas');
    }
  }, [currentUser]);

  // Centralized Audit Logger Helper (Persists locally and to immutable Firestore cloud)
  const logAuditoria = (
    modulo: RegistroAuditoria['modulo'],
    tipo_accion: RegistroAuditoria['tipo_accion'],
    descripcion: string,
    options?: {
      detalles?: string;
      sucursal_nombre?: string;
      sucursal_id?: number | null;
      customUser?: Usuario | null;
    }
  ) => {
    const userToLog = options?.customUser !== undefined ? options.customUser : currentUser;
    const entry = createAuditEntry(userToLog, modulo, tipo_accion, descripcion, options);
    setAuditoriaLogs((prev) => [entry, ...prev]);

    // Persistir de forma inmediata e inmutable en Firestore (Google Cloud)
    saveAuditoriaLogToFirestore(entry).catch((err) =>
      console.warn('Notice syncing auditoria to Firestore:', err)
    );
  };

  const lastHealedSignatureRef = React.useRef<string>('');

  // Helper: Apply company configuration & keep sucursales synchronized (respecting factory resets)
  const applyEmpresaConfigUpdate = (cloudEmpresa: Partial<EmpresaConfig>) => {
    if (!cloudEmpresa) return;

    const localResetMs = getStoredFactoryResetMs();
    const cloudResetMs = parseIsoMs(cloudEmpresa.factoryResetAt);
    const effectiveResetMs = Math.max(localResetMs, cloudResetMs);
    const cloudFiscalMs = parseIsoMs(cloudEmpresa.fiscalUpdatedAt);

    // Ignore stale pre-reset cloud config if local system was reset more recently and no newer fiscal save happened
    if (localResetMs > 0 && (!cloudResetMs || cloudResetMs < localResetMs) && cloudFiscalMs <= localResetMs) {
      return;
    }

    if (cloudEmpresa.factoryResetAt && cloudResetMs >= localResetMs) {
      try {
        localStorage.setItem(STORAGE_KEY_FACTORY_RESET_AT, cloudEmpresa.factoryResetAt);
      } catch (e) {}
    }

    let healPayload: EmpresaConfig | null = null;

    setEmpresaConfig((prev) => {
      const prevFiscalMs = parseIsoMs(prev.fiscalUpdatedAt);
      const prevResetMs = parseIsoMs(prev.factoryResetAt);
      const combinedResetMs = Math.max(effectiveResetMs, prevResetMs);

      // If local state ALREADY has a valid fiscal save strictly newer than the latest reset AND newer than incoming cloud payload,
      // ignore stale/blank fiscal fields from cloud/old tabs so we never flicker back to blank "Comercio".
      const localHasNewerValidFiscal =
        prevFiscalMs > combinedResetMs &&
        cloudFiscalMs < prevFiscalMs &&
        cloudResetMs <= prevFiscalMs;

      // Force fiscal fields blank only if a factory reset applies and NO valid fiscal save exists after it
      const mustKeepFiscalBlank =
        !localHasNewerValidFiscal &&
        ((combinedResetMs > 0 && cloudFiscalMs <= combinedResetMs && prevFiscalMs <= combinedResetMs) ||
          (cloudResetMs > Math.max(localResetMs, prevFiscalMs)));

      const cloudHadStaleFiscalStrings =
        mustKeepFiscalBlank &&
        Boolean(
          cloudEmpresa.nombreEmpresa ||
            cloudEmpresa.rif ||
            cloudEmpresa.direccionFiscal ||
            cloudEmpresa.telefono ||
            cloudEmpresa.logoUrl ||
            cloudEmpresa.piePaginaTicket
        );

      const nextNombre = mustKeepFiscalBlank
        ? ''
        : localHasNewerValidFiscal
        ? prev.nombreEmpresa
        : cloudEmpresa.nombreEmpresa !== undefined
        ? cloudEmpresa.nombreEmpresa
        : prev.nombreEmpresa;

      const nextRif = mustKeepFiscalBlank
        ? ''
        : localHasNewerValidFiscal
        ? prev.rif
        : cloudEmpresa.rif !== undefined
        ? cloudEmpresa.rif
        : prev.rif;

      const nextDireccion = mustKeepFiscalBlank
        ? ''
        : localHasNewerValidFiscal
        ? prev.direccionFiscal
        : cloudEmpresa.direccionFiscal !== undefined
        ? cloudEmpresa.direccionFiscal
        : prev.direccionFiscal;

      const nextTelefono = mustKeepFiscalBlank
        ? ''
        : localHasNewerValidFiscal
        ? prev.telefono
        : cloudEmpresa.telefono !== undefined
        ? cloudEmpresa.telefono
        : prev.telefono;

      const nextLogo = mustKeepFiscalBlank
        ? ''
        : localHasNewerValidFiscal
        ? prev.logoUrl
        : cloudEmpresa.logoUrl !== undefined
        ? cloudEmpresa.logoUrl
        : prev.logoUrl;

      const nextPie = mustKeepFiscalBlank
        ? ''
        : localHasNewerValidFiscal
        ? prev.piePaginaTicket
        : cloudEmpresa.piePaginaTicket !== undefined
        ? cloudEmpresa.piePaginaTicket
        : prev.piePaginaTicket;

      const nextFiscalUpdatedAt = mustKeepFiscalBlank
        ? ''
        : localHasNewerValidFiscal
        ? prev.fiscalUpdatedAt
        : cloudEmpresa.fiscalUpdatedAt || prev.fiscalUpdatedAt;

      const nextFactoryResetAt =
        combinedResetMs > 0
          ? cloudEmpresa.factoryResetAt || prev.factoryResetAt || new Date(combinedResetMs).toISOString()
          : cloudEmpresa.factoryResetAt || prev.factoryResetAt;

      const nextTasa =
        typeof cloudEmpresa.tasaCambio === 'number' && cloudEmpresa.tasaCambio > 0
          ? cloudEmpresa.tasaCambio
          : prev.tasaCambio;

      const nextStockMinimoAlerta =
        typeof cloudEmpresa.stockMinimoAlerta === 'number' &&
        !Number.isNaN(cloudEmpresa.stockMinimoAlerta) &&
        cloudEmpresa.stockMinimoAlerta >= 0
          ? cloudEmpresa.stockMinimoAlerta
          : prev.stockMinimoAlerta ?? 20;

      const updated: EmpresaConfig = {
        ...prev,
        ...cloudEmpresa,
        nombreEmpresa: nextNombre,
        rif: nextRif,
        nombreTienda1: cloudEmpresa.nombreTienda1 || prev.nombreTienda1 || 'Tienda 1',
        nombreTienda2: cloudEmpresa.nombreTienda2 || prev.nombreTienda2 || 'Tienda 2',
        nombreOficina: cloudEmpresa.nombreOficina || prev.nombreOficina || 'Oficina Central / Almacén',
        direccionFiscal: nextDireccion,
        telefono: nextTelefono,
        logoUrl: nextLogo,
        piePaginaTicket: nextPie,
        fiscalUpdatedAt: nextFiscalUpdatedAt,
        factoryResetAt: nextFactoryResetAt,
        tasaCambio: nextTasa,
        stockMinimoAlerta: nextStockMinimoAlerta,
        fechaTasa: cloudEmpresa.fechaTasa || prev.fechaTasa,
        ultimaActualizacionTasa: cloudEmpresa.ultimaActualizacionTasa || prev.ultimaActualizacionTasa,
      };

      if (cloudHadStaleFiscalStrings) {
        healPayload = updated;
      }

      // Avoid pointless re-renders if nothing materially changed
      if (
        prev.nombreEmpresa === updated.nombreEmpresa &&
        prev.rif === updated.rif &&
        prev.direccionFiscal === updated.direccionFiscal &&
        prev.telefono === updated.telefono &&
        prev.logoUrl === updated.logoUrl &&
        prev.piePaginaTicket === updated.piePaginaTicket &&
        prev.fiscalUpdatedAt === updated.fiscalUpdatedAt &&
        prev.factoryResetAt === updated.factoryResetAt &&
        prev.tasaCambio === updated.tasaCambio &&
        prev.stockMinimoAlerta === updated.stockMinimoAlerta &&
        prev.fechaTasa === updated.fechaTasa &&
        prev.nombreTienda1 === updated.nombreTienda1 &&
        prev.nombreTienda2 === updated.nombreTienda2 &&
        prev.nombreOficina === updated.nombreOficina
      ) {
        return prev;
      }

      saveEmpresaConfig(updated);
      return updated;
    });

    // Heal Firestore at most once per distinct stale payload signature (never inside state updater)
    if (healPayload) {
      const sig = `${(healPayload as EmpresaConfig).factoryResetAt || ''}::${cloudEmpresa.nombreEmpresa || ''}::${cloudEmpresa.rif || ''}`;
      if (lastHealedSignatureRef.current !== sig) {
        lastHealedSignatureRef.current = sig;
        saveEmpresaConfigToFirestore(healPayload).catch(() => {});
      }
    }

    // Synchronize sucursales #1..#3 names while preserving any developer-added branches (#4+)
    setSucursales((prevSucs) => {
      const s1 = cloudEmpresa.nombreTienda1 || 'Tienda 1';
      const s2 = cloudEmpresa.nombreTienda2 || 'Tienda 2';
      const s3 = cloudEmpresa.nombreOficina || 'Oficina Central / Almacén';

      const base = prevSucs.length > 0
        ? prevSucs
        : [
            { id: 1, nombre: s1, tipo: 'tienda' as const },
            { id: 2, nombre: s2, tipo: 'tienda' as const },
            { id: 3, nombre: s3, tipo: 'oficina' as const },
          ];

      const changed =
        base.find((s) => s.id === 1)?.nombre !== s1 ||
        base.find((s) => s.id === 2)?.nombre !== s2 ||
        base.find((s) => s.id === 3)?.nombre !== s3;

      if (!changed && prevSucs.length > 0) {
        return prevSucs;
      }

      const updatedSucs = base.map((suc) => {
        if (suc.id === 1) return { ...suc, nombre: s1 };
        if (suc.id === 2) return { ...suc, nombre: s2 };
        if (suc.id === 3) return { ...suc, nombre: s3 };
        return suc;
      });

      try {
        localStorage.setItem(STORAGE_KEYS.sucursales, JSON.stringify(updatedSucs));
      } catch (e) {}

      return updatedSucs;
    });
  };

  // Handler: Update company & store configurations (explicit manual save stamps fiscalUpdatedAt)
  const handleSaveEmpresaConfig = (updated: EmpresaConfig) => {
    const stamped: EmpresaConfig = {
      ...updated,
      fiscalUpdatedAt: new Date().toISOString(),
    };
    applyEmpresaConfigUpdate(stamped);

    // If company phone was updated and store WhatsApp is default/mock/empty, sync it automatically
    if (
      stamped.telefono &&
      (!tiendaConfig.whatsappContacto ||
        isMockDefaultPhone(tiendaConfig.whatsappContacto))
    ) {
      const updatedTienda = { ...tiendaConfig, whatsappContacto: stamped.telefono };
      setTiendaConfig(updatedTienda);
      try {
        localStorage.setItem(STORAGE_KEYS.tienda_config, JSON.stringify(updatedTienda));
      } catch (e) {}
    }

    saveEmpresaConfigToFirestore(stamped)
      .then((ok) => {
        if (!ok) enqueueSyncOp('firestore_empresa', 'firestore_empresa:main', stamped);
      })
      .catch(() => enqueueSyncOp('firestore_empresa', 'firestore_empresa:main', stamped));

    logAuditoria(
      'Configuración',
      'MODIFICAR',
      `Actualización de datos de la empresa: "${stamped.nombreEmpresa || 'Sin Razón Social'}" (RIF: ${stamped.rif || 'N/A'})`,
      {
        detalles: `Dirección: ${stamped.direccionFiscal}, Tel: ${stamped.telefono}. Sucursales: ${stamped.nombreTienda1}, ${stamped.nombreTienda2}, ${stamped.nombreOficina}`,
      }
    );
  };

  // Handler: Update or add branches (sucursales), keeping empresaConfig names 1-3 and Firestore in sync
  const handleUpdateSucursales = (nextSucursales: Sucursal[], auditDescription?: string) => {
    setSucursales(nextSucursales);
    try {
      localStorage.setItem(STORAGE_KEYS.sucursales, JSON.stringify(nextSucursales));
    } catch (e) {}

    const s1 = nextSucursales.find((s) => s.id === 1)?.nombre;
    const s2 = nextSucursales.find((s) => s.id === 2)?.nombre;
    const s3 = nextSucursales.find((s) => s.id === 3)?.nombre;

    if (s1 || s2 || s3) {
      let nextToSave: EmpresaConfig | null = null;
      const localResetMs = getStoredFactoryResetMs();
      setEmpresaConfig((prev) => {
        const resetMs = Math.max(localResetMs, parseIsoMs(prev.factoryResetAt));
        const fiscalMs = parseIsoMs(prev.fiscalUpdatedAt);
        const keepBlank = resetMs > 0 && fiscalMs <= resetMs;
        const synced: EmpresaConfig = {
          ...prev,
          ...(keepBlank
            ? {
                nombreEmpresa: '',
                rif: '',
                direccionFiscal: '',
                telefono: '',
                logoUrl: '',
                piePaginaTicket: '',
                fiscalUpdatedAt: '',
              }
            : {}),
          nombreTienda1: s1 || prev.nombreTienda1 || 'Tienda 1',
          nombreTienda2: s2 || prev.nombreTienda2 || 'Tienda 2',
          nombreOficina: s3 || prev.nombreOficina || 'Oficina Central / Almacén',
        };
        saveEmpresaConfig(synced);
        nextToSave = synced;
        return synced;
      });
      if (nextToSave) {
        const payload = nextToSave;
        saveEmpresaConfigToFirestore(payload)
          .then((ok) => {
            if (!ok) enqueueSyncOp('firestore_empresa', 'firestore_empresa:main', payload);
          })
          .catch(() => enqueueSyncOp('firestore_empresa', 'firestore_empresa:main', payload));
      }
    }

    saveSucursalesToFirestore(nextSucursales)
      .then((ok) => {
        if (!ok) enqueueSyncOp('firestore_sucursales', 'firestore_sucursales:all', nextSucursales);
      })
      .catch(() => enqueueSyncOp('firestore_sucursales', 'firestore_sucursales:all', nextSucursales));

    if (auditDescription) {
      logAuditoria('Configuración', 'CREAR', auditDescription, {
        detalles: `Total de sucursales activas: ${nextSucursales.length} (${nextSucursales.map((s) => s.nombre).join(', ')})`,
      });
    }
  };

  // Handler: Update daily exchange rate (functional state update avoids stale closures)
  const handleSaveTasa = (nuevaTasa: number) => {
    let tasaAnterior = 0;
    let nextToSave: EmpresaConfig | null = null;
    const localResetMs = getStoredFactoryResetMs();
    setEmpresaConfig((prev) => {
      tasaAnterior = prev.tasaCambio;
      const resetMs = Math.max(localResetMs, parseIsoMs(prev.factoryResetAt));
      const fiscalMs = parseIsoMs(prev.fiscalUpdatedAt);
      const keepBlank = resetMs > 0 && fiscalMs <= resetMs;
      const updated: EmpresaConfig = {
        ...prev,
        ...(keepBlank
          ? {
              nombreEmpresa: '',
              rif: '',
              direccionFiscal: '',
              telefono: '',
              logoUrl: '',
              piePaginaTicket: '',
              fiscalUpdatedAt: '',
            }
          : {}),
        tasaCambio: nuevaTasa,
        fechaTasa: new Date().toLocaleDateString('es-VE'),
        ultimaActualizacionTasa: new Date().toISOString(),
      };
      saveEmpresaConfig(updated);
      nextToSave = updated;
      return updated;
    });
    if (nextToSave) {
      saveEmpresaConfigToFirestore(nextToSave).catch((err) =>
        console.warn('Notice syncing tasaCambio to Firestore:', err)
      );
    }
    markTasaSetToday();

    logAuditoria(
      'Tasa de Cambio',
      'MODIFICAR',
      `Fijación de tasa oficial: 1 USD = ${nuevaTasa.toFixed(2)} Bs (Antes: ${tasaAnterior.toFixed(2)} Bs)`,
      {
        detalles: `Tasa aplicada al sistema en fecha ${new Date().toLocaleDateString('es-VE')}`,
      }
    );
  };

  // Handler: Update global low-stock alert threshold (default 20 units)
  const handleUpdateStockMinimoAlerta = (nuevoLimite: number) => {
    const sanitized = Math.max(0, Math.min(1000000, Math.round(Number(nuevoLimite) || 0)));
    let previo = 20;
    let nextToSave: EmpresaConfig | null = null;
    const localResetMs = getStoredFactoryResetMs();
    setEmpresaConfig((prev) => {
      previo = prev.stockMinimoAlerta ?? 20;
      const resetMs = Math.max(localResetMs, parseIsoMs(prev.factoryResetAt));
      const fiscalMs = parseIsoMs(prev.fiscalUpdatedAt);
      const keepBlank = resetMs > 0 && fiscalMs <= resetMs;
      const updated: EmpresaConfig = {
        ...prev,
        ...(keepBlank
          ? {
              nombreEmpresa: '',
              rif: '',
              direccionFiscal: '',
              telefono: '',
              logoUrl: '',
              piePaginaTicket: '',
              fiscalUpdatedAt: '',
            }
          : {}),
        stockMinimoAlerta: sanitized,
      };
      saveEmpresaConfig(updated);
      nextToSave = updated;
      return updated;
    });
    if (nextToSave) {
      saveEmpresaConfigToFirestore(nextToSave).catch((err) =>
        console.warn('Notice syncing stockMinimoAlerta to Firestore:', err)
      );
    }

    logAuditoria(
      'Inventario',
      'MODIFICAR',
      `Actualización de umbral global de alerta por stock bajo: < ${sanitized} un. (Antes: < ${previo} un.)`,
      {
        detalles: `Aplicado a productos sin mínimo individual en tiendas.`,
      }
    );
  };

  // Automated Daily exchange rate sync on startup:
  // Automatically queries the official BCV exchange rate on system boot.
  // If successful: updates the rate in the system, stores the sync date, and displays a confirmation notification.
  // If offline or fails: prompts the operator with the DailyRateModal for manual entry/confirmation.
  useEffect(() => {
    let isMounted = true;

    const performDailyRateRoutine = async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const lastAutoSync = localStorage.getItem('pos_last_bcv_auto_sync_date');

      // If already synced today and today's rate is confirmed, skip
      if (lastAutoSync === todayStr && hasSetTasaToday()) {
        return;
      }

      try {
        const live = await fetchLiveBcvRate();
        if (!isMounted) return;

        if (live && live.success && live.tasa && live.tasa > 0) {
          const roundedTasa = Number(live.tasa.toFixed(2));
          handleSaveTasa(roundedTasa);
          try {
            localStorage.setItem('pos_last_bcv_auto_sync_date', todayStr);
          } catch (e) {}

          setBcvAutoNotice({
            tasa: roundedTasa,
            fecha: live.fecha || new Date().toLocaleDateString('es-VE'),
            fuente: live.fuente || 'Banco Central de Venezuela (BCV Oficial)',
          });
          return;
        }
      } catch (err) {
        console.warn('Auto BCV rate sync routine notice:', err);
      }

      if (!isMounted) return;

      // Fallback: If auto-fetch failed (e.g. offline machine) and rate not set today, open manual rate modal
      if (!hasSetTasaToday()) {
        setShowDailyRateModal(true);
      }
    };

    const timer = setTimeout(() => {
      performDailyRateRoutine();
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [currentUser]);

  // Firebase Firestore Real-Time Subscriptions (Only active when authenticated with verified Google Cloud user)
  useEffect(() => {
    if (!cloudUser?.emailVerified) return;

    // 1. Silent ping check
    testFirestoreConnection().catch(() => {});

    // 2. Fetch latest company config immediately on startup
    getEmpresaConfigFromFirestore()
      .then((cfg) => {
        if (cfg) {
          applyEmpresaConfigUpdate(cfg);
        }
      })
      .catch((err) => console.warn('Notice fetching initial empresa config:', err));

    // 3. Real-time web orders listener (merges cloud orders created after factory reset)
    const unsubOrders = subscribeToPedidosOnline((cloudOrders) => {
      const validCloudOrders = (cloudOrders || []).filter((o) =>
        isCreatedAfterFactoryReset(o.creadoEn || o.fecha)
      );
      if (validCloudOrders.length > 0) {
        setPedidosOnline((prev) => {
          const validPrev = prev.filter((p) => isCreatedAfterFactoryReset(p.creadoEn || p.fecha));
          const prevMap = new Map(validPrev.map((p) => [p.id, p]));
          const newPending = validCloudOrders.find(
            (o) => !prevMap.has(o.id) && o.estado === 'pendiente'
          );
          if (newPending) {
            playOrderChime();
            setNuevoPedidoNotificacion(newPending);
          }

          const mergedMap = new Map<string, PedidoOnline>();
          validPrev.forEach((p) => mergedMap.set(p.id, p));
          validCloudOrders.forEach((o) => {
            const existing = mergedMap.get(o.id);
            mergedMap.set(o.id, existing ? { ...existing, ...o } : o);
          });

          return Array.from(mergedMap.values()).sort(
            (a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime()
          );
        });
      }
    });

    // 4. Real-time exchange rate & company configuration from Firestore (Live sync)
    const unsubEmpresa = subscribeToEmpresaConfig((cloudEmpresa) => {
      if (cloudEmpresa) {
        applyEmpresaConfigUpdate(cloudEmpresa);
      }
    });

    // 5. Real-time digital store configuration
    const unsubTienda = subscribeToTiendaConfig((cloudTienda) => {
      if (cloudTienda) {
        setTiendaConfig((prev) => ({ ...prev, ...cloudTienda }));
      }
    });

    // 6. Real-time immutable audit logs from Firestore (respecting factory reset boundary)
    const unsubAuditoria = subscribeToAuditoriaLogs((cloudLogs) => {
      const validLogs = (cloudLogs || []).filter((l) => isCreatedAfterFactoryReset(l.timestamp));
      if (validLogs.length > 0) {
        setAuditoriaLogs((prev) => {
          const validPrev = prev.filter((l) => isCreatedAfterFactoryReset(l.timestamp));
          const map = new Map<string, RegistroAuditoria>();
          validLogs.forEach((l) => map.set(l.id, l));
          validPrev.forEach((l) => {
            if (!map.has(l.id)) map.set(l.id, l);
          });
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        });
      }
    });

    // 7. Real-time system users & hashed PINs sync from Firestore (read-only hydration, never auto-escalates)
    const unsubUsuarios = subscribeToUsuarios((cloudUsers) => {
      if (cloudUsers && cloudUsers.length > 0) {
        const { users: safeUsers } = ensureMinimumFullAdmin(cloudUsers);

        setUsuarios((prev) => {
          const prevStr = JSON.stringify(prev);
          const nextStr = JSON.stringify(safeUsers);
          if (prevStr === nextStr) return prev;
          try {
            localStorage.setItem(STORAGE_KEYS.usuarios, nextStr);
          } catch (e) {}
          return safeUsers;
        });

        setCurrentUser((prev) => {
          if (!prev) return prev;
          const updatedActive = safeUsers.find((u) => u.id === prev.id);
          return updatedActive ? sanitizeUserForSession(updatedActive) : prev;
        });
      }
    });

    // 8. Real-time branches (sucursales) sync from Firestore
    const unsubSucursales = subscribeToSucursales((cloudSucs) => {
      if (cloudSucs && cloudSucs.length > 0) {
        setSucursales((prev) => {
          const prevStr = JSON.stringify(prev);
          const nextStr = JSON.stringify(cloudSucs);
          if (prevStr === nextStr) return prev;
          try {
            localStorage.setItem(STORAGE_KEYS.sucursales, nextStr);
          } catch (e) {}
          return cloudSucs;
        });
      }
    });

    return () => {
      unsubOrders();
      unsubEmpresa();
      unsubTienda();
      unsubAuditoria();
      unsubUsuarios();
      unsubSucursales();
    };
  }, [cloudUser?.uid, cloudUser?.emailVerified]);


  // Calculate totals
  const totalSalesToday = ventas.reduce((acc, v) => acc + v.total, 0);
  const unitsToday = ventas.reduce((acc, v) => {
    return acc + v.detalles.reduce((dAcc, d) => dAcc + d.cantidad, 0);
  }, 0);

  // Handler: Register a new sale from POS with Cashier Audit, Customer and Payment breakdown
  const handleRegistrarVenta = async (
    sucursalId: number,
    items: { producto: Producto; cantidad: number }[],
    cliente: { id: number | null; nombre: string; rif: string },
    pagoDetalle: DetallePagoVenta
  ): Promise<boolean> => {
    // Consolidar líneas repetidas del carrito antes de validar y descontar
    const consolidatedItems = consolidateSaleItems(items);

    // 1. Verificación previa de existencias locales en la sucursal activa
    const branchInv = inventario.filter((i) => i.sucursal_id === sucursalId);
    for (const item of consolidatedItems) {
      const invRow = branchInv.find((i) => i.producto_id === item.producto.id);
      const stockDisponible = invRow ? invRow.stock : 0;
      if (stockDisponible < item.cantidad) {
        alert(
          `¡Existencia insuficiente para la venta!\n\nProducto: "${item.producto.nombre}"\nStock disponible: ${stockDisponible}\nCantidad solicitada: ${item.cantidad}\n\nPor favor ajuste la cantidad en el carrito antes de continuar.`
        );
        return false;
      }
    }

    const subtotalNeto = items.reduce((acc, item) => acc + item.producto.precio * item.cantidad, 0);
    const baseImponible = items
      .filter((i) => !i.producto.exento_iva)
      .reduce((acc, item) => acc + item.producto.precio * item.cantidad, 0);
    const montoExento = items
      .filter((i) => !!i.producto.exento_iva)
      .reduce((acc, item) => acc + item.producto.precio * item.cantidad, 0);
    const montoIva = +(baseImponible * 0.16).toFixed(2);
    const descuentoUsd = Math.max(0, Number(pagoDetalle.descuento_usd || 0));
    const totalVenta = +(Math.max(0, baseImponible + montoIva + montoExento - descuentoUsd)).toFixed(2);
    const newVentaId = ventas.reduce((max, v) => Math.max(max, Number(v.id) || 0), 0) + 1;
    const numeroFactura = String(newVentaId).padStart(8, '0');
    const txUid = `${newVentaId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const detalles = items.map((item, index) => {
      const isExento = !!item.producto.exento_iva;
      const subtotalItem = +(item.producto.precio * item.cantidad).toFixed(2);
      const ivaItem = isExento ? 0 : +(subtotalItem * 0.16).toFixed(2);

      return {
        id: newVentaId * 100 + index,
        venta_id: newVentaId,
        producto_id: item.producto.id,
        producto_nombre: item.producto.nombre,
        cantidad: item.cantidad,
        precio_unitario: item.producto.precio,
        subtotal: subtotalItem,
        exento_iva: isExento,
        monto_iva: ivaItem,
      };
    });

    const nuevaVenta: Venta = {
      id: newVentaId,
      sucursal_id: sucursalId,
      usuario_id: currentUser ? currentUser.id : undefined,
      usuario_nombre: currentUser ? currentUser.nombre_completo : 'Cajero Anónimo',
      cliente_id: cliente.id,
      cliente_nombre: cliente.nombre,
      cliente_rif: cliente.rif,
      fecha: new Date().toISOString(),
      subtotal_neto: subtotalNeto,
      base_imponible: baseImponible,
      monto_exento: montoExento,
      monto_iva: montoIva,
      total: totalVenta,
      metodo_pago: pagoDetalle.metodo,
      referencia_pago: pagoDetalle.referencia_pago_movil,
      pago_detalle: pagoDetalle,
      detalles,
    };
    (nuevaVenta as any).numeroFactura = numeroFactura;
    (nuevaVenta as any).txUid = txUid;

    // 2. Transacción Atómica en Firestore con bloqueo de concurrencia e idempotencia
    const txResult = await registrarVentaTransaccional({
      venta: nuevaVenta,
      sucursalId,
      items: consolidatedItems,
      txUid,
    });

    // Detectar conflicto si otro dispositivo agotó el inventario concurrentemente
    if (!txResult.success && txResult.stockFaltante && txResult.stockFaltante.length > 0) {
      const msgs = txResult.stockFaltante
        .map((f) => `• ${f.nombre} (Disponible: ${f.stockDisponible}, Solicitado: ${f.requerido})`)
        .join('\n');
      alert(
        `¡Conflicto de inventario concurrente detectado!\n\nOtro punto de venta acaba de vender las existencias de:\n${msgs}\n\nLa venta no pudo ser procesada para evitar sobreventa.`
      );
      return false;
    }

    // Si falló por offline o error no relacionado a stock, encolar venta para conciliación automática en Firestore
    if (!txResult.success) {
      enqueueSyncOp(
        'firestore_venta',
        `firestore_venta:${txUid}`,
        {
          venta: nuevaVenta,
          sucursalId,
          items: consolidatedItems,
          txUid,
        },
        txResult.error
      );
    }

    // 3. Actualizar historial de ventas local (Offline-first inmediato)
    setVentas([nuevaVenta, ...ventas]);

    // 4. Registro de auditoría
    const sucursalName = sucursales.find((s) => s.id === sucursalId)?.nombre || `Sucursal #${sucursalId}`;
    logAuditoria(
      'POS / Ventas',
      'VENTA',
      `Venta POS #${numeroFactura} registrada en ${sucursalName} por ${formatUSD(totalVenta)} (${formatBs(totalVenta, empresaConfig.tasaCambio)}) [Método: ${pagoDetalle.metodo}]`,
      {
        sucursal_id: sucursalId,
        sucursal_nombre: sucursalName,
        detalles: `Cliente: "${cliente.nombre}" (${cliente.rif || 'S/N'}). Items: ${consolidatedItems.map((i) => `${i.cantidad}x ${i.producto.nombre}`).join(', ')}. Base: $${baseImponible}, IVA: $${montoIva}, Exento: $${montoExento}`,
      }
    );

    // 5. Descontar existencias consolidadas en el inventario local
    const qtyByProduct = new Map<number, number>(
      consolidatedItems.map((i) => [i.producto.id, i.cantidad])
    );
    setInventario((prevInv) => {
      const updated = prevInv.map((invItem) => {
        if (invItem.sucursal_id === sucursalId) {
          const soldQty = qtyByProduct.get(invItem.producto_id);
          if (soldQty !== undefined) {
            const nextStock = Math.max(0, +(invItem.stock - soldQty).toFixed(3));
            return {
              ...invItem,
              stock: nextStock,
            };
          }
        }
        return invItem;
      });
      return updated;
    });

    return true;
  };

  // Handler: Register new purchase from supplier with itemized invoice lines & catalog sync
  const handleRegistrarCompra = (compraData: Omit<Compra, 'id'>, newCatalogProducts?: Producto[]) => {
    const newId = compras.length + 1;
    const newCompra: Compra = {
      ...compraData,
      id: newId,
    };

    setCompras([newCompra, ...compras]);

    const sucursalDest = sucursales.find((s) => s.id === compraData.sucursalId)?.nombre || `Sucursal #${compraData.sucursalId}`;
    logAuditoria(
      'Compras',
      'COMPRA',
      `Factura de compra #${compraData.numeroFactura || newId} registrada a proveedor "${compraData.proveedorNombre}" por ${formatUSD(compraData.total)} (${compraData.detalles.length} renglones)`,
      {
        sucursal_id: compraData.sucursalId,
        sucursal_nombre: sucursalDest,
        detalles: `Destino: ${sucursalDest}. Items: ${compraData.detalles.map((d) => `${d.cantidad}x ${d.productoNombre} (Costo: $${d.costoUnitario})`).join(', ')}`,
      }
    );

    // Update or add products in catalog with new cost, selling price (PVP), unit of measure
    setProductos((prevProds) => {
      let nextProds = [...prevProds];

      // Add any newly registered products from invoice lines
      if (newCatalogProducts && newCatalogProducts.length > 0) {
        newCatalogProducts.forEach((np) => {
          if (!nextProds.some((p) => p.id === np.id || (p.codigo_barras && p.codigo_barras === np.codigo_barras))) {
            nextProds.push(np);
          }
        });
      }

      // Update costs and PVPs for items in this purchase
      nextProds = nextProds.map((prod) => {
        const boughtItem = compraData.detalles.find((d) => d.productoId === prod.id || (d.codigo_barras && d.codigo_barras === prod.codigo_barras));
        if (boughtItem) {
          return {
            ...prod,
            costo: boughtItem.costoUnitario,
            precio: (boughtItem.precioVenta && boughtItem.precioVenta > 0) ? boughtItem.precioVenta : prod.precio,
            unidad_medida: boughtItem.unidad_medida || prod.unidad_medida || 'UND',
            exento_iva: boughtItem.exentoIva !== undefined ? boughtItem.exentoIva : prod.exento_iva,
          };
        }
        return prod;
      });

      return nextProds;
    });

    // Increment inventory in destination branch (or create inventory row if missing)
    setInventario((prevInv) => {
      let nextInv = [...prevInv];

      compraData.detalles.forEach((boughtItem) => {
        const existingIdx = nextInv.findIndex(
          (i) => i.sucursal_id === compraData.sucursalId && i.producto_id === boughtItem.productoId
        );

        if (existingIdx >= 0) {
          const curStock = nextInv[existingIdx].stock || 0;
          nextInv[existingIdx] = {
            ...nextInv[existingIdx],
            stock: +(curStock + boughtItem.cantidad).toFixed(3),
          };
        } else {
          const newInvId = Math.max(...nextInv.map((i) => i.id), 0) + 1;
          nextInv.push({
            id: newInvId,
            sucursal_id: compraData.sucursalId,
            producto_id: boughtItem.productoId,
            stock: +boughtItem.cantidad.toFixed(3),
          });
        }
      });

      return nextInv;
    });

    // Create automatic CxP if credit purchase
    const prov =
      proveedores.find((p) => p.id === compraData.proveedorId) ||
      findMatchingProveedor(proveedores, compraData.proveedorNombre);
    const targetProvId = prov ? prov.id : compraData.proveedorId;
    const targetProvNombre = prov ? prov.nombre : compraData.proveedorNombre;
    if (compraData.condicionPago === 'credito') {
      const vcto = compraData.fechaVencimiento 
        ? compraData.fechaVencimiento 
        : (compraData.diasCredito 
            ? new Date(new Date(compraData.fecha).getTime() + compraData.diasCredito * 24 * 3600 * 1000).toISOString()
            : new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString());

      const newCxp: CuentaPorPagar = {
        id: cxpList.length + 1,
        proveedorId: targetProvId,
        proveedorNombre: targetProvNombre,
        compraId: newId,
        numeroFactura: compraData.numeroFactura || `FAC-${newId}`,
        fechaEmision: compraData.fecha,
        fechaVencimiento: vcto,
        montoTotal: compraData.total,
        saldoRestante: compraData.total,
        estado: 'pendiente',
        pagos: [],
        tasaRecepcion: compraData.tasaRecepcion,
        pagarATasaRecepcion: compraData.pagarATasaRecepcion,
      };
      setCxpList([newCxp, ...cxpList]);

      // Update provider balance
      setProveedores((prev) =>
        prev.map((p) => (p.id === targetProvId ? { ...p, saldoPendiente: +(p.saldoPendiente + compraData.total).toFixed(2) } : p))
      );
    }

    // Persistir compra, incremento de stock y CxP de forma atómica en Firestore
    registrarCompraTransaccional(newCompra, currentUser?.nombre_completo).catch((err) =>
      console.warn('Registro atómico de compra Firestore notice:', err)
    );
  };

  // Handler: Transfer Stock between branches with atomic transaction
  const handleTransferStock = (
    origenId: number,
    destinoId: number,
    productoId: number,
    cantidad: number
  ): boolean => {
    const origenItem = inventario.find(
      (i) => i.sucursal_id === origenId && i.producto_id === productoId
    );
    if (!origenItem || origenItem.stock < cantidad) {
      return false;
    }

    const prodObj = productos.find((p) => p.id === productoId);
    const origBranch = sucursales.find((s) => s.id === origenId)?.nombre || `Sucursal #${origenId}`;
    const destBranch = sucursales.find((s) => s.id === destinoId)?.nombre || `Sucursal #${destinoId}`;

    // Disparar transacción atómica en Firestore (garantiza no-pérdida entre sucursales)
    transferirStockTransaccional({
      origenId,
      destinoId,
      productoId,
      productoNombre: prodObj?.nombre || `Producto #${productoId}`,
      cantidad,
      usuarioNombre: currentUser?.nombre_completo || 'Supervisor',
    }).catch((err) => console.warn('Transferencia atómica Firestore notice:', err));

    setInventario((prev) => {
      // Deduct from origen
      let next = prev.map((item) => {
        if (item.sucursal_id === origenId && item.producto_id === productoId) {
          return { ...item, stock: +(item.stock - cantidad).toFixed(3) };
        }
        return item;
      });

      // Add to destino (or create if not existing)
      const destExists = next.some(
        (item) => item.sucursal_id === destinoId && item.producto_id === productoId
      );

      if (destExists) {
        next = next.map((item) => {
          if (item.sucursal_id === destinoId && item.producto_id === productoId) {
            return { ...item, stock: +(item.stock + cantidad).toFixed(3) };
          }
          return item;
        });
      } else {
        const newInvId = Math.max(...next.map((i) => i.id), 0) + 1;
        next.push({
          id: newInvId,
          sucursal_id: destinoId,
          producto_id: productoId,
          stock: cantidad,
        });
      }

      return next;
    });

    logAuditoria(
      'Inventario',
      'TRASPASO',
      `Traspaso de stock: ${cantidad} und de "${prodObj?.nombre || 'Producto #' + productoId}" desde ${origBranch} hacia ${destBranch}`,
      {
        detalles: `Stock origen anterior: ${origenItem.stock}, nuevo stock origen: ${origenItem.stock - cantidad}`,
      }
    );

    return true;
  };

  // Handler: Batch Transfer Stock between branches with multi-item logging
  const handleBatchTransferStock = (
    origenId: number,
    destinoId: number,
    itemsToTransfer: Array<{ productoId: number; cantidad: number }>
  ): { success: boolean; transferredCount: number; errors: string[] } => {
    if (!itemsToTransfer || itemsToTransfer.length === 0) {
      return { success: false, transferredCount: 0, errors: ['No hay artículos para transferir.'] };
    }
    if (origenId === destinoId) {
      return { success: false, transferredCount: 0, errors: ['La sucursal de origen y destino deben ser distintas.'] };
    }

    const errors: string[] = [];
    let transferred = 0;

    for (const item of itemsToTransfer) {
      if (item.cantidad <= 0) continue;
      const ok = handleTransferStock(origenId, destinoId, item.productoId, item.cantidad);
      if (ok) {
        transferred++;
      } else {
        const prodObj = productos.find((p) => p.id === item.productoId);
        errors.push(`Stock insuficiente en origen para "${prodObj?.nombre || 'Producto #' + item.productoId}".`);
      }
    }

    return {
      success: transferred > 0,
      transferredCount: transferred,
      errors,
    };
  };

  // Handler: Add new product to global catalog
  const handleAddProduct = (
    codigoBarras: string,
    nombre: string,
    precio: number,
    costo: number,
    stockOficina: number,
    exentoIva?: boolean,
    categoria?: string,
    unidadMedida?: string,
    imagen?: string,
    descripcion?: string,
    destacadoTienda?: boolean,
    stockMinimo?: number
  ) => {
    const newProdId = Math.max(...productos.map((p) => p.id), 0) + 1;
    const newProd: Producto = {
      id: newProdId,
      codigo_barras: codigoBarras,
      nombre,
      precio,
      costo: +(costo || +(precio * 0.7).toFixed(2)),
      unidad_medida: unidadMedida || 'UND',
      exento_iva: !!exentoIva,
      categoria: categoria || 'Víveres & Granos',
      descripcion: descripcion || '',
      imagen: imagen || '',
      destacadoTienda: destacadoTienda !== undefined ? destacadoTienda : true,
      ...(typeof stockMinimo === 'number' && !Number.isNaN(stockMinimo) && stockMinimo >= 0
        ? { stock_minimo: Math.round(stockMinimo) }
        : {}),
    };
    setProductos((prev) => [...prev, newProd]);

    // Initialize stock for the new product across all active branches
    const baseInvId = Math.max(...inventario.map((i) => i.id), 0);
    const primaryOficinaId =
      sucursales.find((s) => s.id === 3)?.id ??
      sucursales.find((s) => s.tipo === 'oficina')?.id ??
      3;
    const newInvItems: InventarioItem[] = (
      sucursales.length > 0
        ? sucursales
        : [
            { id: 1, nombre: 'Tienda 1', tipo: 'tienda' as const },
            { id: 2, nombre: 'Tienda 2', tipo: 'tienda' as const },
            { id: 3, nombre: 'Oficina Central / Almacén', tipo: 'oficina' as const },
          ]
    ).map((suc, idx) => ({
      id: baseInvId + idx + 1,
      sucursal_id: suc.id,
      producto_id: newProdId,
      stock: suc.id === primaryOficinaId ? stockOficina : 0,
    }));
    setInventario((prev) => [...prev, ...newInvItems]);

    // Sync to Firestore with persistent offline retry queue
    const nextInventory = [...inventario, ...newInvItems];
    saveProductToFirestore(newProd)
      .then((ok) => {
        if (!ok) enqueueSyncOp('firestore_product', `firestore_product:${newProd.id}`, newProd);
      })
      .catch(() => enqueueSyncOp('firestore_product', `firestore_product:${newProd.id}`, newProd));
    saveInventarioToFirestore(nextInventory)
      .then((ok) => {
        if (!ok) enqueueSyncOp('firestore_inventario', 'firestore_inventario:all', nextInventory);
      })
      .catch(() => enqueueSyncOp('firestore_inventario', 'firestore_inventario:all', nextInventory));

    logAuditoria(
      'Inventario',
      'CREAR',
      `Creación de nuevo producto en catálogo: "${nombre}" (PVP: ${formatUSD(precio)}, Costo: ${formatUSD(costo)})`,
      {
        detalles: `Código de barras: ${codigoBarras || 'N/A'}. Stock inicial en almacén central: ${stockOficina} und`,
      }
    );
  };

  // Handler: Update product
  const handleUpdateProduct = (updated: Producto) => {
    setProductos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    saveProductToFirestore(updated)
      .then((ok) => {
        if (!ok) enqueueSyncOp('firestore_product', `firestore_product:${updated.id}`, updated);
      })
      .catch(() => enqueueSyncOp('firestore_product', `firestore_product:${updated.id}`, updated));

    logAuditoria(
      'Inventario',
      'MODIFICAR',
      `Modificación de producto: "${updated.nombre}" (PVP: ${formatUSD(updated.precio)})`,
      {
        detalles: `Costo: ${formatUSD(updated.costo || 0)}, Código: ${updated.codigo_barras || 'N/A'}, Exento IVA: ${updated.exento_iva ? 'Sí' : 'No'}`,
      }
    );
  };

  // Handler: Delete product
  const handleDeleteProduct = (productId: number) => {
    const targetProd = productos.find((p) => p.id === productId);
    setProductos((prev) => prev.filter((p) => p.id !== productId));
    const nextInv = inventario.filter((i) => i.producto_id !== productId);
    setInventario(nextInv);

    // Sync deletion to Firestore with offline queue fallback
    deleteProductFromFirestore(productId)
      .then((ok) => {
        if (!ok) enqueueSyncOp('firestore_delete_product', `firestore_delete_product:${productId}`, { id: productId });
      })
      .catch(() =>
        enqueueSyncOp('firestore_delete_product', `firestore_delete_product:${productId}`, { id: productId })
      );
    saveInventarioToFirestore(nextInv)
      .then((ok) => {
        if (!ok) enqueueSyncOp('firestore_inventario', 'firestore_inventario:all', nextInv);
      })
      .catch(() => enqueueSyncOp('firestore_inventario', 'firestore_inventario:all', nextInv));

    logAuditoria(
      'Inventario',
      'ELIMINAR',
      `Eliminación de producto del catálogo: "${targetProd?.nombre || 'ID #' + productId}"`,
      {
        detalles: `Código: ${targetProd?.codigo_barras || 'N/A'}, PVP: ${formatUSD(targetProd?.precio || 0)}`,
      }
    );
  };

  // Handler: Add Client
  const handleAddCliente = (
    newCliente: Omit<Cliente, 'id' | 'saldoPendiente' | 'fechaRegistro'> & {
      saldoPendiente?: number;
      fechaRegistro?: string;
    }
  ): Cliente => {
    const id = Date.now();
    const created: Cliente = {
      ...newCliente,
      saldoPendiente: newCliente.saldoPendiente ?? 0,
      fechaRegistro: newCliente.fechaRegistro ?? new Date().toISOString().split('T')[0],
      id,
    };
    setClientes((prev) => [...prev, created]);
    logAuditoria(
      'Clientes',
      'CREAR',
      `Registro de nuevo cliente: "${newCliente.nombre}" (${newCliente.rif_cedula})`,
      {
        detalles: `Teléfono: ${newCliente.telefono || 'N/A'}, Límite crédito: ${formatUSD(newCliente.limiteCredito || 0)}`,
      }
    );
    return created;
  };

  // Handler: Update Client
  const handleUpdateCliente = (updated: Cliente) => {
    setClientes((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    logAuditoria(
      'Clientes',
      'MODIFICAR',
      `Actualización de datos del cliente: "${updated.nombre}" (${updated.rif_cedula})`,
      {
        detalles: `Tel: ${updated.telefono}, Email: ${updated.email || 'N/A'}, Límite: ${formatUSD(updated.limiteCredito || 0)}`,
      }
    );
  };

  // Handler: Delete Client
  const handleDeleteCliente = (id: number) => {
    const client = clientes.find((c) => c.id === id);
    if (client && client.saldoPendiente > 0) {
      alert(`No se puede eliminar el cliente "${client.nombre}" porque tiene un saldo deudor pendiente de $${client.saldoPendiente.toFixed(2)}.`);
      return false;
    }
    setClientes((prev) => prev.filter((c) => c.id !== id));
    logAuditoria(
      'Clientes',
      'ELIMINAR',
      `Eliminación de cliente: "${client?.nombre || 'ID #' + id}" (${client?.rif_cedula})`
    );
    return true;
  };

  // Handler: Add Supplier (deduplicated by normalized RIF or business name)
  const handleAddProveedor = (newProv: Omit<Proveedor, 'id'>): Proveedor => {
    const existing = findMatchingProveedor<Proveedor>(proveedores, newProv.nombre, newProv.rif);
    if (existing) {
      const existingRifKey = normalizeSupplierRifKey(existing.rif);
      const newRifKey = normalizeSupplierRifKey(newProv.rif);
      const hasBetterPhone =
        (!existing.telefono || existing.telefono === 'N/A') &&
        Boolean(newProv.telefono && newProv.telefono !== 'N/A');
      const hasBetterContacto =
        (!existing.contacto || existing.contacto === 'Contacto Factura' || existing.contacto === 'N/A') &&
        Boolean(newProv.contacto && newProv.contacto !== 'Contacto Factura' && newProv.contacto !== 'N/A');
      const hasBetterRif = !existingRifKey && Boolean(newRifKey);

      if (hasBetterRif || hasBetterPhone || hasBetterContacto) {
        const enriched: Proveedor = {
          ...existing,
          rif: hasBetterRif ? newProv.rif : existing.rif,
          telefono: hasBetterPhone ? newProv.telefono : existing.telefono,
          contacto: hasBetterContacto ? newProv.contacto : existing.contacto,
        };
        setProveedores((prev) => prev.map((p) => (p.id === existing.id ? enriched : p)));
        return enriched;
      }
      return existing;
    }

    const id = Date.now();
    const created: Proveedor = { ...newProv, id };
    setProveedores((prev) => {
      if (findMatchingProveedor(prev, newProv.nombre, newProv.rif)) {
        return prev;
      }
      return [...prev, created];
    });
    logAuditoria(
      'Proveedores',
      'CREAR',
      `Registro de nuevo proveedor: "${newProv.nombre}" (${newProv.rif})`,
      {
        detalles: `Contacto: ${newProv.contacto || 'N/A'}, Tel: ${newProv.telefono || 'N/A'}`,
      }
    );
    return created;
  };

  // Handler: Update Supplier
  const handleUpdateProveedor = (updated: Proveedor) => {
    setProveedores(proveedores.map((p) => (p.id === updated.id ? updated : p)));
    logAuditoria(
      'Proveedores',
      'MODIFICAR',
      `Actualización de datos del proveedor: "${updated.nombre}" (${updated.rif})`,
      {
        detalles: `Contacto: ${updated.contacto || 'N/A'}, Tel: ${updated.telefono || 'N/A'}`,
      }
    );
  };

  // Handler: Delete Supplier
  const handleDeleteProveedor = (id: number) => {
    const prov = proveedores.find((p) => p.id === id);
    if (prov && prov.saldoPendiente > 0) {
      alert(`No se puede eliminar el proveedor "${prov.nombre}" porque tiene un saldo deudor pendiente de $${prov.saldoPendiente.toFixed(2)}.`);
      return false;
    }
    setProveedores((prev) => prev.filter((p) => p.id !== id));
    logAuditoria(
      'Proveedores',
      'ELIMINAR',
      `Eliminación de proveedor: "${prov?.nombre || 'ID #' + id}" (${prov?.rif})`
    );
    return true;
  };

  // Handler: Register CxC Abono (payment from client)
  const handleRegistrarAbonoCxc = (cxcId: number, monto: number, metodo: string, referencia?: string) => {
    const targetCxc = cxcList.find((c) => c.id === cxcId);

    setCxcList((prev) =>
      prev.map((item) => {
        if (item.id === cxcId) {
          const nuevoSaldo = Math.max(0, item.saldoRestante - monto);
          const nuevoEstado = nuevoSaldo === 0 ? 'pagada' : 'parcial';
          const newAbono = {
            id: item.abonos.length + 1,
            fecha: new Date().toISOString(),
            monto,
            metodoPago: metodo,
            referencia,
            usuarioNombre: currentUser?.nombre_completo || 'Cajero',
          };
          return {
            ...item,
            saldoRestante: nuevoSaldo,
            estado: nuevoEstado,
            abonos: [...item.abonos, newAbono],
          };
        }
        return item;
      })
    );

    // Update client balance
    if (targetCxc) {
      setClientes((prev) =>
        prev.map((cl) =>
          cl.id === targetCxc.clienteId
            ? { ...cl, saldoPendiente: Math.max(0, +(cl.saldoPendiente - monto).toFixed(2)) }
            : cl
        )
      );
      logAuditoria(
        'CxC',
        'ABONO',
        `Abono de ${formatUSD(monto)} recibido de "${targetCxc.clienteNombre}" para cuenta #${targetCxc.id} (${targetCxc.concepto}) [${metodo}]`,
        {
          detalles: `Saldo restante: ${formatUSD(Math.max(0, +(targetCxc.saldoRestante - monto).toFixed(2)))}. Ref: ${referencia || 'N/A'}`,
        }
      );
    }

    // Persistir de forma atómica en Firestore con protección contra pagos duplicados o saldos negativos
    registrarAbonoCxcTransaccional({
      cxcId,
      monto,
      metodoPago: metodo,
      referencia,
      usuarioNombre: currentUser?.nombre_completo || 'Cajero',
    }).catch((err) => console.warn('Abono CxC transaccional notice:', err));
  };

  // Handler: New CxC
  const handleNuevaCxc = (cxcData: Omit<CuentaPorCobrar, 'id' | 'abonos'>) => {
    const newId = cxcList.length + 1;
    const newCxc: CuentaPorCobrar = {
      ...cxcData,
      id: newId,
      abonos: [],
    };
    setCxcList([newCxc, ...cxcList]);
    setClientes((prev) =>
      prev.map((c) =>
        c.id === cxcData.clienteId ? { ...c, saldoPendiente: c.saldoPendiente + cxcData.montoTotal } : c
      )
    );
    logAuditoria(
      'CxC',
      'CREAR',
      `Nueva cuenta por cobrar emitida a "${cxcData.clienteNombre}" por ${formatUSD(cxcData.montoTotal)} (Concepto: ${cxcData.concepto})`,
      {
        detalles: `Vence: ${new Date(cxcData.fechaVencimiento).toLocaleDateString('es-VE')}`,
      }
    );
  };

  // Handler: Register CxP Pago (payment to supplier)
  const handleRegistrarPagoCxp = (cxpId: number, monto: number, metodo: string, referencia?: string) => {
    const targetCxp = cxpList.find((c) => c.id === cxpId);

    setCxpList((prev) =>
      prev.map((item) => {
        if (item.id === cxpId) {
          const nuevoSaldo = Math.max(0, +(item.saldoRestante - monto).toFixed(2));
          const nuevoEstado = nuevoSaldo === 0 ? 'pagada' : 'parcial';
          const newPago = {
            id: item.pagos.length + 1,
            fecha: new Date().toISOString(),
            monto,
            metodoPago: metodo,
            referencia,
            usuarioNombre: currentUser?.nombre_completo || 'Administrador',
          };
          return {
            ...item,
            saldoRestante: nuevoSaldo,
            estado: nuevoEstado,
            pagos: [...item.pagos, newPago],
          };
        }
        return item;
      })
    );

    // Update supplier balance
    if (targetCxp) {
      setProveedores((prev) =>
        prev.map((pr) =>
          pr.id === targetCxp.proveedorId
            ? { ...pr, saldoPendiente: Math.max(0, +(pr.saldoPendiente - monto).toFixed(2)) }
            : pr
        )
      );
      logAuditoria(
        'CxP',
        'PAGO',
        `Pago de ${formatUSD(monto)} registrado al proveedor "${targetCxp.proveedorNombre}" para factura #${targetCxp.numeroFactura} [${metodo}]`,
        {
          detalles: `Saldo restante: ${formatUSD(Math.max(0, +(targetCxp.saldoRestante - monto).toFixed(2)))}. Ref: ${referencia || 'N/A'}`,
        }
      );
    }
  };

  // Handler: New CxP
  const handleNuevaCxp = (cxpData: Omit<CuentaPorPagar, 'id' | 'pagos'>) => {
    const newId = cxpList.length + 1;
    const newCxp: CuentaPorPagar = {
      ...cxpData,
      id: newId,
      pagos: [],
    };
    setCxpList([newCxp, ...cxpList]);
    setProveedores((prev) =>
      prev.map((p) =>
        p.id === cxpData.proveedorId ? { ...p, saldoPendiente: p.saldoPendiente + cxpData.montoTotal } : p
      )
    );
    logAuditoria(
      'CxP',
      'CREAR',
      `Nueva cuenta por pagar registrada de proveedor "${cxpData.proveedorNombre}" por ${formatUSD(cxpData.montoTotal)} (Doc: ${cxpData.numeroFactura})`,
      {
        detalles: `Vence: ${new Date(cxpData.fechaVencimiento).toLocaleDateString('es-VE')}`,
      }
    );
  };

  // Handler: Full Database & Application Reset (Factory Reset)
  const handleResetAllData = async (verifiedAdminPin?: string) => {
    const resetIso = new Date().toISOString();

    // Snapshot General Manager + established PIN BEFORE clearing localStorage
    let storedUsersRaw: Usuario[] = [];
    try {
      const rawUsers = localStorage.getItem(STORAGE_KEYS.usuarios);
      if (rawUsers) {
        const parsed = JSON.parse(rawUsers);
        if (Array.isArray(parsed)) storedUsersRaw = parsed;
      }
    } catch (e) {}

    const sourceUsers = storedUsersRaw.length > 0 ? storedUsersRaw : usuarios;
    const existingAdmin =
      sourceUsers.find((u) => isFullPrivilegeAdmin(u)) ||
      sourceUsers.find((u) => u.rol === 'admin') ||
      sourceUsers.find((u) =>
        ['gerente_general', 'admin_general', 'admin'].includes((u.username || '').toLowerCase())
      );

    let preservedPin =
      existingAdmin?.pin && existingAdmin.pin !== '••••'
        ? existingAdmin.pin
        : '';
    if (!preservedPin && verifiedAdminPin?.trim()) {
      preservedPin = await hashPin(verifiedAdminPin.trim());
    }
    if (!preservedPin) {
      return;
    }

    clearPendingSyncOps();

    // Preserve active exchange rate quote & sync flags before clearing storage
    const preservedTasa = empresaConfig.tasaCambio > 0 ? empresaConfig.tasaCambio : 0;
    const preservedFechaTasa = empresaConfig.fechaTasa || new Date().toLocaleDateString('es-VE');
    const preservedUltimaActualizacion =
      empresaConfig.ultimaActualizacionTasa || new Date().toISOString();
    let prevTasaDateFlag: string | null = null;
    let prevBcvAutoSyncFlag: string | null = null;
    let prevLicenseKey: string | null = null;
    try {
      prevTasaDateFlag = localStorage.getItem('pos_tasa_date_v1');
      prevBcvAutoSyncFlag = localStorage.getItem('pos_last_bcv_auto_sync_date');
      prevLicenseKey = localStorage.getItem('omnipos_enterprise_license_key_v1');
    } catch (e) {}

    try {
      localStorage.clear();
      Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem('pos_correlativo_x');
      localStorage.removeItem('pos_correlativo_z');
      localStorage.removeItem('pos_app_pos_draft_v1');
      localStorage.setItem(STORAGE_KEY_FACTORY_RESET_AT, resetIso);
      if (prevLicenseKey) {
        localStorage.setItem('omnipos_enterprise_license_key_v1', prevLicenseKey);
      }
      if (preservedTasa > 0) {
        if (prevTasaDateFlag) localStorage.setItem('pos_tasa_date_v1', prevTasaDateFlag);
        if (prevBcvAutoSyncFlag) localStorage.setItem('pos_last_bcv_auto_sync_date', prevBcvAutoSyncFlag);
      }
    } catch (e) {
      console.error('Error clearing localStorage:', e);
    }

    // 1. Reset Fiscal & Company Data (all fiscal fields blank, exchange rate preserved)
    const cleanEmpresa: EmpresaConfig = {
      ...CLEAN_EMPRESA_CONFIG,
      tasaCambio: preservedTasa,
      fechaTasa: preservedFechaTasa,
      ultimaActualizacionTasa: preservedUltimaActualizacion,
      factoryResetAt: resetIso,
      fiscalUpdatedAt: '',
    };
    saveEmpresaConfig(cleanEmpresa);
    setEmpresaConfig(cleanEmpresa);

    const cleanTienda: TiendaConfig = { ...CLEAN_TIENDA_CONFIG };
    setTiendaConfig(cleanTienda);
    try {
      localStorage.setItem(STORAGE_KEYS.tienda_config, JSON.stringify(cleanTienda));
    } catch (e) {}

    // 2. Reset Users (ONLY General Manager with their already established PIN)
    const cleanUsuarios: Usuario[] = [
      {
        id: existingAdmin?.id || 1,
        nombre_completo: existingAdmin?.nombre_completo || 'Gerente General',
        username: existingAdmin?.username || 'gerente_general',
        pin: preservedPin,
        rol: 'admin',
        sucursal_id: null,
        cargo: existingAdmin?.cargo || 'Gerente General',
        permisos: { ...FULL_ADMIN_PERMISSIONS },
      },
    ];
    setUsuarios(cleanUsuarios);
    setCurrentUser(sanitizeUserForSession(cleanUsuarios[0]));

    // 3. Reset Branches
    const cleanSucursales: Sucursal[] = [
      { id: 1, nombre: cleanEmpresa.nombreTienda1 || 'Tienda 1', tipo: 'tienda' },
      { id: 2, nombre: cleanEmpresa.nombreTienda2 || 'Tienda 2', tipo: 'tienda' },
      { id: 3, nombre: cleanEmpresa.nombreOficina || 'Oficina Central / Almacén', tipo: 'oficina' },
    ];
    setSucursales(cleanSucursales);

    // 4. Reset Inventory & Products (Clean empty catalog)
    const cleanProductos: Producto[] = [];
    const cleanInventario: InventarioItem[] = [];
    setProductos(cleanProductos);
    setInventario(cleanInventario);

    // 5. Reset Fiscal Cuts & Audit Correlatives
    setCorrelativoX(0);
    setCorrelativoZ(0);

    // 6. Empty all transactional data
    const cleanVentas: Venta[] = [];
    const cleanCompras: Compra[] = [];
    const cleanClientes: Cliente[] = [
      {
        id: 1,
        nombre: 'Cliente de Contado',
        rif_cedula: 'V-00000000',
        telefono: '-',
        email: '',
        direccion: 'Mostrador',
        limiteCredito: 0,
        saldoPendiente: 0,
        fechaRegistro: new Date().toISOString().split('T')[0],
      },
    ];
    const cleanProveedores: Proveedor[] = [];
    const cleanCxc: CuentaPorCobrar[] = [];
    const cleanCxp: CuentaPorPagar[] = [];

    setVentas(cleanVentas);
    setCompras(cleanCompras);
    setClientes(cleanClientes);
    setProveedores(cleanProveedores);
    setCxcList(cleanCxc);
    setCxpList(cleanCxp);
    setPedidosOnline([]);
    setNuevoPedidoNotificacion(null);

    const resetAuditEntry = createAuditEntry(
      cleanUsuarios[0],
      'Configuración',
      'RESET',
      'Restablecimiento total del sistema a valores de fábrica',
      {
        detalles: 'Sistema limpio para instalación: datos fiscales en blanco, pedidos web y ventas en cero; se preservó Gerente General y cotización.',
      }
    );
    setAuditoriaLogs([resetAuditEntry]);

    // Save cleaned database to local storage immediately
    try {
      localStorage.setItem(STORAGE_KEYS.ventas, JSON.stringify(cleanVentas));
      localStorage.setItem(STORAGE_KEYS.compras, JSON.stringify(cleanCompras));
      localStorage.setItem(STORAGE_KEYS.clientes, JSON.stringify(cleanClientes));
      localStorage.setItem(STORAGE_KEYS.proveedores, JSON.stringify(cleanProveedores));
      localStorage.setItem(STORAGE_KEYS.cxc, JSON.stringify(cleanCxc));
      localStorage.setItem(STORAGE_KEYS.cxp, JSON.stringify(cleanCxp));
      localStorage.setItem(STORAGE_KEYS.productos, JSON.stringify(cleanProductos));
      localStorage.setItem(STORAGE_KEYS.inventario, JSON.stringify(cleanInventario));
      localStorage.setItem(STORAGE_KEYS.usuarios, JSON.stringify(cleanUsuarios));
      localStorage.setItem(STORAGE_KEYS.sucursales, JSON.stringify(cleanSucursales));
      localStorage.setItem(STORAGE_KEYS.auditoria, JSON.stringify([resetAuditEntry]));
      localStorage.setItem('pos_correlativo_x', '0');
      localStorage.setItem('pos_correlativo_z', '0');
      localStorage.setItem(STORAGE_KEYS.pedidos_online, JSON.stringify([]));
    } catch (e) {}

    // Persist authenticated reset to Backend JSON DB & Cloud Firestore, then refresh live BCV quote
    void ensurePosSessionToken(cleanUsuarios[0]).then(() =>
      fetchApi('/api/system/factory-reset', {
        method: 'POST',
        headers: buildPosAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          empresaConfig: cleanEmpresa,
          tiendaConfig: cleanTienda,
          sucursales: cleanSucursales,
          factoryResetAt: resetIso,
          confirmWord: 'REINICIAR',
          ...(verifiedAdminPin ? { adminPin: verifiedAdminPin } : {}),
        }),
      }).catch(() => {})
    );

    sanitizeUsersForStorage(cleanUsuarios).then(async (sanitizedClean) => {
      setUsuarios(sanitizedClean);
      setCurrentUser(sanitizeUserForSession(sanitizedClean[0]));
      try {
        localStorage.setItem(STORAGE_KEYS.usuarios, JSON.stringify(sanitizedClean));
      } catch (e) {}

      await resetSystemDataInFirestore({
        cleanEmpresa,
        cleanTienda,
        cleanSucursales,
        preservedAdminUsers: sanitizedClean,
      }).catch(() => {});

      // Ensure daily BCV exchange rate quote stays fresh after reset without overwriting blank fiscal info
      try {
        const live = await fetchLiveBcvRate();
        if (live && live.success && live.tasa && live.tasa > 0) {
          const roundedTasa = Number(live.tasa.toFixed(2));
          const todayStr = new Date().toISOString().slice(0, 10);
          const refreshedEmpresa: EmpresaConfig = {
            ...cleanEmpresa,
            tasaCambio: roundedTasa,
            fechaTasa: new Date().toLocaleDateString('es-VE'),
            ultimaActualizacionTasa: new Date().toISOString(),
            fiscalUpdatedAt: '',
          };
          saveEmpresaConfig(refreshedEmpresa);
          setEmpresaConfig(refreshedEmpresa);
          markTasaSetToday();
          try {
            localStorage.setItem('pos_last_bcv_auto_sync_date', todayStr);
          } catch (e) {}
          saveEmpresaConfigToFirestore(refreshedEmpresa).catch(() => {});
          await ensurePosSessionToken(sanitizedClean[0]);
          fetch('/api/sync/state', {
            method: 'POST',
            headers: buildPosAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              empresaConfig: refreshedEmpresa,
              sucursales: cleanSucursales,
              clientFactoryResetAt: resetIso,
            }),
          }).catch(() => {});
        }
      } catch (e) {}
    });

    setActiveTab('dashboard');
  };

  // Handler: Restore full database from JSON backup file & synchronize to server/cloud
  const handleRestoreDatabase = (backupData: any) => {
    if (!backupData) return;
    clearPendingSyncOps();

    const restoredEmpresa: EmpresaConfig = backupData.empresaConfig
      ? {
          ...CLEAN_EMPRESA_CONFIG,
          ...backupData.empresaConfig,
          fiscalUpdatedAt: backupData.empresaConfig.fiscalUpdatedAt || new Date().toISOString(),
        }
      : empresaConfig;

    if (backupData.empresaConfig) {
      setEmpresaConfig(restoredEmpresa);
      saveEmpresaConfig(restoredEmpresa);
    }

    const restoredSucursales: Sucursal[] =
      Array.isArray(backupData.sucursales) && backupData.sucursales.length > 0
        ? backupData.sucursales
        : sucursales;
    if (Array.isArray(backupData.sucursales) && backupData.sucursales.length > 0) {
      setSucursales(restoredSucursales);
      try { localStorage.setItem(STORAGE_KEYS.sucursales, JSON.stringify(restoredSucursales)); } catch (e) {}
    }

    if (Array.isArray(backupData.usuarios) && backupData.usuarios.length > 0) {
      void persistUsuarios(backupData.usuarios);
    }

    const restoredProductos: Producto[] = Array.isArray(backupData.productos) ? backupData.productos : productos;
    if (Array.isArray(backupData.productos)) {
      setProductos(restoredProductos);
      try { localStorage.setItem(STORAGE_KEYS.productos, JSON.stringify(restoredProductos)); } catch (e) {}
    }

    const restoredInventario: InventarioItem[] = Array.isArray(backupData.inventario) ? backupData.inventario : inventario;
    if (Array.isArray(backupData.inventario)) {
      setInventario(restoredInventario);
      try { localStorage.setItem(STORAGE_KEYS.inventario, JSON.stringify(restoredInventario)); } catch (e) {}
    }

    if (Array.isArray(backupData.ventas)) {
      setVentas(backupData.ventas);
      try { localStorage.setItem(STORAGE_KEYS.ventas, JSON.stringify(backupData.ventas)); } catch (e) {}
    }
    if (Array.isArray(backupData.compras)) {
      setCompras(backupData.compras);
      try { localStorage.setItem(STORAGE_KEYS.compras, JSON.stringify(backupData.compras)); } catch (e) {}
    }
    if (Array.isArray(backupData.clientes)) {
      setClientes(backupData.clientes);
      try { localStorage.setItem(STORAGE_KEYS.clientes, JSON.stringify(backupData.clientes)); } catch (e) {}
    }
    if (Array.isArray(backupData.proveedores)) {
      setProveedores(backupData.proveedores);
      try { localStorage.setItem(STORAGE_KEYS.proveedores, JSON.stringify(backupData.proveedores)); } catch (e) {}
    }
    if (Array.isArray(backupData.cxc)) {
      setCxcList(backupData.cxc);
      try { localStorage.setItem(STORAGE_KEYS.cxc, JSON.stringify(backupData.cxc)); } catch (e) {}
    }
    if (Array.isArray(backupData.cxp)) {
      setCxpList(backupData.cxp);
      try { localStorage.setItem(STORAGE_KEYS.cxp, JSON.stringify(backupData.cxp)); } catch (e) {}
    }

    const restoredPedidos: PedidoOnline[] = Array.isArray(backupData.pedidosOnline) ? backupData.pedidosOnline : pedidosOnline;
    if (Array.isArray(backupData.pedidosOnline)) {
      setPedidosOnline(restoredPedidos);
      try { localStorage.setItem(STORAGE_KEYS.pedidos_online, JSON.stringify(restoredPedidos)); } catch (e) {}
    }

    const restoredTienda: TiendaConfig = backupData.tiendaConfig || tiendaConfig;
    if (backupData.tiendaConfig) {
      setTiendaConfig(restoredTienda);
      try { localStorage.setItem(STORAGE_KEYS.tienda_config, JSON.stringify(restoredTienda)); } catch (e) {}
    }
    if (backupData.correlativoX !== undefined) {
      setCorrelativoX(backupData.correlativoX);
      try { localStorage.setItem('pos_correlativo_x', String(backupData.correlativoX)); } catch (e) {}
    }
    if (backupData.correlativoZ !== undefined) {
      setCorrelativoZ(backupData.correlativoZ);
      try { localStorage.setItem('pos_correlativo_z', String(backupData.correlativoZ)); } catch (e) {}
    }

    // Reconcile restored database with Cloud Firestore & backend server sync (queued if offline)
    syncAllToFirestore({
      productos: restoredProductos,
      empresaConfig: restoredEmpresa,
      tiendaConfig: restoredTienda,
      sucursales: restoredSucursales,
      inventario: restoredInventario,
    }).catch(() => {});

    const syncRestorePayload = {
      empresaConfig: restoredEmpresa,
      tiendaConfig: restoredTienda,
      sucursales: restoredSucursales,
      productos: restoredProductos,
      inventario: restoredInventario,
      pedidos: restoredPedidos,
      replacePedidos: true,
      clientFactoryResetAt: localStorage.getItem(STORAGE_KEY_FACTORY_RESET_AT) || null,
    };
    void ensurePosSessionToken(currentUser).then(() =>
      fetchApi('/api/sync/state', {
        method: 'POST',
        headers: buildPosAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(syncRestorePayload),
      })
        .then((r) => {
          if (!r.ok) enqueueSyncOp('sync_state', 'sync_state:latest', syncRestorePayload);
        })
        .catch(() => enqueueSyncOp('sync_state', 'sync_state:latest', syncRestorePayload))
    );

    const restoreEntry = createAuditEntry(
      currentUser,
      'Configuración',
      'RESET',
      `Restauración total de base de datos exitosa desde archivo JSON`,
      {
        detalles: `Restaurados: ${backupData.productos?.length || 0} productos, ${backupData.ventas?.length || 0} ventas, ${backupData.clientes?.length || 0} clientes.`,
      }
    );

    const mergedLogs = Array.isArray(backupData.auditoria) && backupData.auditoria.length > 0
      ? [restoreEntry, ...backupData.auditoria]
      : [restoreEntry, ...auditoriaLogs];

    setAuditoriaLogs(mergedLogs);
    try { localStorage.setItem(STORAGE_KEYS.auditoria, JSON.stringify(mergedLogs)); } catch (e) {}
  };

  // ==========================================
  // E-COMMERCE & TIENDA ONLINE HANDLERS
  // ==========================================

  // Handler: Update Store configuration (WhatsApp, fees, payment info)
  const handleActualizarTiendaConfig = (newConfig: TiendaConfig) => {
    setTiendaConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_KEYS.tienda_config, JSON.stringify(newConfig));
    } catch (e) {}

    // Sync to Firebase Firestore in Google Cloud with offline retry queue
    saveTiendaConfigToFirestore(newConfig)
      .then((ok) => {
        if (!ok) enqueueSyncOp('firestore_tienda', 'firestore_tienda:main', newConfig);
      })
      .catch(() => enqueueSyncOp('firestore_tienda', 'firestore_tienda:main', newConfig));

    logAuditoria(
      'Configuración',
      'MODIFICAR',
      `Configuración de tienda online actualizada: "${newConfig.nombreTienda}" (WhatsApp: ${newConfig.whatsappContacto})`,
      {
        detalles: `Delivery fijo: $${newConfig.costoDeliveryFijo}, Pago Móvil Banco: ${newConfig.pagoMovilBanco}`,
      }
    );
  };

  // Handler: Crear nuevo pedido online (generado desde el catálogo público web o móvil)
  const handleCrearPedidoOnline = (
    pedidoData: Omit<PedidoOnline, 'id' | 'numeroPedido' | 'fecha' | 'creadoEn' | 'estado'>
  ): PedidoOnline => {
    const year = new Date().getFullYear();
    const maxSeq = pedidosOnline.reduce((max, p) => {
      const m = String(p.numeroPedido || '').match(/WEB-\d{4}-(\d+)/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, pedidosOnline.length);
    const nextNum = maxSeq + 1;
    const numeroPedido = `WEB-${year}-${String(nextNum).padStart(3, '0')}`;
    const nowIso = new Date().toISOString();

    const nuevoPedido: PedidoOnline = {
      ...pedidoData,
      id: `pedido_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      numeroPedido,
      fecha: nowIso,
      creadoEn: nowIso,
      estado: 'pendiente',
    };

    setPedidosOnline((prev) => [nuevoPedido, ...prev]);

    // Enviar inmediatamente a Firebase Firestore (tiempo real en la nube sin suspensión)
    savePedidoOnlineToFirestore(nuevoPedido).catch((err) =>
      console.error('Error enviando pedido a Firebase Firestore:', err)
    );

    // Enviar inmediatamente al backend server para que la laptop y otros dispositivos lo reciban al instante
    fetchApi('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevoPedido),
    })
      .then((res) => {
        if (!res.ok && res.status >= 500) {
          enqueueSyncOp('pedido_create', `pedido_create:${nuevoPedido.id}`, nuevoPedido);
        }
      })
      .catch(() => enqueueSyncOp('pedido_create', `pedido_create:${nuevoPedido.id}`, nuevoPedido));

    // Ensure customer is registered in client directory if not already present
    setClientes((prevClientes) => {
      const exists = prevClientes.some(
        (c) =>
          (c.rif && c.rif.trim().toLowerCase() === pedidoData.clienteRif.trim().toLowerCase()) ||
          (c.rif_cedula && c.rif_cedula.trim().toLowerCase() === pedidoData.clienteRif.trim().toLowerCase()) ||
          c.telefono.replace(/\D/g, '') === pedidoData.clienteTelefono.replace(/\D/g, '')
      );
      if (!exists) {
        const nuevoCliente: Cliente = {
          id: prevClientes.length + 1,
          nombre: pedidoData.clienteNombre,
          rif_cedula: pedidoData.clienteRif,
          telefono: pedidoData.clienteTelefono,
          direccion: pedidoData.direccionEntrega || 'Cliente Tienda Web',
          limiteCredito: 0,
          saldoPendiente: 0,
          fechaRegistro: new Date().toISOString().split('T')[0],
        };
        return [...prevClientes, nuevoCliente];
      }
      return prevClientes;
    });

    logAuditoria(
      'POS / Ventas',
      'CREAR',
      `Nuevo pedido online recibido #${numeroPedido} por ${pedidoData.clienteNombre} (${formatUSD(pedidoData.total)})`,
      {
        sucursal_id: pedidoData.sucursalId,
        sucursal_nombre: pedidoData.sucursalNombre,
        detalles: `Modalidad: ${pedidoData.tipoEntrega}. Pago: ${pedidoData.metodoPago}. Artículos: ${pedidoData.detalles.length}. Total: $${pedidoData.total} (Bs. ${pedidoData.totalBs})`,
      }
    );

    return nuevoPedido;
  };

  // Handler: Actualizar estado de pedido online
  const handleActualizarEstadoPedidoOnline = (pedidoId: string, nuevoEstado: PedidoOnline['estado']) => {
    setPedidosOnline((prev) =>
      prev.map((p) => {
        if (p.id === pedidoId) {
          logAuditoria(
            'POS / Ventas',
            'MODIFICAR',
            `Estado de orden web #${p.numeroPedido} actualizado a "${nuevoEstado.toUpperCase()}"`,
            {
              detalles: `Cliente: ${p.clienteNombre} (${p.clienteTelefono})`,
            }
          );
          return { ...p, estado: nuevoEstado };
        }
        return p;
      })
    );

    // Sync status update with Firebase Firestore
    updatePedidoOnlineInFirestore(pedidoId, { estado: nuevoEstado }).catch((err) =>
      console.error('Error actualizando pedido en Firestore:', err)
    );

    // Sync authenticated status update with backend server (queued on failure)
    const patchBody = { estado: nuevoEstado };
    void ensurePosSessionToken(currentUser).then(() =>
      fetchApi(`/api/pedidos/${encodeURIComponent(pedidoId)}`, {
        method: 'PATCH',
        headers: buildPosAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(patchBody),
      })
        .then((r) => {
          if (!r.ok && r.status !== 404) {
            enqueueSyncOp('pedido_patch', `pedido_patch:${pedidoId}`, { id: pedidoId, body: patchBody });
          }
        })
        .catch(() => enqueueSyncOp('pedido_patch', `pedido_patch:${pedidoId}`, { id: pedidoId, body: patchBody }))
    );
  };

  // Handler: Facturar pedido web al POS (convierte pedido en venta oficial y descuenta inventario)
  const handleFacturarPedidoAlPos = (pedido: PedidoOnline) => {
    const sucursalTargetId = pedido.sucursalId || 1;
    const sucursalTarget = sucursales.find((s) => s.id === sucursalTargetId);
    const newVentaId = ventas.length + 1;

    // Map online payment method to POS payment method
    let posMetodo: DetallePagoVenta['metodo'] = 'tarjeta';
    if (pedido.metodoPago === 'pago_movil') posMetodo = 'pago_movil';
    else if (pedido.metodoPago === 'efectivo_usd' || pedido.metodoPago === 'zelle') posMetodo = 'efectivo_usd';
    else if (pedido.metodoPago === 'efectivo_bs') posMetodo = 'efectivo_bs';

    const pagoDetalle: DetallePagoVenta = {
      metodo: posMetodo,
      referencia_pago_movil: pedido.referenciaPago,
      monto_usd: pedido.total,
      monto_bs: pedido.totalBs,
      pago_movil_monto_bs: pedido.metodoPago === 'pago_movil' ? pedido.totalBs : undefined,
      efectivo_usd_recibido: pedido.metodoPago === 'efectivo_usd' || pedido.metodoPago === 'zelle' ? pedido.total : undefined,
      efectivo_bs_recibido: pedido.metodoPago === 'efectivo_bs' ? pedido.totalBs : undefined,
    };

    const detallesVenta: DetalleVenta[] = pedido.detalles.map((d, index) => ({
      id: index + 1,
      venta_id: newVentaId,
      producto_id: d.productoId,
      producto_nombre: d.productoNombre,
      codigo_barras: d.codigo_barras || '',
      cantidad: d.cantidad,
      precio_unitario: d.precioUnitario,
      subtotal: d.subtotal,
      exento_iva: d.exentoIva,
    }));

    const nuevaVenta: Venta = {
      id: newVentaId,
      sucursal_id: sucursalTargetId,
      usuario_nombre: currentUser ? currentUser.nombre_completo : 'Caja Web / Despacho',
      cliente_nombre: pedido.clienteNombre,
      cliente_rif: pedido.clienteRif,
      fecha: new Date().toISOString(),
      subtotal_neto: pedido.subtotalNeto,
      base_imponible: pedido.baseImponible,
      monto_exento: pedido.montoExento,
      monto_iva: pedido.montoIva,
      total: pedido.total,
      metodo_pago: posMetodo,
      referencia_pago: pedido.referenciaPago,
      pago_detalle: pagoDetalle,
      detalles: detallesVenta,
    };

    // Update sales state
    setVentas((prev) => [nuevaVenta, ...prev]);

    // Deduct stock in inventario
    setInventario((prevInv) =>
      prevInv.map((invItem) => {
        if (invItem.sucursal_id === sucursalTargetId) {
          const soldItem = pedido.detalles.find((d) => d.productoId === invItem.producto_id);
          if (soldItem) {
            return {
              ...invItem,
              stock: Math.max(0, invItem.stock - soldItem.cantidad),
            };
          }
        }
        return invItem;
      })
    );

    // Update online order state: mark as delivered and link sale ID
    setPedidosOnline((prev) =>
      prev.map((p) =>
        p.id === pedido.id
          ? { ...p, estado: 'entregado', ventaIdGenerada: newVentaId }
          : p
      )
    );

    // Sync billed status with Firebase Firestore and backend server
    updatePedidoOnlineInFirestore(pedido.id, {
      estado: 'entregado',
      ventaIdGenerada: newVentaId,
    }).catch((err) => console.error('Error actualizando pedido facturado en Firestore:', err));

    const billedPatchBody = { estado: 'entregado', correlativoFactura: newVentaId };
    void ensurePosSessionToken(currentUser).then(() =>
      fetchApi(`/api/pedidos/${encodeURIComponent(pedido.id)}`, {
        method: 'PATCH',
        headers: buildPosAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(billedPatchBody),
      })
        .then((r) => {
          if (!r.ok && r.status !== 404) {
            enqueueSyncOp('pedido_patch', `pedido_patch:${pedido.id}`, { id: pedido.id, body: billedPatchBody });
          }
        })
        .catch(() =>
          enqueueSyncOp('pedido_patch', `pedido_patch:${pedido.id}`, { id: pedido.id, body: billedPatchBody })
        )
    );

    logAuditoria(
      'POS / Ventas',
      'VENTA',
      `Facturación exitosa en POS para orden web #${pedido.numeroPedido} -> Factura #${nuevaVenta.id} (${formatUSD(pedido.total)})`,
      {
        sucursal_id: sucursalTargetId,
        sucursal_nombre: sucursalTarget?.nombre,
        detalles: `Cliente: ${pedido.clienteNombre} (${pedido.clienteRif}). Facturado en caja por ${currentUser?.nombre_completo || 'Sistema'}`,
      }
    );
  };

  // Access check for activeTab
  const isGeneralManager = currentUser?.rol === 'admin';
  const hasAccessToActiveTab =
    isGeneralManager ||
    (currentUser?.permisos && currentUser.permisos[activeTab] !== undefined
      ? Boolean(currentUser.permisos[activeTab])
      : activeTab === 'ventas' || (activeTab === 'pedidos_web' && currentUser?.rol === 'supervisor'));

  // If client is in digital store mode, render the public online catalog and ordering interface
  if (isClientStoreMode) {
    return (
      <TiendaOnlineView
        productos={productos}
        inventario={inventario}
        sucursales={sucursales}
        empresaConfig={empresaConfig}
        tiendaConfig={tiendaConfig}
        usuarios={usuarios}
        currentUser={currentUser}
        isInternalPreview={isInternalPreview}
        onOpenStoreShare={() => setShowStoreShareModal(true)}
        onCrearPedido={handleCrearPedidoOnline}
        onVolverAlPos={() => {
          setIsClientStoreMode(false);
          setIsInternalPreview(false);
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('vista');
            url.searchParams.delete('tienda');
            url.searchParams.delete('cliente');
            window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
          }
        }}
        onActualizarTiendaConfig={handleActualizarTiendaConfig}
      />
    );
  }

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Top Auth / User Selector Bar */}
      <AuthHeader
        currentUser={currentUser}
        usuarios={usuarios}
        sucursales={sucursales}
        empresaConfig={empresaConfig}
        requireLogin={licenseValidation.isValid}
        onSelectUser={async (u, verifiedPin) => {
          if (u && (!currentUser || currentUser.id !== u.id)) {
            logAuditoria(
              'Usuarios',
              'LOGIN',
              `Inicio de sesión / Cambio de usuario a: "${u.nombre_completo}" (${u.rol.toUpperCase()})`,
              {
                customUser: u,
                detalles: `Cargo: ${u.cargo || 'Operador'}. Sucursal asignada: ${sucursales.find((s) => s.id === u.sucursal_id)?.nombre || 'Todas'}`,
              }
            );
          }
          await ensurePosSessionToken(u, { forceRefresh: true, pin: verifiedPin });
          setCurrentUser(sanitizeUserForSession(u));
        }}
        onLoginAudit={(success, targetUser, area) => {
          const sucName = sucursales.find((s) => s.id === targetUser.sucursal_id)?.nombre || 'Todas las Sucursales';
          if (!success) {
            logAuditoria(
              'Seguridad',
              'ACCESO_DENEGADO',
              `ALERTA DE SEGURIDAD: Intento fallido de inicio de sesión para "${targetUser.nombre_completo}" (${targetUser.username}) en ${sucName}`,
              {
                sucursal_id: targetUser.sucursal_id,
                sucursal_nombre: sucName,
                customUser: targetUser,
                detalles: `Área seleccionada: ${area}. PIN incorrecto introducido en pantalla.`,
              }
            );
          }
        }}
        onLogout={() => {
          if (currentUser) {
            logAuditoria(
              'Usuarios',
              'LOGOUT',
              `Cierre de sesión de usuario "${currentUser.nombre_completo}"`,
              {
                customUser: currentUser,
              }
            );
          }
          clearPosSessionToken();
          setCurrentUser(null);
        }}
        onOpenHtmlModal={() => setShowHtmlModal(true)}
        onOpenCalculator={() => setShowCalculatorModal(true)}
        onOpenRateModal={() => setShowDailyRateModal(true)}
        onOpenClientStore={() => {
          setIsInternalPreview(true);
          setIsClientStoreMode(true);
        }}
      />

      {/* Main Layout with Left Sidebar */}
      <div className="flex-1 flex flex-row overflow-hidden min-h-0">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setIsSidebarCollapsed(true); // Automatically collapse sidebar to the left upon choosing a module
          }}
          currentUser={currentUser}
          empresaConfig={empresaConfig}
          onOpenRateModal={() => setShowDailyRateModal(true)}
          onLogout={() => {
            clearPosSessionToken();
            setCurrentUser(null);
          }}
          onOpenHtmlModal={() => setShowHtmlModal(true)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          pendingWebOrdersCount={pedidosOnline.filter((p) => p.estado === 'pendiente').length}
          onOpenClientStore={() => {
            setIsInternalPreview(true);
            setIsClientStoreMode(true);
          }}
        />

        {/* Content Area */}
        <div
          className={`flex-1 flex flex-col min-h-0 ${
            activeTab === 'ventas' ? 'overflow-y-auto lg:overflow-hidden' : 'overflow-y-auto custom-scrollbar'
          }`}
        >
          {/* Module Content */}
          <main
            className={
              activeTab === 'ventas'
                ? 'flex-1 min-h-0 p-2 sm:p-3 max-w-[1680px] mx-auto w-full flex flex-col'
                : 'flex-1 p-4 sm:p-6 max-w-[1680px] mx-auto w-full'
            }
          >
            {!currentUser ? (
              <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-8 text-center space-y-3 max-w-md mx-auto my-16">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white">Autenticación Requerida</h3>
                <p className="text-xs text-slate-400">
                  Selecciona tu usuario e ingresa tu PIN para acceder al sistema POS.
                </p>
              </div>
            ) : !hasAccessToActiveTab ? (
              <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-8 text-center space-y-4 max-w-xl mx-auto my-12">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Módulo Restringido</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Tu usuario (<strong>{currentUser?.nombre_completo}</strong>) solo cuenta con acceso autorizado para el módulo de <strong>Ventas</strong>.
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Solicita al Gerente General en el módulo de Configuración que te otorgue permisos adicionales si los requieres.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('ventas')}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 mx-auto cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Ir al Punto de Venta (Ventas)</span>
                </button>
              </div>
            ) : (
              <>
                {/* 1. DASHBOARD */}
                {activeTab === 'dashboard' && (
                  <ExecutiveDashboard
                    sucursales={sucursales}
                    productos={productos}
                    inventario={inventario}
                    ventas={ventas}
                    compras={compras}
                    proveedores={proveedores}
                    usuarios={usuarios}
                    currentUser={currentUser}
                    empresaConfig={empresaConfig}
                    onOpenCompanySettings={() => setShowCompanySettingsModal(true)}
                  />
                )}

                {/* 2. VENTAS (POS) */}
                {activeTab === 'ventas' && (
                  <PosSimulator
                    sucursales={sucursales}
                    productos={productos}
                    inventario={inventario}
                    currentUser={currentUser}
                    empresaConfig={empresaConfig}
                    clientes={clientes}
                    onRegistrarVenta={handleRegistrarVenta}
                    onAddCliente={handleAddCliente}
                    onUpdateCliente={handleUpdateCliente}
                    ventas={ventas}
                  />
                )}

                {/* 2.1 PEDIDOS WEB (E-COMMERCE) */}
                {activeTab === 'pedidos_web' && (
                  <PedidosWebManager
                    pedidosOnline={pedidosOnline}
                    tiendaConfig={tiendaConfig}
                    sucursales={sucursales}
                    empresaConfig={empresaConfig}
                    currentUser={currentUser}
                    onActualizarEstadoPedido={handleActualizarEstadoPedidoOnline}
                    onFacturarPedidoAlPos={handleFacturarPedidoAlPos}
                    onActualizarTiendaConfig={handleActualizarTiendaConfig}
                    onAbrirTiendaCliente={() => {
                      setIsInternalPreview(true);
                      setIsClientStoreMode(true);
                    }}
                  />
                )}

                {/* 3. INVENTARIO */}
                {activeTab === 'inventario' && (
                  <InventoryManager
                    sucursales={sucursales}
                    productos={productos}
                    inventario={inventario}
                    currentUser={currentUser}
                    empresaConfig={empresaConfig}
                    onTransferStock={handleTransferStock}
                    onBatchTransferStock={handleBatchTransferStock}
                    onAddProduct={handleAddProduct}
                    onUpdateProduct={handleUpdateProduct}
                    onDeleteProduct={handleDeleteProduct}
                    onUpdateStockMinimoAlerta={handleUpdateStockMinimoAlerta}
                    proveedores={proveedores}
                    onRegistrarCompra={handleRegistrarCompra}
                    onAddProveedor={handleAddProveedor}
                  />
                )}

                {/* 4. COMPRAS */}
                {activeTab === 'compras' && (
                  <ComprasManager
                    compras={compras}
                    proveedores={proveedores}
                    productos={productos}
                    sucursales={sucursales}
                    empresaConfig={empresaConfig}
                    currentUser={currentUser}
                    onRegistrarCompra={handleRegistrarCompra}
                    onAddProveedor={handleAddProveedor}
                  />
                )}

                {/* 4. CLIENTES */}
                {activeTab === 'clientes' && (
                  <ClientesManager
                    clientes={clientes}
                    onAddCliente={handleAddCliente}
                    onUpdateCliente={handleUpdateCliente}
                    onDeleteCliente={handleDeleteCliente}
                    empresaConfig={empresaConfig}
                  />
                )}

                {/* 5. PROVEEDORES */}
                {activeTab === 'proveedores' && (
                  <ProveedoresManager
                    proveedores={proveedores}
                    onAddProveedor={handleAddProveedor}
                    onUpdateProveedor={handleUpdateProveedor}
                    onDeleteProveedor={handleDeleteProveedor}
                    empresaConfig={empresaConfig}
                  />
                )}

                {/* 6. CXC */}
                {activeTab === 'cxc' && (
                  <CxcManager
                    cxcList={cxcList}
                    clientes={clientes}
                    empresaConfig={empresaConfig}
                    currentUser={currentUser}
                    onRegistrarAbono={handleRegistrarAbonoCxc}
                    onNuevaCuentaCobrar={handleNuevaCxc}
                  />
                )}

                {/* 7. CXP */}
                {activeTab === 'cxp' && (
                  <CxpManager
                    cxpList={cxpList}
                    proveedores={proveedores}
                    empresaConfig={empresaConfig}
                    currentUser={currentUser}
                    onRegistrarPago={handleRegistrarPagoCxp}
                    onNuevaCuentaPagar={handleNuevaCxp}
                  />
                )}

                {/* 8. REPORTES */}
                {activeTab === 'reportes' && (
                  <PdfReportsCenter
                    currentUser={currentUser}
                    ventas={ventas}
                    compras={compras}
                    proveedores={proveedores}
                    sucursales={sucursales}
                    empresaConfig={empresaConfig}
                    usuarios={usuarios}
                    correlativoX={correlativoX}
                    correlativoZ={correlativoZ}
                    onIncrementCorrelativoX={() => {
                      const next = correlativoX + 1;
                      setCorrelativoX(next);
                      logAuditoria(
                        'Reportes / Fiscal',
                        'CORTE_X',
                        `Generación de Corte Fiscal Parcial X #${next}`,
                        { detalles: `Emitido por ${currentUser?.nombre_completo || 'Usuario'}` }
                      );
                    }}
                    onIncrementCorrelativoZ={() => {
                      const next = correlativoZ + 1;
                      setCorrelativoZ(next);
                      logAuditoria(
                        'Reportes / Fiscal',
                        'CORTE_Z',
                        `Cierre Diario Definitivo - Corte Fiscal Z #${next}`,
                        { detalles: `Emitido y correlativo bloqueado por ${currentUser?.nombre_completo || 'Usuario'}` }
                      );
                    }}
                  />
                )}

                {/* 9. CONFIGURACIÓN (PERMISOS, NOMBRES, PIN, EMPRESA, AUDITORÍA) */}
                {activeTab === 'configuracion' && (
                  <ConfiguracionView
                    usuarios={usuarios}
                    onUpdateUsuarios={async (updated) => {
                      const saved = await persistUsuarios(updated);
                      logAuditoria(
                        'Usuarios',
                        'MODIFICAR',
                        `Actualización de la nómina de usuarios y permisos (${saved.length} usuarios)`,
                        {
                          detalles: saved.map((u) => `${u.nombre_completo} (${u.username}, ${u.rol})`).join('; '),
                        }
                      );
                    }}
                    empresaConfig={empresaConfig}
                    onSaveEmpresaConfig={handleSaveEmpresaConfig}
                    sucursales={sucursales}
                    onUpdateSucursales={handleUpdateSucursales}
                    currentUser={currentUser}
                    onOpenRateModal={() => setShowDailyRateModal(true)}
                    onResetAllData={handleResetAllData}
                    auditoriaLogs={auditoriaLogs}
                    onClearAuditoriaLogs={() => {
                      const entry = createAuditEntry(
                        currentUser,
                        'Auditoría',
                        'LIMPIAR',
                        'Vaciado y limpieza del historial de auditoría'
                      );
                      setAuditoriaLogs([entry]);
                    }}
                    productos={productos}
                    inventario={inventario}
                    ventas={ventas}
                    compras={compras}
                    clientes={clientes}
                    proveedores={proveedores}
                    cxcList={cxcList}
                    cxpList={cxpList}
                    pedidosOnline={pedidosOnline}
                    tiendaConfig={tiendaConfig}
                    correlativoX={correlativoX}
                    correlativoZ={correlativoZ}
                    onRestoreDatabase={handleRestoreDatabase}
                    onLogAudit={logAuditoria}
                    licenseValidationResult={licenseValidation}
                    onLicenseChanged={recheckLicense}
                    onOpenCalculator={() => setShowCalculatorModal(true)}
                    onOpenStoreShare={() => setShowStoreShareModal(true)}
                    onOpenHtmlModal={() => setShowHtmlModal(true)}
                    onDataLoadedFromCloud={(data) => {
                      if (data.productos && data.productos.length > 0) setProductos(data.productos);
                      if (data.inventario && data.inventario.length > 0) setInventario(data.inventario);
                      if (data.empresaConfig) applyEmpresaConfigUpdate(data.empresaConfig);
                      if (data.tiendaConfig) setTiendaConfig(data.tiendaConfig);
                    }}
                  />
                )}
              </>
            )}
          </main>

          {/* Footer Corporativo Oficial AITech Soluciones, C. A. */}
          {activeTab !== 'ventas' && <AITechFooter variant="standard" />}
        </div>
      </div>

      {/* Toast Notificación Nuevo Pedido Web en Tiempo Real */}
      {nuevoPedidoNotificacion && (
        <div className="fixed top-14 right-4 z-50 max-w-sm w-full bg-slate-900/95 backdrop-blur-md border-2 border-amber-500/80 rounded-2xl p-4 shadow-2xl shadow-amber-500/20 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                <PackageCheck className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 block">
                  ¡Nuevo Pedido Web Recibido!
                </span>
                <p className="text-sm font-bold text-white">
                  {nuevoPedidoNotificacion.numeroPedido}
                </p>
                <p className="text-xs text-slate-300">
                  Cliente: <strong>{nuevoPedidoNotificacion.clienteNombre}</strong>
                </p>
                <p className="text-xs font-mono font-bold text-emerald-400">
                  Total: {formatUSD(nuevoPedidoNotificacion.total)} ({formatBs(nuevoPedidoNotificacion.total, empresaConfig.tasaCambio)})
                </p>
              </div>
            </div>
            <button
              onClick={() => setNuevoPedidoNotificacion(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab('pedidos_web');
                setNuevoPedidoNotificacion(null);
              }}
              className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all"
            >
              <span>Atender en Pedidos Web</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Toast Notificación Cotización Diaria Actualizada Automáticamente */}
      {bcvAutoNotice && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full bg-slate-900/95 backdrop-blur-md border-2 border-emerald-500/80 rounded-2xl p-4 shadow-2xl shadow-emerald-500/20 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">
                  Cotización Oficial Actualizada
                </span>
                <p className="text-base font-black font-mono text-white">
                  1 USD = {formatBs(1, bcvAutoNotice.tasa)}
                </p>
                <p className="text-[11px] text-slate-300">
                  {bcvAutoNotice.fuente || 'Banco Central de Venezuela (BCV Oficial)'}
                </p>
                <p className="text-[10px] text-slate-400">
                  Sincronizado hoy: {bcvAutoNotice.fecha}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBcvAutoNotice(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cerrar notificación"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowDailyRateModal(true);
                setBcvAutoNotice(null);
              }}
              className="flex-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>Ajustar Manualmente</span>
            </button>
            <button
              type="button"
              onClick={() => setBcvAutoNotice(null)}
              className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition-all cursor-pointer shadow-sm"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Cryptographic License Lock Screen Modal (If invalid or unactivated) */}
      {(!licenseValidation.isValid || showLicenseLockModal) && (
        <LicenseLockModal
          validationResult={licenseValidation}
          onLicenseActivated={(key) => {
            recheckLicense();
            logAuditoria(
              'Seguridad',
              'ACCESO',
              'Activación de licencia de software exitosa con firma criptográfica',
              { detalles: `Clave registrada y validada para este ID de hardware.` }
            );
          }}
          canDismiss={false}
        />
      )}

      {/* Daily Exchange Rate Prompt Modal */}
      <DailyRateModal
        isOpen={showDailyRateModal}
        empresaConfig={empresaConfig}
        currentRate={empresaConfig.tasaCambio}
        onSaveRate={handleSaveTasa}
        onClose={() => setShowDailyRateModal(false)}
      />

      {/* Manager Company & Fiscal Settings Modal */}
      <CompanySettingsModal
        isOpen={showCompanySettingsModal}
        empresaConfig={empresaConfig}
        currentUser={currentUser}
        onSaveConfig={handleSaveEmpresaConfig}
        onClose={() => setShowCompanySettingsModal(false)}
      />

      {/* Standalone HTML File Downloader Modal */}
      {showHtmlModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl p-6 relative animate-fade-in">
            <button
              type="button"
              onClick={() => setShowHtmlModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
            <StandaloneHtmlDownloader
              liveData={{
                empresaConfig,
                usuarios,
                productos,
                inventario,
                ventas,
                compras,
                clientes,
                proveedores,
                cxc: cxcList,
                cxp: cxpList,
                sucursales,
                currentUser,
                auditoria: auditoriaLogs,
              }}
            />
          </div>
        </div>
      )}

      {/* Client Public Store Share Modal */}
      {showStoreShareModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-teal-500/40 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative animate-fade-in space-y-4">
            <button
              type="button"
              onClick={() => setShowStoreShareModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Link de la Tienda Online para Clientes
                </h3>
                <p className="text-xs text-slate-400">
                  Enlace público directo al catálogo de compras
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Este es el enlace que debes compartir con tus clientes por <strong>WhatsApp, Instagram, Facebook o estado</strong>. Al abrirlo, el cliente ve tu catálogo de productos actualizado con precios en USD y Bolívares (a tasa oficial del día), puede agregar productos al carrito y hacer pedidos con entrega o retiro.
            </p>

            {/* QR Code & URL Display */}
            {(() => {
              const realWs = !isMockDefaultPhone(tiendaConfig.whatsappContacto)
                ? tiendaConfig.whatsappContacto
                : (!isMockDefaultPhone(empresaConfig.telefono) ? empresaConfig.telefono : '');
              const cleanWs = cleanMobileDigits(realWs);
              const wsQuery = cleanWs ? `&ws=${encodeURIComponent(cleanWs)}` : '';
              const shareUrl = typeof window !== 'undefined'
                ? `${window.location.origin}${window.location.pathname}?vista=tienda${wsQuery}`
                : `https://miapp.com?vista=tienda${wsQuery}`;

              return (
                <>
                  <div className="py-1 flex justify-center">
                    <StoreQrCode
                      url={shareUrl}
                      storeName={tiendaConfig.nombreTienda || empresaConfig.nombreEmpresa}
                      size={168}
                      showDownloadButton={true}
                    />
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2">
                    <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider block">
                      Enlace para el cliente:
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={shareUrl}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-teal-200 font-mono select-all focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(shareUrl);
                          setCopiedStoreUrl(true);
                          setTimeout(() => setCopiedStoreUrl(false), 2500);
                        }}
                        className="px-3.5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-sm"
                      >
                        {copiedStoreUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedStoreUrl ? '¡Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const realWs = !isMockDefaultPhone(tiendaConfig.whatsappContacto)
                    ? tiendaConfig.whatsappContacto
                    : (!isMockDefaultPhone(empresaConfig.telefono) ? empresaConfig.telefono : '');
                  const cleanWs = cleanMobileDigits(realWs);
                  const wsQuery = cleanWs ? `&ws=${encodeURIComponent(cleanWs)}` : '';
                  const shareUrl = `${window.location.origin}${window.location.pathname}?vista=tienda${wsQuery}`;
                  const msg = encodeURIComponent(
                    `¡Hola! 👋 Te invitamos a visitar nuestro catálogo en línea de *${empresaConfig.nombreEmpresa}*. Puedes ver nuestros productos, precios y ordenar directamente desde este enlace:\n\n👉 ${shareUrl}`
                  );
                  window.open(`https://wa.me/?text=${msg}`, '_blank');
                }}
                className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Enviar por WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowStoreShareModal(false);
                  setIsInternalPreview(true);
                  setIsClientStoreMode(true);
                }}
                className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 text-teal-400" />
                <span>Ver Tienda como Cliente</span>
              </button>
            </div>

            {/* Highlights explanation */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                <ShieldAlert className="w-3.5 h-3.5 text-teal-400" />
                <span>Seguro y exclusivo para clientes:</span>
              </div>
              <p>
                • El cliente <strong>no necesita contraseña</strong> ni ve los datos internos del negocio (costos, reportes, inventario privado).
              </p>
              <p>
                • Todos los pedidos que tus clientes hagan aparecen automáticamente en el módulo de <strong>Pedidos Web</strong> de tu POS para que los apruebes y factures.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Calculadora Comercial Multimoneda (Hotkey F9) */}
      <CommercialCalculatorModal
        isOpen={showCalculatorModal}
        onClose={() => setShowCalculatorModal(false)}
        empresaConfig={empresaConfig}
      />
    </div>
  );
}
