import { Compra, EmpresaConfig, Sucursal, Venta } from '../types';
import { generateBarcodeSvgString } from '../components/BarcodeSvg';

export interface PrintableTicketItem {
  nombre: string;
  cantidad: number;
  precio: number; // USD
  codigo_barras?: string;
  unidad_medida?: string;
}

export interface PrintableTicketData {
  numeroFactura: string;
  sucursalNombre: string;
  cajeroNombre?: string;
  clienteNombre: string;
  clienteRif: string;
  items: PrintableTicketItem[];
  subtotalNeto: number;
  baseImponible?: number;
  montoExento?: number;
  montoIva: number;
  totalUsd: number;
  tasa: number;
  fecha: string;
  pagoDetalle?: any;
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export type ThermalPaperWidth = '58mm' | '80mm';

const PAPER_WIDTH_STORAGE_KEY = 'pos_ticket_paper_width';

export function getSavedPaperWidth(): ThermalPaperWidth {
  try {
    const saved = localStorage.getItem(PAPER_WIDTH_STORAGE_KEY);
    if (saved === '80mm' || saved === '58mm') return saved;
  } catch {
    // ignore storage errors
  }
  return '58mm';
}

export function setSavedPaperWidth(width: ThermalPaperWidth): void {
  try {
    localStorage.setItem(PAPER_WIDTH_STORAGE_KEY, width);
  } catch {
    // ignore storage errors
  }
}

/**
 * Builds crisp monochrome thermal receipt HTML calibrated for 58mm (48mm printable) and 80mm (72mm printable) printers.
 * Uses pure #000000 high-contrast strokes and sans-serif tabular numerals to eliminate thermal halftone dithering.
 */
export function generateThermalTicketHtml(
  ticket: PrintableTicketData,
  empresaConfig: EmpresaConfig,
  paperWidth: ThermalPaperWidth = getSavedPaperWidth()
): string {
  const is58 = paperWidth === '58mm';
  const pagePhysicalWidth = is58 ? '58mm' : '80mm';
  const contentWidth = is58 ? '47mm' : '71mm';
  const totalBs = ticket.totalUsd * ticket.tasa;
  const barcodeValue = `FAC-${ticket.numeroFactura}-${ticket.clienteRif.replace(/[^A-Za-z0-9]/g, '')}`;
  const barcodeSvg = generateBarcodeSvgString(barcodeValue, is58 ? 34 : 38, '#000000', true);

  const itemsHtml = ticket.items
    .map((it) => {
      const lineTotalUsd = it.cantidad * it.precio;
      const lineTotalBs = lineTotalUsd * ticket.tasa;
      return `
        <div class="item-row">
          <div class="item-main">
            <span class="item-name">${it.cantidad}x ${escapeHtml(it.nombre)}</span>
            <span class="item-total">$${lineTotalUsd.toFixed(2)}</span>
          </div>
          <div class="item-meta">
            <span>$${it.precio.toFixed(2)} c/u</span>
            <span class="nowrap">Bs.${lineTotalBs.toFixed(2)}</span>
          </div>
        </div>
      `;
    })
    .join('');

  // Payment Breakdown details
  let paymentHtml = '';
  if (ticket.pagoDetalle) {
    const pd = ticket.pagoDetalle;
    const paymentRows: string[] = [];

    if (pd.descuento_usd && pd.descuento_usd > 0) {
      paymentRows.push(`
        <div class="kv-row">
          <span>Descuento Aplicado:</span>
          <span class="nowrap">-$${pd.descuento_usd.toFixed(2)}</span>
        </div>
      `);
    }

    if (pd.metodo === 'efectivo_usd' || pd.efectivo_usd_recibido) {
      const usdAmount = pd.efectivo_usd_recibido || (pd.zelle_monto_usd ? 0 : ticket.totalUsd);
      if (usdAmount > 0) {
        paymentRows.push(`
          <div class="kv-row">
            <span>Efectivo Divisas:</span>
            <span class="nowrap">$${usdAmount.toFixed(2)}</span>
          </div>
        `);
      }
      if (pd.vuelto_usd && pd.vuelto_usd > 0) {
        paymentRows.push(`
          <div class="kv-row">
            <span>Vuelto Divisas:</span>
            <span class="nowrap">$${pd.vuelto_usd.toFixed(2)}</span>
          </div>
        `);
      }
    }

    if (pd.zelle_monto_usd && pd.zelle_monto_usd > 0) {
      paymentRows.push(`
        <div class="kv-row">
          <span>Zelle (USD):</span>
          <span class="nowrap">$${pd.zelle_monto_usd.toFixed(2)}</span>
        </div>
      `);
    }

    if (pd.metodo === 'efectivo_bs' || pd.efectivo_bs_recibido) {
      paymentRows.push(`
        <div class="kv-row">
          <span>Efectivo Bs:</span>
          <span class="nowrap">Bs. ${(pd.efectivo_bs_recibido || totalBs).toFixed(2)}</span>
        </div>
      `);
    }

    if (pd.metodo === 'pago_movil' || pd.pago_movil_monto_bs) {
      paymentRows.push(`
        <div class="kv-row">
          <span>Pago Móvil:</span>
          <span class="nowrap">Bs. ${(pd.pago_movil_monto_bs || totalBs).toFixed(2)}</span>
        </div>
      `);
      if (pd.referencia_pago_movil) {
        paymentRows.push(`
          <div class="kv-row">
            <span>Ref. Pago Móvil:</span>
            <span class="nowrap">${escapeHtml(pd.referencia_pago_movil)}</span>
          </div>
        `);
      }
    }

    if (pd.metodo === 'biopago' || pd.biopago_monto_bs) {
      paymentRows.push(`
        <div class="kv-row">
          <span>BioPago:</span>
          <span class="nowrap">Bs. ${(pd.biopago_monto_bs || totalBs).toFixed(2)}</span>
        </div>
      `);
    }

    if (pd.metodo === 'tarjeta' || pd.tarjeta_monto_bs) {
      paymentRows.push(`
        <div class="kv-row">
          <span>Punto de Venta:</span>
          <span class="nowrap">Bs. ${(pd.tarjeta_monto_bs || totalBs).toFixed(2)}</span>
        </div>
      `);
      if (pd.tarjeta_referencia || pd.tarjeta_lote) {
        paymentRows.push(`
          <div class="kv-row">
            <span>Ref/Lote POS:</span>
            <span class="nowrap">${escapeHtml(pd.tarjeta_referencia || '')} ${pd.tarjeta_lote ? `(L:${escapeHtml(pd.tarjeta_lote)})` : ''}</span>
          </div>
        `);
      }
    }

    if (pd.vuelto_bs && pd.vuelto_bs > 0) {
      paymentRows.push(`
        <div class="kv-row">
          <span>Vuelto en Bs:</span>
          <span class="nowrap">Bs. ${pd.vuelto_bs.toFixed(2)}</span>
        </div>
      `);
    }

    if (paymentRows.length > 0) {
      paymentHtml = `
        <div class="divider"></div>
        <div class="section-label">FORMA DE PAGO:</div>
        <div class="payment-block">
          ${paymentRows.join('')}
        </div>
      `;
    }
  }

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ticket Fiscal #${escapeHtml(ticket.numeroFactura)}</title>
  <style>
    @page {
      size: ${pagePhysicalWidth} auto;
      margin: 1mm 1mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      color: #000000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background: #ffffff !important;
      color: #000000 !important;
      font-family: 'Segoe UI', 'Calibri', 'Tahoma', Arial, Helvetica, sans-serif;
      font-variant-numeric: tabular-nums;
      -webkit-font-smoothing: none;
      text-rendering: optimizeSpeed;
      width: ${contentWidth};
      max-width: 100%;
      margin: 0 auto;
      padding: 1mm 0.5mm 7mm 0.5mm;
      font-size: ${is58 ? '9.5px' : '10.5px'};
      font-weight: 400;
      line-height: 1.28;
    }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .font-black { font-weight: 700; }
    .nowrap { white-space: nowrap; }
    .divider {
      border-top: 1px dashed #000000;
      margin: 4px 0;
    }
    .double-divider {
      border-top: 1.5px solid #000000;
      margin: 4px 0;
    }
    .company-name {
      font-size: ${is58 ? '11.5px' : '13px'};
      font-weight: 700;
      text-transform: uppercase;
      line-height: 1.15;
      margin-bottom: 2px;
    }
    .company-rif {
      font-size: ${is58 ? '9.5px' : '10.5px'};
      font-weight: 700;
    }
    .company-addr {
      font-size: ${is58 ? '8.8px' : '9.5px'};
      font-weight: 400;
      line-height: 1.22;
      margin-top: 1.5px;
    }
    .invoice-box {
      display: inline-block;
      border: 1px solid #000000;
      background: #ffffff;
      padding: 2px 6px;
      margin-top: 3px;
      font-size: ${is58 ? '10px' : '11px'};
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .meta-block {
      font-size: ${is58 ? '9px' : '10px'};
      font-weight: 400;
      line-height: 1.3;
      word-break: break-word;
    }
    .section-label {
      font-weight: 700;
      font-size: ${is58 ? '9px' : '10px'};
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 700;
      font-size: ${is58 ? '9px' : '9.5px'};
      text-transform: uppercase;
      padding-bottom: 2px;
      border-bottom: 1px solid #000000;
      margin-bottom: 3px;
    }
    .item-row {
      margin-bottom: 3.5px;
      padding-bottom: 2.5px;
      border-bottom: 1px dashed #000000;
    }
    .item-row:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .item-main {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 6px;
      font-weight: 400;
      font-size: ${is58 ? '9.5px' : '10.5px'};
      line-height: 1.2;
    }
    .item-name {
      flex: 1;
      min-width: 0;
      word-break: break-word;
    }
    .item-total {
      flex-shrink: 0;
      white-space: nowrap;
      font-weight: 700;
      text-align: right;
    }
    .item-meta {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 1px 6px;
      font-size: ${is58 ? '8.3px' : '9px'};
      font-weight: 400;
      margin-top: 1px;
    }
    .kv-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 6px;
      font-size: ${is58 ? '9.5px' : '10.5px'};
      font-weight: 400;
      line-height: 1.32;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 4px;
      font-size: ${is58 ? '11px' : '12.5px'};
      font-weight: 700;
      line-height: 1.28;
    }
    .rate-note {
      text-align: right;
      font-size: ${is58 ? '8.5px' : '9px'};
      font-weight: 400;
      margin-top: 2px;
    }
    .payment-block {
      font-size: ${is58 ? '9px' : '10px'};
    }
    .barcode-wrap {
      width: 100%;
      max-width: ${is58 ? '44mm' : '64mm'};
      margin: 2px auto;
    }
    .footer-note {
      font-size: ${is58 ? '8.2px' : '9px'};
      font-weight: 400;
      margin-top: 2px;
      line-height: 1.25;
    }
  </style>
</head>
<body>
  <div class="text-center">
    <div class="company-name">${escapeHtml(empresaConfig.nombreEmpresa)}</div>
    <div class="company-rif">RIF: ${escapeHtml(empresaConfig.rif)}</div>
    ${(empresaConfig.direccionFiscal || (empresaConfig as any).direccion) ? `<div class="company-addr">${escapeHtml(empresaConfig.direccionFiscal || (empresaConfig as any).direccion)}</div>` : ''}
    ${empresaConfig.telefono ? `<div class="company-addr">TELF: ${escapeHtml(empresaConfig.telefono)}</div>` : ''}
    <div class="company-addr" style="margin-top: 2px; font-weight: 700;">SUCURSAL: ${escapeHtml(ticket.sucursalNombre)}</div>
    <div class="invoice-box">
      FACTURA FISCAL: #${escapeHtml(ticket.numeroFactura)}
    </div>
  </div>

  <div class="divider"></div>

  <div class="meta-block">
    <div><span class="font-bold">FECHA:</span> ${escapeHtml(ticket.fecha)}</div>
    <div><span class="font-bold">CLIENTE:</span> ${escapeHtml(ticket.clienteNombre)}</div>
    <div><span class="font-bold">RIF/CÉDULA:</span> ${escapeHtml(ticket.clienteRif)}</div>
    ${ticket.cajeroNombre ? `<div><span class="font-bold">CAJERO:</span> ${escapeHtml(ticket.cajeroNombre)}</div>` : ''}
  </div>

  <div class="divider"></div>
  <div class="table-header">
    <span>CANT / DESCRIPCIÓN</span>
    <span>TOTAL</span>
  </div>

  <div>
    ${itemsHtml}
  </div>

  <div class="divider"></div>

  <div>
    <div class="kv-row">
      <span class="nowrap">SUBTOTAL:</span>
      <span class="nowrap">$${ticket.subtotalNeto.toFixed(2)}</span>
    </div>
    ${(ticket.montoExento && ticket.montoExento > 0) ? `
    <div class="kv-row">
      <span class="nowrap">EXENTO (E 0%):</span>
      <span class="nowrap">$${ticket.montoExento.toFixed(2)}</span>
    </div>` : ''}
    ${(ticket.baseImponible && ticket.baseImponible > 0) ? `
    <div class="kv-row">
      <span class="nowrap">BASE IMP. (G 16%):</span>
      <span class="nowrap">$${ticket.baseImponible.toFixed(2)}</span>
    </div>` : ''}
    <div class="kv-row">
      <span class="nowrap">IVA (16%):</span>
      <span class="nowrap">+$${ticket.montoIva.toFixed(2)}</span>
    </div>

    <div class="double-divider"></div>

    <div class="total-row">
      <span class="nowrap">TOTAL USD:</span>
      <span class="nowrap">$${ticket.totalUsd.toFixed(2)}</span>
    </div>
    <div class="total-row" style="margin-top: 2px;">
      <span class="nowrap">TOTAL BS:</span>
      <span class="nowrap">Bs. ${totalBs.toFixed(2)}</span>
    </div>
    <div class="rate-note">
      Tasa BCV: Bs. ${ticket.tasa.toFixed(2)} / USD
    </div>
  </div>

  ${paymentHtml}

  <div class="divider"></div>

  <div class="text-center" style="margin-top: 4px;">
    <div class="section-label" style="margin-bottom: 2px;">VALIDACIÓN DE FACTURA</div>
    <div class="barcode-wrap">
      ${barcodeSvg}
    </div>
    <div class="font-bold" style="font-size: ${is58 ? '9px' : '9.5px'}; margin-top: 3px;">
      *** GRACIAS POR SU COMPRA ***
    </div>
    <div class="footer-note">
      ${escapeHtml(empresaConfig.piePaginaTicket || 'Conserve este ticket para devoluciones o reclamos')}
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Triggers thermal ticket printing directly through a dedicated hidden iframe.
 * Avoids browser popup blockers and guarantees zero styling/overlay bleed.
 */
export function printTicketViaIframe(
  ticket: PrintableTicketData,
  empresaConfig: EmpresaConfig,
  paperWidth: ThermalPaperWidth = getSavedPaperWidth()
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      let iframe = document.getElementById('sales-ticket-print-frame') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'sales-ticket-print-frame';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.zIndex = '-9999';
        document.body.appendChild(iframe);
      }

      const html = generateThermalTicketHtml(ticket, empresaConfig, paperWidth);
      const doc = iframe.contentWindow?.document || iframe.contentDocument;

      if (!doc) {
        console.warn('Iframe document not accessible, falling back to window.print');
        window.print();
        resolve(true);
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve(true);
        } catch (err) {
          console.error('Error invoking print inside iframe, fallback to window.print', err);
          window.print();
          resolve(true);
        }
      }, 180);
    } catch (e) {
      console.error('printTicketViaIframe error:', e);
      window.print();
      resolve(false);
    }
  });
}

