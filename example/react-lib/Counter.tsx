import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', fontFamily: 'sans-serif' }}>
      <button
        onClick={() => setCount((n) => n - 1)}
        style={{ padding: '0.25rem 0.75rem', cursor: 'pointer' }}
      >
        −
      </button>
      <span style={{ minWidth: '2rem', textAlign: 'center', fontWeight: 'bold' }}>{count}</span>
      <button
        onClick={() => setCount((n) => n + 1)}
        style={{ padding: '0.25rem 0.75rem', cursor: 'pointer' }}
      >
        +
      </button>
    </div>
  );
}
