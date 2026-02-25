import { useState } from 'react';

export default function ApiKeyInput() {
  const [key, setKey] = useState(
    () => localStorage.getItem('irc_api_key') || import.meta.env.VITE_API_TOKEN || ''
  );
  const [saved, setSaved] = useState(false);

  function handleSave() {
    localStorage.setItem('irc_api_key', key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleClear() {
    localStorage.removeItem('irc_api_key');
    setKey(import.meta.env.VITE_API_TOKEN || '');
  }

  return (
    <div className="api-key-input">
      <input
        type="password"
        placeholder="Enter API Key"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
      />
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
