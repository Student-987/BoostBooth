import { Eye, Plus, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { composePhotosWithFrame, detectPngDimensions, readFileAsDataUrl } from '../../services/composer';
import type { CanvaFrame, FrameSlot } from '../../types';

interface FrameLayoutEditorModalProps {
  open: boolean;
  editingFrame: CanvaFrame | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: Partial<CanvaFrame> & { pngDataUrl?: string }) => Promise<void>;
}

const SAMPLE_TEST_PHOTOS = [
  '/src/assets/images/welcome_studio_hero_1795415053626.jpg',
  '/src/assets/images/welcome_booth_couple_1795415054211.jpg',
  '/src/assets/images/welcome_booth_party_1795415053857.jpg',
];

export function FrameLayoutEditorModal({
  open,
  editingFrame,
  saving,
  onClose,
  onSave,
}: FrameLayoutEditorModalProps) {
  const [frameName, setFrameName] = useState('');
  const [category, setCategory] = useState('Event');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [width, setWidth] = useState(1200);
  const [height, setHeight] = useState(1800);
  const [previewUrl, setPreviewUrl] = useState('');
  const [pngDataUrl, setPngDataUrl] = useState<string | undefined>(undefined);
  const [slots, setSlots] = useState<FrameSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [testCompositeUrl, setTestCompositeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    slotId: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origSlot: FrameSlot;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTestCompositeUrl(null);
    if (editingFrame) {
      setFrameName(editingFrame.frame_name);
      setCategory(editingFrame.category || 'Event');
      setDescription(editingFrame.description || '');
      setIsActive(editingFrame.is_active);
      setWidth(editingFrame.width || 1200);
      setHeight(editingFrame.height || 1800);
      setPreviewUrl(editingFrame.preview_url);
      setPngDataUrl(undefined);
      const copied = (editingFrame.frame_layout || []).map((s) => ({ ...s }));
      setSlots(copied);
      setSelectedSlotId(copied[0]?.id || null);
    } else {
      setFrameName('');
      setCategory('Event');
      setDescription('');
      setIsActive(true);
      setWidth(1200);
      setHeight(1800);
      setPreviewUrl('');
      setPngDataUrl(undefined);
      const initialSlot: FrameSlot = {
        id: 'slot-1',
        label: 'Photo 1',
        x: 8,
        y: 8,
        width: 84,
        height: 72,
        fit: 'cover',
        rotation: 0,
      };
      setSlots([initialSlot]);
      setSelectedSlotId(initialSlot.id);
    }
  }, [open, editingFrame]);

  useEffect(() => {
    const onPointerMove = (ev: PointerEvent) => {
      const drag = dragStateRef.current;
      const stage = stageRef.current;
      if (!drag || !stage) return;

      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dxPct = ((ev.clientX - drag.startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - drag.startY) / rect.height) * 100;

      setSlots((prev) =>
        prev.map((s) => {
          if (s.id !== drag.slotId) return s;
          if (drag.mode === 'move') {
            const nextX = Math.max(0, Math.min(100 - s.width, Number((drag.origSlot.x + dxPct).toFixed(1))));
            const nextY = Math.max(0, Math.min(100 - s.height, Number((drag.origSlot.y + dyPct).toFixed(1))));
            return { ...s, x: nextX, y: nextY };
          } else {
            const nextW = Math.max(5, Math.min(100 - s.x, Number((drag.origSlot.width + dxPct).toFixed(1))));
            const nextH = Math.max(5, Math.min(100 - s.y, Number((drag.origSlot.height + dyPct).toFixed(1))));
            return { ...s, width: nextW, height: nextH };
          }
        })
      );
    };

    const onPointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  if (!open) return null;

  const handlePngUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'image/png') {
      setError('Canva frames must be transparent PNG files (.png).');
      return;
    }
    setError(null);
    const dataUrl = await readFileAsDataUrl(file);
    const dims = await detectPngDimensions(dataUrl);
    setPngDataUrl(dataUrl);
    setPreviewUrl(dataUrl);
    setWidth(dims.width);
    setHeight(dims.height);
    if (!frameName) {
      setFrameName(file.name.replace(/\.png$/i, '').replace(/[_-]+/g, ' '));
    }
  };

  const addSlot = () => {
    const idx = slots.length + 1;
    const newSlot: FrameSlot = {
      id: `slot-${Date.now()}`,
      label: `Photo ${idx}`,
      x: Math.min(70, 8 + ((idx - 1) % 3) * 10),
      y: Math.min(70, 8 + ((idx - 1) % 3) * 10),
      width: 40,
      height: 35,
      fit: 'cover',
      rotation: 0,
    };
    setSlots((prev) => [...prev, newSlot]);
    setSelectedSlotId(newSlot.id);
  };

  const updateSlot = (slotId: string, patch: Partial<FrameSlot>) => {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, ...patch } : s)));
  };

  const removeSlot = (slotId: string) => {
    setSlots((prev) => {
      const next = prev.filter((s) => s.id !== slotId);
      if (selectedSlotId === slotId) {
        setSelectedSlotId(next[0]?.id || null);
      }
      return next;
    });
  };

  const runLiveTestPreview = async () => {
    if (!previewUrl) {
      setError('Upload a transparent PNG frame first to test the composite preview.');
      return;
    }
    setError(null);
    if (testCompositeUrl) {
      setTestCompositeUrl(null);
      return;
    }
    try {
      const tempFrame: CanvaFrame = {
        frame_id: editingFrame?.frame_id || 'PREVIEW',
        frame_name: frameName || 'Preview',
        category,
        description,
        drive_file_id: '',
        preview_url: previewUrl,
        width,
        height,
        frame_layout: slots,
        is_active: isActive,
        created_at: '',
      };
      const result = await composePhotosWithFrame(SAMPLE_TEST_PHOTOS, tempFrame, {
        maxOutputWidth: 800,
        format: 'image/jpeg',
        quality: 0.9,
      });
      setTestCompositeUrl(result.dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.');
    }
  };

  const handleSubmit = async () => {
    if (!frameName.trim()) {
      setError('Please enter a frame name.');
      return;
    }
    if (!previewUrl) {
      setError('Please upload a transparent PNG exported from Canva.');
      return;
    }
    if (slots.length === 0) {
      setError('Add at least one photo slot.');
      return;
    }
    setError(null);
    await onSave({
      frame_id: editingFrame?.frame_id,
      frame_name: frameName.trim(),
      category: category.trim() || 'Event',
      description: description.trim(),
      width,
      height,
      frame_layout: slots,
      is_active: isActive,
      preview_url: editingFrame?.preview_url,
      drive_file_id: editingFrame?.drive_file_id,
      pngDataUrl,
    });
  };

  const selectedSlot = slots.find((s) => s.id === selectedSlotId) || null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-6xl rounded-2xl bg-white text-zinc-900 border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-zinc-900">
              {editingFrame ? 'Edit Canva Frame & Slot Layout' : 'Add New Canva PNG Frame'}
            </h2>
            <p className="text-xs text-zinc-500">
              Upload transparent PNG from Canva and drag/resize percentage photo slots.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
            aria-label="Close frame editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Interactive Canvas Editor */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="min-h-[40px] px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{previewUrl ? 'Replace PNG' : 'Upload Canva PNG'}</span>
                  <input
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={(e) => handlePngUpload(e.target.files?.[0])}
                  />
                </label>

                <button
                  type="button"
                  onClick={addSlot}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-xs font-semibold text-zinc-800 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Photo Slot</span>
                </button>
              </div>

              <button
                type="button"
                onClick={runLiveTestPreview}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border ${
                  testCompositeUrl
                    ? 'bg-amber-100 border-amber-300 text-amber-900'
                    : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{testCompositeUrl ? 'Back to Layout Editor' : 'Preview Composite'}</span>
              </button>
            </div>

            <div className="rounded-2xl border border-zinc-200 checkerboard-bg p-4 flex items-center justify-center min-h-[420px]">
              {!previewUrl ? (
                <div className="text-center max-w-xs">
                  <p className="text-sm font-medium text-zinc-700">No Canva PNG uploaded</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Export your design from Canva with Transparent Background (PNG) and upload here.
                  </p>
                </div>
              ) : testCompositeUrl ? (
                <img
                  src={testCompositeUrl}
                  alt="Test Composite Preview"
                  className="max-h-[520px] max-w-full object-contain rounded-lg shadow-lg"
                />
              ) : (
                <div
                  ref={stageRef}
                  className="relative select-none shadow-lg"
                  style={{
                    aspectRatio: `${width} / ${height}`,
                    maxHeight: '520px',
                    width: width >= height ? '100%' : 'auto',
                    height: height > width ? '500px' : 'auto',
                  }}
                >
                  {/* Draggable Percentage Slots Behind Frame */}
                  {slots.map((slot, index) => {
                    const isSel = slot.id === selectedSlotId;
                    return (
                      <div
                        key={slot.id}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedSlotId(slot.id);
                          dragStateRef.current = {
                            slotId: slot.id,
                            mode: 'move',
                            startX: e.clientX,
                            startY: e.clientY,
                            origSlot: { ...slot },
                          };
                        }}
                        className={`absolute cursor-move flex items-center justify-center transition-colors ${
                          isSel
                            ? 'bg-amber-400/35 border-2 border-amber-500 z-20'
                            : 'bg-sky-500/20 border border-sky-600/70 z-10'
                        }`}
                        style={{
                          left: `${slot.x}%`,
                          top: `${slot.y}%`,
                          width: `${slot.width}%`,
                          height: `${slot.height}%`,
                          transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
                        }}
                      >
                        <span className="px-2 py-0.5 rounded bg-zinc-900/85 text-white font-mono text-[11px]">
                          #{index + 1} {slot.label}
                        </span>

                        {/* Resize Handle */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelectedSlotId(slot.id);
                            dragStateRef.current = {
                              slotId: slot.id,
                              mode: 'resize',
                              startX: e.clientX,
                              startY: e.clientY,
                              origSlot: { ...slot },
                            };
                          }}
                          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-sm bg-amber-500 border border-white cursor-nwse-resize"
                          title="Drag to resize"
                        />
                      </div>
                    );
                  })}

                  {/* Canva PNG Overlay */}
                  <img
                    src={previewUrl}
                    alt="Canva Frame Overlay"
                    className="pointer-events-none relative z-10 w-full h-full object-contain opacity-90"
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-zinc-500 font-mono tabular-nums">
              Canvas Resolution: {width} × {height} px · {slots.length} slot(s)
            </p>
          </div>

          {/* Right: Metadata & Precision Slot Coordinates */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Frame Name</label>
                <input
                  type="text"
                  value={frameName}
                  onChange={(e) => setFrameName(e.target.value)}
                  placeholder="e.g. Gala Gold 3-Strip"
                  className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Portrait, Wedding..."
                    className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-300"
                    />
                    <span>Active in Kiosk</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional note for guests"
                  className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm"
                />
              </div>
            </div>

            <hr className="border-zinc-200" />

            {/* Slot Selector Pills / List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-zinc-900">Photo Slot Coordinates (%)</h3>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {slots.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSlotId(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      s.id === selectedSlotId
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    }`}
                  >
                    Slot {idx + 1}
                  </button>
                ))}
              </div>

              {selectedSlot && (
                <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={selectedSlot.label}
                      onChange={(e) => updateSlot(selectedSlot.id, { label: e.target.value })}
                      className="min-h-[36px] rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeSlot(selectedSlot.id)}
                      disabled={slots.length <= 1}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30"
                      title="Delete slot"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                    <label className="block">
                      <span className="text-zinc-500">X (%)</span>
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={95}
                        value={selectedSlot.x}
                        onChange={(e) => updateSlot(selectedSlot.id, { x: Number(e.target.value) })}
                        className="mt-1 w-full min-h-[36px] rounded-lg border border-zinc-200 bg-white px-2.5"
                      />
                    </label>
                    <label className="block">
                      <span className="text-zinc-500">Y (%)</span>
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={95}
                        value={selectedSlot.y}
                        onChange={(e) => updateSlot(selectedSlot.id, { y: Number(e.target.value) })}
                        className="mt-1 w-full min-h-[36px] rounded-lg border border-zinc-200 bg-white px-2.5"
                      />
                    </label>
                    <label className="block">
                      <span className="text-zinc-500">Width (%)</span>
                      <input
                        type="number"
                        step="0.5"
                        min={5}
                        max={100}
                        value={selectedSlot.width}
                        onChange={(e) => updateSlot(selectedSlot.id, { width: Number(e.target.value) })}
                        className="mt-1 w-full min-h-[36px] rounded-lg border border-zinc-200 bg-white px-2.5"
                      />
                    </label>
                    <label className="block">
                      <span className="text-zinc-500">Height (%)</span>
                      <input
                        type="number"
                        step="0.5"
                        min={5}
                        max={100}
                        value={selectedSlot.height}
                        onChange={(e) => updateSlot(selectedSlot.id, { height: Number(e.target.value) })}
                        className="mt-1 w-full min-h-[36px] rounded-lg border border-zinc-200 bg-white px-2.5"
                      />
                    </label>
                    <label className="block">
                      <span className="text-zinc-500">Rotation (deg)</span>
                      <input
                        type="number"
                        step="1"
                        min={-45}
                        max={45}
                        value={selectedSlot.rotation || 0}
                        onChange={(e) => updateSlot(selectedSlot.id, { rotation: Number(e.target.value) })}
                        className="mt-1 w-full min-h-[36px] rounded-lg border border-zinc-200 bg-white px-2.5"
                      />
                    </label>
                    <label className="block">
                      <span className="text-zinc-500">Crop Fit</span>
                      <select
                        value={selectedSlot.fit || 'cover'}
                        onChange={(e) => updateSlot(selectedSlot.id, { fit: e.target.value as 'cover' | 'contain' })}
                        className="mt-1 w-full min-h-[36px] rounded-lg border border-zinc-200 bg-white px-2 font-sans"
                      >
                        <option value="cover">Cover (Fill Slot)</option>
                        <option value="contain">Contain</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 flex items-center justify-end gap-3 bg-zinc-50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-[44px] px-5 py-2 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="min-h-[44px] px-6 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving Frame...' : 'Save Frame'}
          </button>
        </div>
      </div>
    </div>
  );
}
