import { useRef, useState, type DragEvent } from 'react';
import { errorText } from '../../../../shared/errors';
import { useLoad } from '../../../../shared/hooks';
import { Button, Notice, UsageMeter } from '../../../../shared/ui';
import { formatBytes, UPLOAD_MAX_BYTES, UPLOAD_TYPES, type Asset, type DocumentFile } from '../api/assets';
import { useAssetApis } from '../api/context';
import { formatDate } from './assetFormat';
import { ConfirmDialog } from './UserDialogs';

/** The same checks the server makes, so a wrong file is explained before it is sent. The server still decides. */
export function fileProblem(file: File): string | null {
  if (!UPLOAD_TYPES.includes(file.type)) return `${file.name} isn't a PDF or an image (PNG, JPEG or WebP). Save it as one of those and try again.`;
  if (file.size > UPLOAD_MAX_BYTES) return `${file.name} is ${formatBytes(file.size)}; files can be up to 25 MB. Make it smaller and try again.`;
  return null;
}

const ext = (d: DocumentFile) => (d.fileName.includes('.') ? d.fileName.split('.').pop()!.toUpperCase() : d.contentType.split('/').pop()!.toUpperCase());

export function DocumentsTab({ asset, uploadReason }: { asset: Asset; uploadReason: string | null }) {
  const { documents } = useAssetApis();
  const [docs, reload] = useLoad(() => documents.list(asset.id), [documents, asset.id]);
  const [usage, reloadUsage] = useLoad(() => documents.usage(), [documents]);
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<DocumentFile | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const full = usage.data?.state === 'blocked';
  const reason = uploadReason ?? (full ? "Your plan's storage is full. Delete files you no longer need, or ask your Owner about a bigger plan." : null);
  const rows = docs.data ?? [];

  async function upload(files: File[]) {
    setProblems([]);
    setMessage(null);
    const found: string[] = [];
    let added = 0;
    for (const file of files) {
      const problem = fileProblem(file);
      if (problem) {
        found.push(problem);
        continue;
      }
      setUploading(file.name);
      try {
        await documents.upload(asset.id, file);
        added++;
      } catch (err) {
        found.push(errorText(err, `${file.name} could not be uploaded.`));
      }
    }
    setUploading(null);
    setProblems(found);
    if (added) setMessage(added === 1 ? 'The file was uploaded.' : `${added} files were uploaded.`);
    reload();
    reloadUsage();
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (reason) return;
    void upload([...e.dataTransfer.files]);
  };

  async function download(d: DocumentFile) {
    setLinkError(null);
    try {
      const link = await documents.link(d.id);
      window.open(link.url, '_blank', 'noopener');
    } catch (err) {
      setLinkError(errorText(err, `${d.fileName} could not be opened.`));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {message ? <Notice kind="ok" action={<Button size="sm" onClick={() => setMessage(null)}>Dismiss</Button>}>{message}</Notice> : null}
      {problems.length ? <Notice kind="error">{problems.map((p) => <p key={p}>{p}</p>)}</Notice> : null}
      {linkError ? <Notice kind="error">{linkError}</Notice> : null}

      <div
        className="dropzone"
        data-dragging={dragging || undefined}
        aria-disabled={reason ? true : undefined}
        onDragOver={(e) => { e.preventDefault(); if (!reason) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <strong>{uploading ? `Uploading ${uploading}…` : 'Drop files here'}</strong>
        <span className="muted">PDF, PNG, JPEG or WebP, up to 25 MB each.</span>
        <Button disabledReason={reason} busy={Boolean(uploading)} onClick={() => input.current?.click()}>Choose files</Button>
        <input ref={input} type="file" multiple hidden accept={UPLOAD_TYPES.join(',')} aria-label="Choose files to upload"
          onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; void upload(files); }} />
        {usage.data ? (
          <div style={{ width: '100%', maxWidth: 320 }}>
            <span className="tile-label">Storage on your plan</span>
            <UsageMeter label="Storage" used={Math.round(usage.data.usedBytes / 1024 ** 2)} limit={Math.round(usage.data.limitBytes / 1024 ** 2)} state={usage.data.state} />
            <span className="muted" style={{ fontSize: 12 }}>{formatBytes(usage.data.usedBytes)} of {formatBytes(usage.data.limitBytes)} used (MB shown)</span>
          </div>
        ) : null}
        {usage.status === 'error' ? <span className="muted" style={{ fontSize: 12 }}>Storage use didn't load: {usage.error.message}</span> : null}
      </div>

      <section className="card" aria-label="Documents and photos">
        {docs.status === 'error' ? <div style={{ padding: 16 }}><Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>Documents didn't load: {docs.error.message}</Notice></div> : null}
        {docs.status === 'loading' && rows.length === 0 ? <p className="muted" style={{ padding: 16, margin: 0 }}>Loading documents…</p> : null}
        {docs.status === 'ready' && rows.length === 0 ? <div className="empty"><strong>No documents yet</strong><span>Add manuals, certificates or photos of the nameplate.</span></div> : null}
        {rows.length > 0 ? (
          <ul className="doc-list">
            {rows.map((d) => (
              <li key={d.id}>
                <span className="mono doc-ext">{ext(d)}</span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flexGrow: 1 }}>
                  <strong style={{ overflowWrap: 'anywhere' }}>{d.fileName}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>{formatBytes(d.sizeBytes)} · {d.uploadedByName} · {formatDate(d.uploadedAt)}</span>
                </span>
                <Button size="sm" aria-label={`Download ${d.fileName}`} onClick={() => download(d)}>Download</Button>
                <Button size="sm" variant="danger" aria-label={`Delete ${d.fileName}`} disabledReason={uploadReason} onClick={() => setDeleting(d)}>Delete</Button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {deleting ? (
        <ConfirmDialog title={`Delete ${deleting.fileName}?`} action="Delete file" danger description="It is removed from this asset for everyone and frees its storage. This can't be undone."
          onClose={() => setDeleting(null)}
          run={async () => { await documents.remove(deleting.id); setDeleting(null); setMessage(`${deleting.fileName} was deleted.`); reload(); reloadUsage(); }} />
      ) : null}
    </div>
  );
}
