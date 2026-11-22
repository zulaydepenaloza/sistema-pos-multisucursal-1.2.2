import React, { useState } from 'react';
import {
  Settings,
  Users,
  Shield,
  KeyRound,
  Edit3,
  Check,
  Building2,
  TrendingUp,
  Store,
  CheckCircle2,
  AlertCircle,
  Save,
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  DollarSign,
  Lock,
  Download,
  Code,
  UserPlus,
  Trash2,
  Search,
  Filter,
  RefreshCw,
  Eye,
  EyeOff,
  Sparkles,
  ClipboardList,
  Fingerprint,
  Database,
  FileJson,
  Wrench,
  Calculator,
  Globe,
  Flame,
  Layers,
  ExternalLink,
  Copy,
  Cloud,
  HardDrive,
  Cpu,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  X,
} from 'lucide-react';
import { Usuario, EmpresaConfig, Sucursal, ModuloPermisos, RegistroAuditoria, Producto, InventarioItem, Venta, Compra, Cliente, Proveedor, CuentaPorCobrar, CuentaPorPagar, PedidoOnline, TiendaConfig, BackupDatabasePayload } from '../types';
import { formatBs, formatUSD } from '../lib/currency';
import { StandaloneHtmlDownloader } from './StandaloneHtmlDownloader';
import { downloadStandaloneHtmlFile } from '../lib/downloadHtml';
import { AuditoriaView } from './AuditoriaView';
import { LicenseManagerView } from './LicenseManagerView';
import { LicenseValidationResult } from '../lib/licensing';
import { BackupRestoreView } from './BackupRestoreView';
import {
  testFirestoreConnection,
  syncAllToFirestore,
  fetchAllFromFirestore,
  subscribeToCloudAuth,
  signInWithGoogleCloud,
  signOutGoogleCloud,
  CloudAuthUser,
} from '../lib/firebaseClient';
import { fetchApi } from '../lib/apiFetch';
import {
  hashPin,
  isHashedPin,
  verifyUserPin,
  isFullPrivilegeAdmin,
  countOtherFullPrivilegeAdmins,
  FULL_ADMIN_PERMISSIONS,
} from '../lib/security';

interface ConfiguracionViewProps {
  usuarios: Usuario[];
  onUpdateUsuarios: (updated: Usuario[]) => void | Promise<void>;
  empresaConfig: EmpresaConfig;
  onSaveEmpresaConfig: (config: EmpresaConfig) => void;
  sucursales: Sucursal[];
  onUpdateSucursales?: (nextSucursales: Sucursal[], auditDescription?: string) => void;
  currentUser: Usuario | null;
  onOpenRateModal: () => void;
  onResetAllData?: (verifiedAdminPin?: string) => void;
  auditoriaLogs?: RegistroAuditoria[];
  onClearAuditoriaLogs?: () => void;
  productos?: Producto[];
  inventario?: InventarioItem[];
  ventas?: Venta[];
  compras?: Compra[];
  clientes?: Cliente[];
  proveedores?: Proveedor[];
  cxcList?: CuentaPorCobrar[];
  cxpList?: CuentaPorPagar[];
  pedidosOnline?: PedidoOnline[];
  tiendaConfig?: TiendaConfig;
  correlativoX?: number;
  correlativoZ?: number;
  onRestoreDatabase?: (backupData: BackupDatabasePayload['datos']) => void;
  onLogAudit?: (
    modulo: RegistroAuditoria['modulo'],
    tipo_accion: RegistroAuditoria['tipo_accion'],
    descripcion: string,
    options?: { detalles?: string }
  ) => void;
  licenseValidationResult?: LicenseValidationResult;
  onLicenseChanged?: () => void;
  onOpenCalculator?: () => void;
  onOpenStoreShare?: () => void;
  onOpenHtmlModal?: () => void;
  onDataLoadedFromCloud?: (data: {
    productos?: Producto[];
    inventario?: InventarioItem[];
    empresaConfig?: EmpresaConfig;
    tiendaConfig?: TiendaConfig;
  }) => void;
}

