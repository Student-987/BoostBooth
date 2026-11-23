import QRCode from 'qrcode';
import { useEffect, useRef } from 'react';

interface QrCodeCanvasProps {
  value: string;
  size?: number;
  className?: string;
}

export function QrCodeCanvas({ value, size = 240, className = '' }: QrCodeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    QRCode.toCanvas(
      canvas,
      value,
      {
        width: size,
        margin: 2,
        color: {
          dark: '#09090B',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
      },
      () => {}
    );
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`rounded-xl bg-white p-2 ${className}`}
      aria-label="Session download QR code"
    />
  );
}