/**
 * Helper to print arbitrary HTML through the hidden thermal iframe
 */
export function printHtmlViaIframe(htmlContent: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      let iframe = document.getElementById('sales-ticket-print-frame') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'sales-ticket-print-frame';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.zIndex = '-9999';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc) {
        window.print();
        resolve(true);
        return;
      }

      doc.open();
      doc.write(htmlContent);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve(true);
        } catch (err) {
          console.error('Error printing html in iframe:', err);
          window.print();
          resolve(true);
        }
      }, 150);
    } catch (err) {
      console.error('printHtmlViaIframe failed:', err);
      window.print();
      resolve(false);
    }
  });
}

/**
 * Converts a stored Venta record into PrintableTicketData compatible with PosSimulator thermal tickets.
 */
export function ventaToPrintableTicket(
  venta: Venta,
  sucursales: Sucursal[],
  empresaConfig: EmpresaConfig
): PrintableTicketData {
  const tasa = empresaConfig.tasaCambio || 45.5;
  const branchObj = sucursales.find((s) => s.id === venta.sucursal_id);
  const sucursalNombre =
    branchObj?.nombre ||
    (venta.sucursal_id === 1
      ? empresaConfig.nombreTienda1
      : venta.sucursal_id === 2
      ? empresaConfig.nombreTienda2
      : empresaConfig.nombreOficina || `Sucursal #${venta.sucursal_id}`);

  const parsedDate = new Date(venta.fecha);
  const formattedFecha = isNaN(parsedDate.getTime())
    ? String(venta.fecha || '')
    : parsedDate.toLocaleString('es-VE');

  return {
    numeroFactura:
      (venta as any).numeroFactura ||
      (venta.id ? String(venta.id).padStart(8, '0') : '00000001'),
    sucursalNombre,
    cajeroNombre: venta.usuario_nombre || 'Cajero de Turno',
    clienteNombre: venta.cliente_nombre || 'Cliente de Mostrador',
    clienteRif: venta.cliente_rif || 'V-00000000',
    items: (venta.detalles || []).map((d) => ({
      nombre: d.producto_nombre,
      cantidad: d.cantidad,
      precio: d.precio_unitario,
      codigo_barras: d.codigo_barras,
      unidad_medida: d.unidad_medida,
    })),
    subtotalNeto: venta.subtotal_neto ?? venta.total,
    baseImponible: venta.base_imponible ?? 0,
    montoExento: venta.monto_exento ?? 0,
    montoIva: venta.monto_iva ?? 0,
    totalUsd: venta.total,
    tasa,
    fecha: formattedFecha,
    pagoDetalle: venta.pago_detalle || {
      metodo: (venta.metodo_pago as any) || 'efectivo_usd',
      monto_usd: venta.total,
      monto_bs: venta.total * tasa,
    },
  };
}

