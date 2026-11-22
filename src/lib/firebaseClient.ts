import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  getDocs,
  deleteDoc,
  limit,
  runTransaction,
  deleteField,
} from 'firebase/firestore';
import firebaseConfigData from '../../firebase-applet-config.json';
import {
  Producto,
  PedidoOnline,
  EmpresaConfig,
  TiendaConfig,
  Sucursal,
  InventarioItem,
  Venta,
  Compra,
  CuentaPorCobrar,
  CuentaPorPagar,
  RegistroAuditoria,
  Usuario,
} from '../types';

export const firebaseConfig = {
  projectId: firebaseConfigData.projectId,
  appId: firebaseConfigData.appId,
  apiKey: firebaseConfigData.apiKey,
  authDomain: firebaseConfigData.authDomain,
  firestoreDatabaseId: firebaseConfigData.firestoreDatabaseId || '(default)',
  storageBucket: firebaseConfigData.storageBucket,
  messagingSenderId: firebaseConfigData.messagingSenderId,
};

// Initialize Firebase App singleton
export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Authentication (Google Sign-In only)
export const auth = getAuth(firebaseApp);

export interface CloudAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

function mapFirebaseUser(user: User | null): CloudAuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: Boolean(user.emailVerified),
  };
}

export async function signInWithGoogleCloud(): Promise<{
  success: boolean;
  user?: CloudAuthUser | null;
  error?: string;
}> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    return { success: true, user: mapFirebaseUser(result.user) };
  } catch (error: any) {
    const code = error?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return { success: false, error: 'Inicio de sesión con Google cancelado.' };
    }
    return {
      success: false,
      error: error?.message || 'No se pudo autenticar con Google Cloud.',
    };
  }
}

export async function signOutGoogleCloud(): Promise<void> {
  await signOut(auth);
}

export function subscribeToCloudAuth(onChanged: (user: CloudAuthUser | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    onChanged(mapFirebaseUser(user));
  });
}

// Initialize Firestore targeting the provisioned database ID
export const db = getFirestore(
  firebaseApp,
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined
);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const user = auth.currentUser;
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: user?.uid || null,
      email: user?.email || null,
      emailVerified: user ? user.emailVerified : null,
      isAnonymous: user ? user.isAnonymous : null,
      tenantId: user?.tenantId || null,
      providerInfo: user
        ? user.providerData.map((p) => ({
            providerId: p.providerId,
            displayName: p.displayName,
            email: p.email,
            photoUrl: p.photoURL,
          }))
        : [],
    },
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

/**
 * Recursively strips all `undefined` properties so Firestore setDoc/updateDoc never throws
 * `Unsupported field value: undefined`.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(value as Record<string, any>)) {
      if (val !== undefined) {
        cleaned[key] = stripUndefinedDeep(val);
      }
    }
    return cleaned as T;
  }
  return value;
}

/**
 * Validates connection to Firestore server directly (read-only ping)
 */
export async function testFirestoreConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const testDocRef = doc(db, 'test', 'connection');
    await getDocFromServer(testDocRef);
    return {
      success: true,
      message: auth.currentUser
        ? `¡Conectado exitosamente con Firebase Firestore (${auth.currentUser.email || 'Google Cloud'})!`
        : 'Conexión verificada con el clúster de Firestore.',
    };
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    const code = error?.code || '';
    if (msg.includes('the client is offline')) {
      return {
        success: false,
        message: 'El dispositivo no tiene acceso a internet o la base de datos está desconectada.',
      };
    }
    if (code === 'permission-denied' || msg.toLowerCase().includes('permission')) {
      if (!auth.currentUser) {
        return {
          success: false,
          message: 'Inicia sesión con Google en Configuración → Nube para conectar con Firestore.',
        };
      }
      return {
        success: false,
        message: 'Permisos denegados en Firestore para la cuenta de Google actual.',
      };
    }
    console.error('Firebase test connection error:', error);
    return {
      success: false,
      message: `Error al conectar con Firestore: ${msg}`,
    };
  }
}

/**
 * Real-time listener for incoming Web Orders (pedidos_online)
 */
export function subscribeToPedidosOnline(
  onOrdersUpdated: (orders: PedidoOnline[]) => void,
  onError?: (err: Error) => void
) {
  const pathForList = 'pedidos_online';
  try {
    const q = query(collection(db, pathForList), orderBy('fecha', 'desc'), limit(150));
    return onSnapshot(
      q,
      (snapshot) => {
        const orders: PedidoOnline[] = [];
        snapshot.forEach((d) => {
          orders.push(d.data() as PedidoOnline);
        });
        onOrdersUpdated(orders);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, pathForList);
        if (onError) onError(err);
      }
    );
  } catch (e: any) {
    console.warn('Error starting pedidos_online listener:', e);
    return () => {};
  }
}

/**
 * Saves a new online web order into Firestore (stripping undefined fields)
 */
