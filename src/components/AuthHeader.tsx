import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  UserCheck,
  Lock,
  Calculator,
  KeyRound,
  User,
  TrendingUp,
  X,
} from 'lucide-react';
import { Usuario, Sucursal, EmpresaConfig } from '../types';
import { INITIAL_USUARIOS } from '../data/mockData';
import { verifyUserPin } from '../lib/security';
import { formatBs } from '../lib/currency';

interface AuthHeaderProps {
  currentUser: Usuario | null;
  usuarios: Usuario[];
  sucursales: Sucursal[];
  empresaConfig?: EmpresaConfig;
  onSelectUser: (user: Usuario) => void;
  onLogout: () => void;
  onOpenHtmlModal?: () => void;
  onOpenClientStore?: () => void;
  onOpenCalculator?: () => void;
  onOpenRateModal?: () => void;
  onLoginAudit?: (success: boolean, targetUser: Usuario, area: string) => void;
}

export const AuthHeader: React.FC<AuthHeaderProps> = ({
  currentUser,
  usuarios,
  empresaConfig,
  onSelectUser,
  onOpenCalculator,
  onOpenRateModal,
  onLoginAudit,
}) => {
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Filtrar usuarios de prueba heredados para que inicialmente sólo aparezca el Gerente General.
  // Cualquier usuario creado por el Gerente General en Configuración aparecerá aquí.
  const isLegacyMockUser = (u: Usuario) =>
    [
      'cajero1_t1',
      'cajero2_t1',
      'cajero3_t1',
      'supervisor_t1',
      'cajero1_t2',
      'cajero2_t2',
      'cajero3_t2',
      'supervisor_t2',
      'inv_jefe',
      'inv_operador1',
      'inv_operador2',
    ].includes(u.username);

  const realUsers = (Array.isArray(usuarios) && usuarios.length > 0 ? usuarios : INITIAL_USUARIOS)
    .filter((u) => !isLegacyMockUser(u))
    .map((u) => {
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

  const availableUsers: Usuario[] = realUsers.length > 0 ? realUsers : INITIAL_USUARIOS;

  const [selectedUserId, setSelectedUserId] = useState<number>(() => {
    const admin = availableUsers.find((u) => u.rol === 'admin');
    return admin ? admin.id : availableUsers[0]?.id || 1;
  });
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [errorPin, setErrorPin] = useState<string | null>(null);

  const userListRef = useRef<HTMLDivElement>(null);
  const userOptionRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (availableUsers.length > 0) {
      const exists = availableUsers.some((u) => u.id === selectedUserId);
      if (!exists) {
        const admin = availableUsers.find((u) => u.rol === 'admin');
        setSelectedUserId(admin ? admin.id : availableUsers[0].id);
      }
    }
  }, [availableUsers, selectedUserId]);

  // Auto-focus user selector on open & allow Escape to close login modal
  useEffect(() => {
    if (!showLoginModal) return;

    const timer = requestAnimationFrame(() => {
      userListRef.current?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowLoginModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      cancelAnimationFrame(timer);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [showLoginModal]);

  // Keep selected user scrolled into view inside the list
  useEffect(() => {
    if (!showLoginModal) return;
    userOptionRefs.current[selectedUserId]?.scrollIntoView({ block: 'nearest' });
  }, [selectedUserId, showLoginModal]);

  const handleOpenLoginModal = () => {
    setErrorPin(null);
    setEnteredPin('');
    const admin = availableUsers.find((u) => u.rol === 'admin');
    if (currentUser) {
      setSelectedUserId(currentUser.id);
    } else if (admin) {
      setSelectedUserId(admin.id);
    } else if (availableUsers[0]) {
      setSelectedUserId(availableUsers[0].id);
    }
    setShowLoginModal(true);
  };

  const handleUserListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (availableUsers.length === 0) return;

    const currentIndex = Math.max(
      0,
      availableUsers.findIndex((u) => u.id === selectedUserId)
    );

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = (currentIndex + 1) % availableUsers.length;
      setSelectedUserId(availableUsers[nextIdx].id);
      setErrorPin(null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = (currentIndex - 1 + availableUsers.length) % availableUsers.length;
      setSelectedUserId(availableUsers[prevIdx].id);
      setErrorPin(null);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedUserId(availableUsers[0].id);
      setErrorPin(null);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedUserId(availableUsers[availableUsers.length - 1].id);
      setErrorPin(null);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      pinInputRef.current?.focus();
    }
  };

  const handleVerifyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorPin(null);
    const targetUser = availableUsers.find((u) => u.id === selectedUserId) || availableUsers[0];
    if (!targetUser) {
      setErrorPin('Por favor selecciona un usuario válido.');
      return;
    }

    const isValid = await verifyUserPin(enteredPin, targetUser.pin, targetUser);
    if (isValid) {
      onSelectUser({
        ...targetUser,
        pin: enteredPin.trim(),
      });
      if (onLoginAudit) {
        onLoginAudit(true, targetUser, 'Inicio de Sesión');
      }
      setShowLoginModal(false);
      setEnteredPin('');
      setErrorPin(null);
    } else {
      if (onLoginAudit) {
        onLoginAudit(false, targetUser, 'Inicio de Sesión');
      }
      setErrorPin('PIN incorrecto. Por favor verifica e intenta nuevamente.');
    }
  };

  return (
    <>
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-1.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-[46px] w-[116px] sm:h-[54px] sm:w-[136px] rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-2 border-emerald-500/45 shadow-md shadow-black/40 ring-1 ring-white/10 flex items-center justify-center overflow-hidden shrink-0">
            <img
              src="/assets/aistudio/Axis-logo-SF_065bc396.png"
              alt="AxisPOS ERP"
              className="w-[144px] sm:w-[168px] max-w-none h-auto translate-y-[2px] pointer-events-none select-none"
            />
          </div>

          <div className="h-7 w-px bg-slate-800 hidden sm:block shrink-0" />

          <span className="font-extrabold text-white tracking-wide text-sm uppercase truncate max-w-[200px] sm:max-w-md">
            {empresaConfig?.nombreEmpresa || 'Comercio'}
          </span>

          {currentUser ? (
            <button
              type="button"
              onClick={handleOpenLoginModal}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-800 border border-slate-700/70 transition-colors cursor-pointer text-left shrink-0"
              title="Cambiar de usuario"
            >
              <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-white font-semibold">
                {currentUser.nombre_completo || currentUser.username}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenLoginModal}
              className="text-amber-400 hover:text-amber-300 flex items-center gap-1.5 cursor-pointer underline font-medium"
            >
              <Lock className="w-3.5 h-3.5" /> Sesión cerrada (Haz clic para iniciar sesión)
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {empresaConfig && (
            <button
              type="button"
              onClick={onOpenRateModal}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 transition-colors cursor-pointer font-mono font-semibold"
              title="Tasa de cambio del día (Click para cambiar manualmente o consultar BCV en vivo)"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>1 USD = {formatBs(1, empresaConfig.tasaCambio)}</span>
              {onOpenRateModal && (
                <span className="text-[10px] text-emerald-300 font-sans underline opacity-85 hidden sm:inline">
                  (Ajustar)
                </span>
              )}
            </button>
          )}

          {onOpenCalculator && (
            <button
              type="button"
              onClick={onOpenCalculator}
              className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 flex items-center gap-1.5 transition-colors cursor-pointer font-bold shadow-sm"
              title="Abrir Calculadora Comercial Multimoneda (Tecla F9)"
            >
              <Calculator className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Calculadora</span>
              <span className="text-[9px] bg-purple-950/80 border border-purple-400/40 px-1 py-0.2 rounded text-purple-300 font-mono font-bold">
                F9
              </span>
            </button>
          )}

          {!currentUser && (
            <button
              type="button"
              onClick={handleOpenLoginModal}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <UserCheck className="w-4 h-4 stroke-[2.5]" />
              <span>Iniciar Sesión</span>
            </button>
          )}
        </div>
      </div>

      {/* MODAL DE INICIO DE SESIÓN ELEGANTE (SIN PINES VISIBLES) */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Iniciar Sesión</h3>
                  <p className="text-xs text-slate-400">Control de acceso seguro</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                aria-label="Cerrar"
                title="Cerrar (Esc)"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVerifyLogin} className="space-y-4">
              {/* CAMPO DE SELECCIÓN DE USUARIO (TECLADO FLECHAS + ENTER O MOUSE) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300">Usuario:</label>
                  <span className="text-[10px] text-slate-500">
                    ↑↓ Elegir • Enter → PIN
                  </span>
                </div>
                <div
                  ref={userListRef}
                  tabIndex={0}
                  role="listbox"
                  aria-label="Seleccionar usuario"
                  aria-activedescendant={`login-user-option-${selectedUserId}`}
                  onKeyDown={handleUserListKeyDown}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none rounded-xl p-1.5 max-h-44 overflow-y-auto custom-scrollbar space-y-1"
                >
                  {availableUsers.map((u) => {
                    const isSelected = u.id === selectedUserId;
                    return (
                      <button
                        key={u.id}
                        id={`login-user-option-${u.id}`}
                        ref={(el) => {
                          userOptionRefs.current[u.id] = el;
                        }}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        tabIndex={-1}
                        onClick={() => {
                          setSelectedUserId(u.id);
                          setErrorPin(null);
                          pinInputRef.current?.focus();
                        }}
                        className={`w-full px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500/15 border border-emerald-500/50 text-white'
                            : 'border border-transparent hover:bg-slate-800/70 text-slate-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-xs sm:text-sm block truncate">
                            {u.nombre_completo}
                          </span>
                          <span className="text-[11px] text-slate-400 block truncate">
                            {u.cargo || u.rol.toUpperCase()}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase shrink-0 ${
                            u.rol === 'admin'
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                              : u.rol === 'supervisor'
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {u.rol}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CAMPO DE PIN DE ACCESO */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  PIN de Acceso:
                </label>
                <div className="relative">
                  <input
                    ref={pinInputRef}
                    type="password"
                    required
                    placeholder="••••"
                    value={enteredPin}
                    onChange={(e) => {
                      setEnteredPin(e.target.value);
                      setErrorPin(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp' && !enteredPin) {
                        e.preventDefault();
                        userListRef.current?.focus();
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 font-mono text-lg text-emerald-400 p-3 pr-10 rounded-xl focus:border-emerald-500 focus:outline-none tracking-widest placeholder:tracking-normal placeholder:text-slate-600 placeholder:text-sm text-center"
                  />
                  <KeyRound className="w-4 h-4 text-slate-500 absolute right-3 top-4" />
                </div>
                {errorPin && (
                  <p className="text-xs text-rose-400 mt-2 font-medium bg-rose-950/40 p-2.5 rounded-lg border border-rose-500/30">
                    {errorPin}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Ingresar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
