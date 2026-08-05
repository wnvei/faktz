import { useState, useEffect } from 'react';
import type { AnalysisResponse, ClaimVerification } from './types';
import './sidebar/styles/components.css'; // I will create this next
import { ShieldCheck, ShieldAlert, Shield, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

const API_BASE_URL = 'http://localhost:8000/api';

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);

  useEffect(() => {
    // Automatically extract and analyze when sidebar opens
    analyzeCurrentPage();
  }, []);

  const analyzeCurrentPage = () => {
    setLoading(true);
    setError('');
    
    // Request content script to extract text
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
      if (!tabs[0]?.id) return;
      
      chrome.tabs.sendMessage(
        tabs[0].id, 
        { type: 'EXTRACT_ARTICLE' }, 
        async (response: any) => {
          if (chrome.runtime.lastError || !response) {
            setError('Could not extract article content. Make sure this is a readable webpage.');
            setLoading(false);
            return;
          }
          
          if (response.error) {
            setError(response.error);
            setLoading(false);
            return;
          }
          
          try {
            const apiRes = await fetch(`${API_BASE_URL}/analyze`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: response.url,
                title: response.title,
                textContent: response.textContent,
                htmlContent: response.htmlContent
              })
            });
            
            if (!apiRes.ok) {
              throw new Error('Analysis failed.');
            }
            
            const data: AnalysisResponse = await apiRes.json();
            setAnalysis(data);
            
            // Send highlights back to content script
            const highlightPayload = data.verifications.map(v => {
              const claim = data.article.claims.find(c => c.id === v.claim_id);
              return {
                id: v.claim_id,
                text: claim?.text || '',
                status: v.status
              };
            });
            
            chrome.tabs.sendMessage(tabs[0].id!, { 
              type: 'HIGHLIGHT_CLAIMS', 
              claims: highlightPayload 
            });
            
          } catch (err: any) {
            setError(err.message || 'Error connecting to Faktz API.');
          } finally {
            setLoading(false);
          }
        }
      );
    });
  };

  if (loading) {
    return (
      <div className="flex-center full-height">
        <div className="spinner"></div>
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Analyzing credibility...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="error-box">
          <ShieldAlert size={24} color="var(--status-contradicted-text)" />
          <p>{error}</p>
          <button className="btn-primary" onClick={analyzeCurrentPage}>Try Again</button>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex-center full-height container">
        <h2>Welcome to Faktz</h2>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
          Open a news article to begin automatic credibility analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header score={analysis.overall_score} bias={analysis.article.bias_estimate} />
      
      <div className="section summary-section">
        <h3>Summary</h3>
        <p>{analysis.article.summary}</p>
        <div className="tags">
          {analysis.article.entities.map(e => (
            <span key={e} className="tag">{e}</span>
          ))}
        </div>
      </div>

      <div className="section claims-section">
        <h3>Factual Claims</h3>
        {analysis.verifications.map(v => {
          const claim = analysis.article.claims.find(c => c.id === v.claim_id);
          if (!claim) return null;
          return <ClaimCard key={v.claim_id} claim={claim} verification={v} />;
        })}
      </div>
    </div>
  );
}

function Header({ score, bias }: { score: number, bias: string }) {
  let ScoreIcon = Shield;
  let color = 'var(--text-primary)';
  
  if (score >= 80) {
    ScoreIcon = ShieldCheck;
    color = 'var(--status-verified-text)';
  } else if (score < 50) {
    ScoreIcon = ShieldAlert;
    color = 'var(--status-contradicted-text)';
  } else {
    color = 'var(--status-needs-evidence-text)';
  }

  return (
    <div className="header">
      <div className="score-container" style={{ color }}>
        <ScoreIcon size={32} />
        <span className="score-number">{score}</span>
      </div>
      <div className="meta">
        <div className="meta-item">
          <span className="meta-label">Credibility Score</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Bias Estimate:</span> {bias}
        </div>
      </div>
    </div>
  );
}

function ClaimCard({ claim, verification }: { claim: any, verification: ClaimVerification }) {
  const [expanded, setExpanded] = useState(false);
  
  const statusClass = verification.status.replace(/\s+/g, '-').toLowerCase();

  return (
    <div className={`claim-card ${expanded ? 'expanded' : ''}`}>
      <div className="claim-header" onClick={() => setExpanded(!expanded)}>
        <div className="claim-text-container">
          <span className={`status-badge status-${statusClass}`}>{verification.status}</span>
          <p className="claim-text">{claim.text}</p>
        </div>
        <button className="expand-btn">
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>
      
      {expanded && (
        <div className="claim-details">
          <p className="explanation">{verification.explanation}</p>
          
          <div className="evidence-section">
            <h4>Evidence</h4>
            {verification.supporting_evidence.length > 0 && (
              <div className="evidence-group support">
                <h5>Supporting</h5>
                {verification.supporting_evidence.map(e => (
                   <a key={e.url} href={e.url} target="_blank" rel="noreferrer" className="evidence-link">
                     <ExternalLink size={14} /> {e.publisher}: {e.title}
                   </a>
                ))}
              </div>
            )}
            
            {verification.contradicting_evidence.length > 0 && (
              <div className="evidence-group contradict">
                <h5>Contradicting</h5>
                {verification.contradicting_evidence.map(e => (
                   <a key={e.url} href={e.url} target="_blank" rel="noreferrer" className="evidence-link">
                     <ExternalLink size={14} /> {e.publisher}: {e.title}
                   </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
