import { useState, useEffect } from 'react';
import type { AnalysisResponse, ClaimVerification } from './types';
import './sidebar/styles/components.css';
import { ChevronDown, ExternalLink, ShieldAlert, Zap, Check } from 'lucide-react';

const API_BASE_URL = 'http://localhost:8000/api';

const safe = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

// credibility_score & confidence come from backend as 0-100 integers.
// Normalize to 0-100 for display, 0-1 for bar widths.
const norm100 = (n: number | undefined | null): number =>
  n == null ? 50 : n > 1 ? Math.min(n, 100) : Math.round(n * 100);



function statusStyle(status: string): { barCls: string; badgeCls: string } {
  if (status.includes('Verified'))
    return { barCls: 'green', badgeCls: 'green' };
  if (['Contradicted', 'Misleading', 'Out of Context'].includes(status))
    return { barCls: 'red', badgeCls: 'red' };
  if (['Needs More Evidence', 'Opinion'].includes(status))
    return { barCls: 'dim', badgeCls: 'dim' };
  return { barCls: 'amber', badgeCls: 'amber' };
}

// ─── Loading ─────────────────────────────────────────────────────────────────
function LoadingState() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setStep(1), 1200),
      setTimeout(() => setStep(2), 2800),
      setTimeout(() => setStep(3), 4400),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  const steps = [
    'Extracting claims',
    'Cross-referencing sources',
    'Scoring credibility',
    'Building report',
  ];

  return (
    <div className="loading">
      <div className="loading-wordmark">Faktz</div>
      <div className="loading-track">
        <div className="loading-fill" />
      </div>
      <div className="loading-steps">
        {steps.map((label, i) => (
          <div
            key={i}
            className={`loading-step${step > i ? ' done' : step === i ? ' active' : ''}`}
          >
            <div className="step-pip">
              {step > i && <Check size={8} strokeWidth={3} />}
            </div>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Confidence bar ───────────────────────────────────────────────────────────
// confidence comes from backend as 0-100 integer
function ConfBar({ value }: { value: number }) {
  const pct = norm100(value);
  const cls = pct >= 65 ? 'high' : pct >= 35 ? 'medium' : 'low';
  return (
    <div className="confidence-row">
      <span className="confidence-label">Confidence</span>
      <div className="confidence-track">
        <div className={`confidence-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="confidence-val">{pct}%</span>
    </div>
  );
}

// ─── Claim Row ────────────────────────────────────────────────────────────────
function ClaimRow({ claim, verification }: { claim: any; verification: ClaimVerification }) {
  const [open, setOpen] = useState(false);
  const status = safe(verification.status);
  const { barCls, badgeCls } = statusStyle(status);

  return (
    <div className={`claim-row${open ? ' open' : ''}`}>
      <div className="claim-header" onClick={() => setOpen(o => !o)}>
        <div className={`claim-bar ${barCls}`} />
        <div className="claim-body">
          <div className="claim-badges">
            <span className={`badge ${badgeCls}`}>{status}</span>
            {claim.type && claim.type !== 'Fact' && <span className="badge dim">{claim.type}</span>}
            {verification.contradiction_type && (
              <span className="badge red">{verification.contradiction_type}</span>
            )}
            {verification.temporal_verification && verification.temporal_verification !== 'Current' && (
              <span className="badge amber">Outdated info</span>
            )}
            {verification.scope_expansion && (
              <span className="badge amber">Overgeneralized</span>
            )}
          </div>
          <p className="claim-text">{safe(claim.text)}</p>
        </div>
        <ChevronDown size={15} className="chevron" />
      </div>

      {open && (
        <div className="claim-details">
          {verification.confidence != null && <ConfBar value={verification.confidence} />}
          <div className="claim-explanation">{safe(verification.explanation)}</div>

          {verification.temporal_verification && verification.temporal_verification !== 'Current' && (
            <div className="warn-banner temporal">⚠ {verification.temporal_verification}</div>
          )}
          {verification.scope_expansion && (
            <div className="warn-banner scope">⚠ {verification.scope_expansion}</div>
          )}

          {(verification.supporting_evidence?.length ?? 0) > 0 && (
            <div className="source-group">
              <div className="source-group-label color-green">Supporting</div>
              {verification.supporting_evidence!.map((ev, i) => (
                <a key={i} href={typeof ev.url === 'string' ? ev.url : '#'}
                  target="_blank" rel="noreferrer" className="source-row">
                  <div className="source-info">
                    <div className="source-pub">{safe(ev.publisher)}</div>
                    <div className="source-title">{safe(ev.title)}</div>
                  </div>
                  <ExternalLink size={13} className="source-ext" />
                </a>
              ))}
            </div>
          )}

          {(verification.contradicting_evidence?.length ?? 0) > 0 && (
            <div className="source-group">
              <div className="source-group-label color-red">Contradicting</div>
              {verification.contradicting_evidence!.map((ev, i) => (
                <a key={i} href={typeof ev.url === 'string' ? ev.url : '#'}
                  target="_blank" rel="noreferrer" className="source-row">
                  <div className="source-info">
                    <div className="source-pub">{safe(ev.publisher)}</div>
                    <div className="source-title">{safe(ev.title)}</div>
                  </div>
                  <ExternalLink size={13} className="source-ext" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  INTEL TAB — genuinely novel features
// ═══════════════════════════════════════════════════════════

/**
 * Source Table — replaces the unreadable SVG network graph.
 * Lists every unique source with its role, credibility bar, and claim count.
 * Sorted: contradicting first (most important), then by credibility desc.
 */
function SourceTable({ verifications }: { verifications: ClaimVerification[] }) {
  type Row = { publisher: string; url: string; title: string; credibility: number; role: 'For' | 'Against'; claimCount: number; };
  const map = new Map<string, Row>();

  verifications.forEach(v => {
    const addSrc = (ev: any, role: 'For' | 'Against') => {
      const key = safe(ev.publisher) || safe(ev.url);
      if (!key) return;
      if (map.has(key)) { map.get(key)!.claimCount++; }
      else map.set(key, { publisher: safe(ev.publisher) || key, url: safe(ev.url), title: safe(ev.title), credibility: norm100(ev.credibility_score), role, claimCount: 1 });
    };
    (v.supporting_evidence ?? []).forEach(ev => addSrc(ev, 'For'));
    (v.contradicting_evidence ?? []).forEach(ev => addSrc(ev, 'Against'));
  });

  const rows = [...map.values()]
    .sort((a, b) => { if (a.role !== b.role) return a.role === 'Against' ? -1 : 1; return b.credibility - a.credibility; })
    .slice(0, 10);

  if (rows.length === 0) return null;

  return (
    <div>
      <div className="section-label">Sources Consulted</div>
      <div className="source-table">
        {rows.map((row, i) => {
          const isAgainst = row.role === 'Against';
          const barColor = isAgainst ? 'var(--red)' : 'var(--green)';
          return (
            <div key={i} className="source-table-row">
              <div className="source-table-top">
                <span className={`source-role-tag ${isAgainst ? 'red' : 'green'}`}>{row.role}</span>
                <a href={row.url} target="_blank" rel="noreferrer" className="source-table-name">
                  {row.publisher}
                  <ExternalLink size={10} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '3px' }} />
                </a>
                {row.claimCount > 1 && <span className="source-claim-count">{row.claimCount} claims</span>}
              </div>
              {row.title && <div className="source-table-title">{row.title.slice(0, 75)}{row.title.length > 75 ? '…' : ''}</div>}
              <div className="source-cred-row">
                <span className="source-cred-label">Credibility</span>
                <div className="source-cred-track">
                  <div className="source-cred-fill" style={{ width: `${row.credibility}%`, background: barColor }} />
                </div>
                <span className="source-cred-val">{row.credibility}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}




/**
 * Claim Credibility Line
 * confidence from backend is 0-100 int. Normalize to 0-1 for chart Y.
 */
function ClaimECG({ verifications }: { verifications: ClaimVerification[] }) {
  if (verifications.length < 2) return null;

  const W = 280, H = 72, padX = 6, padY = 8;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const pts = verifications.map((v, i) => {
    // confidence is 0-100 int; derive from status if missing/zero
    let conf = norm100(v.confidence);
    if (conf === 0) {
      const s = safe(v.status);
      if (s === 'Verified') conf = 90;
      else if (s === 'Partially Verified') conf = 65;
      else if (s === 'Needs More Evidence' || s === 'Opinion') conf = 35;
      else if (['Contradicted', 'Misleading', 'Out of Context'].includes(s)) conf = 15;
      else conf = 50;
    }
    const x = padX + (i / Math.max(verifications.length - 1, 1)) * innerW;
    const y = padY + (1 - conf / 100) * innerH;
    return { x, y, conf, status: safe(v.status) };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length-1].x.toFixed(1)},${H-padY} L${pts[0].x.toFixed(1)},${H-padY} Z`;

  const dotColor = (status: string) => {
    if (status.includes('Verified') && !status.includes('Partially')) return 'var(--green)';
    if (['Contradicted', 'Misleading', 'Out of Context'].includes(status)) return 'var(--red)';
    if (status === 'Partially Verified') return 'var(--amber)';
    return 'var(--text-muted)';
  };

  const highY = padY;
  const lowY  = H - padY;

  return (
    <div>
      <div className="section-label">Claim Confidence — Reading Order</div>
      <div className="ecg-wrapper">
        <svg viewBox={`0 0 ${W} ${H}`} className="ecg-svg" style={{ height: `${H}px` }}>
          <defs>
            <linearGradient id="ecgGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--green)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--green)" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {/* Y axis labels */}
          <text x={padX - 2} y={highY + 4} textAnchor="end" fontSize="7" fill="var(--text-muted)" fontFamily="Inter">High</text>
          <text x={padX - 2} y={lowY + 1} textAnchor="end" fontSize="7" fill="var(--text-muted)" fontFamily="Inter">Low</text>
          {/* Mid baseline */}
          <line x1={padX} y1={(highY+lowY)/2} x2={W-padX} y2={(highY+lowY)/2}
            stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" />
          {/* Area */}
          <path d={areaPath} fill="url(#ecgGrad)" />
          {/* Line */}
          <path d={linePath} fill="none" stroke="var(--green)" strokeWidth="1.5"
            strokeOpacity="0.6" strokeLinejoin="round" />
          {/* Dots */}
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3.5"
              fill={dotColor(verifications[i] ? safe(verifications[i].status) : '')}
              stroke="var(--bg)" strokeWidth="1.5" />
          ))}
        </svg>
        <div className="ecg-labels">
          <span className="ecg-label">Claim 1</span>
          <span className="ecg-label">Claim {verifications.length}</span>
        </div>
      </div>
      <p style={{ fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '8px' }}>
        Each dot is one claim in the order it appears. A sharp dip usually marks where a disputed or unsupported claim is embedded in the article.
      </p>
    </div>
  );
}

/**
 * Source Quality Matrix
 * credibility_score from backend is 0-100 int — use norm100() to normalize.
 */
function SourceQuality({ verifications }: { verifications: ClaimVerification[] }) {
  const sup = verifications.flatMap(v => v.supporting_evidence ?? []);
  const con = verifications.flatMap(v => v.contradicting_evidence ?? []);

  const avg = (arr: typeof sup) => {
    const s = arr.map(e => norm100(e.credibility_score)).filter((n): n is number => n != null);
    return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
  };

  const supAvg = avg(sup);  // already 0-100
  const conAvg = avg(con);

  if (supAvg === null && conAvg === null) return null;

  const primaryCount = [...sup, ...con].filter(e => e.is_primary_source).length;
  const indepCount   = [...sup, ...con].filter(e => e.is_independent !== false).length;

  let verdict = '';
  if (supAvg !== null && conAvg !== null) {
    if (conAvg > supAvg + 15) verdict = 'Higher-quality sources push back on this article — worth investigating further.';
    else if (supAvg > conAvg + 15) verdict = 'The sources backing this article score higher than those against it.';
    else verdict = 'Supporting and contradicting sources are of similar quality.';
  }

  return (
    <div>
      <div className="section-label">Source Quality</div>
      <div className="quality-rows">
        {supAvg !== null && (
          <div className="quality-row">
            <span className="quality-label">Sources for ({sup.length})</span>
            <div className="quality-track">
              <div className="quality-fill positive" style={{ width: `${supAvg}%` }} />
            </div>
            <span className="quality-val">{supAvg}%</span>
          </div>
        )}
        {conAvg !== null && (
          <div className="quality-row">
            <span className="quality-label">Sources against ({con.length})</span>
            <div className="quality-track">
              <div className="quality-fill negative" style={{ width: `${conAvg}%` }} />
            </div>
            <span className="quality-val">{conAvg}%</span>
          </div>
        )}
      </div>
      <p style={{ fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '10px' }}>
        {primaryCount > 0 && `${primaryCount} primary source${primaryCount > 1 ? 's' : ''}, `}
        {indepCount > 0 && `${indepCount} independently reported. `}
        {verdict}
      </p>
    </div>
  );
}

// ─── Bias Spectrum ────────────────────────────────────────────────────────────
function BiasSpectrum({ biasEstimate }: { biasEstimate: string }) {
  const b = safe(biasEstimate).toLowerCase();
  let pos = 50, label = biasEstimate || 'Unknown';
  if (b.includes('far left'))      { pos = 4;  label = 'Far Left'; }
  else if (b.includes('center-left') || b.includes('centre-left')) { pos = 32; label = 'Center-Left'; }
  else if (b.includes('left'))     { pos = 18; label = 'Left-Leaning'; }
  else if (b.includes('center-right') || b.includes('centre-right')) { pos = 68; label = 'Center-Right'; }
  else if (b.includes('far right')) { pos = 96; label = 'Far Right'; }
  else if (b.includes('right'))    { pos = 82; label = 'Right-Leaning'; }
  else if (b.includes('neutral') || b.includes('balanced')) { pos = 50; label = 'Balanced'; }

  return (
    <div>
      <div className="section-label">Political Bias Spectrum</div>
      <div className="bias-bar">
        <div className="bias-marker" style={{ left: `${pos}%` }} />
      </div>
      <div className="bias-axis"><span>Far Left</span><span>Center</span><span>Far Right</span></div>
      <div className="bias-result-row">
        <span className="bias-result-key">Assessment</span>
        <span className="bias-result-val">{label}</span>
      </div>
    </div>
  );
}

// ─── Propaganda Pattern Scanner ───────────────────────────────────────────────
type Sev = 'critical' | 'high' | 'medium' | 'clear';
interface Pattern { icon: string; name: string; desc: string; sev: Sev; }

function buildPatterns(article: any, verifications: ClaimVerification[]): Pattern[] {
  const out: Pattern[] = [];
  const emotional = (article.emotional_language ?? []) as string[];
  const omissions = (article.omissions_detected ?? []) as string[];
  const total = verifications.length;
  const disputed = verifications.filter(v =>
    ['Contradicted', 'Misleading', 'Out of Context'].includes(safe(v.status)));
  const ratio = total > 0 ? disputed.length / total : 0;
  const temporalClaims = verifications.filter(v =>
    v.temporal_verification && v.temporal_verification !== 'Current');
  const scopeExpClaims = verifications.filter(v => v.scope_expansion);
  const allSrc = verifications.flatMap(v => [...(v.supporting_evidence ?? []), ...(v.contradicting_evidence ?? [])]);
  const uniqPubs = new Set(allSrc.map(s => safe(s.publisher)).filter(Boolean));
  const factualContras = verifications.filter(v => safe(v.contradiction_type).toLowerCase().includes('factual'));

  if (factualContras.length > 0) {
    out.push({ icon: '🚨', sev: 'critical', name: 'Factual Contradiction',
      desc: `${factualContras.length} claim${factualContras.length > 1 ? 's' : ''} directly contradict verified records. This is not disputed interpretation — the facts don't match.` });
  }
  if (ratio > 0.55 && total >= 3) {
    out.push({ icon: '⛔', sev: 'critical', name: 'High Disputed Rate',
      desc: `${disputed.length} of ${total} checked claims are contradicted or misleading (${Math.round(ratio*100)}%). This goes beyond selective framing.` });
  }
  if (emotional.length >= 4) {
    out.push({ icon: '⚡', sev: 'high', name: 'Heavy Emotional Language',
      desc: `Words like "${emotional.slice(0,3).join('", "')}" — ${emotional.length} terms total — push the reader toward an emotional reaction rather than a factual one.` });
  } else if (emotional.length >= 1) {
    out.push({ icon: '💬', sev: 'medium', name: 'Loaded Language',
      desc: `Contains ${emotional.length} emotionally-charged term${emotional.length > 1 ? 's' : ''}: "${emotional.join('", "')}".` });
  }
  if (ratio > 0.3 && ratio <= 0.55 && total >= 2) {
    out.push({ icon: '🃏', sev: 'high', name: 'Selective Evidence',
      desc: `${disputed.length} of ${total} claims are disputed. The article may be cherry-picking the facts that support its angle.` });
  }
  if (article.is_satire) {
    out.push({ icon: '🎭', sev: 'high', name: 'Satire / Parody Markers',
      desc: 'The article shows markers consistent with satire. Claims should not be taken as literal fact.' });
  }
  if (allSrc.length > 3 && uniqPubs.size <= 2) {
    out.push({ icon: '🔁', sev: 'high', name: 'Narrow Source Base',
      desc: `${allSrc.length} citations come from just ${uniqPubs.size} publisher${uniqPubs.size > 1 ? 's' : ''} (${[...uniqPubs].join(', ')}). Multiple citations from one outlet isn't independent corroboration.` });
  }
  if (temporalClaims.length > 0) {
    out.push({ icon: '⏰', sev: 'medium', name: 'Outdated Information',
      desc: `${temporalClaims.length} claim${temporalClaims.length > 1 ? 's' : ''} ${temporalClaims.length > 1 ? 'are' : 'is'} flagged as outdated but presented as current fact.` });
  }
  if (omissions.length > 0) {
    out.push({ icon: '🔍', sev: 'medium', name: 'Missing Context',
      desc: `${omissions.length} gap${omissions.length > 1 ? 's' : ''} detected: ${omissions.slice(0,2).join('; ')}${omissions.length > 2 ? '…' : ''}.` });
  }
  if (scopeExpClaims.length > 0) {
    out.push({ icon: '📊', sev: 'medium', name: 'Overgeneralized Claims',
      desc: `${scopeExpClaims.length} claim${scopeExpClaims.length > 1 ? 's' : ''} draw broad conclusions from limited evidence: "${safe(scopeExpClaims[0].scope_expansion).slice(0, 80)}…"` });
  }
  if (out.length === 0) {
    out.push({ icon: '✓', sev: 'clear', name: 'No red flags found',
      desc: 'No significant disinformation markers detected in this article.' });
  }

  return out;
}

function PatternScanner({ article, verifications }: { article: any; verifications: ClaimVerification[] }) {
  const patterns = buildPatterns(article, verifications);
  return (
    <div>
      <div className="section-label">Disinformation Pattern Scanner</div>
      <div className="pattern-list">
        {patterns.map((p, i) => (
          <div key={i} className={`pattern-card sev-${p.sev}`}>
            <div className="pattern-icon">{p.icon}</div>
            <div className="pattern-inner">
              <div className="pattern-sev">{p.sev}</div>
              <div className="pattern-name">{p.name}</div>
              <div className="pattern-desc">{p.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Intel Tab ────────────────────────────────────────────────────────────────
function IntelTab({ analysis }: { analysis: AnalysisResponse }) {
  const { article, verifications } = analysis;
  const omissions = (article.omissions_detected ?? []) as string[];

  // Derive extra omission context from verification data
  const derivedGaps: string[] = [];
  const temporalV = verifications.filter(v => v.temporal_verification && v.temporal_verification !== 'Current');
  const scopeV    = verifications.filter(v => v.scope_expansion);
  const noSrcV    = verifications.filter(v =>
    (v.supporting_evidence ?? []).length === 0 && (v.contradicting_evidence ?? []).length === 0);

  if (temporalV.length > 0)
    derivedGaps.push(`${temporalV.length} claim${temporalV.length > 1 ? 's' : ''} use outdated data but are framed as current — no timeframe qualifier given.`);
  if (scopeV.length > 0)
    derivedGaps.push(`${scopeV.length} claim${scopeV.length > 1 ? 's' : ''} generalize beyond what the cited evidence actually shows.`);
  if (noSrcV.length > 0)
    derivedGaps.push(`${noSrcV.length} claim${noSrcV.length > 1 ? 's' : ''} couldn't be verified against any web source — no corroboration available.`);
  if (article.bias_estimate && !article.bias_estimate.toLowerCase().includes('neutral') && !article.bias_estimate.toLowerCase().includes('balanced'))
    derivedGaps.push(`The ${article.bias_estimate} framing may mean opposing perspectives were not represented.`);

  const allGaps = [...omissions, ...derivedGaps];

  return (
    <div className="content">
      {/* Claim Credibility Line */}
      <ClaimECG verifications={verifications} />

      {/* Source table — replaces unreadable network graph */}
      <SourceTable verifications={verifications} />

      {/* Source Quality Matrix */}
      <SourceQuality verifications={verifications} />

      {/* Disinformation Pattern Scanner */}
      <PatternScanner article={article} verifications={verifications} />

      {/* Bias Spectrum */}
      {article.bias_estimate && <BiasSpectrum biasEstimate={article.bias_estimate} />}

      {/* Context Gaps — backend + derived */}
      {allGaps.length > 0 && (
        <div>
          <div className="section-label">Context Gaps</div>
          <div className="omission-list">
            {allGaps.map((o, i) => (
              <div key={i} className="omission-item">
                <span style={{ fontSize: '11px', flexShrink: 0, marginTop: '1px' }}>⚠</span>
                <div className="omission-text">{safe(o)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Narrative conclusion */}
      {article.narrative_conclusion && (
        <div>
          <div className="section-label">What the article is trying to say</div>
          <div className="narrative-card">
            <p className="narrative-text">{safe(article.narrative_conclusion)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'claims' | 'intel'>('overview');

  useEffect(() => { analyze(); }, []);

  const analyze = () => {
    setLoading(true);
    setError('');
    setAnalysis(null);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
      if (!tabs[0]?.id) { setLoading(false); return; }

      chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_ARTICLE' }, async (res: any) => {
        if (chrome.runtime.lastError || !res) {
          setError('Could not extract article content. Navigate to a news article page.');
          setLoading(false);
          return;
        }
        if (res.error && !res.mediaUrl) {
          setError(safe(res.error));
          setLoading(false);
          return;
        }

        try {
          const r = await fetch(`${API_BASE_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: res.url,
              title: res.title,
              textContent: res.textContent,
              htmlContent: res.htmlContent,
              investigation_mode: 'Standard',
              media_url: res.mediaUrl ?? null,
            }),
          });
          if (!r.ok) throw new Error('Analysis failed.');
          const data: AnalysisResponse = await r.json();
          setAnalysis(data);
          const highlights = data.verifications.map(v => {
            const c = data.article.claims.find(x => x.id === v.claim_id);
            return { id: v.claim_id, text: c?.text ?? '', status: v.status };
          });
          chrome.tabs.sendMessage(tabs[0].id!, { type: 'HIGHLIGHT_CLAIMS', claims: highlights });
        } catch (e: any) {
          setError(safe(e.message) || 'Could not connect to Faktz backend.');
        } finally {
          setLoading(false);
        }
      });
    });
  };

  // ── States ──────────────────────────────────────────────
  if (loading) return <div className="app-root"><LoadingState /></div>;

  if (error) return (
    <div className="app-root">
      <div className="state-center">
        <ShieldAlert size={24} style={{ color: 'var(--red)' }} />
        <h2>Analysis Failed</h2>
        <p>{error}</p>
        <button className="btn" onClick={analyze}>Try Again</button>
      </div>
    </div>
  );

  if (!analysis) return (
    <div className="app-root">
      <div className="state-center">
        <Zap size={24} style={{ color: 'var(--green)' }} />
        <h2>Ready to Analyze</h2>
        <p>Navigate to any news article. Faktz activates automatically.</p>
      </div>
    </div>
  );

  // ── Score derivation ────────────────────────────────────
  const score = analysis.overall_score;
  const scoreCls = score >= 80 ? 'verified' : score < 50 ? 'disputed' : 'mixed';
  const scoreLabel = score >= 80 ? 'Verified' : score < 50 ? 'Disputed' : 'Mixed';

  const verifiedCt  = analysis.verifications.filter(v => ['Verified', 'Partially Verified'].includes(safe(v.status))).length;
  const disputedCt  = analysis.verifications.filter(v => ['Contradicted', 'Misleading', 'Out of Context'].includes(safe(v.status))).length;
  const insuffCt    = analysis.verifications.filter(v => ['Needs More Evidence', 'Opinion'].includes(safe(v.status))).length;

  return (
    <div className="app-root">
      {/* Tab bar */}
      <div className="tabs">
        <button id="tab-overview" className={`tab${activeTab === 'overview' ? ' active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
        <button id="tab-claims"   className={`tab${activeTab === 'claims'   ? ' active' : ''}`} onClick={() => setActiveTab('claims')}>Claims</button>
        <button id="tab-intel"    className={`tab intel-tab${activeTab === 'intel' ? ' active' : ''}`} onClick={() => setActiveTab('intel')}>Intel</button>
      </div>

      {/* ── Overview ── */}
      {activeTab === 'overview' && (
        <div className="content">
          {/* Score */}
          <div>
            <div className="section-label">Credibility Score</div>
            <div className="score-row">
              <span className={`score-number ${scoreCls}`}>{score}</span>
              <div className="score-info">
                <div className="score-verdict">{scoreLabel}</div>
                <div className="score-sub">{analysis.verifications.length} claims analyzed</div>
              </div>
            </div>
            <div className="score-bar-track">
              <div className={`score-bar-fill ${scoreCls}`} style={{ width: `${score}%` }} />
            </div>
            <div className="stat-pills">
              {verifiedCt  > 0 && <span className="pill green">✓ {verifiedCt} Verified</span>}
              {disputedCt  > 0 && <span className="pill red">✕ {disputedCt} Disputed</span>}
              {insuffCt    > 0 && <span className="pill amber">? {insuffCt} Unclear</span>}
            </div>
          </div>

          {/* Summary */}
          <div>
            <div className="section-label">Summary</div>
            <p className="summary-primary">{safe(analysis.short_summary || analysis.score_explanation)}</p>
            {analysis.short_summary && (
              <p className="summary-secondary">{safe(analysis.score_explanation)}</p>
            )}
          </div>

          {/* Key factors */}
          {(analysis.key_reasons?.length ?? 0) > 0 && (
            <div>
              <div className="section-label">Key Factors</div>
              {analysis.key_reasons!.map((r, i) => (
                <div key={i} className="reason-item" style={{ color: r.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
                  {r}
                </div>
              ))}
            </div>
          )}

          {/* Key findings */}
          {(analysis.article.key_takeaways?.length ?? 0) > 0 && (
            <div>
              <div className="section-label">Key Findings</div>
              <ul className="takeaway-list">
                {analysis.article.key_takeaways!.map((t, i) => (
                  <li key={i} className="takeaway-item">
                    <span className="takeaway-num">0{i + 1}</span>
                    <span className="takeaway-text">{safe(t)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Claims ── */}
      {activeTab === 'claims' && (
        <div className="content">
          <div className="claims-list">
            {analysis.verifications.map(v => {
              const claim = analysis.article.claims.find(c => c.id === v.claim_id);
              if (!claim) return null;
              return <ClaimRow key={v.claim_id} claim={claim} verification={v} />;
            })}
          </div>
        </div>
      )}

      {/* ── Intel ── */}
      {activeTab === 'intel' && <IntelTab analysis={analysis} />}
    </div>
  );
}
