import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

interface Props {
  imageSrc: string;
  onCrop: (dataUrl: string) => void;
  onCancel: () => void;
  outputSize?: number;
}

export function ImageCropper({ imageSrc, onCrop, onCancel, outputSize = 128 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [displayW, setDisplayW] = useState(0);
  const [displayH, setDisplayH] = useState(0);

  // Crop square position/size in display coordinates
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropSize, setCropSize] = useState(100);
  const dragging = useRef<{ startX: number; startY: number; origCropX: number; origCropY: number } | null>(null);
  const resizing = useRef<{ startX: number; startY: number; origSize: number } | null>(null);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;

      // Fit image into max 360px display area
      const maxDim = 360;
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const dw = Math.round(img.width * scale);
      const dh = Math.round(img.height * scale);
      setDisplayW(dw);
      setDisplayH(dh);

      // Default crop: largest centered square
      const minDim = Math.min(dw, dh);
      const initialSize = Math.round(minDim * 0.8);
      setCropSize(initialSize);
      setCropX(Math.round((dw - initialSize) / 2));
      setCropY(Math.round((dh - initialSize) / 2));
      setImgLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Draw preview
  useEffect(() => {
    if (!imgLoaded || !canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    canvas.width = displayW;
    canvas.height = displayH;

    // Draw image
    ctx.drawImage(imgRef.current, 0, 0, displayW, displayH);

    // Dim outside crop area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, displayW, cropY);
    ctx.fillRect(0, cropY + cropSize, displayW, displayH - cropY - cropSize);
    ctx.fillRect(0, cropY, cropX, cropSize);
    ctx.fillRect(cropX + cropSize, cropY, displayW - cropX - cropSize, cropSize);

    // Crop border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropSize, cropSize);

    // Corner handles
    const hs = 8;
    ctx.fillStyle = '#fff';
    // Bottom-right resize handle
    ctx.fillRect(cropX + cropSize - hs, cropY + cropSize - hs, hs, hs);
  }, [imgLoaded, displayW, displayH, cropX, cropY, cropSize]);

  const clampCrop = useCallback((x: number, y: number, size: number) => {
    const s = Math.max(32, Math.min(size, displayW, displayH));
    const cx = Math.max(0, Math.min(x, displayW - s));
    const cy = Math.max(0, Math.min(y, displayH - s));
    return { x: cx, y: cy, size: s };
  }, [displayW, displayH]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check if near bottom-right corner (resize)
    const cornerDist = Math.max(Math.abs(mx - (cropX + cropSize)), Math.abs(my - (cropY + cropSize)));
    if (cornerDist < 16) {
      resizing.current = { startX: e.clientX, startY: e.clientY, origSize: cropSize };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Check if inside crop (drag)
    if (mx >= cropX && mx <= cropX + cropSize && my >= cropY && my <= cropY + cropSize) {
      dragging.current = { startX: e.clientX, startY: e.clientY, origCropX: cropX, origCropY: cropY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (resizing.current) {
      const dx = e.clientX - resizing.current.startX;
      const dy = e.clientY - resizing.current.startY;
      const delta = Math.max(dx, dy);
      const { x, y, size } = clampCrop(cropX, cropY, resizing.current.origSize + delta);
      setCropX(x);
      setCropY(y);
      setCropSize(size);
      return;
    }
    if (dragging.current) {
      const dx = e.clientX - dragging.current.startX;
      const dy = e.clientY - dragging.current.startY;
      const { x, y } = clampCrop(dragging.current.origCropX + dx, dragging.current.origCropY + dy, cropSize);
      setCropX(x);
      setCropY(y);
    }
  };

  const handlePointerUp = () => {
    dragging.current = null;
    resizing.current = null;
  };

  const handleConfirm = () => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    const scaleX = img.width / displayW;
    const scaleY = img.height / displayH;

    const sx = cropX * scaleX;
    const sy = cropY * scaleY;
    const sSize = cropSize * Math.min(scaleX, scaleY);

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, outputSize, outputSize);
    onCrop(canvas.toDataURL('image/png'));
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="glass"
        style={{
          padding: '20px',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 'var(--font-md)', fontWeight: 600, color: 'var(--text-primary)' }}>
          Crop Image
        </div>

        {imgLoaded ? (
          <div
            ref={containerRef}
            style={{
              position: 'relative',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              cursor: 'move',
            }}
          >
            <canvas
              ref={canvasRef}
              width={displayW}
              height={displayH}
              style={{ display: 'block' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </div>
        ) : (
          <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Loading...
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!imgLoaded} style={{ flex: 1 }}>
            Crop
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
