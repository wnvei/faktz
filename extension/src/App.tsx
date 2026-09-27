import { useState, useEffect } from 'react';
import type { AnalysisResponse, ClaimVerification } from './types';
import './sidebar/styles/components.css';
import { ShieldCheck, ShieldAlert, Shield, ChevronDown, ChevronUp, ExternalLink, RefreshCw, Zap, Eye, AlertTriangle } from 'lucide-react';

const API_BASE_URL = 'http://localhost:8000/api';

const safe = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

// ─── Animated Score Ring (Hero) ───────────────────────────────────────────────
function ScoreRing({ score }: { score: any }) {
  const numScore = Number(score) || 0;
  const radius = 64;
  const strokeW = 10;
  const circumference = 2 * Math.PI * radius;
  const [animated, setAnimated] = useState(0);
  const offset = circumference - (animated / 100) * circumference;
  const size = (radius + strokeW) * 2;

  let color = '#fbbf24';
  let label = 'Mixed';
  let sublabel = 'Some claims need review';
  if (numScore >= 80) { color = '#34d399'; label = 'Credible'; sublabel = 'Well-supported by evidence'; }
  else if (numScore < 50) { color = '#f87171'; label = 'Unreliable'; sublabel = 'Key claims contradicted'; }

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(numScore), 120);
    return () => clearTimeout(timer);
  }, [numScore]);

  return (
    <div className="score-hero-ring" style={{ '--score-color': color } as React.CSSProperties}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeW} />
        {/* Progress */}
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{
            transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: `drop-shadow(0 0 12px ${color}99)`
          }}
        />
      </svg>
      <div className="score-hero-inner">
        <span className="score-hero-number" style={{ color }}>{numScore}</span>
        <span className="score-hero-label" style={{ color }}>{label}</span>
        <span className="score-hero-sublabel">{sublabel}</span>
      </div>
    </div>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────