export async function savePedidoOnlineToFirestore(pedido: PedidoOnline): Promise<boolean> {
  const safeId = String(pedido.id || `pedido_${Date.now()}`).replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  const pathForWrite = `pedidos_online/${safeId}`;
  try {
    const cleanPedido = stripUndefinedDeep({
      ...pedido,
      id: safeId,
      clienteNombre: String(pedido.clienteNombre || 'Cliente').trim().slice(0, 150),
      clienteTelefono: String(pedido.clienteTelefono || '0000000').trim().slice(0, 35),
      total: Number(pedido.total) || 0,
      totalBs: Number(pedido.totalBs) || 0,
      estado: pedido.estado || 'pendiente',
      fecha: pedido.fecha || new Date().toISOString(),
    });
    const docRef = doc(db, 'pedidos_online', safeId);
    await setDoc(docRef, cleanPedido, { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pathForWrite);
    return false;
  }
}

/**
 * Updates status or details of a web order in Firestore
 */
export async function updatePedidoOnlineInFirestore(
  pedidoId: string,
  updates: Partial<PedidoOnline>
): Promise<boolean> {
  const safeId = String(pedidoId).replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  const pathForUpdate = `pedidos_online/${safeId}`;
  try {
    const docRef = doc(db, 'pedidos_online', safeId);
    await setDoc(docRef, stripUndefinedDeep(updates), { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, pathForUpdate);
    return false;
  }
}

/**
 * Real-time listener for company configuration and daily exchange rate
 */
export function subscribeToEmpresaConfig(
  onConfigUpdated: (config: EmpresaConfig) => void,
  onError?: (err: Error) => void
) {
  try {
    const docRef = doc(db, 'empresa_config', 'main');
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          onConfigUpdated(snap.data() as EmpresaConfig);
        }
      },
      (err) => {
        console.warn('Firestore empresa_config notice:', err);
        if (onError) onError(err);
      }
    );
  } catch (e: any) {
    console.warn('Error subscribing to empresa_config:', e);
    return () => {};
  }
}

/**
 * Saves company configuration and exchange rate to Firestore
 */
export async function saveEmpresaConfigToFirestore(config: EmpresaConfig): Promise<boolean> {
  try {
    const cleanConfig: Record<string, any> = {
      nombreEmpresa: config.nombreEmpresa || '',
      rif: config.rif || '',
      direccionFiscal: config.direccionFiscal || '',
      telefono: config.telefono || '',
      logoUrl: config.logoUrl || '',
      tasaCambio: Number(config.tasaCambio) || 0,
      fechaTasa: config.fechaTasa || new Date().toLocaleDateString('es-VE'),
      ultimaActualizacionTasa: config.ultimaActualizacionTasa || new Date().toISOString(),
      nombreTienda1: config.nombreTienda1 || 'Tienda 1',
      nombreTienda2: config.nombreTienda2 || 'Tienda 2',
      nombreOficina: config.nombreOficina || 'Oficina Central / Almacén',
    };
    if (config.piePaginaTicket !== undefined) {
      cleanConfig.piePaginaTicket = config.piePaginaTicket;
    }
    if (config.factoryResetAt !== undefined) {
      cleanConfig.factoryResetAt = config.factoryResetAt;
    }
    if (config.fiscalUpdatedAt !== undefined) {
      cleanConfig.fiscalUpdatedAt = config.fiscalUpdatedAt;
    }
    if (typeof config.stockMinimoAlerta === 'number' && config.stockMinimoAlerta >= 0) {
      cleanConfig.stockMinimoAlerta = config.stockMinimoAlerta;
    }
    await setDoc(doc(db, 'empresa_config', 'main'), cleanConfig);
    return true;
  } catch (error) {
    console.error('Error saving empresa_config to Firestore:', error);
    return false;
  }
}

/**
 * Fetch company configuration directly once from Firestore
 */
export async function getEmpresaConfigFromFirestore(): Promise<EmpresaConfig | null> {
  try {
    const empSnap = await getDoc(doc(db, 'empresa_config', 'main'));
    if (empSnap.exists()) {
      return empSnap.data() as EmpresaConfig;
    }
  } catch (e) {
    console.warn('Could not fetch empresa_config directly:', e);
  }
  return null;
}

/**
 * Persists all branches (sucursales) to Firestore `/sucursales`
 */
export async function saveSucursalesToFirestore(sucursalesList: Sucursal[]): Promise<boolean> {
  try {
    if (!Array.isArray(sucursalesList) || sucursalesList.length === 0) return false;
    const batch = writeBatch(db);
    for (const suc of sucursalesList) {
      const cleanSuc: Sucursal = {
        id: Number(suc.id),
        nombre: String(suc.nombre || `Sucursal #${suc.id}`).trim().slice(0, 150),
        tipo: suc.tipo === 'oficina' ? 'oficina' : 'tienda',
      };
      batch.set(doc(db, 'sucursales', String(cleanSuc.id)), cleanSuc, { merge: true });
    }
    await batch.commit();
    return true;
  } catch (err) {
    console.warn('Notice saving sucursales to Firestore:', err);
    return false;
  }
}

/**
 * Real-time subscription to `/sucursales` in Firestore
 */
export function subscribeToSucursales(
  onSucursalesUpdated: (sucursales: Sucursal[]) => void,
  onError?: (err: Error) => void
) {
  try {
    const colRef = collection(db, 'sucursales');
    return onSnapshot(
      colRef,
      (snapshot) => {
        if (snapshot.empty) return;
        const list: Sucursal[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as Partial<Sucursal>;
          const idNum = Number(data.id ?? d.id);
          if (Number.isFinite(idNum) && data.nombre) {
            list.push({
              id: idNum,
              nombre: String(data.nombre),
              tipo: data.tipo === 'oficina' ? 'oficina' : 'tienda',
            });
          }
        });
        if (list.length > 0) {
          list.sort((a, b) => a.id - b.id);
          onSucursalesUpdated(list);
        }
      },
      (err) => {
        console.warn('Firestore sucursales notice:', err);
        if (onError) onError(err);
      }
    );
  } catch (e: any) {
    console.warn('Error subscribing to sucursales:', e);
    return () => {};
  }
}

/**
 * Real-time listener for digital store settings
 */
