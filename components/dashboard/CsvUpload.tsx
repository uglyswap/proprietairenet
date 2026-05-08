'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Download, FileText, X, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface CsvUploadProps {
  onSearch: (searchData: any) => Promise<void> | void;
  loading: boolean;
}

export default function CsvUpload({ onSearch, loading }: CsvUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedAddresses, setParsedAddresses] = useState<Array<{ adresse: string; code_postal: string; ville: string }>>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_ADDRESSES = 200;

  const downloadTemplate = () => {
    const bom = '\uFEFF';
    const content = bom + 'Adresse;Code postal;Ville\n15 rue de Rivoli;75001;Paris\n23 avenue des Champs-\u00C9lys\u00E9es;75008;Paris\n';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-recherche-proprietaire.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const detectSeparator = (headerLine: string): string => {
    const semicolonCount = (headerLine.match(/;/g) || []).length;
    const commaCount = (headerLine.match(/,/g) || []).length;
    return semicolonCount >= commaCount ? ';' : ',';
  };

  const normalizeHeader = (h: string): string => {
    return h.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_')
      .trim();
  };

  const parseCsv = useCallback((text: string) => {
    setParseError(null);
    setTruncated(false);

    const cleaned = text.replace(/^\uFEFF/, '');
    const lines = cleaned.split(/\r?\n/).filter((line) => line.trim() !== '');

    if (lines.length < 2) {
      setParseError('Le fichier doit contenir au moins un en-t\u00EAte et une ligne de donn\u00E9es.');
      setParsedAddresses([]);
      return;
    }

    const sep = detectSeparator(lines[0]);
    const rawHeaders = lines[0].split(sep).map((hdr) => normalizeHeader(hdr));

    const adresseIdx = rawHeaders.findIndex((hdr) => hdr.includes('adresse') && !hdr.includes('postal'));
    const cpIdx = rawHeaders.findIndex((hdr) => (hdr.includes('code') && hdr.includes('postal')) || hdr === 'cp' || hdr === 'code_postal');
    const villeIdx = rawHeaders.findIndex((hdr) => hdr.includes('ville') || hdr.includes('commune') || hdr.includes('city'));

    if (adresseIdx === -1) {
      setParseError('Colonne "Adresse" introuvable. V\u00E9rifiez les en-t\u00EAtes du CSV (Adresse;Code postal;Ville).');
      setParsedAddresses([]);
      return;
    }

    const addresses: Array<{ adresse: string; code_postal: string; ville: string }> = [];
    let wasTruncated = false;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(sep).map((col) => col.trim().replace(/^["']|["']$/g, ''));
      const adresse = cols[adresseIdx] || '';
      if (!adresse) continue;

      if (addresses.length >= MAX_ADDRESSES) {
        wasTruncated = true;
        break;
      }

      addresses.push({
        adresse,
        code_postal: cpIdx !== -1 ? (cols[cpIdx] || '') : '',
        ville: villeIdx !== -1 ? (cols[villeIdx] || '') : '',
      });
    }

    if (addresses.length === 0) {
      setParseError('Aucune adresse valide trouv\u00E9e dans le fichier.');
      setParsedAddresses([]);
      return;
    }

    setTruncated(wasTruncated);
    setParsedAddresses(addresses);
  }, []);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv') && !f.name.endsWith('.txt')) {
      setParseError('Format non support\u00E9. Veuillez utiliser un fichier .csv');
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      parseCsv(text);
    };
    reader.readAsText(f, 'UTF-8');
  }, [parseCsv]);

  const handleDrop = useCallback((ev: React.DragEvent) => {
    ev.preventDefault();
    setDragOver(false);
    const droppedFile = ev.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }, [handleFile]);

  const handleDragOver = useCallback((ev: React.DragEvent) => {
    ev.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((ev: React.DragEvent) => {
    ev.preventDefault();
    setDragOver(false);
  }, []);

  const handleClear = () => {
    setFile(null);
    setParsedAddresses([]);
    setParseError(null);
    setTruncated(false);
    setProcessing(false);
    setProgress(0);
    setProgressLabel('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLaunchSearch = async () => {
    if (parsedAddresses.length === 0) return;
    setProcessing(true);
    setProgress(0);

    const batch = parsedAddresses.map((addr) => {
      const parts = [addr.adresse];
      if (addr.code_postal) parts.push(addr.code_postal);
      if (addr.ville) parts.push(addr.ville);
      return {
        adresse: parts.join(' '),
        code_postal: addr.code_postal,
      };
    });

    setProgressLabel('Envoi de ' + batch.length + ' adresse' + (batch.length > 1 ? 's' : '') + '...');
    setProgress(20);

    try {
      await onSearch(batch);
      setProgress(100);
      setProgressLabel('Termin\u00E9 !');
    } catch (err) {
      setProgressLabel('Erreur lors de la recherche');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={downloadTemplate}
        className="w-full text-xs"
      >
        <Download className="h-3.5 w-3.5 mr-1.5" />
        T\u00E9l\u00E9charger le mod\u00E8le CSV
      </Button>

      {!file ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ' + (
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary/50 hover:bg-gray-50 dark:hover:bg-gray-800'
          )}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            Glissez votre fichier CSV ici
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            ou cliquez pour s\u00E9lectionner
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(ev) => {
              const picked = ev.target.files?.[0];
              if (picked) handleFile(picked);
            }}
          />
        </div>
      ) : (
        <div className="border rounded-lg p-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClear} className="h-6 w-6 p-0">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {parseError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">{parseError}</AlertDescription>
        </Alert>
      )}

      {parsedAddresses.length > 0 && (
        <>
          <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-900 dark:text-green-200">
                {parsedAddresses.length} adresse{parsedAddresses.length > 1 ? 's' : ''} d\u00E9tect\u00E9e{parsedAddresses.length > 1 ? 's' : ''}
              </span>
            </div>

            {truncated && (
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Seules les {MAX_ADDRESSES} premi\u00E8res adresses seront trait\u00E9es.
              </p>
            )}

            <div className="space-y-1 max-h-28 overflow-y-auto">
              {parsedAddresses.slice(0, 5).map((addr, idx) => (
                <p key={idx} className="text-xs text-muted-foreground truncate">
                  {idx + 1}. {addr.adresse}{addr.code_postal ? ', ' + addr.code_postal : ''}{addr.ville ? ' ' + addr.ville : ''}
                </p>
              ))}
              {parsedAddresses.length > 5 && (
                <p className="text-xs text-muted-foreground italic">
                  ... et {parsedAddresses.length - 5} autre{parsedAddresses.length - 5 > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>

          {processing && (
            <div className="space-y-2">
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: progress + '%' }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">{progressLabel}</p>
            </div>
          )}

          <Button
            type="button"
            onClick={handleLaunchSearch}
            disabled={loading || processing}
            className="w-full text-sm"
          >
            {loading || processing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Recherche en cours...
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                {'Lancer la recherche (' + parsedAddresses.length + ' adresse' + (parsedAddresses.length > 1 ? 's' : '') + ')'}
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
