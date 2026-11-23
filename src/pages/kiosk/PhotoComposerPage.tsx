import { ArrowRight, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { composePhotosWithFrame } from '../../services/composer';
import type { CanvaFrame } from '../../types';

interface PhotoComposerPageProps {
  selectedFrame: CanvaFrame;
  capturedPhotos: string[];
  gifBurstsBySlot: string[][];
  onContinue: () => void;
}

export function PhotoComposerPage({
  selectedFrame,
  capturedPhotos,
  gifBurstsBySlot,
  onContinue,
}: PhotoComposerPageProps) {
  const [compositeUrl, setCompositeUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const [activeTab, setActiveTab] = useState<'photo' | 'gif'>('photo');
  const [gifTick, setGifTick] = useState(0);

  useEffect(() => {
    let active = true;
    if (capturedPhotos.length > 0) {
      setRendering(true);
      composePhotosWithFrame(capturedPhotos, selectedFrame, {
        maxOutputWidth: 1000,
        format: 'image/jpeg',
        quality: 0.9,
      })
        .then((res) => {
          if (active) setCompositeUrl(res.dataUrl);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setRendering(false);
        });
    } else {
      setRendering(false);
    }
    return () => {
      active = false;
    };
  }, [capturedPhotos, selectedFrame]);

  const slots =
    selectedFrame.frame_layout && selectedFrame.frame_layout.length > 0
      ? selectedFrame.frame_layout
      : [{ id: 'slot-1', label: 'Photo 1', x: 5, y: 5, width: 90, height: 90, fit: 'cover' as const }];

  const slotSequences: string[][] = slots.map((_, slotIdx) => {
    const raw =
      gifBurstsBySlot[slotIdx] && gifBurstsBySlot[slotIdx].length > 0
        ? gifBurstsBySlot[slotIdx]
        : capturedPhotos[slotIdx]
          ? [capturedPhotos[slotIdx]]
          : gifBurstsBySlot[0] || [];
    return raw.length > 2 ? [...raw, ...raw.slice(1, -1).reverse()] : raw;
  });

  const maxGifFrames = Math.max(1, ...slotSequences.map((s) => s.length));

  useEffect(() => {
    if (activeTab !== 'gif' || maxGifFrames <= 1) return;
    const timer = window.setInterval(() => {
      setGifTick((t) => (t + 1) % maxGifFrames);
    }, 140);
    return () => window.clearInterval(timer);
  }, [activeTab, maxGifFrames]);

  const frameAspect = `${selectedFrame.width || 960} / ${selectedFrame.height || 1200}`;

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col">
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-4 border-b border-[#EFEAEC]">
        <span className="text-xs font-medium text-zinc-500">{selectedFrame.frame_name}</span>

        <h1 className="font-display text-xl sm:text-2xl font-bold text-zinc-950">Preview</h1>

        <button
          type="button"
          onClick={onContinue}
          className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white font-display font-bold text-sm inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <span>Create QR</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-8 flex flex-col items-center gap-6">
        <div className="inline-flex rounded-xl border border-[#EFEAEC] bg-[#FBF9FA] p-1">
          <button
            type="button"
            onClick={() => setActiveTab('photo')}
            className={`min-h-[42px] px-5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'photo'
                ? 'bg-[#7A1C2C] text-white shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Photo
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gif')}
            className={`min-h-[42px] px-5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'gif'
                ? 'bg-[#7A1C2C] text-white shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            GIF
          </button>
        </div>

        <div className="w-full max-w-md rounded-3xl bg-[#FBF9FA] border border-[#EFEAEC] p-4 flex items-center justify-center shadow-sm">
          {activeTab === 'photo' ? (
            rendering ? (
              <div className="aspect-[4/5] w-full flex items-center justify-center text-sm text-zinc-500">
                Loading...
              </div>
            ) : compositeUrl ? (
              <img
                src={compositeUrl}
                alt="Framed Photo"
                className="w-full max-h-[60vh] object-contain rounded-2xl shadow-md"
              />
            ) : null
          ) : (
            <div
              className="relative w-full max-h-[60vh] bg-white rounded-2xl overflow-hidden shadow-md"
              style={{ aspectRatio: frameAspect }}
            >
              {slots.map((slot, slotIdx) => {
                const seq = slotSequences[slotIdx] || [];
                if (seq.length === 0) return null;
                const mappedIdx =
                  maxGifFrames > 1
                    ? Math.round((gifTick / (maxGifFrames - 1)) * (seq.length - 1))
                    : 0;
                const frameSrc = seq[mappedIdx] || seq[0];
                return (
                  <div
                    key={slot.id}
                    className="absolute overflow-hidden"
                    style={{
                      left: `${slot.x}%`,
                      top: `${slot.y}%`,
                      width: `${slot.width}%`,
                      height: `${slot.height}%`,
                      transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
                    }}
                  >
                    <img
                      src={frameSrc}
                      alt={`GIF Slot ${slotIdx + 1}`}
                      className={`w-full h-full ${slot.fit === 'contain' ? 'object-contain' : 'object-cover'}`}
                    />
                  </div>
                );
              })}
              <img
                src={selectedFrame.preview_url}
                alt={selectedFrame.frame_name}
                className="absolute inset-0 w-full h-full object-fill pointer-events-none z-10"
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="min-h-[60px] w-full max-w-md rounded-2xl bg-[#7A1C2C] hover:bg-[#611421] text-white font-display font-bold text-lg inline-flex items-center justify-center gap-2 transition-colors shadow-xl shadow-[#7A1C2C]/20"
        >
          <Check className="w-5 h-5" />
          <span>Save &amp; Get QR Code</span>
        </button>
      </main>
    </div>
  );
}