/**
 * Generates an A4/Carta printable Sales Invoice HTML for standard office printers.
 */
export function generateVentaLetterHtml(
  venta: Venta,
  sucursales: Sucursal[],
  empresaConfig: EmpresaConfig
): string {
  const ticket = ventaToPrintableTicket(venta, sucursales, empresaConfig);
  const totalBs = ticket.totalUsd * ticket.tasa;

  const rowsHtml = (venta.detalles || [])
    .map((d, idx) => {
      const lineBs = d.subtotal * ticket.tasa;
      return `
        <tr>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;color:#475569;font-family:monospace;">${idx + 1}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px;">${escapeHtml(d.codigo_barras || `SKU-${d.producto_id}`)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(d.producto_nombre)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${escapeHtml(d.unidad_medida || 'UND')}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">${d.cantidad}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">$${d.precio_unitario.toFixed(2)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${d.exento_iva ? 'E (0%)' : 'G (16%)'}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;font-weight:700;">$${d.subtotal.toFixed(2)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;color:#475569;">Bs. ${lineBs.toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Factura de Venta #${escapeHtml(ticket.numeroFactura)}</title>
  <style>
    @page { size: letter portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px; }
    .badge { display: inline-block; border: 1.5px solid #0f172a; padding: 4px 10px; font-weight: 800; font-size: 13px; letter-spacing: 0.4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #0f172a; color: #ffffff; text-align: left; padding: 7px 8px; font-size: 10.5px; text-transform: uppercase; }
    .totals { width: 320px; margin-left: auto; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #f8fafc; }
    .trow { display: flex; justify-content: space-between; margin-bottom: 4px; font-family: monospace; }
    .tgrand { display: flex; justify-content: space-between; border-top: 2px solid #0f172a; padding-top: 6px; margin-top: 6px; font-size: 15px; font-weight: 800; font-family: monospace; }
    .footer { margin-top: 24px; border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 10.5px; color: #475569; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:18px;font-weight:800;text-transform:uppercase;">${escapeHtml(empresaConfig.nombreEmpresa)}</div>
      <div style="font-weight:700;margin-top:2px;">RIF: ${escapeHtml(empresaConfig.rif)}</div>
      <div style="color:#475569;margin-top:2px;">${escapeHtml(empresaConfig.direccionFiscal || '')}</div>
      ${empresaConfig.telefono ? `<div style="color:#475569;">Telf: ${escapeHtml(empresaConfig.telefono)}</div>` : ''}
      <div style="margin-top:4px;font-weight:700;">Sucursal: ${escapeHtml(ticket.sucursalNombre)}</div>
    </div>
    <div style="text-align:right;">
      <div class="badge">FACTURA DE VENTA #${escapeHtml(ticket.numeroFactura)}</div>
      <div style="margin-top:6px;font-size:11px;color:#475569;">COPIA / REIMPRESIÓN</div>
      <div style="margin-top:4px;font-family:monospace;">Fecha: ${escapeHtml(ticket.fecha)}</div>
    </div>
  </div>

  <div class="grid">
    <div>
      <div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;">Cliente / Razón Social</div>
      <div style="font-weight:700;font-size:13px;margin-top:2px;">${escapeHtml(ticket.clienteNombre)}</div>
      <div style="font-family:monospace;margin-top:2px;">RIF / C.I.: ${escapeHtml(ticket.clienteRif)}</div>
    </div>
    <div>
      <div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;">Operación</div>
      <div style="margin-top:2px;"><strong>Cajero:</strong> ${escapeHtml(ticket.cajeroNombre || 'N/A')}</div>
      <div style="margin-top:2px;"><strong>Método de Pago:</strong> ${escapeHtml((venta.metodo_pago || 'efectivo_usd').toUpperCase().replace('_', ' '))}</div>
      <div style="margin-top:2px;font-family:monospace;"><strong>Tasa BCV:</strong> Bs. ${ticket.tasa.toFixed(2)} / USD</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Código</th>
        <th>Descripción</th>
        <th style="text-align:center;">Und</th>
        <th style="text-align:right;">Cant.</th>
        <th style="text-align:right;">P. Unit</th>
        <th style="text-align:center;">IVA</th>
        <th style="text-align:right;">Subtotal $</th>
        <th style="text-align:right;">Subtotal Bs</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="totals">
    <div class="trow"><span>Subtotal Neto:</span><span>$${ticket.subtotalNeto.toFixed(2)}</span></div>
    <div class="trow"><span>Monto Exento (0%):</span><span>$${(ticket.montoExento || 0).toFixed(2)}</span></div>
    <div class="trow"><span>Base Imponible (16%):</span><span>$${(ticket.baseImponible || 0).toFixed(2)}</span></div>
    <div class="trow"><span>IVA (16%):</span><span>$${ticket.montoIva.toFixed(2)}</span></div>
    <div class="tgrand"><span>TOTAL USD:</span><span>$${ticket.totalUsd.toFixed(2)}</span></div>
    <div class="tgrand" style="border-top:none;padding-top:2px;margin-top:2px;font-size:13px;"><span>TOTAL BS:</span><span>Bs. ${totalBs.toFixed(2)}</span></div>
  </div>

  <div class="footer">
    ${escapeHtml(empresaConfig.piePaginaTicket || 'Documento emitido para control administrativo y soporte al cliente.')}
  </div>
</body>
</html>`;
}

export function printVentaLetterViaIframe(
  venta: Venta,
  sucursales: Sucursal[],
  empresaConfig: EmpresaConfig
): Promise<boolean> {
  return printHtmlViaIframe(generateVentaLetterHtml(venta, sucursales, empresaConfig));
}

/**
 * Generates an A4/Carta printable Supplier Purchase Invoice / Inventory Reception voucher.
 */
export function generateCompraInvoiceHtml(
  compra: Compra,
  sucursalNombre: string,
  empresaConfig: EmpresaConfig
): string {
  const rate = compra.tasaRecepcion || empresaConfig.tasaCambio || 45.5;
  const totalBs = compra.total * rate;
  const subtotalNeto =
    compra.subtotalNeto ??
    (compra.detalles || []).reduce((acc, d) => acc + (d.subtotal || d.cantidad * d.costoUnitario), 0);
  const baseImp =
    compra.baseImponible ??
    (compra.detalles || [])
      .filter((d) => !d.exentoIva)
      .reduce((acc, d) => acc + (d.subtotal || d.cantidad * d.costoUnitario), 0);
  const montoExento =
    compra.montoExento ??
    (compra.detalles || [])
      .filter((d) => d.exentoIva)
      .reduce((acc, d) => acc + (d.subtotal || d.cantidad * d.costoUnitario), 0);
  const montoIva = compra.montoIva ?? +(baseImp * 0.16).toFixed(2);

  const parsedDate = new Date(compra.fecha);
  const fechaStr = isNaN(parsedDate.getTime())
    ? String(compra.fecha || '')
    : parsedDate.toLocaleDateString('es-VE');

  const rowsHtml = (compra.detalles || [])
    .map((d, idx) => {
      const subUsd = d.subtotal ?? d.cantidad * d.costoUnitario;
      const costBs = d.costoUnitario * rate;
      return `
        <tr>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;color:#475569;font-family:monospace;">${idx + 1}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px;">${escapeHtml(d.codigo_barras || `SKU-${d.productoId}`)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(d.productoNombre)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${escapeHtml(d.unidad_medida || 'UND')}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">${d.cantidad}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">$${d.costoUnitario.toFixed(2)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;color:#475569;">Bs. ${costBs.toFixed(2)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${d.exentoIva ? 'EXENTO' : '16%'}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;font-weight:700;">$${subUsd.toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Factura de Compra #${escapeHtml(compra.numeroFactura || String(compra.id))}</title>
  <style>
    @page { size: letter portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px; }
    .badge { display: inline-block; border: 1.5px solid #0f172a; padding: 4px 10px; font-weight: 800; font-size: 13px; letter-spacing: 0.4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #0f172a; color: #ffffff; text-align: left; padding: 7px 8px; font-size: 10.5px; text-transform: uppercase; }
    .totals { width: 340px; margin-left: auto; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #f8fafc; }
    .trow { display: flex; justify-content: space-between; margin-bottom: 4px; font-family: monospace; }
    .tgrand { display: flex; justify-content: space-between; border-top: 2px solid #0f172a; padding-top: 6px; margin-top: 6px; font-size: 15px; font-weight: 800; font-family: monospace; }
    .footer { margin-top: 24px; border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 10.5px; color: #475569; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:18px;font-weight:800;text-transform:uppercase;">${escapeHtml(empresaConfig.nombreEmpresa)}</div>
      <div style="font-weight:700;margin-top:2px;">RIF: ${escapeHtml(empresaConfig.rif)}</div>
      <div style="color:#475569;margin-top:2px;">${escapeHtml(empresaConfig.direccionFiscal || '')}</div>
      <div style="margin-top:4px;font-weight:700;">Almacén / Destino: ${escapeHtml(sucursalNombre)}</div>
    </div>
    <div style="text-align:right;">
      <div class="badge">COMPROBANTE DE COMPRA #${escapeHtml(compra.numeroFactura || String(compra.id))}</div>
      ${compra.numeroControl ? `<div style="margin-top:4px;font-family:monospace;">Nro. Control: ${escapeHtml(compra.numeroControl)}</div>` : ''}
      <div style="margin-top:4px;font-family:monospace;">Fecha Factura: ${escapeHtml(fechaStr)}</div>
    </div>
  </div>

  <div class="grid">
    <div>
      <div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;">Proveedor</div>
      <div style="font-weight:700;font-size:13px;margin-top:2px;">${escapeHtml(compra.proveedorNombre)}</div>
      ${compra.proveedorRif ? `<div style="font-family:monospace;margin-top:2px;">RIF: ${escapeHtml(compra.proveedorRif)}</div>` : ''}
      <div style="margin-top:2px;">Registrado por: ${escapeHtml(compra.usuarioNombre || 'Administrador')}</div>
    </div>
    <div>
      <div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;">Condiciones Financieras</div>
      <div style="margin-top:2px;"><strong>Condición:</strong> ${compra.condicionPago === 'contado' ? 'Contado' : `Crédito${compra.diasCredito ? ` (${compra.diasCredito} días)` : ''}`}</div>
      ${compra.fechaVencimiento ? `<div style="margin-top:2px;"><strong>Vencimiento:</strong> ${escapeHtml(compra.fechaVencimiento)}</div>` : ''}
      <div style="margin-top:2px;font-family:monospace;"><strong>Tasa de Recepción:</strong> Bs. ${rate.toFixed(2)} / USD</div>
      ${compra.condicionPago !== 'contado' ? `<div style="margin-top:2px;font-size:11px;"><strong>Tasa Liquidación:</strong> ${compra.pagarATasaRecepcion ? 'Tasa de recepción' : 'Tasa del día en curso'}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Código</th>
        <th>Artículo</th>
        <th style="text-align:center;">Und</th>
        <th style="text-align:right;">Cant.</th>
        <th style="text-align:right;">Costo $</th>
        <th style="text-align:right;">Costo Bs</th>
        <th style="text-align:center;">IVA</th>
        <th style="text-align:right;">Subtotal $</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="totals">
    <div class="trow"><span>Subtotal Neto:</span><span>$${subtotalNeto.toFixed(2)}</span></div>
    <div class="trow"><span>Monto Exento (0%):</span><span>$${montoExento.toFixed(2)}</span></div>
    <div class="trow"><span>Base Imponible (16%):</span><span>$${baseImp.toFixed(2)}</span></div>
    <div class="trow"><span>IVA Crédito Fiscal (16%):</span><span>$${montoIva.toFixed(2)}</span></div>
    <div class="tgrand"><span>TOTAL FACTURA USD:</span><span>$${compra.total.toFixed(2)}</span></div>
    <div class="tgrand" style="border-top:none;padding-top:2px;margin-top:2px;font-size:13px;"><span>TOTAL BS (Tasa Recepción):</span><span>Bs. ${totalBs.toFixed(2)}</span></div>
  </div>

  <div class="footer">
    Comprobante interno de recepción de mercancía e ingreso a inventario • Impreso el ${new Date().toLocaleString('es-VE')}
  </div>
</body>
</html>`;
}

export function printCompraViaIframe(
  compra: Compra,
  sucursalNombre: string,
  empresaConfig: EmpresaConfig
): Promise<boolean> {
  return printHtmlViaIframe(generateCompraInvoiceHtml(compra, sucursalNombre, empresaConfig));
}
