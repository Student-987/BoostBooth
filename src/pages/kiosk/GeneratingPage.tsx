import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { kioskApi } from '../../services/apiClient';
import { composePhotosWithFrame, createFramedGif } from '../../services/composer';
import type { BoothSession, CanvaFrame, MediaItem } from '../../types';

interface GeneratingPageProps {
  selectedFrame: CanvaFrame;
  capturedPhotos: string[];
  gifBurstsBySlot: string[][];
  onComplete: (result: { session: BoothSession; media: MediaItem[] }) => void;
  onBackToPreview: () => void;
}

type StepStatus = 'pending' | 'active' | 'done' | 'error';

interface PipelineStep {
  id: string;
  label: string;
  status: StepStatus;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function GeneratingPage({
  selectedFrame,
  capturedPhotos,
  gifBurstsBySlot,
  onComplete,
  onBackToPreview,
}: GeneratingPageProps) {
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: 'session', label: 'Creating Session', status: 'pending' },
    { id: 'compose', label: 'Rendering Photo & GIF', status: 'pending' },
    { id: 'upload', label: 'Saving Files', status: 'pending' },
    { id: 'qr', label: 'Generating QR Code', status: 'pending' },
  ]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gifProgress, setGifProgress] = useState<number>(0);

  const sessionRef = useRef<BoothSession | null>(null);
  const outputsRef = useRef<{ photoBlob: Blob; gifBlob: Blob | null } | null>(null);
  const startedRef = useRef(false);

  const setStepStatus = (id: string, status: StepStatus) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const runPipeline = useCallback(async () => {
    setErrorMsg(null);

    try {
      setStepStatus('session', 'active');
      if (!sessionRef.current) {
        const res = await kioskApi.createSession({
          selected_frame_id: selectedFrame.frame_id,
          shooting_mode: 'photo+gif',
        });
        sessionRef.current = res.session;
      }
      const session = sessionRef.current;
      setStepStatus('session', 'done');

      setStepStatus('compose', 'active');
      if (!outputsRef.current) {
        const composed = await composePhotosWithFrame(capturedPhotos, selectedFrame, {
          format: 'image/jpeg',
          quality: 0.94,
        });

        let gifBlob: Blob | null = null;
        const burstSource =
          gifBurstsBySlot.length > 0
            ? gifBurstsBySlot
            : capturedPhotos.map((p) => [p]);
        if (burstSource.length > 0) {
          const gif = await createFramedGif(burstSource, selectedFrame, {
            boomerang: true,
            frameDelayMs: 140,
            onProgress: (pct) => setGifProgress(pct),
          });
          gifBlob = gif.blob;
        }
        outputsRef.current = { photoBlob: composed.blob, gifBlob };
      }
      setStepStatus('compose', 'done');

      setStepStatus('upload', 'active');
      for (let i = 0; i < capturedPhotos.length; i++) {
        const rawBlob = dataUrlToBlob(capturedPhotos[i]);
        await kioskApi.uploadMediaWithRetry({
          session_id: session.session_id,
          media_type: 'original',
          file_name: `${session.session_id}_original_${i + 1}.jpg`,
          mime_type: rawBlob.type || 'image/jpeg',
          blob: rawBlob,
          upload_key: `${session.session_id}:original:${i + 1}`,
        });
      }

      const { photoBlob, gifBlob } = outputsRef.current;
      await kioskApi.uploadMediaWithRetry({
        session_id: session.session_id,
        media_type: 'framed',
        file_name: `${session.session_id}_framed.jpg`,
        mime_type: 'image/jpeg',
        blob: photoBlob,
        upload_key: `${session.session_id}:framed:main`,
      });

      if (gifBlob) {
        await kioskApi.uploadMediaWithRetry({
          session_id: session.session_id,
          media_type: 'gif',
          file_name: `${session.session_id}_boomerang.gif`,
          mime_type: 'image/gif',
          blob: gifBlob,
          upload_key: `${session.session_id}:gif:main`,
        });
      }
      setStepStatus('upload', 'done');

      setStepStatus('qr', 'active');
      const finalized = await kioskApi.finalizeSession(session.session_id);
      setStepStatus('qr', 'done');

      onComplete(finalized);
    } catch (err) {
      setSteps((prev) =>
        prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' } : s))
      );
      setErrorMsg(err instanceof Error ? err.message : 'Processing failed.');
    }
  }, [capturedPhotos, gifBurstsBySlot, onComplete, selectedFrame]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runPipeline();
  }, [runPipeline]);

  const completedCount = steps.filter((s) => s.status === 'done').length;
  const pct = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl bg-[#FBF9FA] border border-[#EFEAEC] p-8 shadow-lg">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-zinc-950">Preparing Files</h1>
          <span className="font-mono text-sm text-[#7A1C2C] font-semibold tabular-nums">{pct}%</span>
        </div>

        <div className="mt-4 h-2 w-full rounded-full bg-[#EFEAEC] overflow-hidden">
          <div
            className="h-full bg-[#7A1C2C] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-8 space-y-4">
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex items-center justify-between gap-3 py-2 border-b border-[#EFEAEC] last:border-b-0"
            >
              <div className="flex items-center gap-3">
                {step.status === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                {step.status === 'active' && <Loader2 className="w-5 h-5 text-[#7A1C2C] animate-spin shrink-0" />}
                {step.status === 'error' && <AlertCircle className="w-5 h-5 text-[#7A1C2C] shrink-0" />}
                {step.status === 'pending' && (
                  <div className="w-5 h-5 rounded-full border border-[#D8CDD1] shrink-0" />
                )}
                <span
                  className={`text-sm font-medium ${
                    step.status === 'pending' ? 'text-zinc-400' : 'text-zinc-900'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {step.id === 'compose' && step.status === 'active' && (
                <span className="font-mono text-xs text-[#7A1C2C] font-semibold tabular-nums">{gifProgress}%</span>
              )}
            </div>
          ))}
        </div>

        {errorMsg && (
          <div className="mt-6 rounded-xl bg-[#FDF2F4] border border-[#7A1C2C]/30 p-4">
            <p className="text-sm text-[#7A1C2C]">{errorMsg}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={runPipeline}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#7A1C2C] text-white font-semibold text-sm inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry</span>
              </button>
              <button
                type="button"
                onClick={onBackToPreview}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E5DADF] bg-white text-sm text-zinc-800"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
