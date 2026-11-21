import React, { useState } from 'react';

interface CsvPreviewRow {
  row: number;
  origin: string;
  destination: string;
  equipment: string;
  weight_lbs: number;
  rate_total_usd: number;
  estimated_miles: number;
  rate_per_mile: number;
  pickup_date: string;
  full_or_partial: string;
  external_reference_id?: string;
}

interface InvalidCsvRow {
  row: number;
  errors: string[];
}

interface BrokerIngestionToolsProps {
  isLight: boolean;
  onLoadsPublished: () => void;
  showToast: (msg: string) => void;
}

export const BrokerIngestionTools: React.FC<BrokerIngestionToolsProps> = ({
  isLight,
  onLoadsPublished,
  showToast,
}) => {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewRows, setPreviewRows] = useState<CsvPreviewRow[]>([]);
  const [invalidRows, setInvalidRows] = useState<InvalidCsvRow[]>([]);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const cardBg = isLight
    ? 'bg-white border border-slate-200 text-slate-900 shadow-sm'
    : 'bg-slate-900/90 border border-slate-800 text-slate-100';

  const runDryValidation = async (rawCsv: string) => {
    setValidating(true);
    try {
      const res = await fetch('/api/v1/loads/bulk-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ csv: rawCsv, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'CSV validation failed');
      setPreviewRows(data.valid_preview || []);
      setInvalidRows(data.invalid_rows || []);
      showToast(`Validated CSV: ${data.valid_count || 0} valid row(s), ${data.invalid_count || 0} issue(s).`);
    } catch (err: any) {
      showToast(err?.message || 'Could not parse CSV file');
    } finally {
      setValidating(false);
    }
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || '');
      setCsvText(content);
      runDryValidation(content);
    };
    reader.readAsText(file);
  };

  const handlePublishCsv = async () => {
    if (!csvText.trim()) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/v1/loads/bulk-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ csv: csvText, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk CSV publish failed');
      showToast(data.message || `Published +${data.inserted_count} loads live!`);
      setCsvText('');
      setFileName('');
      setPreviewRows([]);
      setInvalidRows([]);
      onLoadsPublished();
    } catch (err: any) {
      showToast(err?.message || 'Could not publish CSV loads');
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText('loads@loadsnexus.com');
      setCopiedEmail(true);
      showToast('Copied loads@loadsnexus.com to clipboard!');
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      showToast('Forward your load sheet to loads@loadsnexus.com');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. CSV / Excel Drag-and-Drop Bulk Uploader */}
      <div className={`rounded-2xl p-5 ${cardBg}`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-black flex items-center gap-2">
              <span>📊</span>
              <span>Bulk CSV / Sheet Load Uploader</span>
            </h3>
            <p className="text-[11.5px] opacity-70 mt-0.5">
              Upload up to 250 loads at once with instant row-by-row validation &amp; auto-deduplication.
            </p>
          </div>
          <a
            href="/api/v1/loads/csv-template"
            className="px-3 py-1.5 rounded-lg text-[11px] font-extrabold bg-blue-600/10 text-blue-600 border border-blue-500/30 hover:bg-blue-600/20 whitespace-nowrap"
          >
            ⬇ Sample CSV
          </a>
        </div>

        <label
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFile(e.dataTransfer.files?.[0] || null);
          }}
          className={`block border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-emerald-500 bg-emerald-500/10'
              : isLight
              ? 'border-slate-300 hover:border-blue-500 bg-slate-50'
              : 'border-slate-700 hover:border-blue-400 bg-slate-950/60'
          }`}
        >
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
          <div className="text-2xl mb-1">📂</div>
          <div className="text-xs font-extrabold">
            {fileName ? `Loaded: ${fileName}` : 'Drag & drop your CSV load list here, or click to browse'}
          </div>
          <div className="text-[11px] opacity-65 mt-1">
            Auto-maps Origin, Destination, Equipment, Weight, Rate, Miles, Pickup Date &amp; Ref #
          </div>
        </label>

        {validating && (
          <div className="mt-3 text-xs font-bold text-blue-600">⏳ Validating CSV rows...</div>
        )}

        {(previewRows.length > 0 || invalidRows.length > 0) && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-emerald-600">✅ {previewRows.length} valid loads ready</span>
              {invalidRows.length > 0 && (
                <span className="text-rose-600">⚠️ {invalidRows.length} rows have errors</span>
              )}
            </div>
            {previewRows.length > 0 && (
              <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 text-[11px]">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-800">
                    <tr>
                      <th className="p-1.5">Row</th>
                      <th className="p-1.5">Lane</th>
                      <th className="p-1.5">Equip</th>
                      <th className="p-1.5">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 8).map((r) => (
                      <tr key={r.row} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="p-1.5 font-bold">#{r.row}</td>
                        <td className="p-1.5">{r.origin} → {r.destination}</td>
                        <td className="p-1.5">{r.equipment}</td>
                        <td className="p-1.5 font-bold text-emerald-600">${r.rate_total_usd.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              type="button"
              disabled={publishing || previewRows.length === 0}
              onClick={handlePublishCsv}
              className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-extrabold shadow"
            >
              {publishing ? '⏳ Publishing Live...' : `🚀 Publish ${previewRows.length} Valid Loads to LoadsNexus`}
            </button>
          </div>
        )}
      </div>

      {/* 2. AI Email-to-Load Ingestion Card */}
      <div className={`rounded-2xl p-5 flex flex-col justify-between ${cardBg}`}>
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-black flex items-center gap-2">
              <span>🤖</span>
              <span>AI Email-to-Load Auto-Posting</span>
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
              ACTIVE 24/7
            </span>
          </div>
          <p className="text-xs opacity-80 leading-relaxed">
            Forward your daily available load sheet (tables, plain text, or CSV attachment) from your verified brokerage email domain to auto-post up to 50 loads in 30 seconds — zero manual entry!
          </p>

          <div className={`mt-4 p-3.5 rounded-xl border flex items-center justify-between gap-2 ${
            isLight ? 'bg-emerald-50/70 border-emerald-200' : 'bg-emerald-950/40 border-emerald-800'
          }`}>
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Dedicated Broker Ingest Address
              </div>
              <div className="text-sm font-black font-mono text-emerald-800 dark:text-emerald-200 mt-0.5">
                loads@loadsnexus.com
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyEmail}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold whitespace-nowrap"
            >
              {copiedEmail ? '✅ Copied!' : '📋 Copy Address'}
            </button>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] opacity-75">
          <span>✓ Auto-matches your FMCSA MC# by domain</span>
          <span>✓ Auto-deduplicates &amp; expires stale loads in 24h</span>
        </div>
      </div>
    </div>
  );
};
