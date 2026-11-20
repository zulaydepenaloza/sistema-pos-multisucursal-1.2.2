import React from 'react';
import { X, ShieldCheck, FileText, RotateCcw, Phone, Building2 } from 'lucide-react';
import { EmpresaConfig, TiendaConfig } from '../types';
import { formatBs } from '../lib/currency';

export type LegalTab = 'privacidad' | 'terminos' | 'devoluciones';

interface TiendaLegalModalProps {
  isOpen: boolean;
  activeTab: LegalTab;
  onTabChange: (tab: LegalTab) => void;
  onClose: () => void;
  empresaConfig: EmpresaConfig;
  tiendaConfig: TiendaConfig;
  resolvedPhone?: string;
}

export const TiendaLegalModal: React.FC<TiendaLegalModalProps> = ({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  empresaConfig,
  tiendaConfig,
  resolvedPhone,
}) => {
  if (!isOpen) return null;

  const nombreComercio = tiendaConfig.nombreTienda || empresaConfig.nombreEmpresa;
  const rifComercio = empresaConfig.rif || 'No especificado';
  const direccionComercio = empresaConfig.direccion || 'Sucursal principal';
  const telefonoComercio = resolvedPhone || empresaConfig.telefono || '';

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden my-6 flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
              Información Legal y Políticas del Comercio
            </h3>
            <p className="text-[11px] text-slate-400 truncate">
              {nombreComercio} · RIF: {rifComercio}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar información legal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-5 pt-3 pb-2 bg-slate-950/40 border-b border-slate-800 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onTabChange('privacidad')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'privacidad'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Aviso de Privacidad</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('terminos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'terminos'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Términos y Condiciones</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('devoluciones')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'devoluciones'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Política de Devoluciones</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed custom-scrollbar">
          {activeTab === 'privacidad' && (
            <>
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">1. Responsable de tus datos</h4>
                <p>
                  <strong className="text-white">{nombreComercio}</strong> (RIF: <span className="font-mono">{rifComercio}</span>), con domicilio en {direccionComercio}, es responsable del tratamiento de los datos que suministras al realizar un pedido o guardar tu perfil de cliente.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">2. Qué datos recopilamos y para qué</h4>
                <p>
                  Solicitamos únicamente la información necesaria para procesar, facturar y entregar tu compra: nombre o razón social, cédula/RIF, teléfono WhatsApp, dirección de entrega (cuando eliges delivery) y correo electrónico opcional. No vendemos ni cedemos tus datos a terceros con fines publicitarios.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">3. Almacenamiento local y en la nube</h4>
                <p>
                  Esta tienda no utiliza cookies publicitarias ni rastreadores de anuncios. Si decides recordar tus datos para futuras compras, tu perfil se guarda localmente en la memoria de tu navegador (<span className="font-mono text-slate-200">localStorage</span>). Los pedidos confirmados se registran en el sistema de gestión del comercio (y en su respaldo seguro en Google Cloud / Firebase cuando la sincronización en la nube está activa).
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">4. Cómo eliminar tus datos</h4>
                <p>
                  Puedes borrar los datos guardados en tu dispositivo en cualquier momento desde el botón <strong className="text-emerald-400">Mi Perfil → Borrar Datos</strong>. Para solicitar la eliminación o actualización de registros de contacto asociados a pedidos ya enviados, contáctanos directamente por nuestro canal oficial de atención.
                </p>
              </div>
            </>
          )}

          {activeTab === 'terminos' && (
            <>
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">1. Precios, IVA y tasa de cambio</h4>
                <p>
                  Todos los precios exhibidos en el catálogo en línea ya incluyen el <strong>IVA (16%)</strong> o indican expresamente la condición <strong>Exento</strong> según la normativa vigente. El equivalente en Bolívares se calcula de forma referencial a la tasa oficial configurada por el comercio (<span className="font-mono text-emerald-400">1 USD = {formatBs(1, empresaConfig.tasaCambio)}</span>) al momento de registrar la orden.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">2. Disponibilidad y confirmación de pedidos</h4>
                <p>
                  Los pedidos están sujetos a verificación de inventario en la sucursal seleccionada y validación del pago reportado (Pago Móvil, Zelle o efectivo contra entrega/retiro). El envío del formulario genera una orden de compra que el equipo confirmará antes del despacho.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">3. Entregas (Delivery y Retiro en Tienda)</h4>
                <p>
                  No aplicamos recargos ocultos: el retiro en sucursal tiene costo <strong className="text-white">$0.00</strong> y el costo de envío a domicilio se muestra de forma transparente antes de confirmar tu orden.
                </p>
              </div>
            </>
          )}

          {activeTab === 'devoluciones' && (
            <>
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">1. Condiciones para cambios o devoluciones</h4>
                <p>
                  Para gestionar cualquier cambio o devolución es indispensable presentar la factura, ticket de compra o número de orden digital emitido por <strong className="text-white">{nombreComercio}</strong>. El producto debe encontrarse sin uso, sellado y en su empaque original en buen estado.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">2. Productos defectuosos o errores de despacho</h4>
                <p>
                  Si recibiste un artículo distinto al solicitado o con algún defecto de fábrica/empaque, notifícalo de inmediato al momento de la entrega o dentro de las primeras <strong>48 horas</strong> por nuestro WhatsApp de atención para coordinar el reemplazo o ajuste sin costo adicional.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white">3. Excepciones</h4>
                <p>
                  Por razones de higiene y seguridad alimentaria, los productos perecederos, refrigerados o de empaque abierto deben verificarse al momento de recibir el pedido y no admiten cambio posterior salvo defecto comprobado de origen.
                </p>
              </div>
            </>
          )}

          {/* Business Identity Summary Box */}
          <div className="mt-4 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400">
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-slate-200 font-semibold">{nombreComercio} · RIF: {rifComercio}</p>
                <p>{direccionComercio}</p>
              </div>
            </div>
            {telefonoComercio && (
              <div className="flex items-center gap-1.5 text-slate-300 font-mono shrink-0">
                <Phone className="w-3.5 h-3.5 text-teal-400" />
                <span>{telefonoComercio}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs cursor-pointer transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
