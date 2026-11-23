import { Check, Copy, Download, FileCode2, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminApi } from '../../services/apiClient';
import type { GasProjectFile } from '../../types';

export function GasExportToolkit() {
  const [files, setFiles] = useState<GasProjectFile[]>([]);
  const [bridgeScript, setBridgeScript] = useState('');
  const [selectedName, setSelectedName] = useState('Code.gs');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .getGasExportFiles()
      .then((res) => {
        setFiles(res.files);
        setBridgeScript(res.bridgeScript);
        if (res.files.length > 0) setSelectedName(res.files[0].name);
      })
      .finally(() => setLoading(false));
  }, []);

  const currentContent =
    selectedName === 'sony-bridge-server.mjs'
      ? bridgeScript
      : files.find((f) => f.name === selectedName)?.content || '';

  const currentDesc =
    selectedName === 'sony-bridge-server.mjs'
      ? 'Run this Node.js script on a Mac/PC/Raspberry Pi connected to your Sony DSLR via USB-C (gphoto2) or Wi-Fi.'
      : files.find((f) => f.name === selectedName)?.description || '';

  const copyCode = async () => {
    await navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const downloadFile = (name: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="p-8 text-sm text-zinc-500">Loading GAS & Sony Bridge files...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-5">
        <h2 className="font-display text-lg font-bold text-zinc-900">
          2-File Google Apps Script Edition (Code.gs + Index.html)
        </h2>
        <p className="mt-1 text-sm text-zinc-600 leading-relaxed">
          Your entire Google Sheets + Drive + QR Download backend fits in just 2 files:{' '}
          <span className="font-mono text-zinc-900">Code.gs</span> and{' '}
          <span className="font-mono text-zinc-900">Index.html</span> at{' '}
          <span className="font-mono text-zinc-900">script.google.com</span>. Run{' '}
          <span className="font-mono text-zinc-900">initializeDatabase()</span>, deploy as a Web App
          (Execute as: Me, Who has access: Anyone), and paste the URL into <strong>Settings</strong>.
          The optional <span className="font-mono text-zinc-900">sony-bridge-server.mjs</span> file is
          only needed on a Mac/PC if controlling a Sony DSLR over USB-C.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* File List */}
        <div className="lg:col-span-4 rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600">
            Project Files ({files.length + 1})
          </div>
          <div className="divide-y divide-zinc-100 max-h-[540px] overflow-y-auto">
            {files.map((file) => (
              <button
                key={file.name}
                type="button"
                onClick={() => setSelectedName(file.name)}
                className={`w-full text-left px-4 py-3 flex items-center gap-2.5 text-sm transition-colors ${
                  selectedName === file.name
                    ? 'bg-zinc-900 text-white font-medium'
                    : 'text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <FileCode2 className="w-4 h-4 shrink-0 opacity-75" />
                <span className="font-mono text-xs truncate">{file.name}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setSelectedName('sony-bridge-server.mjs')}
              className={`w-full text-left px-4 py-3 flex items-center gap-2.5 text-sm transition-colors ${
                selectedName === 'sony-bridge-server.mjs'
                  ? 'bg-zinc-900 text-white font-medium'
                  : 'text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <Server className="w-4 h-4 shrink-0 opacity-75" />
              <span className="font-mono text-xs truncate">sony-bridge-server.mjs</span>
            </button>
          </div>
        </div>

        {/* Code Viewer */}
        <div className="lg:col-span-8 rounded-xl border border-zinc-200 bg-white overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold text-zinc-900">{selectedName}</p>
              <p className="text-xs text-zinc-500 truncate">{currentDesc}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyCode}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-medium text-zinc-700 inline-flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={() => downloadFile(selectedName, currentContent)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-white inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
          </div>

          <pre className="p-4 text-xs font-mono text-zinc-800 bg-zinc-50/50 overflow-auto max-h-[500px] leading-relaxed">
            {currentContent}
          </pre>
        </div>
      </div>
    </div>
  );
}
