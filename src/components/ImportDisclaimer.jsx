import { useState } from 'react';
import './ImportDisclaimer.css';

export default function ImportDisclaimer() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="import-disclaimer-collapsible">
      <button 
        type="button"
        className="disclaimer-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        title="Show/hide import limitations"
      >
        <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
        <span className="toggle-text">⚠️ Import Limitations</span>
      </button>
      
      {isExpanded && (
        <div className="disclaimer-content">
          <p>
            Our IRC log import process uses duplicate detection to maintain data quality. 
            This may filter legitimate repeated content:
          </p>
          <ul>
            <li><strong>Minute-level precision:</strong> Logs with HH:MM timestamps only cannot distinguish messages within the same minute</li>
            <li><strong>Spam & flooding:</strong> Repeated content from the same user within the same minute may be deduplicated</li>
            <li><strong>Cross-import duplicates:</strong> Re-importing the same log file will be filtered</li>
          </ul>
          <p className="disclaimer-note">
            💡 <strong>Tip:</strong> Logs with second-level precision (HH:MM:SS) provide significantly better coverage.
          </p>
        </div>
      )}
    </div>
  );
}
