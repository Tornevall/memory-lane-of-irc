import { isTrustedNoKeyHost } from '../services/authMode';
import { hasConfiguredApiKey } from '../services/apiKey';

export default function ApiKeyInput() {
  const trustedNoKeyHost = isTrustedNoKeyHost();
  const hasKey = hasConfiguredApiKey();

  return (
    <div className="api-key-input">
      <input
        type="password"
        placeholder={trustedNoKeyHost ? 'API key via .env (optional here)' : 'API key via .env'}
        value={hasKey ? 'configured-in-env' : ''}
        readOnly
      />
      <span className={`mode-chip ${hasKey ? 'write' : 'readonly'}`}>
        {hasKey || trustedNoKeyHost ? 'Write' : 'Readonly'}
      </span>
      <span className="api-key-note">.env</span>
    </div>
  );
}
