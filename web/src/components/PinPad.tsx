import { useEffect, useState } from 'react';

interface Props {
  onSubmit(pin: string): void;
  busy?: boolean;
  /** Auto-submit as soon as this many digits are entered. */
  length?: number;
}

export function PinPad({ onSubmit, busy, length = 4 }: Props) {
  const [pin, setPin] = useState('');

  const press = (d: string) => {
    if (busy) return;
    setPin((p) => (p.length < length ? p + d : p));
  };

  useEffect(() => {
    if (pin.length === length) {
      onSubmit(pin);
      setPin('');
    }
  }, [pin, length, onSubmit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="pinpad">
      <div className="pin-dots" aria-label={`Введено цифр: ${pin.length}`}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={i < pin.length ? 'filled' : ''} />
        ))}
      </div>
      <div className="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)} disabled={busy}>{d}</button>
        ))}
        <button className="pin-aux" onClick={() => setPin('')} disabled={busy}>C</button>
        <button onClick={() => press('0')} disabled={busy}>0</button>
        <button className="pin-aux" onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy} aria-label="Стереть">⌫</button>
      </div>
    </div>
  );
}
