import { useState, useEffect } from 'react';

export default function ApiKeyInput() {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const hasKey = key.trim().length > 0;

  useEffect(() => {
    const stored = localStorage.getItem('irc_api_key') || '';
    setKey(stored);
  }, []);

  function handleSave() {
    localStorage.setItem('irc_api_key', key.trim());
    window.dispatchEvent(new Event('irc-api-key-changed'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleClear() {
    localStorage.removeItem('irc_api_key');
    setKey('');
    window.dispatchEvent(new Event('irc-api-key-changed'));
  }

  return (
    <div className="api-key-input">
      <input
        type="password"
        placeholder="Optional API Key (write access)"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
      />
      <span className={`mode-chip ${hasKey ? 'write' : 'readonly'}`}>
        {hasKey ? 'Write' : 'Readonly'}
      </span>
      <button onClick={handleSave} className="btn-save">
        {saved ? '✓ Saved' : 'Save'}
      </button>
      {key && (
        <button onClick={handleClear} className="btn-clear">
          Clear
        </button>
      )}
    </div>
  );
}