function SkeletonLoader() {
  return (
    <div className="skeleton-container">
      <div className="skeleton-header">
        <div className="skeleton-circle" />
        <div className="skeleton-lines">
          <div className="skeleton-line w-60" />
          <div className="skeleton-line w-40" />
        </div>
      </div>
      <div className="skeleton-block" />
      <div className="skeleton-block short" />
      {[1,2,3].map(i => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton-line w-20" />
          <div className="skeleton-line w-80" />
          <div className="skeleton-line w-60" />
        </div>
      ))}
      <div className="loading-status">
        <div className="pulse-dot" />
        <span>Analyzing article credibility...</span>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'deep-dive'>('overview');

  useEffect(() => { analyzeCurrentPage(); }, []);

  const analyzeCurrentPage = () => {
    setLoading(true);
    setError('');
    setAnalysis(null);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
      if (!tabs[0]?.id) { setLoading(false); return; }

      chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_ARTICLE' }, async (response: any) => {
        if (chrome.runtime.lastError || !response) {
          setError('Could not extract article content. Make sure this is a news article page.');
          setLoading(false);
          return;
        }
        if (response.error) {
          setError(safe(response.error));
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

          if (!apiRes.ok) throw new Error('Analysis failed. Server returned an error.');

          const data: AnalysisResponse = await apiRes.json();
          setAnalysis(data);

          const highlightPayload = data.verifications.map(v => {
            const claim = data.article.claims.find(c => c.id === v.claim_id);
            return { id: v.claim_id, text: claim?.text || '', status: v.status };
          });
          chrome.tabs.sendMessage(tabs[0].id!, { type: 'HIGHLIGHT_CLAIMS', claims: highlightPayload });

        } catch (err: any) {
          setError(safe(err.message) || 'Could not connect to Faktz backend.');
        } finally {
          setLoading(false);
        }
      });
    });
  };

  if (loading) return <SkeletonLoader />;

  if (error) {
    return (
      <div className="error-container">
        <div className="error-icon-wrap">
          <ShieldAlert size={28} />
        </div>
        <h3>Analysis Failed</h3>
        <p>{error}</p>
        <button className="btn-retry" onClick={analyzeCurrentPage}>
          <RefreshCw size={14} /> Try Again
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="welcome-container">
        <div className="welcome-icon"><Zap size={32} /></div>
        <h2>Faktz</h2>
        <p>Open any news article to automatically analyze its credibility, verify claims, and detect bias.</p>
      </div>
    );
  }

  return (
    <div className="app-root">
      {/* ── Hero Header ── */}
      <div className="app-header">
        <button className="refresh-btn" onClick={analyzeCurrentPage} title="Re-analyze">
          <RefreshCw size={14} />
        </button>
        <ScoreRing score={analysis.overall_score} />
        <div className="header-chips">
          <div className="bias-chip">{safe(analysis.article.bias_estimate)}</div>
          {analysis.article.is_satire && (
            <div className="satire-chip"><AlertTriangle size={12} /> Satire</div>
          )}
        </div>
        <p className="score-explanation">{safe(analysis.score_explanation)}</p>
      </div>

      {/* ── Tabs ── */}
      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          <Shield size={13} /> Overview
        </button>
        <button className={`tab-btn ${activeTab === 'deep-dive' ? 'active' : ''}`} onClick={() => setActiveTab('deep-dive')}>
          <Eye size={13} /> Deep Dive
        </button>
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          <div className="card">
            <div className="card-label">Summary</div>
            <p className="summary-text">{safe(analysis.article.summary)}</p>
            {Array.isArray(analysis.article.entities) && analysis.article.entities.length > 0 && (
              <div className="tags">
                {analysis.article.entities.slice(0, 6).map((e, i) => (
                  <span key={i} className="tag">{safe(e)}</span>
                ))}
              </div>
            )}
          </div>

          <div className="claims-header">
            <span className="claims-title">Verified Claims</span>
            <span className="claims-badge">{analysis.verifications.length}</span>
          </div>

          <div className="claims-list">
            {analysis.verifications.map(v => {
              const claim = analysis.article.claims.find(c => c.id === v.claim_id);
              if (!claim) return null;
              return <ClaimCard key={v.claim_id} claim={claim} verification={v} />;
            })}
          </div>
        </div>
      )}

      {/* ── Deep Dive Tab ── */}
      {activeTab === 'deep-dive' && (
        <div className="tab-content">
          {Array.isArray(analysis.article.key_takeaways) && analysis.article.key_takeaways.length > 0 && (
            <div className="card">
              <div className="card-label">Key Takeaways</div>
              <ul className="takeaway-list">
                {analysis.article.key_takeaways.map((pt, i) => (
                  <li key={i}><span className="takeaway-dot" />{safe(pt)}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <div className="card-label">Emotional Language</div>
            {Array.isArray(analysis.article.emotional_language) && analysis.article.emotional_language.length > 0 ? (
              <div className="tags">
                {analysis.article.emotional_language.map((phrase, i) => (
                  <span key={i} className="tag tag-warn">"{safe(phrase)}"</span>
                ))}
              </div>
            ) : (
              <div className="clean-signal">
                <ShieldCheck size={14} /> No manipulative language detected
              </div>
            )}
          </div>

          {Array.isArray(analysis.article.entities) && analysis.article.entities.length > 0 && (
            <div className="card">
              <div className="card-label">All Entities</div>
              <div className="tags">
                {analysis.article.entities.map((e, i) => (
                  <span key={i} className="tag">{safe(e)}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Claim Card ───────────────────────────────────────────────────────────────
function ClaimCard({ claim, verification }: { claim: any; verification: ClaimVerification }) {
  const [open, setOpen] = useState(false);
  const status = safe(verification.status);
  const statusKey = status.toLowerCase().replace(/\s+/g, '-');
  const conf = Number(verification.confidence) || 0;

  return (
    <div className={`claim-card ${open ? 'open' : ''} status-bg-${statusKey}`}>
      <div className="claim-top" onClick={() => setOpen(o => !o)}>
        <div className="claim-left">
          <span className={`status-pill status-${statusKey}`}>{status}</span>
          <p className="claim-text">{safe(claim.text)}</p>
        </div>
        <div className="claim-right">
          <div className="conf-bar-wrap" title={`${conf}% confidence`}>
            <div className="conf-bar" style={{ height: `${conf}%`, background: getConfColor(conf) }} />
          </div>
          <button className="expand-btn">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
        </div>
      </div>

      {open && (
        <div className="claim-body">
          <p className="explanation">{safe(verification.explanation)}</p>

          {verification.supporting_evidence && verification.supporting_evidence.length > 0 && (
            <div className="evidence-group">
              <div className="evidence-group-label support">Supporting</div>
              {verification.supporting_evidence.map((e, i) => (
                <a key={i} href={typeof e.url === 'string' ? e.url : '#'} target="_blank" rel="noreferrer" className="evidence-link">
                  <ExternalLink size={12} />
                  <span>{safe(e.publisher)} — {safe(e.title)}</span>
                </a>
              ))}
            </div>
          )}

          {verification.contradicting_evidence && verification.contradicting_evidence.length > 0 && (
            <div className="evidence-group">
              <div className="evidence-group-label contradict">Contradicting</div>
              {verification.contradicting_evidence.map((e, i) => (
                <a key={i} href={typeof e.url === 'string' ? e.url : '#'} target="_blank" rel="noreferrer" className="evidence-link">
                  <ExternalLink size={12} />
                  <span>{safe(e.publisher)} — {safe(e.title)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getConfColor(conf: number) {
  if (conf >= 75) return '#34d399';
  if (conf >= 45) return '#fbbf24';
  return '#f87171';
}

export default App;
