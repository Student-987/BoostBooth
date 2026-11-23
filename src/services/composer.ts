import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import type { CanvaFrame, FrameSlot } from '../types';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 64)}`));
    img.src = src;
  });
}

function drawCroppedIntoSlot(
  ctx: CanvasRenderingContext2D,
  photo: HTMLImageElement,
  slot: FrameSlot,
  canvasWidth: number,
  canvasHeight: number
) {
  const sx = (slot.x / 100) * canvasWidth;
  const sy = (slot.y / 100) * canvasHeight;
  const sw = (slot.width / 100) * canvasWidth;
  const sh = (slot.height / 100) * canvasHeight;

  if (sw <= 0 || sh <= 0) return;

  ctx.save();
  const cx = sx + sw / 2;
  const cy = sy + sh / 2;
  ctx.translate(cx, cy);
  if (slot.rotation) {
    ctx.rotate((slot.rotation * Math.PI) / 180);
  }
  ctx.beginPath();
  ctx.rect(-sw / 2, -sh / 2, sw, sh);
  ctx.clip();

  const imgW = photo.naturalWidth || photo.width || 1280;
  const imgH = photo.naturalHeight || photo.height || 720;
  const imgRatio = imgW / imgH;
  const slotRatio = sw / sh;

  let drawW = sw;
  let drawH = sh;
  if (slot.fit === 'contain') {
    if (imgRatio > slotRatio) {
      drawW = sw;
      drawH = sw / imgRatio;
    } else {
      drawH = sh;
      drawW = sh * imgRatio;
    }
  } else {
    // Cover crop
    if (imgRatio > slotRatio) {
      drawH = sh;
      drawW = sh * imgRatio;
    } else {
      drawW = sw;
      drawH = sw / imgRatio;
    }
  }

  ctx.drawImage(photo, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

export async function composePhotosWithFrame(
  photoDataUrls: string[],
  frame: CanvaFrame,
  options?: { maxOutputWidth?: number; format?: 'image/jpeg' | 'image/png'; quality?: number }
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const frameImg = await loadImage(frame.preview_url);
  const rawW = frame.width || frameImg.naturalWidth || 1200;
  const rawH = frame.height || frameImg.naturalHeight || 1800;

  const scale =
    options?.maxOutputWidth && rawW > options.maxOutputWidth ? options.maxOutputWidth / rawW : 1;
  const outW = Math.round(rawW * scale);
  const outH = Math.round(rawH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create 2D canvas context.');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, outW, outH);

  const loadedPhotos = await Promise.all(photoDataUrls.map((url) => loadImage(url)));
  const slots = frame.frame_layout && frame.frame_layout.length > 0
    ? frame.frame_layout
    : [{ id: 'slot-1', label: 'Photo 1', x: 5, y: 5, width: 90, height: 90, fit: 'cover' as const }];

  slots.forEach((slot, idx) => {
    const photo = loadedPhotos[idx % loadedPhotos.length];
    if (photo) {
      drawCroppedIntoSlot(ctx, photo, slot, outW, outH);
    }
  });

  // Overlay transparent Canva PNG frame on top
  ctx.drawImage(frameImg, 0, 0, outW, outH);

  const format = options?.format || 'image/jpeg';
  const quality = options?.quality ?? 0.92;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to export composited image.'))),
      format,
      quality
    );
  });

  return {
    blob,
    dataUrl: canvas.toDataURL(format, quality),
    width: outW,
    height: outH,
  };
}

export async function createFramedGif(
  burstsBySlot: string[][],
  frame: CanvaFrame,
  options: { boomerang: boolean; frameDelayMs: number; onProgress?: (pct: number) => void }
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const validSlotBursts = burstsBySlot.filter((arr) => arr.length > 0);
  if (validSlotBursts.length === 0) {
    throw new Error('No frames captured for GIF.');
  }

  const frameImg = await loadImage(frame.preview_url);
  const baseW = frame.width || frameImg.naturalWidth || 1080;
  const baseH = frame.height || frameImg.naturalHeight || 1350;

  // Target crisp 640px width for fast, reliable iPad Safari encoding
  const targetW = Math.min(640, baseW);
  const targetH = Math.round((baseH / baseW) * targetW);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Unable to create 2D canvas context for GIF.');

  const slots = frame.frame_layout && frame.frame_layout.length > 0
    ? frame.frame_layout
    : [{ id: 'slot-1', label: 'Photo 1', x: 5, y: 5, width: 90, height: 90, fit: 'cover' as const }];

  // Build an independent boomerang (or forward) sequence for each slot from its own last-3s burst
  const slotSequences: string[][] = slots.map((_, slotIdx) => {
    const rawBurst = validSlotBursts[slotIdx % validSlotBursts.length];
    return options.boomerang && rawBurst.length > 2
      ? [...rawBurst, ...rawBurst.slice(1, -1).reverse()]
      : rawBurst;
  });

  // Preload all unique frame images once before encoding
  const uniqueUrls = Array.from(new Set(slotSequences.flat()));
  const imageCache = new Map<string, HTMLImageElement>();
  await Promise.all(
    uniqueUrls.map(async (url) => {
      const img = await loadImage(url);
      imageCache.set(url, img);
    })
  );

  const totalFrames = Math.max(...slotSequences.map((s) => s.length));
  const gif = GIFEncoder();

  for (let i = 0; i < totalFrames; i++) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);

    // Draw each slot's own last-3s animation frame into its exact Canva slot
    for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
      const seq = slotSequences[slotIdx];
      const mappedIdx =
        totalFrames > 1 ? Math.round((i / (totalFrames - 1)) * (seq.length - 1)) : 0;
      const photo = imageCache.get(seq[mappedIdx]);
      if (photo) {
        drawCroppedIntoSlot(ctx, photo, slots[slotIdx], targetW, targetH);
      }
    }
    ctx.drawImage(frameImg, 0, 0, targetW, targetH);

    const imageData = ctx.getImageData(0, 0, targetW, targetH);
    const palette = quantize(imageData.data, 256);
    const index = applyPalette(imageData.data, palette);
    gif.writeFrame(index, targetW, targetH, {
      palette,
      delay: options.frameDelayMs,
    });

    if (options.onProgress) {
      options.onProgress(Math.round(((i + 1) / totalFrames) * 100));
    }
    // Yield to browser UI thread on iPad Safari
    await new Promise((r) => setTimeout(r, 0));
  }

  gif.finish();
  const bytes = gif.bytes();
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/gif' });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to encode GIF data URL.'));
    reader.readAsDataURL(blob);
  });

  return { blob, dataUrl, width: targetW, height: targetH };
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

export async function detectPngDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  const img = await loadImage(dataUrl);
  return { width: img.naturalWidth || 1200, height: img.naturalHeight || 1800 };
}

/**
 * Local studio-grade natural portrait retouching (no external AI key required):
 * - Preserves 100% of original facial geometry, pores, expression, and identity
 * - Applies subtle soft-focus skin glow blended lightly over the original detail layer
 * - Adds gentle studio brightness and even midtone balance
 */
export async function applyNaturalPortraitPolish(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || 1280;
  const h = img.naturalHeight || 720;

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = w;
  baseCanvas.height = h;
  const ctx = baseCanvas.getContext('2d');
  if (!ctx) throw new Error('Unable to initialize canvas for portrait polish.');

  // 1. Base crisp layer with gentle natural brightening & even tone
  ctx.filter = 'brightness(1.06) contrast(0.98) saturate(1.04)';
  ctx.drawImage(img, 0, 0, w, h);

  // 2. Soft-focus studio glow layer blended delicately to smooth harsh skin texture without losing pores
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = w;
  blurCanvas.height = h;
  const bCtx = blurCanvas.getContext('2d');
  if (bCtx) {
    bCtx.filter = 'blur(4px) brightness(1.08)';
    bCtx.drawImage(img, 0, 0, w, h);
    ctx.save();
    ctx.filter = 'none';
    ctx.globalAlpha = 0.22;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(blurCanvas, 0, 0, w, h);
    ctx.restore();
  }

  return baseCanvas.toDataURL('image/jpeg', 0.94);
}