export const ConfiguracionView: React.FC<ConfiguracionViewProps> = ({
  usuarios,
  onUpdateUsuarios,
  empresaConfig,
  onSaveEmpresaConfig,
  sucursales,
  onUpdateSucursales,
  currentUser,
  onOpenRateModal,
  onResetAllData,
  auditoriaLogs = [],
  onClearAuditoriaLogs,
  productos = [],
  inventario = [],
  ventas = [],
  compras = [],
  clientes = [],
  proveedores = [],
  cxcList = [],
  cxpList = [],
  pedidosOnline = [],
  tiendaConfig,
  correlativoX = 0,
  correlativoZ = 0,
  onRestoreDatabase,
  onLogAudit,
  licenseValidationResult,
  onLicenseChanged = () => {},
  onOpenCalculator,
  onOpenStoreShare,
  onOpenHtmlModal,
  onDataLoadedFromCloud,
}) => {
  const isGeneralManager = currentUser?.rol === 'admin';

  const [activeSubTab, setActiveSubTab] = useState<'usuarios' | 'empresa' | 'sucursales' | 'tasa' | 'licencia' | 'auditoria' | 'respaldo' | 'html' | 'nube' | 'reinicio' | 'temporal'>('usuarios');

  // Cloud Firestore Database Management State
  const [cloudStatus, setCloudStatus] = useState<{ isConnected: boolean | null; message: string; latency?: number }>({
    isConnected: null,
    message: 'Listo para comprobar conexión con Google Cloud Firestore.',
  });
  const [cloudUser, setCloudUser] = useState<CloudAuthUser | null>(null);
  const [isSigningInCloud, setIsSigningInCloud] = useState<boolean>(false);
  const [isTestingCloud, setIsTestingCloud] = useState<boolean>(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [isDownloadingCloud, setIsDownloadingCloud] = useState<boolean>(false);
  const [cloudNotice, setCloudNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  React.useEffect(() => {
    const unsub = subscribeToCloudAuth((user) => {
      setCloudUser(user);
      if (user?.emailVerified) {
        testFirestoreConnection()
          .then((res) => {
            setCloudStatus({
              isConnected: res.success,
              message: res.message,
            });
          })
          .catch(() => {
            setCloudStatus({
              isConnected: false,
              message: 'Sin conexión directa a Firestore',
            });
          });
      } else {
        setCloudStatus({
          isConnected: false,
          message: 'Inicia sesión con Google para habilitar sincronización con Firestore.',
        });
      }
    });
    return () => unsub();
  }, []);

  const handleGoogleCloudSignIn = async () => {
    setIsSigningInCloud(true);
    setCloudNotice(null);
    const res = await signInWithGoogleCloud();
    setIsSigningInCloud(false);
    if (res.success && res.user) {
      setCloudNotice({
        type: 'success',
        text: `Cuenta Google conectada: ${res.user.email || res.user.displayName}`,
      });
    } else if (res.error) {
      setCloudNotice({ type: 'error', text: res.error });
    }
  };

  const handleGoogleCloudSignOut = async () => {
    await signOutGoogleCloud();
    setCloudStatus({ isConnected: false, message: 'Sesión Cloud desconectada.' });
    setCloudNotice({ type: 'info', text: 'Sesión de Google Cloud cerrada correctamente.' });
  };

  const handleTestCloudPing = async () => {
    setIsTestingCloud(true);
    setCloudNotice(null);
    try {
      const res = await testFirestoreConnection();
      setCloudStatus({
        isConnected: res.success,
        message: res.message,
      });
      setCloudNotice({
        type: res.success ? 'success' : 'error',
        text: res.message,
      });
    } catch (e: any) {
      setCloudStatus({
        isConnected: false,
        message: e?.message || 'Error al conectar con Firestore',
      });
      setCloudNotice({
        type: 'error',
        text: `Error de conexión: ${e?.message || e}`,
      });
    } finally {
      setIsTestingCloud(false);
    }
  };

  const handleUploadAllToFirestore = async () => {
    setIsSyncingCloud(true);
    setCloudNotice(null);
    try {
      const res = await syncAllToFirestore({
        productos,
        empresaConfig,
        tiendaConfig: tiendaConfig || {
          nombreTienda: empresaConfig.nombreEmpresa,
          whatsappContacto: empresaConfig.telefono,
          costoDelivery: 0,
          montoMinimoDelivery: 0,
          pagoMovilBanco: '',
          pagoMovilTelefono: '',
          pagoMovilCedula: '',
        },
        sucursales,
        inventario,
      });

      if (res.success) {
        setCloudStatus((prev) => ({ ...prev, isConnected: true }));
        setCloudNotice({
          type: 'success',
          text: `¡Catálogo y datos sincronizados con total éxito! Se actualizaron ${res.count} productos y todas las configuraciones en Firestore.`,
        });
        if (onLogAudit) {
          onLogAudit(
            'Configuración',
            'SISTEMA',
            `Sincronización masiva de base de datos a Google Cloud Firestore (${res.count} productos)`,
            { detalles: 'Subida manual ejecutada desde el panel de Base de Datos Cloud' }
          );
        }
      } else {
        setCloudNotice({
          type: 'error',
          text: `Fallo en la sincronización: ${res.error || 'Error desconocido'}`,
        });
      }
    } catch (err: any) {
      setCloudNotice({
        type: 'error',
        text: `Error durante la subida: ${err?.message || err}`,
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleDownloadAllFromFirestore = async () => {
    setIsDownloadingCloud(true);
    setCloudNotice(null);
    try {
      const data = await fetchAllFromFirestore();
      if (data && (data.productos || data.empresaConfig || data.tiendaConfig)) {
        setCloudStatus((prev) => ({ ...prev, isConnected: true }));
        if (onDataLoadedFromCloud) {
          onDataLoadedFromCloud(data);
        }
        setCloudNotice({
          type: 'success',
          text: `Datos descargados desde la nube exitosamente (${data.productos?.length || 0} productos recibidos).`,
        });
      } else {
        setCloudNotice({
          type: 'info',
          text: 'No se encontraron datos nuevos en la nube o el catálogo remoto está vacío.',
        });
      }
    } catch (err: any) {
      setCloudNotice({
        type: 'error',
        text: `Error al descargar desde Firestore: ${err?.message || err}`,
      });
    } finally {
      setIsDownloadingCloud(false);
    }
  };

  // Reset Modal & Verification State
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetWordInput, setResetWordInput] = useState<string>('');
  const [resetPinInput, setResetPinInput] = useState<string>('');
  const [resetError, setResetError] = useState<string | null>(null);

  // Company Form State
  const [companyForm, setCompanyForm] = useState<EmpresaConfig>({ ...empresaConfig });
  const [isCompanyFormDirty, setIsCompanyFormDirty] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Branch names draft & Developer-protected New Branch Modal
  const [branchNamesDraft, setBranchNamesDraft] = useState<Record<number, string>>(() =>
    sucursales.reduce((acc, s) => ({ ...acc, [s.id]: s.nombre }), {} as Record<number, string>)
  );
  const [showAddSucursalModal, setShowAddSucursalModal] = useState<boolean>(false);
  const [newBranchNombre, setNewBranchNombre] = useState<string>('');
  const [newBranchTipo, setNewBranchTipo] = useState<'tienda' | 'oficina'>('tienda');
  const [devMasterToken, setDevMasterToken] = useState<string>('');
  const [showDevToken, setShowDevToken] = useState<boolean>(false);
  const [addSucursalError, setAddSucursalError] = useState<string | null>(null);
  const [isVerifyingDevToken, setIsVerifyingDevToken] = useState<boolean>(false);

  // User list filters
  const [userSearch, setUserSearch] = useState<string>('');
  const [userSucursalFilter, setUserSucursalFilter] = useState<string>('all');

  // Selected user for editing in the Permissions/PIN area
  const [selectedUser, setSelectedUser] = useState<Usuario | null>(usuarios[0] || null);
  const [editNombre, setEditNombre] = useState<string>('');
  const [editCargo, setEditCargo] = useState<string>('');
  const [editPin, setEditPin] = useState<string>('');
  const [editRol, setEditRol] = useState<'cajero' | 'supervisor' | 'inventario' | 'admin'>('cajero');
  const [editSucursalId, setEditSucursalId] = useState<number | null>(1);
  const [showPin, setShowPin] = useState<boolean>(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<number | null>(null);
  const [editPermisos, setEditPermisos] = useState<ModuloPermisos>({
    dashboard: false,
    ventas: true,
    pedidos_web: false,
    inventario: false,
    compras: false,
    clientes: false,
    proveedores: false,
    cxc: false,
    cxp: false,
    reportes: false,
    configuracion: false,
  });

  // Modal: New User Creation
  const [showNewUserModal, setShowNewUserModal] = useState<boolean>(false);
  const [newNombre, setNewNombre] = useState<string>('');
  const [newCargo, setNewCargo] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [newRol, setNewRol] = useState<'cajero' | 'supervisor' | 'inventario' | 'admin'>('cajero');
  const [newSucursalId, setNewSucursalId] = useState<number | null>(1);
  const [newUserError, setNewUserError] = useState<string | null>(null);
  const [newPermisos, setNewPermisos] = useState<ModuloPermisos>({
    dashboard: false,
    ventas: true,
    pedidos_web: false,
    inventario: false,
    compras: false,
    clientes: false,
    proveedores: false,
    cxc: false,
    cxp: false,
    reportes: false,
    configuracion: false,
  });

  const otherFullAdminsCount = selectedUser
    ? countOtherFullPrivilegeAdmins(usuarios, selectedUser.id)
    : 0;
  const isProtectedSoleAdmin = Boolean(
    selectedUser &&
      (isFullPrivilegeAdmin(selectedUser) || selectedUser.rol === 'admin') &&
      otherFullAdminsCount === 0
  );

  // When selected user changes, sync form fields (never expose SHA-256 hash in the PIN input)
  const handleSelectUser = (u: Usuario | null) => {
    setUserFormError(null);
    setPendingDeleteUserId(null);
    if (!u) {
      setSelectedUser(null);
      return;
    }
    setSelectedUser(u);
    setEditNombre(u.nombre_completo);
    setEditCargo(u.cargo);
    setEditPin(isHashedPin(u.pin) ? '' : (u.pin === '••••' ? '' : u.pin));
    setShowPin(false);
    setEditRol(u.rol);
    setEditSucursalId(u.sucursal_id);
    const defaultPerms: ModuloPermisos = {
      dashboard: u.rol === 'admin',
      ventas: true,
      pedidos_web: u.rol === 'admin' || u.rol === 'supervisor',
      inventario: u.rol === 'admin' || u.rol === 'inventario',
      compras: u.rol === 'admin' || u.rol === 'inventario',
      clientes: u.rol === 'admin',
      proveedores: u.rol === 'admin' || u.rol === 'inventario',
      cxc: u.rol === 'admin',
      cxp: u.rol === 'admin',
      reportes: u.rol === 'admin' || u.rol === 'supervisor',
      configuracion: u.rol === 'admin',
    };
    setEditPermisos(
      u.permisos
        ? { ...defaultPerms, ...u.permisos }
        : defaultPerms
    );
    setSuccessMsg(null);
  };

  const lastSeenResetAtRef = React.useRef<string>(empresaConfig.factoryResetAt || '');

  // Keep companyForm synced ONLY when the user isn't actively editing it (or if a new factory reset occurred)
  React.useEffect(() => {
    const incomingResetAt = empresaConfig.factoryResetAt || '';
    const isNewFactoryReset =
      Boolean(incomingResetAt) && incomingResetAt !== lastSeenResetAtRef.current;

    if (isNewFactoryReset) {
      lastSeenResetAtRef.current = incomingResetAt;
      setIsCompanyFormDirty(false);
      setCompanyForm({ ...empresaConfig });
      return;
    }

    if (!isCompanyFormDirty) {
      setCompanyForm({ ...empresaConfig });
    }
  }, [empresaConfig, isCompanyFormDirty]);

  // Keep branch draft names synced with live sucursales
  React.useEffect(() => {
    setBranchNamesDraft(
      sucursales.reduce((acc, s) => ({ ...acc, [s.id]: s.nombre }), {} as Record<number, string>)
    );
  }, [sucursales]);

  // Keep selected user synced when usuarios list changes (e.g. from Firestore or after save)
  React.useEffect(() => {
    if (usuarios.length > 0) {
      if (!selectedUser) {
        handleSelectUser(usuarios[0]);
      } else {
        const refreshed = usuarios.find((u) => u.id === selectedUser.id);
        if (!refreshed) {
          handleSelectUser(usuarios[0]);
        } else {
          setSelectedUser(refreshed);
          if (
            refreshed.rol !== selectedUser.rol ||
            JSON.stringify(refreshed.permisos) !== JSON.stringify(selectedUser.permisos)
          ) {
            setEditRol(refreshed.rol);
            setEditSucursalId(refreshed.sucursal_id);
            if (refreshed.permisos) {
              setEditPermisos({ ...refreshed.permisos });
            }
          }
        }
      }
    } else {
      setSelectedUser(null);
    }
  }, [usuarios]);

  const handleSaveUserChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setUserFormError(null);

    const cleanNewPin = editPin.trim();
    const hasExistingPin = Boolean(selectedUser.pin && selectedUser.pin !== '••••');

    // Allow leaving PIN blank when user already has a saved/encrypted PIN
    if (!cleanNewPin && !hasExistingPin) {
      setUserFormError('El PIN debe tener al menos 4 caracteres/dígitos numéricos.');
      return;
    }

    if (cleanNewPin && cleanNewPin.length < 4) {
      setUserFormError('El nuevo PIN debe tener al menos 4 caracteres/dígitos numéricos.');
      return;
    }

    const candidateUserCheck: Usuario = {
      ...selectedUser,
      nombre_completo: editNombre.trim(),
      cargo: editCargo.trim(),
      rol: editRol,
      sucursal_id: editSucursalId,
      permisos: { ...editPermisos },
    };

    if (isProtectedSoleAdmin && !isFullPrivilegeAdmin(candidateUserCheck)) {
      setEditRol('admin');
      setEditSucursalId(null);
      setEditPermisos({ ...FULL_ADMIN_PERMISSIONS });
      setUserFormError(
        'Protección de seguridad: no se permite retirar privilegios ni cambiar el rol del único Gerente/Administrador sin antes configurar otro usuario Administrador con todos los permisos (11/11 módulos).'
      );
      return;
    }

    const finalPinHash = cleanNewPin
      ? (isHashedPin(cleanNewPin) ? cleanNewPin : await hashPin(cleanNewPin))
      : selectedUser.pin;

    let updatedTarget: Usuario | null = null;
    const updatedList = usuarios.map((u) => {
      if (u.id === selectedUser.id) {
        updatedTarget = {
          ...u,
          nombre_completo: editNombre.trim(),
          cargo: editCargo.trim(),
          pin: finalPinHash,
          rol: editRol,
          sucursal_id: editSucursalId,
          permisos: { ...editPermisos },
        };
        return updatedTarget;
      }
      return u;
    });

    if (!updatedList.some((u) => isFullPrivilegeAdmin(u))) {
      setUserFormError(
        'Protección de seguridad: debe existir al menos un usuario Administrador/Gerente con todos los privilegios activos.'
      );
      return;
    }

    await onUpdateUsuarios(updatedList);
    if (updatedTarget) {
      setSelectedUser(updatedTarget);
    }
    setEditPin('');
    setShowPin(false);
    setSuccessMsg(
      cleanNewPin
        ? `¡Usuario "${editNombre}" actualizado con éxito! Nuevo PIN cifrado y guardado permanentemente.`
        : `¡Usuario "${editNombre}" actualizado con éxito! Permisos guardados y PIN actual conservado.`
    );
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleCreateNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewUserError(null);
    if (!newNombre.trim() || !newCargo.trim() || !newPin.trim()) {
      setNewUserError('Por favor complete todos los campos obligatorios.');
      return;
    }

    if (newPin.trim().length < 4) {
      setNewUserError('El PIN debe tener al menos 4 dígitos.');
      return;
    }

    const generatedId = Math.max(...usuarios.map((u) => u.id), 0) + 1;
    const finalUsername = newUsername.trim()
      ? newUsername.trim().toLowerCase().replace(/\s+/g, '_')
      : `user_${generatedId}`;

    const hashedNewPin = isHashedPin(newPin.trim()) ? newPin.trim() : await hashPin(newPin.trim());

    const newUser: Usuario = {
      id: generatedId,
      username: finalUsername,
      nombre_completo: newNombre.trim(),
      cargo: newCargo.trim(),
      pin: hashedNewPin,
      rol: newRol,
      sucursal_id: newSucursalId,
      permisos: { ...newPermisos },
    };

    const updatedList = [...usuarios, newUser];
    await onUpdateUsuarios(updatedList);
    setSelectedUser(newUser);
    handleSelectUser(newUser);

    setShowNewUserModal(false);
    setNewNombre('');
    setNewCargo('');
    setNewUsername('');
    setNewPin('');
    setNewRol('cajero');
    setNewSucursalId(1);
    applyPresetPermissions('pos', true);
    setSuccessMsg(`¡Nuevo usuario "${newUser.nombre_completo}" creado y permisos asignados con éxito!`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleRequestDeleteUser = (userToDelete: Usuario) => {
    setUserFormError(null);
    const hasOtherAdmin = countOtherFullPrivilegeAdmins(usuarios, userToDelete.id) > 0;
    if ((isFullPrivilegeAdmin(userToDelete) || userToDelete.rol === 'admin') && !hasOtherAdmin) {
      setUserFormError(
        'No es posible eliminar al único Administrador/Gerente del sistema. Primero crea o configura otro usuario con rol Administrador y todos los privilegios (11/11 módulos).'
      );
      return;
    }

    if (currentUser && currentUser.id === userToDelete.id) {
      setUserFormError('No puedes eliminar al usuario con el que tienes la sesión activa actualmente.');
      return;
    }

    setPendingDeleteUserId(userToDelete.id);
  };

  const handleConfirmDeleteUser = (userToDelete: Usuario) => {
    setUserFormError(null);
    const hasOtherAdmin = countOtherFullPrivilegeAdmins(usuarios, userToDelete.id) > 0;
    if ((isFullPrivilegeAdmin(userToDelete) || userToDelete.rol === 'admin') && !hasOtherAdmin) {
      setPendingDeleteUserId(null);
      setUserFormError(
        'No es posible eliminar al único Administrador/Gerente sin otro Administrador completo configurado.'
      );
      return;
    }

    const updatedList = usuarios.filter((u) => u.id !== userToDelete.id);
    if (!updatedList.some((u) => isFullPrivilegeAdmin(u))) {
      setPendingDeleteUserId(null);
      setUserFormError('Operación bloqueada: debe permanecer al menos un Administrador con todos los privilegios.');
      return;
    }

    onUpdateUsuarios(updatedList);
    setPendingDeleteUserId(null);
    if (selectedUser?.id === userToDelete.id) {
      handleSelectUser(updatedList[0] || null);
    }
    setSuccessMsg(`Usuario "${userToDelete.nombre_completo}" eliminado correctamente.`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const generateRandomPin = (isNew: boolean = false) => {
    const random = Math.floor(1000 + Math.random() * 9000).toString();
    if (isNew) {
      setNewPin(random);
    } else {
      setEditPin(random);
      setShowPin(true);
    }
  };

  const applyPresetPermissions = (
    preset: 'pos' | 'almacen' | 'supervisor' | 'finanzas' | 'admin',
    isNew: boolean = false
  ) => {
    if (!isNew && isProtectedSoleAdmin && preset !== 'admin') {
      setUserFormError(
        'Protección de seguridad: no puedes asignar un perfil restringido al único Gerente/Administrador sin antes configurar otro usuario Administrador con acceso total.'
      );
      return;
    }
    setUserFormError(null);

    let presetPerms: ModuloPermisos;

    switch (preset) {
      case 'pos':
        presetPerms = {
          dashboard: false,
          ventas: true,
          pedidos_web: false,
          inventario: false,
          compras: false,
          clientes: false,
          proveedores: false,
          cxc: false,
          cxp: false,
          reportes: false,
          configuracion: false,
        };
        break;
      case 'almacen':
        presetPerms = {
          dashboard: false,
          ventas: false,
          pedidos_web: false,
          inventario: true,
          compras: true,
          clientes: false,
          proveedores: true,
          cxc: false,
          cxp: false,
          reportes: false,
          configuracion: false,
        };
        break;
      case 'supervisor':
        presetPerms = {
          dashboard: true,
          ventas: true,
          pedidos_web: true,
          inventario: true,
          compras: false,
          clientes: true,
          proveedores: false,
          cxc: true,
          cxp: false,
          reportes: true,
          configuracion: false,
        };
        break;
      case 'finanzas':
        presetPerms = {
          dashboard: true,
          ventas: true,
          pedidos_web: false,
          inventario: false,
          compras: true,
          clientes: true,
          proveedores: true,
          cxc: true,
          cxp: true,
          reportes: true,
          configuracion: false,
        };
        break;
      case 'admin':
      default:
        presetPerms = { ...FULL_ADMIN_PERMISSIONS };
        break;
    }

    if (isNew) {
      setNewPermisos(presetPerms);
    } else {
      setEditPermisos(presetPerms);
    }
  };

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveEmpresaConfig({
      ...empresaConfig,
      nombreEmpresa: companyForm.nombreEmpresa,
      rif: companyForm.rif,
      direccionFiscal: companyForm.direccionFiscal,
      telefono: companyForm.telefono,
      piePaginaTicket: companyForm.piePaginaTicket,
      logoUrl: companyForm.logoUrl,
    });
    setIsCompanyFormDirty(false);
    setSuccessMsg('¡Datos de la empresa y membrete fiscal actualizados con éxito!');
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleSaveSucursalesNames = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedSucursales = sucursales.map((s) => {
      const candidate = (branchNamesDraft[s.id] ?? s.nombre).trim();
      return {
        ...s,
        nombre: candidate || s.nombre,
      };
    });

    if (onUpdateSucursales) {
      onUpdateSucursales(
        updatedSucursales,
        `Actualización de nombres de sucursales (${updatedSucursales.map((s) => `#${s.id}: ${s.nombre}`).join(', ')})`
      );
    } else {
      const s1 = updatedSucursales.find((s) => s.id === 1)?.nombre || companyForm.nombreTienda1;
      const s2 = updatedSucursales.find((s) => s.id === 2)?.nombre || companyForm.nombreTienda2;
      const s3 = updatedSucursales.find((s) => s.id === 3)?.nombre || companyForm.nombreOficina;
      onSaveEmpresaConfig({
        ...companyForm,
        nombreTienda1: s1,
        nombreTienda2: s2,
        nombreOficina: s3,
      });
    }

    setSuccessMsg('¡Nombres de sucursales actualizados con éxito!');
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleOpenAddSucursalModal = () => {
    setNewBranchNombre('');
    setNewBranchTipo('tienda');
    setDevMasterToken('');
    setShowDevToken(false);
    setAddSucursalError(null);
    setShowAddSucursalModal(true);
  };

  const handleAddNewSucursal = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newBranchNombre.trim();
    const cleanToken = devMasterToken.trim();

    if (!cleanName) {
      setAddSucursalError('Debes ingresar el nombre de la nueva sucursal.');
      return;
    }

    if (sucursales.some((s) => s.nombre.trim().toLowerCase() === cleanName.toLowerCase())) {
      setAddSucursalError('Ya existe una sucursal con ese mismo nombre.');
      return;
    }

    if (!cleanToken) {
      setAddSucursalError('Debes ingresar el Token Maestro de Desarrollador para autorizar nuevas sedes.');
      return;
    }

    setIsVerifyingDevToken(true);
    setAddSucursalError(null);
    try {
      const response = await fetchApi('/api/developer/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanToken }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.success || !data?.authorized) {
        setAddSucursalError(
          data?.error || 'Token maestro de desarrollador inválido. Acceso denegado.'
        );
        return;
      }

      const nextId = Math.max(...sucursales.map((s) => s.id), 3) + 1;
      const nuevaSucursal: Sucursal = {
        id: nextId,
        nombre: cleanName,
        tipo: newBranchTipo,
      };
      const updatedSucursales = [...sucursales, nuevaSucursal];

      if (onUpdateSucursales) {
        onUpdateSucursales(
          updatedSucursales,
          `Alta de nueva sucursal #${nextId}: "${cleanName}" (${newBranchTipo === 'tienda' ? 'Tienda Física' : 'Oficina / Almacén'}) autorizada con Token Maestro de Desarrollador`
        );
      }

      setShowAddSucursalModal(false);
      setDevMasterToken('');
      setNewBranchNombre('');
      setSuccessMsg(`¡Sucursal #${nextId} "${cleanName}" agregada y sincronizada con éxito!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch {
      setAddSucursalError('No se pudo validar el Token Maestro con el servidor. Intenta nuevamente.');
    } finally {
      setIsVerifyingDevToken(false);
    }
  };

  const togglePermiso = (key: keyof ModuloPermisos, isNew: boolean = false) => {
    if (!isNew && isProtectedSoleAdmin && Boolean(editPermisos[key])) {
      setUserFormError(
        'Protección de seguridad: no puedes desactivar módulos del único Gerente/Administrador sin antes configurar otro usuario Administrador con todos los privilegios (11/11 módulos).'
      );
      return;
    }
    setUserFormError(null);

    if (isNew) {
      setNewPermisos((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    } else {
      setEditPermisos((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    }
  };

  const modulesList: { key: keyof ModuloPermisos; label: string; desc: string; icon: string }[] = [
    { key: 'dashboard', label: 'Dashboard Ejecutivo', desc: 'Acceso a métricas de ventas, ingresos, utilidades y gráficos', icon: '📊' },
    { key: 'ventas', label: 'Ventas y Punto de Venta (POS)', desc: 'Facturación en caja, lectura de código de barras y cobros', icon: '🛒' },
    { key: 'pedidos_web', label: 'Pedidos Web (Tienda Online)', desc: 'Gestión, aprobación, despacho y facturación en caja de pedidos web', icon: '🌐' },
    { key: 'inventario', label: 'Control de Inventario', desc: 'Stock multi-sucursal, traspasos entre tiendas y catálogo maestro', icon: '📦' },
    { key: 'compras', label: 'Módulo de Compras', desc: 'Registro de compras de mercancía y recepción en almacén', icon: '🛍️' },
    { key: 'clientes', label: 'Directorio de Clientes', desc: 'Gestión de clientes, datos de contacto y límites de crédito', icon: '👥' },
    { key: 'proveedores', label: 'Directorio de Proveedores', desc: 'Gestión de proveedores, contactos y datos de facturación', icon: '🚚' },
    { key: 'cxc', label: 'Cuentas por Cobrar (CxC)', desc: 'Cobranza a clientes, registro de abonos y estados de cuenta', icon: '💳' },
    { key: 'cxp', label: 'Cuentas por Pagar (CxP)', desc: 'Gestión de pagos y obligaciones con proveedores', icon: '🧾' },
    { key: 'reportes', label: 'Centro de Reportes y PDFs', desc: 'Emisión de cortes de caja X/Z, libros fiscales e informes', icon: '📑' },
    { key: 'configuracion', label: 'Configuración y Permisos', desc: 'Gestión de usuarios, PINs de seguridad, roles y datos fiscales', icon: '⚙️' },
  ];

  const countAllowedModules = (perms?: ModuloPermisos) => {
    if (!perms) return 1;
    return modulesList.filter((m) => Boolean(perms[m.key])).length;
  };

  // Filtered users list
  const filteredUsers = usuarios.filter((u) => {
    const matchesSearch =
      u.nombre_completo.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.cargo.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.username.toLowerCase().includes(userSearch.toLowerCase());

    if (!matchesSearch) return false;

    if (userSucursalFilter === 'all') return true;
    if (userSucursalFilter === 'null') return u.sucursal_id === null;
    return u.sucursal_id === Number(userSucursalFilter);
  });

  return (
    <div className="space-y-6">
      {/* Top Title Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-emerald-400" /> Centro de Configuración y Control de Permisos
            </h2>
            {empresaConfig.nombreEmpresa && (
              <span className="bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-purple-500/30">
                {empresaConfig.nombreEmpresa}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Asigna permisos granulares a cada usuario, gestiona respaldos JSON y configura datos fiscales.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab('respaldo')}
            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer hover:scale-102"
          >
            <FileJson className="w-4 h-4" />
            <span>Exportar JSON</span>
          </button>
        </div>
      </div>

      {/* Solapas Superpuestas Multi-Nivel (100% Visibles sin cortes) */}
      <div className="bg-slate-950/90 border border-slate-800/80 rounded-2xl p-2.5 shadow-xl space-y-2">
        {/* Nivel 1: Solapas de Gestión Principal y Fiscal */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSubTab('usuarios')}
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'usuarios'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400 z-10'
                : 'text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-800 font-semibold shadow-sm'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Usuarios y Permisos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('empresa')}
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'empresa'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400 z-10'
                : 'text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-800 font-semibold shadow-sm'
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>Datos Fiscales</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('sucursales')}
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'sucursales'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400 z-10'
                : 'text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-800 font-semibold shadow-sm'
            }`}
          >
            <Store className="w-4 h-4 shrink-0" />
            <span>Sucursales</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('tasa')}
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'tasa'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400 z-10'
                : 'text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-800 font-semibold shadow-sm'
            }`}
          >
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span>Cotización Diaria</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('licencia')}
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'licencia'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400 z-10'
                : 'text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-800 font-semibold shadow-sm'
            }`}
          >
            <Fingerprint className="w-4 h-4 shrink-0" />
            <span>Licencia & Seguridad</span>
          </button>
        </div>

        {/* Nivel 2: Solapas de Operaciones, Auditoría y Zona Temporal */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/60">
          <button
            type="button"
            onClick={() => setActiveSubTab('auditoria')}
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'auditoria'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400 z-10'
                : 'text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-800 font-semibold shadow-sm'
            }`}
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span>Bitácora de Auditoría</span>
            {auditoriaLogs && auditoriaLogs.length > 0 && (
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ml-0.5 ${
                  activeSubTab === 'auditoria'
                    ? 'bg-slate-950/30 text-slate-950'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {auditoriaLogs.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('respaldo')}
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'respaldo'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400 z-10'
                : 'text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-800 font-semibold shadow-sm'
            }`}
          >
            <Database className="w-4 h-4 shrink-0" />
            <span>Respaldo JSON</span>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ml-0.5 ${
                activeSubTab === 'respaldo'
                  ? 'bg-slate-950/30 text-slate-950'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              Backup
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('html')}
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'html'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400 z-10'
                : 'text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-800 font-semibold shadow-sm'
            }`}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Descargar .HTML</span>
          </button>

          {/* Solapa: Base de Datos en la Nube (Google Cloud Firebase Firestore) */}
          <button
            type="button"
            onClick={() => setActiveSubTab('nube')}
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'nube'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400 z-10'
                : 'text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-800 font-semibold shadow-sm'
            }`}
          >
            <Cloud className="w-4 h-4 shrink-0 text-cyan-400" />
            <span>Base de Datos Cloud</span>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ml-0.5 ${
                activeSubTab === 'nube'
                  ? 'bg-slate-950/30 text-slate-950'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              }`}
            >
              FIRESTORE
            </span>
          </button>

          {/* Solapa Especial: Módulo Temporal / Botones Auxiliares */}
          <button
            type="button"
            onClick={() => setActiveSubTab('temporal')}
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'temporal'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400 z-10'
                : 'text-amber-300 hover:text-amber-100 bg-amber-950/30 hover:bg-amber-900/40 border border-amber-600/40 font-bold shadow-sm'
            }`}
          >
            <Wrench className="w-4 h-4 shrink-0 text-amber-400" />
            <span>⚡ Botones Temporales</span>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-black uppercase ml-0.5 ${
                activeSubTab === 'temporal'
                  ? 'bg-slate-950/40 text-slate-950'
                  : 'bg-amber-500 text-slate-950'
              }`}
            >
              TEMP
            </span>
          </button>

          <div className="h-5 w-px bg-slate-800 mx-1 shrink-0 hidden sm:block" />

          <button
            type="button"
            onClick={() => setActiveSubTab('reinicio')}
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'reinicio'
                ? 'bg-rose-600 text-white font-black shadow-md shadow-rose-600/30 ring-2 ring-rose-400 z-10'
                : 'text-rose-400 hover:text-rose-200 bg-rose-950/20 hover:bg-rose-900/30 border border-rose-900/40 font-semibold shadow-sm'
            }`}
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Reinicio de Sistema</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-950/60 border border-emerald-500/40 p-4 rounded-xl text-emerald-200 text-xs flex items-center gap-2.5 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 1: USUARIOS, PINS Y PERMISOS (CORE REQUIREMENT) */}
      {/* ======================================================== */}
      {activeSubTab === 'usuarios' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: List of users with search, filter and "New User" button */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" /> Personal del Sistema ({usuarios.length})
                </h3>
                <p className="text-[11px] text-slate-400">
                  Selecciona un colaborador para modificar sus permisos de acceso.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setNewUserError(null);
                  setShowNewUserModal(true);
                }}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
              >
                <UserPlus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Nuevo Usuario</span>
              </button>
            </div>

            {/* Search and Branch Filter */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar colaborador..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <select
                value={userSucursalFilter}
                onChange={(e) => setUserSucursalFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="all">Todas las Sedes</option>
                <option value="1">Tienda 1 - Centro</option>
                <option value="2">Tienda 2 - Norte</option>
                <option value="3">Oficina / Almacén</option>
                <option value="null">Acceso Global</option>
              </select>
            </div>

            {/* Users list items */}
            <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1 custom-scrollbar">
              {filteredUsers.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  No se encontraron colaboradores con los criterios seleccionados.
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = selectedUser?.id === u.id;
                  const isAdmin = u.rol === 'admin';
                  const allowedCount = countAllowedModules(u.permisos);

                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleSelectUser(u)}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-md'
                          : 'bg-slate-950/70 border-slate-800/80 text-slate-300 hover:bg-slate-800/60 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-mono font-bold text-xs ${
                            isAdmin
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-slate-800 text-emerald-400 border border-slate-700'
                          }`}
                        >
                          {u.nombre_completo.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                          <div className="text-xs font-bold truncate flex items-center gap-1.5">
                            <span>{u.nombre_completo}</span>
                            {isAdmin && (
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                                  isFullPrivilegeAdmin(u)
                                    ? 'bg-purple-500/20 text-purple-300'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {isFullPrivilegeAdmin(u) ? 'ADMIN TOTAL' : 'ADMIN PARCIAL'}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {u.cargo} • <span className="font-mono text-slate-500">@{u.username}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-1">
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                              allowedCount === modulesList.length
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : allowedCount > 1
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {allowedCount === modulesList.length
                                ? 'Acceso Total'
                                : `${allowedCount}/${modulesList.length} módulos permitidos`}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-mono bg-slate-900 border border-slate-700/80 px-2 py-0.5 rounded text-amber-400 block font-bold">
                          PIN: ••••
                        </span>
                        <span className="text-[9px] text-slate-500 capitalize block mt-0.5">
                          {u.sucursal_id ? `Sucursal ${u.sucursal_id}` : 'Global'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: User Details Editor & Permissions Matrix */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
            {selectedUser ? (
              <form onSubmit={handleSaveUserChanges} className="space-y-5">
                <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <Edit3 className="w-4 h-4 text-emerald-400" />
                      Permisos de: <span className="text-emerald-300">{selectedUser.nombre_completo}</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Asigna o revoca el acceso a cada módulo del sistema de manera individual.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-slate-950 border border-slate-800 text-slate-400 px-2.5 py-1 rounded-lg">
                      ID #{selectedUser.id} • @{selectedUser.username}
                    </span>
                    {isProtectedSoleAdmin ? (
                      <span
                        className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1"
                        title="Protegido: configura otro Administrador con acceso total antes de eliminar o cambiar este usuario"
                      >
                        <Lock className="w-3 h-3" /> Protegido
                      </span>
                    ) : (
                      currentUser?.id !== selectedUser.id && (
                        pendingDeleteUserId === selectedUser.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleConfirmDeleteUser(selectedUser)}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Confirmar Eliminar
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteUserId(null)}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRequestDeleteUser(selectedUser)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors cursor-pointer"
                            title="Eliminar este usuario del sistema"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )
                    )}
                  </div>
                </div>

                {/* Sole-Admin Security Protection Banner */}
                {isProtectedSoleAdmin && (
                  <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-200">
                    <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold text-amber-300">
                        Protección de Administrador Principal Activa
                      </p>
                      <p className="text-[11px] text-amber-200/85 leading-relaxed">
                        Este usuario es el único Gerente/Administrador con privilegios completos. No puede perder su rol, desactivar módulos ni ser eliminado hasta que configures otro usuario con rol <strong>Gerente General / Administrador</strong> y los <strong>11/11 módulos</strong> habilitados.
                      </p>
                    </div>
                  </div>
                )}

                {userFormError && (
                  <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-200">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{userFormError}</span>
                  </div>
                )}

                {/* Form fields: Name, Cargo, PIN, Rol, Sucursal */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Nombre Completo del Colaborador
                    </label>
                    <input
                      type="text"
                      required
                      value={editNombre}
                      onChange={(e) => setEditNombre(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Cargo / Puesto de Trabajo
                    </label>
                    <input
                      type="text"
                      required
                      value={editCargo}
                      onChange={(e) => setEditCargo(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5" /> PIN de Acceso (Mínimo 4 dígitos)
                      </label>
                      <div className="flex items-center gap-2">
                        {isHashedPin(selectedUser.pin) && !editPin && (
                          <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> PIN cifrado activo
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => generateRandomPin(false)}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" /> Generar PIN
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type={showPin ? 'text' : 'password'}
                        required={!selectedUser.pin || selectedUser.pin === '••••'}
                        maxLength={8}
                        value={editPin}
                        onChange={(e) => setEditPin(e.target.value)}
                        className="w-full bg-slate-950 border border-amber-500/50 text-amber-300 font-mono text-sm font-bold pl-3 pr-10 py-2 rounded-xl focus:border-amber-400 focus:outline-none tracking-widest placeholder:tracking-normal placeholder:text-xs placeholder:font-normal placeholder:text-slate-500"
                        placeholder={
                          isHashedPin(selectedUser.pin)
                            ? '•••• (Dejar vacío para mantener o escribe nuevo PIN)'
                            : 'Ej: 1234'
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                        title={showPin ? 'Ocultar nuevo PIN' : 'Mostrar nuevo PIN'}
                      >
                        {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {isHashedPin(selectedUser.pin)
                        ? 'Por seguridad tu PIN se almacena cifrado (SHA-256). Déjalo vacío para conservarlo o escribe uno nuevo para cambiarlo.'
                        : 'PIN numérico para autenticación rápida en el sistema y corte de caja.'}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-400">
                        Rol en el Sistema
                      </label>
                      {isProtectedSoleAdmin && (
                        <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Bloqueado (único Admin)
                        </span>
                      )}
                    </div>
                    <select
                      value={editRol}
                      disabled={isProtectedSoleAdmin}
                      onChange={(e) => {
                        const nextRole = e.target.value as 'cajero' | 'supervisor' | 'inventario' | 'admin';
                        if (isProtectedSoleAdmin && nextRole !== 'admin') {
                          setUserFormError(
                            'No puedes cambiar el rol del único Administrador/Gerente sin antes configurar otro Administrador completo.'
                          );
                          return;
                        }
                        setUserFormError(null);
                        setEditRol(nextRole);
                        if (nextRole === 'admin') {
                          setEditSucursalId(null);
                          setEditPermisos({ ...FULL_ADMIN_PERMISSIONS });
                        }
                      }}
                      className={`w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none ${
                        isProtectedSoleAdmin ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <option value="cajero">Cajero / Operador de Ventas</option>
                      <option value="supervisor">Supervisor de Tienda</option>
                      <option value="inventario">Personal de Inventario / Almacén</option>
                      <option value="admin">Gerente General / Administrador</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Sucursal Asignada
                    </label>
                    <select
                      value={editSucursalId === null ? 'null' : editSucursalId}
                      onChange={(e) => setEditSucursalId(e.target.value === 'null' ? null : Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none cursor-pointer"
                    >
                      <option value="null">Acceso Global (Todas las Sucursales)</option>
                      {sucursales.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre} ({s.tipo === 'oficina' ? 'Almacén/Oficina' : 'Tienda'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Permissions Matrix & Quick Presets */}
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-800 pt-3 gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Sliders className="w-4 h-4 text-emerald-400" /> Matriz de Permisos por Módulo
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Marca los módulos donde el usuario <strong>puede entrar</strong> y desmarca donde <strong>no tiene acceso</strong>.
                      </p>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={isProtectedSoleAdmin}
                        onClick={() => applyPresetPermissions('pos', false)}
                        className="text-[10px] bg-slate-950 hover:bg-slate-800 text-slate-300 px-2 py-1 rounded-lg border border-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        🛒 Solo POS
                      </button>
                      <button
                        type="button"
                        disabled={isProtectedSoleAdmin}
                        onClick={() => applyPresetPermissions('almacen', false)}
                        className="text-[10px] bg-slate-950 hover:bg-slate-800 text-slate-300 px-2 py-1 rounded-lg border border-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        📦 Almacén
                      </button>
                      <button
                        type="button"
                        disabled={isProtectedSoleAdmin}
                        onClick={() => applyPresetPermissions('supervisor', false)}
                        className="text-[10px] bg-slate-950 hover:bg-slate-800 text-slate-300 px-2 py-1 rounded-lg border border-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        🛡️ Supervisor
                      </button>
                      <button
                        type="button"
                        disabled={isProtectedSoleAdmin}
                        onClick={() => applyPresetPermissions('finanzas', false)}
                        className="text-[10px] bg-slate-950 hover:bg-slate-800 text-slate-300 px-2 py-1 rounded-lg border border-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        💰 Finanzas
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPresetPermissions('admin', false)}
                        className="text-[10px] bg-purple-950/60 hover:bg-purple-900 text-purple-300 px-2 py-1 rounded-lg border border-purple-500/30 cursor-pointer font-bold"
                      >
                        👑 Acceso Total
                      </button>
                    </div>
                  </div>

                  {/* 11 Modules Permission Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {modulesList.map((m) => {
                      const isAllowed = Boolean(editPermisos[m.key]);
                      const isLockedOn = isProtectedSoleAdmin && isAllowed;
                      return (
                        <div
                          key={m.key}
                          onClick={() => togglePermiso(m.key, false)}
                          className={`p-3 rounded-xl border flex items-start gap-2.5 transition-all ${
                            isLockedOn ? 'cursor-not-allowed' : 'cursor-pointer'
                          } ${
                            isAllowed
                              ? 'bg-emerald-950/30 border-emerald-500/60 text-white shadow-sm'
                              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 opacity-75'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-lg mt-0.5 flex items-center justify-center shrink-0 border transition-all ${
                              isAllowed
                                ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                                : 'border-slate-700 bg-slate-900 text-transparent'
                            }`}
                          >
                            {isAllowed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold leading-tight flex items-center gap-1.5">
                                <span>{m.icon}</span>
                                <span>{m.label}</span>
                              </span>
                              <span
                                className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded inline-flex items-center gap-1 shrink-0 ${
                                  isAllowed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                                }`}
                              >
                                {isLockedOn && <Lock className="w-2.5 h-2.5" />}
                                <span>{isAllowed ? 'PERMITIDO' : 'BLOQUEADO'}</span>
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 leading-tight mt-1">{m.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <div className="text-xs text-slate-400">
                    Módulos autorizados: <strong className="text-emerald-400 font-mono">{countAllowedModules(editPermisos)} de {modulesList.length}</strong>
                  </div>
                  <button
                    type="submit"
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    <Save className="w-4 h-4" />
                    <span>Guardar Cambios de Permisos</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs">
                Selecciona un usuario de la lista izquierda para editar sus permisos.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: REGISTRAR NUEVO USUARIO / COLABORADOR */}
      {/* ======================================================== */}
      {showNewUserModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-3xl w-full max-w-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Crear Nuevo Colaborador</h3>
                  <p className="text-xs text-slate-400">Define sus datos de acceso, PIN y permisos por módulo.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewUserModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewUser} className="space-y-4">
              {newUserError && (
                <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl p-3 flex items-start gap-2 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{newUserError}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Sofía Ramírez"
                    value={newNombre}
                    onChange={(e) => setNewNombre(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Cargo / Puesto *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Cajera Turno Mañana"
                    value={newCargo}
                    onChange={(e) => setNewCargo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Nombre de Usuario (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: sofia_cajera"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-amber-400">PIN de 4 dígitos *</label>
                    <button
                      type="button"
                      onClick={() => generateRandomPin(true)}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 cursor-pointer"
                    >
                      Generar PIN
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    placeholder="Mínimo 4 dígitos"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-500/50 text-amber-300 font-mono text-sm font-bold px-3 py-2 rounded-xl focus:border-amber-400 focus:outline-none tracking-widest text-center"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Rol</label>
                  <select
                    value={newRol}
                    onChange={(e) => {
                      const nextRole = e.target.value as 'cajero' | 'supervisor' | 'inventario' | 'admin';
                      setNewRol(nextRole);
                      if (nextRole === 'admin') {
                        setNewSucursalId(null);
                        setNewPermisos({ ...FULL_ADMIN_PERMISSIONS });
                      } else if (nextRole === 'supervisor') {
                        applyPresetPermissions('supervisor', true);
                      } else if (nextRole === 'inventario') {
                        applyPresetPermissions('almacen', true);
                      } else {
                        applyPresetPermissions('pos', true);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="cajero">Cajero / Operador de Ventas</option>
                    <option value="supervisor">Supervisor de Tienda</option>
                    <option value="inventario">Personal de Inventario / Almacén</option>
                    <option value="admin">Gerente General / Administrador</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Sucursal</label>
                  <select
                    value={newSucursalId === null ? 'null' : newSucursalId}
                    onChange={(e) => setNewSucursalId(e.target.value === 'null' ? null : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="null">Acceso Global (Todas las Sucursales)</option>
                    {sucursales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre} ({s.tipo === 'oficina' ? 'Almacén/Oficina' : 'Tienda'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Module Permissions Matrix */}
              <div className="space-y-2.5 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Asignación Inicial de Permisos</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => applyPresetPermissions('pos', true)}
                      className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded cursor-pointer"
                    >
                      Solo POS
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetPermissions('supervisor', true)}
                      className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded cursor-pointer"
                    >
                      Supervisor
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetPermissions('admin', true)}
                      className="text-[9px] bg-purple-900/60 text-purple-300 px-2 py-0.5 rounded cursor-pointer font-bold"
                    >
                      Acceso Total
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {modulesList.map((m) => {
                    const isAllowed = Boolean(newPermisos[m.key]);
                    return (
                      <div
                        key={m.key}
                        onClick={() => togglePermiso(m.key, true)}
                        className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isAllowed ? 'bg-emerald-950/40 border-emerald-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <span className="text-xs flex items-center gap-1.5">
                          <span>{m.icon}</span>
                          <span>{m.label}</span>
                        </span>
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] font-bold ${
                            isAllowed ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-700 bg-slate-900'
                          }`}
                        >
                          {isAllowed && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewUserModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/20"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Crear Colaborador y Guardar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 2: DATOS FISCALES DE LA EMPRESA */}
      {/* ======================================================== */}
      {activeSubTab === 'empresa' && (
        <form onSubmit={handleSaveCompany} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-400" /> Razón Social y Datos Fiscales
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Estos datos se imprimen en los tickets de venta POS, comprobantes de pago y reportes contables.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Nombre de la Empresa / Razón Social
              </label>
              <input
                type="text"
                required
                value={companyForm.nombreEmpresa}
                onChange={(e) => {
                  setIsCompanyFormDirty(true);
                  setCompanyForm({ ...companyForm, nombreEmpresa: e.target.value });
                }}
                className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none font-medium"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Registro de Información Fiscal (RIF)
              </label>
              <input
                type="text"
                required
                value={companyForm.rif}
                onChange={(e) => {
                  setIsCompanyFormDirty(true);
                  setCompanyForm({ ...companyForm, rif: e.target.value });
                }}
                placeholder="J-12345678-9"
                className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Dirección Fiscal Completa
              </label>
              <input
                type="text"
                required
                value={companyForm.direccionFiscal}
                onChange={(e) => {
                  setIsCompanyFormDirty(true);
                  setCompanyForm({ ...companyForm, direccionFiscal: e.target.value });
                }}
                className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Teléfonos de Contacto
              </label>
              <input
                type="text"
                required
                value={companyForm.telefono}
                onChange={(e) => {
                  setIsCompanyFormDirty(true);
                  setCompanyForm({ ...companyForm, telefono: e.target.value });
                }}
                className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Pie de Página / Leyenda Fiscal en Ticket
              </label>
              <input
                type="text"
                value={companyForm.piePaginaTicket}
                onChange={(e) => {
                  setIsCompanyFormDirty(true);
                  setCompanyForm({ ...companyForm, piePaginaTicket: e.target.value });
                }}
                className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-800">
            <button
              type="submit"
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-colors shadow-lg shadow-emerald-500/20"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Datos Fiscales</span>
            </button>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 3: NOMBRES DE SUCURSALES */}
      {/* ======================================================== */}
      {activeSubTab === 'sucursales' && (
        <form onSubmit={handleSaveSucursalesNames} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Store className="w-5 h-5 text-emerald-400" /> Sedes y Sucursales de la Empresa
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {sucursales.length} activas
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Personaliza el nombre de las tiendas físicas y oficinas. Agregar nuevas sedes requiere autorización con Token Maestro de Desarrollador.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenAddSucursalModal}
              className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-colors shrink-0 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar Sucursal</span>
              <Lock className="w-3.5 h-3.5 text-amber-400" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sucursales.map((suc) => {
              const isOficina = suc.tipo === 'oficina';
              const roleLabel =
                suc.id === 1
                  ? 'Tienda Principal'
                  : suc.id === 2
                  ? 'Tienda Secundaria'
                  : suc.id === 3
                  ? 'Oficina / Almacén'
                  : isOficina
                  ? 'Oficina / Almacén Adicional'
                  : 'Tienda Adicional';

              const accentClass =
                suc.id === 1
                  ? 'text-emerald-400'
                  : suc.id === 2
                  ? 'text-sky-400'
                  : isOficina
                  ? 'text-purple-400'
                  : 'text-amber-400';

              return (
                <div key={suc.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className={`flex items-center gap-2 text-xs font-bold ${accentClass}`}>
                      {isOficina ? <Building2 className="w-4 h-4 shrink-0" /> : <Store className="w-4 h-4 shrink-0" />}
                      <span>
                        Sucursal #{suc.id} ({roleLabel})
                      </span>
                    </div>
                    {suc.id > 3 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Nueva
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={branchNamesDraft[suc.id] ?? suc.nombre}
                    onChange={(e) =>
                      setBranchNamesDraft((prev) => ({
                        ...prev,
                        [suc.id]: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:border-emerald-500 focus:outline-none font-bold"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-800">
            <button
              type="submit"
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-colors shadow-lg shadow-emerald-500/20"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Nombres de Sucursales</span>
            </button>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 4: TASA DE CAMBIO */}
      {/* ======================================================== */}
      {activeSubTab === 'tasa' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" /> Tasa Oficial de Cambio (USD / Bs.)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                La tasa del día se utiliza en toda la empresa para el cálculo en tiempo real de precios en Bolívares.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenRateModal}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow"
            >
              <DollarSign className="w-4 h-4 stroke-[2.5]" />
              <span>Actualizar Tasa Ahora</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Tasa Oficial Vigente:</span>
                <span className="text-2xl font-black font-mono text-emerald-400">
                  {formatBs(1, empresaConfig.tasaCambio)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-3">
                <span>Fecha de Fijación:</span>
                <span className="font-mono text-white">{empresaConfig.fechaTasa}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Fuente / Modalidad:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Oficial BCV / Manual
                </span>
              </div>
            </div>

            <div className="bg-slate-950/70 p-6 rounded-2xl border border-slate-800 space-y-3 text-xs text-slate-300">
              <div className="font-bold text-white flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold border border-emerald-500/30">
                  AUTOMÁTICO + MANUAL
                </span>
                <span>Modo de Operación</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                <strong>1. Automático diario:</strong> Al iniciar el sistema cada día, se consulta y actualiza automáticamente la cotización oficial del Banco Central de Venezuela (BCV).
              </p>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                <strong>2. Manual en cualquier momento:</strong> Si necesitas fijar una tasa distinta o si el equipo trabaja sin conexión a internet, puedes pulsar en <em>Actualizar Tasa Ahora</em> o pulsar en la cotización de la barra superior.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 5: STANDALONE HTML DOWNLOADER */}
      {/* ======================================================== */}
      {activeSubTab === 'html' && (
        <StandaloneHtmlDownloader
          liveData={{
            empresaConfig,
            usuarios,
            sucursales,
            currentUser,
            productos,
            inventario,
            ventas,
            compras,
            clientes,
            proveedores,
            cxc: cxcList,
            cxp: cxpList,
            auditoria: auditoriaLogs,
          }}
        />
      )}

      {/* ======================================================== */}
      {/* SUB-TAB: LICENCIAMIENTO CRIPTOGRÁFICO Y HARDWARE LOCK */}
      {/* ======================================================== */}
      {activeSubTab === 'licencia' && (
        <LicenseManagerView
          validationResult={
            licenseValidationResult || {
              isValid: true,
              isExpired: false,
              isMachineMismatch: false,
              isTampered: false,
              status: 'active',
              message: 'Licencia activa.',
            }
          }
          onLicenseChanged={onLicenseChanged}
        />
      )}

      {/* ======================================================== */}
      {/* SUB-TAB: BITÁCORA DE AUDITORÍA Y TRAZABILIDAD */}
      {/* ======================================================== */}
      {activeSubTab === 'auditoria' && (
        <AuditoriaView
          logs={auditoriaLogs}
          usuarios={usuarios}
          sucursales={sucursales}
          currentUser={currentUser}
          empresaConfig={empresaConfig}
          onClearLogs={onClearAuditoriaLogs}
        />
      )}

      {/* ======================================================== */}
      {/* SUB-TAB: COPIA DE SEGURIDAD & RESTAURACIÓN JSON */}
      {/* ======================================================== */}
      {activeSubTab === 'respaldo' && (
        <BackupRestoreView
          empresaConfig={empresaConfig}
          sucursales={sucursales}
          usuarios={usuarios}
          productos={productos}
          inventario={inventario}
          ventas={ventas}
          compras={compras}
          clientes={clientes}
          proveedores={proveedores}
          cxcList={cxcList}
          cxpList={cxpList}
          auditoriaLogs={auditoriaLogs}
          pedidosOnline={pedidosOnline}
          tiendaConfig={tiendaConfig}
          correlativoX={correlativoX}
          correlativoZ={correlativoZ}
          currentUser={currentUser}
          onRestoreDatabase={onRestoreDatabase || (() => {})}
          onLogAudit={onLogAudit}
        />
      )}

      {/* ======================================================== */}
      {/* SUB-TAB: BASE DE DATOS EN LA NUBE (FIREBASE FIRESTORE)  */}
      {/* ======================================================== */}
      {activeSubTab === 'nube' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border border-cyan-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30 shadow-lg shadow-cyan-500/10 shrink-0">
                  <Cloud className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-white">
                      Base de Datos en la Nube · Google Cloud Firestore
                    </h3>
                    <span className="bg-cyan-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                      PRODUCCIÓN 24/7
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Almacenamiento persistente en servidores de Google con replicación multi-zona, sincronización continua en tiempo real y soporte autónomo para trabajar sin internet.
                  </p>
                </div>
              </div>

              {/* Status Badge & Google Auth */}
              <div className="flex flex-wrap items-center gap-2">
                {cloudUser ? (
                  <button
                    type="button"
                    onClick={handleGoogleCloudSignOut}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                    title="Cerrar sesión de Google Cloud"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="max-w-[180px] truncate">{cloudUser.email || 'Google Conectado'}</span>
                    <span className="text-[10px] opacity-75">(Salir)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoogleCloudSignIn}
                    disabled={isSigningInCloud}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-md disabled:opacity-50"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isSigningInCloud ? 'Autenticando...' : 'Conectar con Google (Cloud)'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleTestCloudPing}
                  disabled={isTestingCloud}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  title="Comprobar comunicación directa con los servidores de Google"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isTestingCloud ? 'animate-spin' : ''}`} />
                  <span>{isTestingCloud ? 'Comprobando...' : 'Probar Conexión'}</span>
                </button>
              </div>
            </div>

            {/* Connection Status Pill Banner */}
            <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    cloudStatus.isConnected === true
                      ? 'bg-emerald-400 shadow-md shadow-emerald-400/50 animate-pulse'
                      : cloudStatus.isConnected === false
                      ? 'bg-rose-500'
                      : 'bg-amber-400'
                  }`}
                />
                <span className="font-semibold text-slate-300">
                  Estado del Servidor:
                </span>
                <span
                  className={`font-mono font-bold ${
                    cloudStatus.isConnected === true
                      ? 'text-emerald-400'
                      : cloudStatus.isConnected === false
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {cloudStatus.isConnected === true
                    ? 'Conectado a Google Cloud (Clúster Activo)'
                    : !cloudUser
                    ? 'Requiere Conectar con Google para Sincronizar'
                    : cloudStatus.isConnected === false
                    ? 'Sin Conexión Directa (Modo Local Activo)'
                    : 'Listo para comprobar'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Proyecto: <span className="text-cyan-300 font-bold">composed-keep-9v9wh</span>
              </div>
            </div>
          </div>

          {/* Feedback Notice */}
          {cloudNotice && (
            <div
              className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 animate-fade-in ${
                cloudNotice.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : cloudNotice.type === 'error'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{cloudNotice.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setCloudNotice(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Action Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Action 1: Upload / Sync to Firestore */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg hover:border-cyan-500/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">
                    Subir & Sincronizar Catálogo Completo
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Envía productos, tasas, stock por sucursal y configuración a Firestore.
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Utiliza lotes protegidos de 400 operaciones para garantizar cumplimiento con los estándares de Google Cloud y resguardar la consistencia de inventario en todas las sucursales.
              </p>
              <button
                type="button"
                onClick={handleUploadAllToFirestore}
                disabled={isSyncingCloud}
                className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                <Cloud className={`w-4 h-4 ${isSyncingCloud ? 'animate-bounce' : ''}`} />
                <span>{isSyncingCloud ? 'Sincronizando con Google Cloud...' : '☁️ Subir y Sincronizar Todo a la Nube'}</span>
              </button>
            </div>

            {/* Action 2: Download / Pull from Firestore */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg hover:border-emerald-500/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <ArrowDownRight className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">
                    Descargar & Refrescar desde la Nube
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Restaura o actualiza el catálogo local trayendo los datos más recientes.
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ideal al abrir una nueva caja, instalar el sistema en una computadora nueva o sincronizar cambios cargados desde otra sucursal.
              </p>
              <button
                type="button"
                onClick={handleDownloadAllFromFirestore}
                disabled={isDownloadingCloud}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isDownloadingCloud ? 'animate-spin' : ''}`} />
                <span>{isDownloadingCloud ? 'Descargando desde Firestore...' : '📥 Descargar Catálogo desde la Nube'}</span>
              </button>
            </div>
          </div>

          {/* Firestore Collections Live Metrics Strip */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg">
            <h4 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
              <Database className="w-4 h-4 text-cyan-400" />
              <span>Colecciones y Estructura en Google Cloud Firestore</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">productos</span>
                <span className="text-lg font-black text-white font-mono">{productos.length}</span>
                <span className="text-[10px] text-slate-500 block">Artículos activos</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">inventario</span>
                <span className="text-lg font-black text-emerald-400 font-mono">{inventario.length}</span>
                <span className="text-[10px] text-slate-500 block">Separado por sucursal</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">sucursales</span>
                <span className="text-lg font-black text-cyan-400 font-mono">{sucursales.length}</span>
                <span className="text-[10px] text-slate-500 block">Tiendas / Almacenes</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">auditoria</span>
                <span className="text-lg font-black text-purple-400 font-mono">{auditoriaLogs.length}</span>
                <span className="text-[10px] text-slate-500 block">Logs inmutables</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB: PESTAÑA TEMPORAL / CAJA DE BOTONES AUXILIARES */}
      {/* ======================================================== */}
      {activeSubTab === 'temporal' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shadow-lg shadow-amber-500/10 shrink-0">
                  <Wrench className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-white">
                      Módulo Temporal & Zona de Botones Auxiliares
                    </h3>
                    <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                      ZONA DE TRANSICIÓN
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Aquí agrupamos botones y accesos rápidos retirados de las pantallas de trabajo para mantener la interfaz limpia. Puedes usarlos aquí siempre que los necesites. Posteriormente podremos eliminarlos uno a uno según tus indicaciones.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Grid de Secciones */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Tarjeta 1: Utilidades y Accesos Rápidos del Sistema */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Herramientas Operativas</h4>
                  <p className="text-[11px] text-slate-400">Acceso a utilidades de cálculo y venta</p>
                </div>
              </div>

              <div className="space-y-2.5">
                {/* Botón Calculadora Comercial */}
                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3 hover:border-purple-500/40 transition-colors">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Calculadora Comercial Multimoneda</span>
                      <span className="text-[9px] bg-purple-900/60 border border-purple-500/30 text-purple-300 px-1.5 py-0.2 rounded font-mono">F9</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">Calcula con IVA (+/-16%), conversión dual USD/Bs en vivo.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenCalculator) onOpenCalculator();
                    }}
                    className="px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer shadow-md shadow-purple-900/30 flex items-center gap-1.5"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>Abrir</span>
                  </button>
                </div>

                {/* Botón Tienda Clientes */}
                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3 hover:border-teal-500/40 transition-colors">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Enlace Público de Catálogo / Tienda</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">Link para compartir por WhatsApp con pedidos directos.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenStoreShare) onOpenStoreShare();
                    }}
                    className="px-3 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Link Tienda</span>
                  </button>
                </div>

                {/* Botón Descargar HTML */}
                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3 hover:border-emerald-500/40 transition-colors">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Descargar Versión .HTML Autónomo</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">Genera el archivo portable sin conexión para usar en laptops.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenHtmlModal) {
                        onOpenHtmlModal();
                      } else {
                        downloadStandaloneHtmlFile();
                      }
                    }}
                    className="px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Tarjeta 2: Nube, Datos y Mantenimiento */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Nube & Respaldos</h4>
                  <p className="text-[11px] text-slate-400">Sincronización con Google Cloud Firestore</p>
                </div>
              </div>

              <div className="space-y-2.5">
                {/* Botón Respaldo JSON */}
                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3 hover:border-emerald-500/40 transition-colors">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Copia de Seguridad en JSON</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">Exporta inventario, ventas, clientes y configuraciones a un archivo.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('respaldo')}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <FileJson className="w-3.5 h-3.5" />
                    <span>Ir a Respaldo</span>
                  </button>
                </div>

                {/* Botón Probar Conexión Firestore */}
                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3 hover:border-amber-500/40 transition-colors">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Verificar Base de Datos en la Nube</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">Envía un ping a Firebase Firestore en Google Cloud.</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await testFirestoreConnection();
                      alert(res.success ? '✅ ¡Conexión con Firebase Firestore exitosa!' : '❌ Error: ' + res.message);
                    }}
                    className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>Probar Ping</span>
                  </button>
                </div>

                {/* Botón Ajustar Tasa */}
                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3 hover:border-emerald-500/40 transition-colors">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Fijar Tasa Oficial de Cambio</span>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">1$ = {formatBs(1, empresaConfig.tasaCambio)}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">Actualiza el tipo de cambio oficial para todo el sistema.</p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenRateModal}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Cambiar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tarjeta Informativa de Gestión de Botones */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400 flex items-start gap-3">
            <Layers className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-slate-200">¿Cómo funciona esta Pestaña Temporal?</span>
              <p>
                Los botones ubicados aquí siguen 100% operativos. Cuando quieras eliminar definitivamente alguno de estos botones o trasladar otros desde otras pantallas, solo indícalo y lo ajustaremos al instante.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 6: REINICIO TOTAL DEL SISTEMA (ZONA DE PELIGRO) */}
      {/* ======================================================== */}
      {activeSubTab === 'reinicio' && (
        <div className="bg-slate-900 border border-rose-900/50 rounded-2xl p-6 space-y-6 max-w-3xl">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                Zona de Peligro: Reinicio Total de Fábrica
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Restaura todo el sistema al estado inicial y purga la base de datos local persistida.
              </p>
            </div>
          </div>

          <div className="bg-slate-950 p-5 rounded-2xl border border-rose-950/80 text-xs text-slate-300 space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>Consecuencias de Reiniciar la App:</span>
            </div>
            <p className="text-slate-400">
              Esta acción es irreversible y eliminará todos los registros operativos creados en el sistema:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-300 pl-2">
              <li>Se borrarán todas las transacciones de ventas y pagos registrados en el POS.</li>
              <li>Se borrarán todas las órdenes de compras y facturas a proveedores (CxP).</li>
              <li>Se eliminarán las cuentas por cobrar (CxC) y abonos de clientes.</li>
              <li>El stock e inventario regresará a los valores originales de fábrica.</li>
              <li>Se restablecerán los datos fiscales y cotización de tasa a valores por defecto.</li>
              <li>Se purgará la memoria caché local de este navegador.</li>
            </ul>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setResetWordInput('');
                setResetPinInput('');
                setResetError(null);
                setShowResetModal(true);
              }}
              className="w-full sm:w-auto px-6 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xl shadow-rose-950/60 cursor-pointer transition-all hover:scale-102"
            >
              <Trash2 className="w-4 h-4" />
              <span>Iniciar Protocolo de Reinicio de Base de Datos</span>
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: DOBLE CONFIRMACIÓN DE SEGURIDAD PARA REINICIO */}
      {/* ======================================================== */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-600/60 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold">
                <ShieldAlert className="w-5 h-5" />
                <span className="text-sm">Confirmación Crítica de Seguridad</span>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-slate-300">
              Para prevenir borrados accidentales, debes cumplir con las siguientes <strong>2 verificaciones de seguridad</strong>:
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1">
                  1. Escribe exactamente la palabra <span className="font-mono font-bold text-rose-400">REINICIAR</span>:
                </label>
                <input
                  type="text"
                  value={resetWordInput}
                  onChange={(e) => {
                    setResetWordInput(e.target.value);
                    setResetError(null);
                  }}
                  placeholder="Escribe REINICIAR"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono uppercase focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  2. Ingresa el PIN de Administrador ({currentUser?.nombre || 'Ana Morales'}):
                </label>
                <input
                  type="password"
                  value={resetPinInput}
                  maxLength={6}
                  onChange={(e) => {
                    setResetPinInput(e.target.value);
                    setResetError(null);
                  }}
                  placeholder="PIN de Administrador"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-center tracking-widest focus:border-rose-500 focus:outline-none"
                />
              </div>

              {resetError && (
                <div className="text-rose-400 text-[11px] font-semibold bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/50">
                  {resetError}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const isWordValid = resetWordInput.trim().toUpperCase() === 'REINICIAR';
                  const adminUsers = usuarios.filter((u) => u.rol === 'admin');
                  const pinToCheck = resetPinInput.trim();

                  if (!isWordValid) {
                    setResetError('Debes escribir la palabra REINICIAR exactamente.');
                    return;
                  }

                  let isAdminPinValid = false;
                  for (const u of adminUsers) {
                    if (await verifyUserPin(pinToCheck, u.pin, u)) {
                      isAdminPinValid = true;
                      break;
                    }
                  }

                  if (!isAdminPinValid) {
                    setResetError('El PIN ingresado no corresponde a un Administrador autorizado.');
                    return;
                  }

                  setShowResetModal(false);
                  if (onResetAllData) {
                    onResetAllData(pinToCheck);
                  }
                  setSuccessMsg('¡Base de datos y sistema reiniciados con éxito a valores de fábrica!');
                  setTimeout(() => setSuccessMsg(null), 6000);
                }}
                disabled={
                  resetWordInput.trim().toUpperCase() !== 'REINICIAR' ||
                  resetPinInput.trim().length < 4
                }
                className={`flex-1 py-2.5 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  resetWordInput.trim().toUpperCase() === 'REINICIAR' &&
                  resetPinInput.trim().length >= 4
                    ? 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shadow-lg shadow-rose-950/60'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>🔥 Borrar y Reiniciar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: AGREGAR NUEVA SUCURSAL CON TOKEN MAESTRO */}
      {/* ======================================================== */}
      {showAddSucursalModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAddNewSucursal}
            className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <Store className="w-5 h-5" />
                <span className="text-sm">Agregar Nueva Sucursal</span>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                title="Cerrar (Esc)"
                data-modal-close="true"
                onClick={() => {
                  setShowAddSucursalModal(false);
                  setDevMasterToken('');
                  setAddSucursalError(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2.5 text-amber-200">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                La creación de nuevas sucursales está protegida. Ingresa el <strong>Token Maestro de Desarrollador</strong> para habilitar la nueva sede en el sistema.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nombre de la Nueva Sucursal <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newBranchNombre}
                  onChange={(e) => {
                    setNewBranchNombre(e.target.value);
                    setAddSucursalError(null);
                  }}
                  placeholder="Ej: Tienda 3 - Zona Este"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Tipo de Sede
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewBranchTipo('tienda')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                      newBranchTipo === 'tienda'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Store className="w-4 h-4 shrink-0" />
                    <div>
                      <div className="text-xs">Tienda Física</div>
                      <div className="text-[10px] opacity-75">Con caja POS</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewBranchTipo('oficina')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                      newBranchTipo === 'oficina'
                        ? 'bg-purple-500/15 border-purple-500 text-purple-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Building2 className="w-4 h-4 shrink-0" />
                    <div>
                      <div className="text-xs">Oficina / Almacén</div>
                      <div className="text-[10px] opacity-75">Depósito / Gestión</div>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Token Maestro de Desarrollador <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showDevToken ? 'text' : 'password'}
                    required
                    value={devMasterToken}
                    onChange={(e) => {
                      setDevMasterToken(e.target.value);
                      setAddSucursalError(null);
                    }}
                    placeholder="Ingresa el token maestro de autorización"
                    autoComplete="off"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3 pr-9 py-2 text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDevToken((prev) => !prev)}
                    aria-label="Mostrar u ocultar token"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showDevToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {addSucursalError && (
                <div className="text-rose-400 text-[11px] font-semibold bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/50 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{addSucursalError}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowAddSucursalModal(false);
                  setDevMasterToken('');
                  setAddSucursalError(null);
                }}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isVerifyingDevToken}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{isVerifyingDevToken ? 'Verificando...' : 'Autorizar y Crear'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
