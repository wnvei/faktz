// @ts-nocheck
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  
  // Enable side panel on all pages
  await chrome.sidePanel.setOptions({
    tabId,
    path: 'index.html',
    enabled: true
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ANALYZE_ARTICLE") {
    // The background script could handle caching or API calls, 
    // but we can also just let the Sidebar handle it. 
    // This listener is useful if we need to bypass CORS in some cases,
    // though the FastAPI backend allows all origins.
  }
});
