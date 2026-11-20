/**
 * Venezuelan Fiscal & Commercial Validation Library
 * Handles RIF/Cédula, Phone Numbers (+58), and Financial Amounts
 */

export interface ValidationResult<T = string> {
  isValid: boolean;
  value: T;
  formatted: string;
  error?: string;
}

/**
 * Validates and formats Venezuelan Cédulas and RIFs
 * Allowed prefixes: V (Venezolano), E (Extranjero), J (Jurídico), G (Gubernamental), P (Pasaporte)
 * Formats: V-12345678, J-12345678-9, J-123456789, E-81234567
 */
export function validateVenezuelanFiscalId(rawInput: string): ValidationResult {
  if (!rawInput || !rawInput.trim()) {
    return {
      isValid: false,
      value: '',
      formatted: '',
      error: 'El número de RIF o Cédula es obligatorio.',
    };
  }

  // Clean characters: keep only alphanumeric
  const cleaned = rawInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Extract letter prefix and numbers
  const match = cleaned.match(/^([VEJGP])?(\d{6,10})$/);

  if (!match) {
    return {
      isValid: false,
      value: cleaned,
      formatted: rawInput.trim().toUpperCase(),
      error: 'Formato inválido. Debe comenzar con V-, E-, J-, G- o P- seguido de 6 a 9 dígitos (ejemplo: V-14235890 o J-30123456-1).',
    };
  }

  const prefix = match[1] || 'V'; // Default to V if only numbers were typed
  const digits = match[2];

  let formatted = '';
  if (prefix === 'J' || prefix === 'G') {
    // For Jurídico or Gubernamental with check digit (if 9 or 10 digits)
    if (digits.length >= 9) {
      formatted = `${prefix}-${digits.slice(0, digits.length - 1)}-${digits.slice(-1)}`;
    } else {
      formatted = `${prefix}-${digits}`;
    }
  } else {
    formatted = `${prefix}-${digits}`;
  }

  return {
    isValid: true,
    value: formatted,
    formatted,
  };
}

/**
 * Validates and normalizes Venezuelan phone numbers
 * Supported prefixes:
 * - Mobile: 0412, 0414, 0424, 0416, 0426
 * - Major Landline: 0212, 0241, 0243, 0251, 0261, 0274, 0281, etc.
 * Formats:
 * - Local formatted: 0414-1234567
 * - International WhatsApp standard: +584141234567
 */
export function validateVenezuelanPhone(rawInput: string): ValidationResult<{
  local: string;
  international: string;
  digits: string;
}> {
  if (!rawInput || !rawInput.trim()) {
    return {
      isValid: false,
      value: { local: '', international: '', digits: '' },
      formatted: '',
      error: 'El número de teléfono es obligatorio.',
    };
  }

  // Strip non-digits
  let digits = rawInput.replace(/\D/g, '');

  // If starts with 58 (Venezuela international code) and has 12 digits, strip leading 58
  if (digits.startsWith('58') && digits.length === 12) {
    digits = '0' + digits.slice(2);
  }

  // If typed without leading 0 (e.g. 4141234567, 10 digits), prepend 0
  if (digits.length === 10 && (digits.startsWith('4') || digits.startsWith('2'))) {
    digits = '0' + digits;
  }

  if (digits.length !== 11) {
    return {
      isValid: false,
      value: { local: rawInput, international: '', digits },
      formatted: rawInput,
      error: 'El teléfono debe tener 11 dígitos con código de área (ejemplo: 0414-1234567 o 0212-9876543).',
    };
  }

  const prefix = digits.slice(0, 4);
  const validPrefixes = [
    // Mobile (Digitel, Movistar, Movilnet)
    '0412', '0414', '0424', '0416', '0426',
    // Landlines
    '0212', '0241', '0242', '0243', '0244', '0245', '0246', '0247', '0248', '0249',
    '0251', '0252', '0253', '0254', '0255', '0256', '0257', '0258', '0259',
    '0261', '0262', '0263', '0264', '0265', '0266', '0267', '0268', '0269',
    '0271', '0272', '0273', '0274', '0275', '0276', '0277', '0278', '0279',
    '0281', '0282', '0283', '0284', '0285', '0286', '0287', '0288', '0289',
    '0291', '0292', '0293', '0294', '0295'
  ];

  if (!validPrefixes.includes(prefix)) {
    return {
      isValid: false,
      value: { local: rawInput, international: '', digits },
      formatted: rawInput,
      error: `El prefijo "${prefix}" no corresponde a una operadora móvil (0412, 0414, 0424, 0416, 0426) o código de área venezolano válido.`,
    };
  }

  const local = `${prefix}-${digits.slice(4)}`;
  const international = `+58${digits.slice(1)}`;

  return {
    isValid: true,
    value: { local, international, digits },
    formatted: local,
  };
}

/**
 * Validates non-negative commercial amounts
 */
export function validatePositiveAmount(
  val: any,
  fieldName = 'El monto',
  allowZero = false
): { isValid: boolean; value: number; error?: string } {
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, '.'));

  if (isNaN(num) || !isFinite(num)) {
    return {
      isValid: false,
      value: 0,
      error: `${fieldName} debe ser un valor numérico válido.`,
    };
  }

  if (allowZero ? num < 0 : num <= 0) {
    return {
      isValid: false,
      value: num,
      error: `${fieldName} debe ser ${allowZero ? 'mayor o igual a cero (≥ 0)' : 'estrictamente mayor a cero (> 0)'}.`,
    };
  }

  return {
    isValid: true,
    value: Number(num.toFixed(4)),
  };
}

