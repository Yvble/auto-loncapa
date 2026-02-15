const DEFAULTS = {
  mode: "assist",
  autoSubmit: false,
};

const elements = {
  mode: document.getElementById("behaviorMode"),
  autoSubmit: document.getElementById("autoSubmit"),
  currentVersion: document.getElementById("current-version"),
  saveStatus: document.getElementById("save-status"),
};

function setStatus(text) {
  if (!elements.saveStatus) return;
  elements.saveStatus.textContent = text;
}

function isStudyMode() {
  return elements.mode?.value === "study";
}

function syncBehaviorControls() {
  if (!elements.autoSubmit) return;

  const disableAutoSubmit = isStudyMode();
  const toggleLabel = elements.autoSubmit.closest(".toggle");

  elements.autoSubmit.disabled = disableAutoSubmit;
  if (toggleLabel) {
    toggleLabel.classList.toggle("disabled", disableAutoSubmit);
  }
}

function saveSettings(update, statusText = "Settings saved") {
  chrome.storage.sync.set(update, () => {
    if (chrome.runtime.lastError) {
      setStatus("Save failed");
      return;
    }
    setStatus(statusText);
  });
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

    if (elements.mode) {
      elements.mode.value = settings.mode === "study" ? "study" : "assist";
    }

    if (elements.autoSubmit) {
      elements.autoSubmit.checked = Boolean(settings.autoSubmit);
    }

    syncBehaviorControls();
  });
}

function bindEvents() {
  if (elements.mode) {
    elements.mode.addEventListener("change", (event) => {
      const mode = event.target.value === "study" ? "study" : "assist";
      syncBehaviorControls();
      saveSettings({ mode }, `Mode set to ${mode === "study" ? "Study" : "Assist"}`);
    });
  }

  if (elements.autoSubmit) {
    elements.autoSubmit.addEventListener("change", (event) => {
      const enabled = Boolean(event.target.checked);
      saveSettings({ autoSubmit: enabled });
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  bindEvents();
});
