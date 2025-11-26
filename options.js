const DEFAULT_OUTPUT_ROOT = "F24";
const DEFAULT_CAPTURE_DELAY = 2500;
const INVALID_SEGMENT_CHARS = /[<>:"\\/|?*\r\n]+/g;

function sanitizeRootInput(raw) {
  if (!raw) return DEFAULT_OUTPUT_ROOT;
  const parts = String(raw)
    .split(/[\\/]+/)
    .map((segment) => sanitizeSegment(segment))
    .filter(Boolean);
  return parts.join("/") || DEFAULT_OUTPUT_ROOT;
}

function sanitizeSegment(value) {
  if (!value) return "";
  const cleaned = String(value)
    .replace(INVALID_SEGMENT_CHARS, "")
    .trim();
  if (cleaned === "." || cleaned === "..") {
    return "";
  }
  return cleaned;
}

function showStatus(element, message, isError = false) {
  element.textContent = message;
  element.style.color = isError ? "#c0392b" : "#2c7a1f";
}

document.addEventListener("DOMContentLoaded", () => {
  const rootInput = document.getElementById("output-root");
  const delayInput = document.getElementById("capture-delay");
  const statusEl = document.getElementById("status");
  const form = document.getElementById("settings-form");
  const shortcutsBtn = document.getElementById("open-shortcuts");
  const openOptionsBtn = document.getElementById("open-options");

  chrome.storage.sync.get({ outputRoot: DEFAULT_OUTPUT_ROOT, captureDelay: DEFAULT_CAPTURE_DELAY }, (items) => {
    if (chrome.runtime.lastError) {
      showStatus(statusEl, "读取设置失败", true);
      return;
    }
    rootInput.value = sanitizeRootInput(items.outputRoot || DEFAULT_OUTPUT_ROOT);
    if (delayInput) {
      delayInput.value = items.captureDelay || DEFAULT_CAPTURE_DELAY;
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const sanitized = sanitizeRootInput(rootInput.value);
    let delay = parseInt(delayInput.value, 10);
    if (Number.isNaN(delay) || delay < 500) {
      delay = DEFAULT_CAPTURE_DELAY;
    }

    chrome.storage.sync.set({ outputRoot: sanitized, captureDelay: delay }, () => {
      if (chrome.runtime.lastError) {
        showStatus(statusEl, "保存失败：" + chrome.runtime.lastError.message, true);
        return;
      }
      rootInput.value = sanitized;
      delayInput.value = delay;
      showStatus(statusEl, "设置已保存");
      setTimeout(() => showStatus(statusEl, ""), 2500);
    });
  });

  if (shortcutsBtn) {
    shortcutsBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    });
  }

  if (openOptionsBtn) {
    openOptionsBtn.addEventListener("click", () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
      }
    });
  }

  const startAutoBtn = document.getElementById("start-auto");
  const stopAutoBtn = document.getElementById("stop-auto");

  if (startAutoBtn && stopAutoBtn) {
    // Check status
    chrome.runtime.sendMessage({ action: "getAutoCaptureStatus" }, (response) => {
      if (response && response.isAutoCapturing) {
        startAutoBtn.style.display = "none";
        stopAutoBtn.style.display = "inline-block";
      } else {
        startAutoBtn.style.display = "inline-block";
        stopAutoBtn.style.display = "none";
      }
    });

    startAutoBtn.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.runtime.sendMessage({ action: "startAutoCapture", tabId: tab.id });
        startAutoBtn.style.display = "none";
        stopAutoBtn.style.display = "inline-block";
      }
    });

    stopAutoBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "stopAutoCapture" });
      startAutoBtn.style.display = "inline-block";
      stopAutoBtn.style.display = "none";
    });
  }
});
