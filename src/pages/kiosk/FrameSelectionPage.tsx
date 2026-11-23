import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CanvaFrame } from '../../types';

interface FrameSelectionPageProps {
  frames: CanvaFrame[];
  selectedFrameId: string | null;
  onSelectFrame: (frame: CanvaFrame) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function FrameSelectionPage({
  frames,
  selectedFrameId,
  onSelectFrame,
  onBack,
  onContinue,
}: FrameSelectionPageProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const categories = useMemo(() => {
    const unique = Array.from(new Set(frames.map((f) => f.category || 'General')));
    return ['All', ...unique];
  }, [frames]);

  const filteredFrames = useMemo(() => {
    if (categoryFilter === 'All') return frames;
    return frames.filter((f) => (f.category || 'General') === categoryFilter);
  }, [frames, categoryFilter]);

  const selectedFrame = frames.find((f) => f.frame_id === selectedFrameId) || null;

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col">
      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4 border-b border-[#EFEAEC]">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[48px] px-4 py-2 rounded-xl border border-[#E5DADF] bg-white hover:bg-[#FDF2F4] text-sm font-medium text-zinc-800 hover:text-[#7A1C2C] inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <h1 className="font-display text-xl sm:text-2xl font-bold text-zinc-950">
          Choose Frame
        </h1>

        <button
          type="button"
          onClick={onContinue}
          disabled={!selectedFrame}
          className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white font-display font-bold text-sm inline-flex items-center gap-2 transition-colors disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
        >
          <span>Next</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6 flex flex-col gap-6">
        {/* Category Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => {
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#7A1C2C] text-white'
                    : 'bg-[#FBF9FA] text-zinc-700 border border-[#EFEAEC] hover:border-[#7A1C2C]/40'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Frames Grid */}
        {filteredFrames.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-center border border-dashed border-[#E5DADF] rounded-2xl bg-[#FBF9FA]">
            <p className="text-lg font-medium text-zinc-800">No active frames</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-24">
            {filteredFrames.map((frame) => {
              const isSelected = frame.frame_id === selectedFrameId;
              const slotCount = frame.frame_layout?.length || 1;
              return (
                <button
                  key={frame.frame_id}
                  type="button"
                  onClick={() => onSelectFrame(frame)}
                  className={`group text-left rounded-2xl p-4 transition-all border flex flex-col ${
                    isSelected
                      ? 'bg-[#FDF2F4] border-[#7A1C2C] ring-2 ring-[#7A1C2C]/25 shadow-sm'
                      : 'bg-white border-[#EFEAEC] hover:border-[#7A1C2C]/50'
                  }`}
                >
                  <div className="relative w-full aspect-[4/5] rounded-xl overflow-hidden checkerboard-bg border border-[#EFEAEC] flex items-center justify-center p-3">
                    <img
                      src={frame.preview_url}
                      alt={frame.frame_name}
                      referrerPolicy="no-referrer"
                      className="max-w-full max-h-full object-contain drop-shadow-md"
                    />
                    {isSelected && (
                      <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-[#7A1C2C] text-white flex items-center justify-center shadow-lg">
                        <Check className="w-5 h-5 stroke-[2.5]" />
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <h2 className="font-display text-lg font-semibold text-zinc-950 truncate">
                      {frame.frame_name}
                    </h2>
                    <span className="text-xs font-medium text-[#7A1C2C] shrink-0">
                      {slotCount} {slotCount === 1 ? 'Shot' : 'Shots'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom Sticky Bar */}
      {selectedFrame && (
        <div className="sticky bottom-0 z-20 border-t border-[#EFEAEC] bg-white/95 backdrop-blur-md px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <p className="font-display font-semibold text-zinc-950 truncate">
              {selectedFrame.frame_name}
            </p>
            <button
              type="button"
              onClick={onContinue}
              className="min-h-[52px] px-8 py-3 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white font-display font-bold text-base inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Open Camera</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
