// @ts-nocheck
import { Readability } from '@mozilla/readability';
import Mark from 'mark.js';

let marker: Mark | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_ARTICLE') {
    // Clone document to avoid modifying original while parsing
    const documentClone = document.cloneNode(true) as Document;
    const reader = new Readability(documentClone);
    const article = reader.parse();
    
    if (article) {
      sendResponse({
        title: article.title,
        textContent: article.textContent,
        htmlContent: article.content,
        url: window.location.href
      });
    } else {
      sendResponse({ error: 'Could not extract article content.' });
    }
  } else if (message.type === 'HIGHLIGHT_CLAIMS') {
    const claims = message.claims; // Array of { text: string, status: string, id: string }
    
    if (!marker) {
      marker = new Mark(document.body);
    }
    
    // Clear previous highlights
    marker.unmark();
    
    claims.forEach((claim: any) => {
      let highlightClass = 'faktz-highlight-default';
      
      switch (claim.status) {
        case 'Verified': highlightClass = 'faktz-highlight-green'; break;
        case 'Needs More Evidence': highlightClass = 'faktz-highlight-yellow'; break;
        case 'Contradicted': highlightClass = 'faktz-highlight-red'; break;
        case 'Misleading':
        case 'Out of Context': highlightClass = 'faktz-highlight-orange'; break;
        case 'Opinion': highlightClass = 'faktz-highlight-blue'; break;
      }
      
      marker?.mark(claim.text, {
        className: `faktz-highlight ${highlightClass}`,
        accuracy: 'partially',
        separateWordSearch: false,
        acrossElements: true,
        each: (node: HTMLElement) => {
          node.setAttribute('data-claim-id', claim.id);
          node.title = `${claim.status} (Click to view details)`;
          node.style.cursor = 'pointer';
          node.onclick = () => {
            // Send message to open sidebar and scroll to this claim
            chrome.runtime.sendMessage({
              type: 'SCROLL_TO_CLAIM',
              claimId: claim.id
            });
          };
        }
      });
    });
    
    sendResponse({ success: true });
  }
  return true; // Keep message channel open for async
});

// Inject styles for highlighter
const style = document.createElement('style');
style.textContent = `
  .faktz-highlight {
    border-radius: 2px;
    padding: 0 2px;
    transition: background-color 0.2s ease;
  }
  .faktz-highlight:hover {
    filter: brightness(0.9);
  }
  .faktz-highlight-green { background-color: rgba(74, 222, 128, 0.4); border-bottom: 2px solid #22c55e; }
  .faktz-highlight-yellow { background-color: rgba(250, 204, 21, 0.4); border-bottom: 2px solid #eab308; }
  .faktz-highlight-red { background-color: rgba(248, 113, 113, 0.4); border-bottom: 2px solid #ef4444; }
  .faktz-highlight-orange { background-color: rgba(251, 146, 60, 0.4); border-bottom: 2px solid #f97316; }
  .faktz-highlight-blue { background-color: rgba(96, 165, 250, 0.4); border-bottom: 2px solid #3b82f6; }
  .faktz-highlight-default { background-color: rgba(156, 163, 175, 0.4); }
`;
document.head.appendChild(style);
