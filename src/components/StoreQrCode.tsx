import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';

interface StoreQrCodeProps {
  url: string;
  storeName?: string;
  size?: number;
  showDownloadButton?: boolean;
}

export const StoreQrCode: React.FC<StoreQrCodeProps> = ({
  url,
  storeName = 'Tienda Online',
  size = 192,
  showDownloadButton = true,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (!url) {
      setQrDataUrl('');
      return;
    }

    QRCode.toDataURL(url, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#020617',
        light: '#ffffff',
      },
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error('Error generating QR code:', err);
      });

    return () => {
      active = false;
    };
  }, [url]);

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const slug = storeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'tienda';
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `qr-${slug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="bg-white p-3.5 rounded-2xl inline-flex flex-col items-center justify-center shadow-lg border border-slate-200">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`Código QR para abrir ${storeName} en el navegador`}
            style={{ width: size, height: size }}
            className="block rounded-lg"
          />
        ) : (
          <div
            style={{ width: size, height: size }}
            className="flex items-center justify-center bg-slate-100 rounded-lg text-[11px] text-slate-500"
          >
            Generando QR...
          </div>
        )}
        <span className="text-[11px] text-slate-800 font-bold mt-1.5 tracking-tight">
          Escanea con tu cámara para comprar
        </span>
      </div>

      {showDownloadButton && qrDataUrl && (
        <button
          type="button"
          onClick={handleDownloadQr}
          className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Descargar QR (PNG)</span>
        </button>
      )}
    </div>
  );
};