/**
 * Basic HTML / script sanitization to prevent XSS in customer names, addresses and notes
 */
export function sanitizeText(text: string, maxLength = 300): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/[<>]/g, '') // Strip < and > tags
    .slice(0, maxLength);
}

/**
 * Normalizes a Venezuelan RIF for supplier deduplication/matching.
 * Returns '' for empty or placeholder RIFs (e.g. J-00000000-0).
 */
export function normalizeSupplierRifKey(rif?: string | null): string {
  if (!rif) return '';
  const cleaned = rif.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned || cleaned === 'NA' || /^[VEJGP]?0+$/.test(cleaned)) {
    return '';
  }
  return cleaned;
}

/**
 * Normalizes a supplier business name for reliable matching despite casing,
 * accents, punctuation, or corporate suffixes (C.A., S.A., S.R.L., etc.).
 */
export function normalizeSupplierNameKey(name?: string | null): string {
  if (!name) return '';
  const noAccents = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return noAccents
    .replace(/[.,;:'"()\-_/\\&]+/g, ' ')
    .replace(/\b(c\s*a|s\s*a|s\s*r\s*l|ca|sa|srl|ltda|llc|inc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds an existing supplier matching either normalized RIF or normalized business name.
 */
export function findMatchingProveedor<T extends { id: number; nombre: string; rif: string }>(
  proveedores: T[],
  nombre?: string | null,
  rif?: string | null
): T | undefined {
  const targetRif = normalizeSupplierRifKey(rif);
  const targetName = normalizeSupplierNameKey(nombre);

  if (targetRif) {
    const byRif = proveedores.find((p) => normalizeSupplierRifKey(p.rif) === targetRif);
    if (byRif) return byRif;
  }

  if (!targetName || targetName === 'proveedor nuevo' || targetName === 'proveedor de la factura') {
    return undefined;
  }

  const rifConflict = (p: T) => {
    const existingRif = normalizeSupplierRifKey(p.rif);
    return Boolean(targetRif && existingRif && targetRif !== existingRif);
  };

  // Exact normalized name match
  const exactByName = proveedores.find(
    (p) => !rifConflict(p) && normalizeSupplierNameKey(p.nombre) === targetName
  );
  if (exactByName) return exactByName;

  // Safe containment match for longer company names (e.g. shortened branch/commercial variations)
  if (targetName.length >= 6) {
    return proveedores.find((p) => {
      if (rifConflict(p)) return false;
      const pName = normalizeSupplierNameKey(p.nombre);
      return pName.length >= 6 && (pName.includes(targetName) || targetName.includes(pName));
    });
  }

  return undefined;
}

/**
 * Merges duplicate supplier entries that share the same normalized RIF or business name.
 * Returns deduplicated list plus a map from duplicateId -> surviving canonicalId.
 */
export function deduplicateProveedoresList<
  T extends {
    id: number;
    nombre: string;
    rif: string;
    contacto: string;
    telefono: string;
    email?: string;
    direccion?: string;
    saldoPendiente: number;
  }
>(proveedores: T[]): { proveedores: T[]; idMap: Map<number, number>; mergedCount: number } {
  const deduped: T[] = [];
  const idMap = new Map<number, number>();
  let mergedCount = 0;

  for (const item of proveedores) {
    const existingIdx = deduped.findIndex((canonical) => {
      const matched = findMatchingProveedor([canonical], item.nombre, item.rif);
      return Boolean(matched);
    });

    if (existingIdx < 0) {
      deduped.push({ ...item });
      idMap.set(item.id, item.id);
    } else {
      mergedCount += 1;
      const canonical = deduped[existingIdx];
      idMap.set(item.id, canonical.id);

      const canonicalRif = normalizeSupplierRifKey(canonical.rif);
      const itemRif = normalizeSupplierRifKey(item.rif);
      const isGenericName = (n?: string) => {
        const k = normalizeSupplierNameKey(n);
        return !k || k === 'proveedor nuevo' || k === 'proveedor de la factura';
      };

      deduped[existingIdx] = {
        ...canonical,
        nombre:
          isGenericName(canonical.nombre) && !isGenericName(item.nombre)
            ? item.nombre
            : canonical.nombre,
        rif: !canonicalRif && itemRif ? item.rif : canonical.rif,
        contacto:
          (!canonical.contacto || canonical.contacto === 'Contacto Factura' || canonical.contacto === 'N/A') &&
          item.contacto &&
          item.contacto !== 'Contacto Factura' &&
          item.contacto !== 'N/A'
            ? item.contacto
            : canonical.contacto,
        telefono:
          (!canonical.telefono || canonical.telefono === 'N/A') && item.telefono && item.telefono !== 'N/A'
            ? item.telefono
            : canonical.telefono,
        email: canonical.email || item.email,
        direccion:
          (!canonical.direccion || canonical.direccion === 'Venezuela') && item.direccion && item.direccion !== 'Venezuela'
            ? item.direccion
            : canonical.direccion,
        saldoPendiente: +((canonical.saldoPendiente || 0) + (item.saldoPendiente || 0)).toFixed(2),
      };
    }
  }

  return { proveedores: deduped, idMap, mergedCount };
}

