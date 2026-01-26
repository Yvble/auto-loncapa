const DEFAULTS = {
  autoSubmit: false,
};

const elements = {
  autoSubmit: document.getElementById("autoSubmit"),
  currentVersion: document.getElementById("current-version"),
  saveStatus: document.getElementById("save-status"),
};

function setStatus(text) {
  if (!elements.saveStatus) return;
  elements.saveStatus.textContent = text;
}

function loadSettings() {
  const manifest = chrome.runtime.getManifest();
  if (elements.currentVersion && manifest?.version) {
    elements.currentVersion.textContent = manifest.version;
  }

  chrome.storage.sync.get(DEFAULTS, (settings) => {
    if (chrome.runtime.lastError) {
      setStatus("Settings unavailable");
      return;
    }

    if (elements.autoSubmit) {
      elements.autoSubmit.checked = Boolean(settings.autoSubmit);
    }
  });
}

function bindEvents() {
  if (!elements.autoSubmit) return;

  elements.autoSubmit.addEventListener("change", (event) => {
    const enabled = Boolean(event.target.checked);
    chrome.storage.sync.set({ autoSubmit: enabled }, () => {
      if (chrome.runtime.lastError) {
        setStatus("Save failed");
        return;
      }
      setStatus("Settings saved");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  bindEvents();
});