export function subscribeToTiendaConfig(
  onConfigUpdated: (config: TiendaConfig) => void,
  onError?: (err: Error) => void
) {
  try {
    const docRef = doc(db, 'tienda_config', 'main');
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          onConfigUpdated(snap.data() as TiendaConfig);
        }
      },
      (err) => {
        console.warn('Firestore tienda_config notice:', err);
        if (onError) onError(err);
      }
    );
  } catch (e: any) {
    console.warn('Error subscribing to tienda_config:', e);
    return () => {};
  }
}

/**
 * Saves digital store configuration to Firestore
 */
export async function saveTiendaConfigToFirestore(config: TiendaConfig): Promise<boolean> {
  try {
    await setDoc(doc(db, 'tienda_config', 'main'), stripUndefinedDeep(config), { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'tienda_config/main');
    return false;
  }
}

/**
 * Real-time listener for products catalog
 */
export function subscribeToProductos(
  onProductosUpdated: (products: Producto[]) => void,
  onError?: (err: Error) => void
) {
  try {
    const colRef = collection(db, 'productos');
    return onSnapshot(
      colRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const prods: Producto[] = [];
          snapshot.forEach((d) => {
            prods.push(d.data() as Producto);
          });
          onProductosUpdated(prods);
        }
      },
      (err) => {
        console.warn('Firestore productos notice:', err);
        if (onError) onError(err);
      }
    );
  } catch (e: any) {
    console.warn('Error subscribing to productos:', e);
    return () => {};
  }
}

/**
 * Save single product to Firestore
 */
export async function saveProductToFirestore(prod: Producto): Promise<boolean> {
  try {
    const cleanProd: Record<string, any> = {
      id: prod.id,
      nombre: prod.nombre || '',
      precio: Number(prod.precio) || 0,
      codigo_barras: prod.codigo_barras || '',
      costo: prod.costo !== undefined ? Number(prod.costo) : 0,
      unidad_medida: prod.unidad_medida || 'UND',
      exento_iva: Boolean(prod.exento_iva),
      categoria: prod.categoria || 'General',
      descripcion: prod.descripcion || '',
      imagen: prod.imagen || '',
      destacadoTienda: prod.destacadoTienda !== undefined ? Boolean(prod.destacadoTienda) : true,
    };
    if (typeof prod.stock_minimo === 'number' && !Number.isNaN(prod.stock_minimo) && prod.stock_minimo >= 0) {
      cleanProd.stock_minimo = prod.stock_minimo;
    } else {
      cleanProd.stock_minimo = deleteField();
    }
    await setDoc(doc(db, 'productos', String(prod.id)), cleanProd, { merge: true });
    return true;
  } catch (err) {
    console.error('Error saving product to Firestore:', err);
    return false;
  }
}

/**
 * Delete product document from Firestore
 */
export async function deleteProductFromFirestore(prodId: number): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'productos', String(prodId)));
    return true;
  } catch (err) {
    console.error('Error deleting product from Firestore:', err);
    return false;
  }
}

/**
 * Save inventario stock to Firestore with Branch Isolation (Separación por Sucursal)
 * Saves isolated documents per branch (`inventario/sucursal_${id}`) to prevent
 * cross-branch overwrite and document size limit issues.
 */
