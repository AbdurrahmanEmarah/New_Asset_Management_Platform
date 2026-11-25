import { useId, useState } from 'react';
import { Button } from './Button';

/** A link shown once (e.g. an invitation) with a Copy button. Selecting the text works as a fallback. */
export function CopyLink({ url, label }: { url: string; label: string }) {
  const id = useId();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input id={id} className="input mono" readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 13 }} />
        <Button onClick={copy}>{state === 'copied' ? 'Copied' : 'Copy link'}</Button>
      </div>
      <span className="field-hint" role="status">
        {state === 'failed' ? "This browser didn't allow copying. Select the link and copy it yourself." : state === 'copied' ? 'The link is on your clipboard.' : ''}
      </span>
    </div>
  );
}
