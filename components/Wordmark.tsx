/**
 * The event name in the record-form style: "SAMAGGI" in the accent colour, the rest in white.
 * Works with any event name that starts with "Samaggi"; other names are shown as they are.
 */
export function Wordmark({ name, className }: { name?: string | null; className?: string }) {
  const text = name?.trim() || 'Samaggi University Challenge';
  const m = text.match(/^(samaggi)(\s+)([\s\S]*)$/i);
  return (
    <span className={`wordmark ${className ?? ''}`}>
      {m ? <><span className="wm-a">{m[1]}</span>{m[2]}<span className="wm-b">{m[3]}</span></> : <span className="wm-b">{text}</span>}
    </span>
  );
}