export async function saveInventarioToFirestore(
  inventario: InventarioItem[],
  targetSucursalId?: number
): Promise<boolean> {
  try {
    // Group inventory by branch (sucursal)
    const bySucursal = new Map<number, InventarioItem[]>();
    for (const item of inventario) {
      const list = bySucursal.get(item.sucursal_id) || [];
      list.push(item);
      bySucursal.set(item.sucursal_id, list);
    }

    // Save each branch's stock in its own isolated document
    const batch = writeBatch(db);
    const sucursalesToSave = targetSucursalId ? [targetSucursalId] : Array.from(bySucursal.keys());

    for (const sId of sucursalesToSave) {
      const branchItems = bySucursal.get(sId) || [];
      const branchDocRef = doc(db, 'inventario', `sucursal_${sId}`);
      batch.set(
        branchDocRef,
        {
          sucursalId: sId,
          items: branchItems,
          totalArticulos: branchItems.length,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    return true;
  } catch (err) {
    console.error('Error saving inventario to Firestore:', err);
    return false;
  }
}

/**
 * Fetch consolidated inventario from Firestore with multi-branch support
 */
export async function fetchInventarioFromFirestore(): Promise<InventarioItem[] | null> {
  try {
    const invColSnap = await getDocs(collection(db, 'inventario'));
    if (!invColSnap.empty) {
      const consolidatedMap = new Map<string, InventarioItem>();
      let foundBranchDocs = false;

      invColSnap.forEach((d) => {
        if (d.id.startsWith('sucursal_') && Array.isArray(d.data().items)) {
          foundBranchDocs = true;
          (d.data().items as InventarioItem[]).forEach((item) => {
            consolidatedMap.set(`${item.sucursal_id}_${item.producto_id}`, item);
          });
        }
      });

      if (foundBranchDocs && consolidatedMap.size > 0) {
        return Array.from(consolidatedMap.values());
      }

      // Fallback to main document
      const mainDoc = invColSnap.docs.find((d) => d.id === 'main');
      if (mainDoc && Array.isArray(mainDoc.data().items)) {
        return mainDoc.data().items as InventarioItem[];
      }
    }
  } catch (err) {
    console.warn('Error fetching inventario from Firestore:', err);
  }
  return null;
}

/**
 * Synchronize full local product catalog and stock to Firestore
 * Safely upserts products and sucursales without destructive deletes
 * that could eliminate products registered in other branches.
 */
export async function syncAllToFirestore({
  productos,
  empresaConfig,
  tiendaConfig,
  sucursales,
  inventario,
}: {
  productos: Producto[];
  empresaConfig: EmpresaConfig;
  tiendaConfig: TiendaConfig;
  sucursales: Sucursal[];
  inventario: InventarioItem[];
}): Promise<{ success: boolean; count: number; deletedCount: number; error?: string }> {
  try {
    // 1. Sync Empresa & Tienda config and branch-isolated inventory
    await saveEmpresaConfigToFirestore(empresaConfig);
    await saveTiendaConfigToFirestore(tiendaConfig);
    await saveInventarioToFirestore(inventario);

    // 2. Safe chunked batch upsert of local products (max 400 operations per batch to comply with Firestore's 500-write limit)
    const BATCH_LIMIT = 400;
    let count = 0;

    for (let i = 0; i < productos.length; i += BATCH_LIMIT) {
      const slice = productos.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);

      for (const prod of slice) {
        const prodRef = doc(db, 'productos', String(prod.id));
        const cleanProd: Record<string, any> = {
          id: prod.id,
          nombre: prod.nombre || '',
          precio: Number(prod.precio) || 0,
          codigo_barras: prod.codigo_barras || '',
          costo: prod.costo !== undefined ? Number(prod.costo) : 0,
          unidad_medida: prod.unidad_medida || 'UND',
          exento_iva: Boolean(prod.exento_iva),
          categoria: prod.categoria || 'General',
          descripcion: prod.descripcion || '',
          imagen: prod.imagen || '',
          destacadoTienda: prod.destacadoTienda !== undefined ? Boolean(prod.destacadoTienda) : true,
        };
        if (typeof prod.stock_minimo === 'number' && !Number.isNaN(prod.stock_minimo) && prod.stock_minimo >= 0) {
          cleanProd.stock_minimo = prod.stock_minimo;
        } else {
          cleanProd.stock_minimo = deleteField();
        }
        batch.set(prodRef, cleanProd, { merge: true });
        count++;
      }

      await batch.commit();
    }

    // 3. Batch write sucursales in dedicated batch
    if (sucursales.length > 0) {
      const sucBatch = writeBatch(db);
      for (const suc of sucursales) {
        const sucRef = doc(db, 'sucursales', String(suc.id));
        sucBatch.set(sucRef, suc, { merge: true });
      }
      await sucBatch.commit();
    }

    return { success: true, count, deletedCount: 0 };
  } catch (err: any) {
    console.error('Error syncing all to Firestore:', err);
    return { success: false, count: 0, deletedCount: 0, error: err?.message || String(err) };
  }
}

/**
 * Load initial data from Firestore if present
 */
export async function fetchAllFromFirestore(): Promise<{
  productos?: Producto[];
  inventario?: InventarioItem[];
  empresaConfig?: EmpresaConfig;
  tiendaConfig?: TiendaConfig;
  pedidos?: PedidoOnline[];
} | null> {
  try {
    const result: any = {};

    // 1. Fetch empresa config
    const empSnap = await getDoc(doc(db, 'empresa_config', 'main'));
    if (empSnap.exists()) {
      result.empresaConfig = empSnap.data() as EmpresaConfig;
    }

    // 2. Fetch tienda config
    const tiendaSnap = await getDoc(doc(db, 'tienda_config', 'main'));
    if (tiendaSnap.exists()) {
      result.tiendaConfig = tiendaSnap.data() as TiendaConfig;
    }

    // 3. Fetch inventario (reconciled per-branch documents)
    const invConsolidated = await fetchInventarioFromFirestore();
    if (invConsolidated && invConsolidated.length > 0) {
      result.inventario = invConsolidated;
    }

    // 4. Fetch productos
    const prodSnap = await getDocs(collection(db, 'productos'));
    if (!prodSnap.empty) {
      const prods: Producto[] = [];
      prodSnap.forEach((d) => prods.push(d.data() as Producto));
      result.productos = prods;
    }

    // 5. Fetch pedidos_online
    const pedSnap = await getDocs(collection(db, 'pedidos_online'));
    if (!pedSnap.empty) {
      const orders: PedidoOnline[] = [];
      pedSnap.forEach((d) => orders.push(d.data() as PedidoOnline));
      result.pedidos = orders;
    }

    return result;
  } catch (error) {
    console.error('Error fetching all from Firestore:', error);
    return null;
  }
}

// ----------------------------------------------------------------------
// CONCURRENCY & TRANSACTIONAL INTEGRITY (FASE 4 AUDITORÍA)
// ----------------------------------------------------------------------

export interface TransaccionVentaInput {
  venta: Venta;
  sucursalId: number;
  items: { producto: Producto; cantidad: number }[];
  txUid?: string;
}

export interface TransaccionVentaResult {
  success: boolean;
  ventaDocId?: string;
  alreadyProcessed?: boolean;
  error?: string;
  stockFaltante?: { productoId: number; nombre: string; stockDisponible: number; requerido: number }[];
  isOffline?: boolean;
}

/**
 * Consolida líneas duplicadas del carrito para el mismo producto antes de validar/descontar.
 */
export function consolidateSaleItems(
  items: { producto: Producto; cantidad: number }[]
): { producto: Producto; cantidad: number }[] {
  const map = new Map<number, { producto: Producto; cantidad: number }>();
  for (const line of items) {
    if (!line?.producto || !(Number(line.cantidad) > 0)) continue;
    const qty = Number(line.cantidad);
    const existing = map.get(line.producto.id);
    if (existing) {
      existing.cantidad = +(existing.cantidad + qty).toFixed(3);
    } else {
      map.set(line.producto.id, { producto: line.producto, cantidad: qty });
    }
  }
  return Array.from(map.values());
}

/**
 * Transacción Atómica de Venta:
 * - Idempotente por txUid (si la venta ya existe en Firestore, evita doble descuento).
 * - Consolida líneas repetidas por producto antes de validar y descontar stock.
 * - Bloquea y verifica el stock disponible en la sucursal antes de vender.
 */
export async function registrarVentaTransaccional(
  input: TransaccionVentaInput
): Promise<TransaccionVentaResult> {
  const { venta, sucursalId, items, txUid } = input;
  const consolidatedItems = consolidateSaleItems(items);
  const resolvedTxUid = String(
    txUid || (venta as any).txUid || venta.id || Date.now()
  ).replace(/[^a-zA-Z0-9_\-]/g, '_');

  const branchDocRef = doc(db, 'inventario', `sucursal_${sucursalId}`);
  const ventaDocId = `vta_${sucursalId}_${resolvedTxUid}`;
  const ventaDocRef = doc(db, 'ventas', ventaDocId);

  try {
    const result = await runTransaction(db, async (transaction) => {
      // 1. Verificar idempotencia antes de tocar inventario
      const existingVentaSnap = await transaction.get(ventaDocRef);
      if (existingVentaSnap.exists()) {
        return {
          success: true,
          ventaDocId,
          alreadyProcessed: true,
        };
      }

      // 2. Leer el inventario actual de la sucursal
      const branchSnap = await transaction.get(branchDocRef);
      let branchItems: InventarioItem[] = [];

      if (branchSnap.exists() && Array.isArray(branchSnap.data().items)) {
        branchItems = branchSnap.data().items as InventarioItem[];
      }

      // 3. Validar existencias concurrentes consolidadas por producto
      const faltantes: { productoId: number; nombre: string; stockDisponible: number; requerido: number }[] = [];

      for (const item of consolidatedItems) {
        const invItem = branchItems.find((i) => i.producto_id === item.producto.id);
        const currentStock = invItem ? invItem.stock : 0;
        if (currentStock < item.cantidad) {
          faltantes.push({
            productoId: item.producto.id,
            nombre: item.producto.nombre,
            stockDisponible: currentStock,
            requerido: item.cantidad,
          });
        }
      }

      if (faltantes.length > 0) {
        throw new Error(`STOCK_INSUFICIENTE:${JSON.stringify(faltantes)}`);
      }

      // 4. Descontar el inventario consolidado de manera atómica
      const qtyByProduct = new Map<number, number>(
        consolidatedItems.map((i) => [i.producto.id, i.cantidad])
      );
      const updatedItems = branchItems.map((invItem) => {
        const soldQty = qtyByProduct.get(invItem.producto_id);
        if (soldQty !== undefined) {
          return {
            ...invItem,
            stock: Math.max(0, +(invItem.stock - soldQty).toFixed(3)),
          };
        }
        return invItem;
      });

      // 5. Preparar el documento de venta inmutable y limpio
      const numeroFactura =
        (venta as any).numeroFactura ||
        `FAC-${String(sucursalId).padStart(2, '0')}-${String(venta.id).padStart(6, '0')}`;

      const cleanVenta: Record<string, any> = stripUndefinedDeep({
        ...venta,
        txUid: resolvedTxUid,
        numeroFactura,
        id: venta.id,
        sucursal_id: sucursalId,
        fecha: venta.fecha || new Date().toISOString(),
        total: Number(venta.total) || 0,
      });

      // 6. Registrar venta y actualizar inventario en el mismo batch atómico
      transaction.set(ventaDocRef, cleanVenta);
      transaction.set(
        branchDocRef,
        {
          sucursalId,
          items: updatedItems,
          totalArticulos: updatedItems.length,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // 7. Registrar bitácora de auditoría atómica
      const auditDocId = `aud_vta_${resolvedTxUid}`;
      const auditRef = doc(db, 'auditoria', auditDocId);
      transaction.set(auditRef, {
        id: auditDocId,
        accion: 'VENTA',
        modulo: 'POS / Ventas',
        descripcion: `Venta POS #${cleanVenta.numeroFactura} registrada por $${cleanVenta.total.toFixed(2)}`,
        usuario: venta.usuario_nombre || 'Cajero',
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        ventaDocId,
        alreadyProcessed: false,
      };
    });

    return result;
  } catch (err: any) {
    if (err.message && err.message.startsWith('STOCK_INSUFICIENTE:')) {
      const faltantes = JSON.parse(err.message.replace('STOCK_INSUFICIENTE:', ''));
      return {
        success: false,
        error: 'No hay suficiente inventario disponible para completar la venta.',
        stockFaltante: faltantes,
      };
    }

    console.warn('Transacción de venta Firestore notice/fallback:', err);
    return {
      success: false,
      error: err.message || 'Error en transacción de venta',
      isOffline: err.message?.includes('offline') || err.code === 'unavailable',
    };
  }
}

/**
 * Transferencia de Stock Atómica entre Sucursales:
 * Deduce en origen y añade en destino en una sola transacción sin pérdidas.
 */
export async function transferirStockTransaccional({
  origenId,
  destinoId,
  productoId,
  productoNombre,
  cantidad,
  usuarioNombre,
}: {
  origenId: number;
  destinoId: number;
  productoId: number;
  productoNombre: string;
  cantidad: number;
  usuarioNombre?: string;
}): Promise<{ success: boolean; error?: string }> {
  const origDocRef = doc(db, 'inventario', `sucursal_${origenId}`);
  const destDocRef = doc(db, 'inventario', `sucursal_${destinoId}`);

  try {
    await runTransaction(db, async (transaction) => {
      const origSnap = await transaction.get(origDocRef);
      const destSnap = await transaction.get(destDocRef);

      const origItems: InventarioItem[] =
        origSnap.exists() && Array.isArray(origSnap.data().items) ? origSnap.data().items : [];
      const destItems: InventarioItem[] =
        destSnap.exists() && Array.isArray(destSnap.data().items) ? destSnap.data().items : [];

      const origItem = origItems.find((i) => i.producto_id === productoId);
      const currentStock = origItem ? origItem.stock : 0;

      if (currentStock < cantidad) {
        throw new Error(
          `Stock insuficiente en sucursal de origen: disponible ${currentStock}, requerido ${cantidad}`
        );
      }

      // Descontar en origen
      const nextOrigItems = origItems.map((item) => {
        if (item.producto_id === productoId) {
          return { ...item, stock: +(item.stock - cantidad).toFixed(3) };
        }
        return item;
      });

      // Añadir en destino
      let nextDestItems: InventarioItem[] = [];
      const destItemExists = destItems.some((i) => i.producto_id === productoId);

      if (destItemExists) {
        nextDestItems = destItems.map((item) => {
          if (item.producto_id === productoId) {
            return { ...item, stock: +(item.stock + cantidad).toFixed(3) };
          }
          return item;
        });
      } else {
        nextDestItems = [
          ...destItems,
          {
            id: Date.now(),
            sucursal_id: destinoId,
            producto_id: productoId,
            stock: cantidad,
          },
        ];
      }

      transaction.set(origDocRef, { items: nextOrigItems, updatedAt: new Date().toISOString() }, { merge: true });
      transaction.set(destDocRef, { items: nextDestItems, updatedAt: new Date().toISOString() }, { merge: true });

      // Registro de auditoría
      const auditDocId = `aud_tr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      transaction.set(doc(db, 'auditoria', auditDocId), {
        id: auditDocId,
        accion: 'TRASPASO',
        modulo: 'Inventario',
        descripcion: `Transferencia atómica de ${cantidad} und de "${productoNombre}" de sucursal #${origenId} a #${destinoId}`,
        usuario: usuarioNombre || 'Supervisor',
        timestamp: new Date().toISOString(),
      });
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error en transferencia atómica:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Registro Atómico de Compras e Incremento de Stock:
 * Guarda la factura de compra, suma existencias y genera la cuenta por pagar (CxP) si fue a crédito.
 */
export async function registrarCompraTransaccional(
  compra: Compra,
  usuarioNombre?: string
): Promise<{ success: boolean; error?: string }> {
  const branchDocRef = doc(db, 'inventario', `sucursal_${compra.sucursalId}`);
  const compraDocRef = doc(db, 'compras', `cmp_${compra.id}`);

  try {
    await runTransaction(db, async (transaction) => {
      const branchSnap = await transaction.get(branchDocRef);
      let branchItems: InventarioItem[] = [];
      if (branchSnap.exists() && Array.isArray(branchSnap.data().items)) {
        branchItems = branchSnap.data().items;
      }

      // Incrementar stock para cada renglón comprado
      let nextItems = [...branchItems];
      for (const detalle of compra.detalles) {
        const index = nextItems.findIndex((i) => i.producto_id === detalle.productoId);
        if (index >= 0) {
          nextItems[index] = {
            ...nextItems[index],
            stock: +(nextItems[index].stock + detalle.cantidad).toFixed(3),
          };
        } else {
          nextItems.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            sucursal_id: compra.sucursalId,
            producto_id: detalle.productoId,
            stock: detalle.cantidad,
          });
        }
      }

      // Guardar compra
      transaction.set(
        compraDocRef,
        stripUndefinedDeep({
          ...compra,
          fecha: compra.fecha || new Date().toISOString(),
          total: Number(compra.total) || 0,
          numeroFactura: compra.numeroFactura || `FAC-COMP-${compra.id}`,
        })
      );

      // Si es a crédito, registrar en cuentas por pagar
      if (compra.condicionPago === 'credito') {
        const cxpDocRef = doc(db, 'cuentas_por_pagar', `cxp_cmp_${compra.id}`);
        transaction.set(
          cxpDocRef,
          stripUndefinedDeep({
            id: compra.id,
            proveedorId: compra.proveedorId,
            proveedorNombre: compra.proveedorNombre,
            facturaNumero: compra.numeroFactura || `FAC-COMP-${compra.id}`,
            concepto: `Compra a crédito de mercancía (Factura #${compra.numeroFactura || compra.id})`,
            fechaEmision: compra.fecha || new Date().toISOString(),
            fechaVencimiento: compra.fechaVencimiento || new Date(Date.now() + 15 * 86400000).toISOString(),
            montoTotal: compra.total,
            saldoRestante: compra.total,
            estado: 'pendiente',
            pagos: [],
            tasaRecepcion: compra.tasaRecepcion,
            pagarATasaRecepcion: compra.pagarATasaRecepcion,
          })
        );
      }

      // Actualizar inventario
      transaction.set(
        branchDocRef,
        {
          items: nextItems,
          totalArticulos: nextItems.length,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // Bitácora
      const auditDocId = `aud_cmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      transaction.set(doc(db, 'auditoria', auditDocId), {
        id: auditDocId,
        accion: 'COMPRA',
        modulo: 'Compras',
        descripcion: `Compra #${compra.numeroFactura || compra.id} de $${compra.total.toFixed(2)} a ${compra.proveedorNombre} (${compra.condicionPago || 'contado'})`,
        usuario: usuarioNombre || 'Administrador',
        timestamp: new Date().toISOString(),
      });
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error en compra transaccional:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Registro Atómico de Abono en Cuentas por Cobrar (CxC):
 * Protege contra pagos duplicados o que excedan el saldo pendiente.
 */
export async function registrarAbonoCxcTransaccional({
  cxcId,
  monto,
  metodoPago,
  referencia,
  usuarioNombre,
}: {
  cxcId: number;
  monto: number;
  metodoPago: string;
  referencia?: string;
  usuarioNombre?: string;
}): Promise<{ success: boolean; nuevoSaldo?: number; error?: string }> {
  const cxcDocRef = doc(db, 'cuentas_por_cobrar', `cxc_${cxcId}`);

  try {
    const res = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(cxcDocRef);
      if (!snap.exists()) {
        return { success: false, error: 'Cuenta por cobrar no encontrada en Firestore' };
      }

      const data = snap.data();
      const saldoActual = Number(data.saldoRestante) || 0;

      if (monto <= 0 || monto > saldoActual + 0.01) {
        throw new Error(
          `Monto inválido. El abono ($${monto.toFixed(2)}) no puede exceder el saldo restante ($${saldoActual.toFixed(2)})`
        );
      }

      const nuevoSaldo = Math.max(0, +(saldoActual - monto).toFixed(2));
      const nuevoEstado = nuevoSaldo === 0 ? 'pagada' : 'parcial';
      const pagosAnteriores = Array.isArray(data.abonos) ? data.abonos : [];

      const nuevoAbono = {
        id: pagosAnteriores.length + 1,
        fecha: new Date().toISOString(),
        monto,
        metodoPago,
        referencia: referencia || '',
        usuarioNombre: usuarioNombre || 'Cajero',
      };

      transaction.update(cxcDocRef, {
        saldoRestante: nuevoSaldo,
        estado: nuevoEstado,
        abonos: [...pagosAnteriores, nuevoAbono],
        updatedAt: new Date().toISOString(),
      });

      return { success: true, nuevoSaldo };
    });

    return res;
  } catch (err: any) {
    console.error('Error en abono CxC transaccional:', err);
    return { success: false, error: err.message };
  }
}

// ----------------------------------------------------------------------
// AUDIT LOG PERSISTENCE & REAL-TIME REPLICATION (FASE 5)
// ----------------------------------------------------------------------

/**
 * Persists an audit entry directly to Firestore.
 * Conforms to the immutable firestore.rules security blueprint.
 */
export async function saveAuditoriaLogToFirestore(entry: RegistroAuditoria): Promise<boolean> {
  try {
    const logDocId = entry.id.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const docRef = doc(db, 'auditoria', logDocId);

    const cleanEntry: Record<string, any> = {
      id: logDocId,
      accion: entry.tipo_accion || 'REGISTRO',
      tipo_accion: entry.tipo_accion || 'REGISTRO',
      modulo: entry.modulo || 'Sistema',
      descripcion: entry.descripcion || '',
      detalles: entry.detalles || '',
      usuario: entry.usuario_nombre || 'Sistema',
      usuario_id: entry.usuario_id ?? null,
      usuario_username: entry.usuario_username || '',
      usuario_rol: entry.usuario_rol || '',
      sucursal_id: entry.sucursal_id ?? null,
      sucursal_nombre: entry.sucursal_nombre || '',
      fecha: entry.fecha || new Date().toLocaleDateString('es-VE'),
      hora: entry.hora || new Date().toLocaleTimeString('es-VE'),
      timestamp: entry.timestamp || new Date().toISOString(),
    };

    await setDoc(docRef, cleanEntry);
    return true;
  } catch (err) {
    console.warn('Notice saving audit log to Firestore:', err);
    return false;
  }
}

/**
 * Real-time subscription to immutable audit logs from Firestore
 */
export function subscribeToAuditoriaLogs(
  onLogsUpdated: (logs: RegistroAuditoria[]) => void,
  onError?: (err: Error) => void
) {
  try {
    const q = query(collection(db, 'auditoria'), orderBy('timestamp', 'desc'), limit(250));
    return onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const logs: RegistroAuditoria[] = [];
          snapshot.forEach((d) => {
            const data = d.data();
            logs.push({
              id: d.id,
              fecha: data.fecha || '',
              hora: data.hora || '',
              timestamp: data.timestamp || '',
              usuario_id: data.usuario_id,
              usuario_nombre: data.usuario || data.usuario_nombre || 'Operador',
              usuario_username: data.usuario_username,
              usuario_rol: data.usuario_rol,
              usuario_cargo: data.usuario_cargo,
              sucursal_id: data.sucursal_id,
              sucursal_nombre: data.sucursal_nombre,
              modulo: data.modulo,
              tipo_accion: data.tipo_accion || data.accion,
              descripcion: data.descripcion,
              detalles: data.detalles,
            });
          });
          onLogsUpdated(logs);
        }
      },
      (err) => {
        console.warn('Firestore auditoria notice:', err);
        if (onError) onError(err);
      }
    );
  } catch (e: any) {
    console.warn('Error starting auditoria listener:', e);
    return () => {};
  }
}

// ----------------------------------------------------------------------
// SYSTEM USERS & PIN PERSISTENCE IN FIRESTORE
// ----------------------------------------------------------------------

/**
 * Persists the sanitized user roster (with hashed PINs) to Firestore `/usuarios`.
 * Soft-marks deleted users with `eliminado: true` so Firestore security rules remain satisfied.
 */
export async function saveUsuariosToFirestore(usuariosList: Usuario[]): Promise<boolean> {
  try {
    const colRef = collection(db, 'usuarios');
    const existingSnap = await getDocs(colRef);
    const activeIds = new Set(usuariosList.map((u) => `user_${u.id}`));

    const batch = writeBatch(db);
    for (const u of usuariosList) {
      const docRef = doc(db, 'usuarios', `user_${u.id}`);
      batch.set(
        docRef,
        stripUndefinedDeep({
          id: u.id,
          username: u.username || `user_${u.id}`,
          nombre_completo: u.nombre_completo || 'Usuario',
          pin: u.pin || '',
          rol: u.rol,
          sucursal_id: u.sucursal_id ?? null,
          cargo: u.cargo || '',
          permisos: u.permisos || {},
          eliminado: false,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
    }

    // Soft-mark removed users so they don't reappear on reload
    existingSnap.forEach((docSnap) => {
      if (!activeIds.has(docSnap.id)) {
        const data = docSnap.data();
        if (data && data.nombre_completo && data.username && data.rol && !data.eliminado) {
          batch.set(
            doc(db, 'usuarios', docSnap.id),
            {
              eliminado: true,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      }
    });

    await batch.commit();
    return true;
  } catch (err) {
    console.warn('Notice saving usuarios to Firestore:', err);
    return false;
  }
}

/**
 * Real-time subscription to `/usuarios` in Firestore.
 * Emits only active (non-deleted) users when at least one active user exists in Firestore.
 */
export function subscribeToUsuarios(
  onUsuariosUpdated: (users: Usuario[]) => void,
  onError?: (err: Error) => void
) {
  try {
    const colRef = collection(db, 'usuarios');
    return onSnapshot(
      colRef,
      (snapshot) => {
        if (snapshot.empty) return;
        const users: Usuario[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as Usuario & { eliminado?: boolean };
          if (!data.eliminado && data.nombre_completo && data.username && data.rol) {
            users.push({
              id: Number(data.id),
              username: data.username,
              nombre_completo: data.nombre_completo,
              pin: data.pin || '',
              rol: data.rol,
              sucursal_id: data.sucursal_id ?? null,
              cargo: data.cargo || '',
              permisos: data.permisos,
            });
          }
        });
        if (users.length > 0) {
          users.sort((a, b) => a.id - b.id);
          onUsuariosUpdated(users);
        }
      },
      (err) => {
        console.warn('Firestore usuarios notice:', err);
        if (onError) onError(err);
      }
    );
  } catch (e: any) {
    console.warn('Error subscribing to usuarios:', e);
    return () => {};
  }
}

async function clearCollectionInChunks(collectionName: string): Promise<void> {
  try {
    const snap = await getDocs(collection(db, collectionName));
    if (snap.empty) return;
    const docs = snap.docs;
    const BATCH_SIZE = 400;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    console.warn(`Notice clearing Firestore collection ${collectionName}:`, err);
  }
}

/**
 * Performs a clean Factory Reset in Firestore:
 * - Clears web orders, products, stock, sales, purchases, suppliers, CxC, CxP
 * - Overwrites empresa_config/main with blank fiscal info + preserved exchange rate + factoryResetAt
 * - Overwrites tienda_config/main with clean store defaults
 * - Keeps ONLY the preserved General Manager user with their established PIN
 */
export async function resetSystemDataInFirestore({
  cleanEmpresa,
  cleanTienda,
  cleanSucursales,
  preservedAdminUsers,
}: {
  cleanEmpresa: EmpresaConfig;
  cleanTienda: TiendaConfig;
  cleanSucursales: Sucursal[];
  preservedAdminUsers: Usuario[];
}): Promise<boolean> {
  try {
    await Promise.all([
      clearCollectionInChunks('pedidos_online'),
      clearCollectionInChunks('productos'),
      clearCollectionInChunks('inventario'),
      clearCollectionInChunks('ventas'),
      clearCollectionInChunks('compras'),
      clearCollectionInChunks('proveedores'),
      clearCollectionInChunks('cuentas_por_pagar'),
      clearCollectionInChunks('cuentas_por_cobrar'),
      clearCollectionInChunks('sucursales'),
    ]);

    // Clean usuarios collection leaving only preserved General Manager(s)
    try {
      const usersSnap = await getDocs(collection(db, 'usuarios'));
      const keepIds = new Set(preservedAdminUsers.map((u) => `user_${u.id}`));
      const batch = writeBatch(db);
      usersSnap.forEach((d) => {
        if (!keepIds.has(d.id)) {
          batch.delete(d.ref);
        }
      });
      for (const u of preservedAdminUsers) {
        batch.set(
          doc(db, 'usuarios', `user_${u.id}`),
          stripUndefinedDeep({
            id: u.id,
            username: u.username || 'gerente_general',
            nombre_completo: u.nombre_completo || 'Gerente General',
            pin: u.pin || '',
            rol: u.rol,
            sucursal_id: null,
            cargo: u.cargo || 'Gerente General',
            permisos: u.permisos || {},
            eliminado: false,
            updatedAt: new Date().toISOString(),
          })
        );
      }
      await batch.commit();
    } catch (err) {
      console.warn('Notice resetting usuarios in Firestore:', err);
    }

    // Overwrite empresa_config/main and tienda_config/main cleanly (no stale fields)
    await saveEmpresaConfigToFirestore(cleanEmpresa);
    await setDoc(doc(db, 'tienda_config', 'main'), stripUndefinedDeep(cleanTienda));

    // Write clean sucursales
    if (cleanSucursales.length > 0) {
      const sucBatch = writeBatch(db);
      for (const suc of cleanSucursales) {
        sucBatch.set(doc(db, 'sucursales', String(suc.id)), suc);
      }
      await sucBatch.commit();
    }

    return true;
  } catch (err) {
    console.error('Error resetting Firestore data:', err);
    return false;
  }
}

