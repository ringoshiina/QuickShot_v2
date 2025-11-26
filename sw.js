const DEFAULT_SETTINGS = Object.freeze({
  outputRoot: "F24",
});
const RATIO_PATTERN = /(\d+)\s*[/／]\s*(\d+)/;
const INDEX_HINT_PATTERN = /(?:序号|当前|index|sequence)/i;
const INVALID_SEGMENT_CHARS = /[<>:"\\/|?*\r\n]+/g;
const sequenceMemory = new Map();
const BLANK_RETRY_LIMIT = 3;
const BLANK_RETRY_DELAY = 700;
const BLANK_THRESHOLD = 0.94;
let settingsCache = null;
let isAutoCapturing = false;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && ("outputRoot" in changes)) {
    settingsCache = null;
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getAutoCaptureStatus") {
    sendResponse({ isAutoCapturing });
    return true;
  }
  if (request.action === "startAutoCapture") {
    if (request.tabId) {
      startAutoCapture(request.tabId);
      sendResponse({ success: true });
    }
    return true;
  }
  if (request.action === "stopAutoCapture") {
    stopAutoCapture();
    sendResponse({ success: true });
    return true;
  }
});

async function getSettings() {
  if (settingsCache) return settingsCache;
  const settings = await readSettingsFromStorage();
  settingsCache = settings;
  return settings;
}

function readSettingsFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      if (chrome.runtime.lastError) {
        console.warn("[QuickShot] 读取设置失败", chrome.runtime.lastError);
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }
      resolve({
        outputRoot: sanitizeOutputRoot(items.outputRoot),
      });
    });
  });
}

function sanitizeOutputRoot(value) {
  if (!value) return DEFAULT_SETTINGS.outputRoot;
  const segments = String(value)
    .split(/[\\/]+/)
    .map((segment) => sanitizeSegment(segment))
    .filter(Boolean);
  return segments.join("/") || DEFAULT_SETTINGS.outputRoot;
}

function sanitizePathSegment(value, fallback = "unknown") {
  const sanitized = sanitizeSegment(value);
  return sanitized || fallback;
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

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  runCapture(tab.id);
});



chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === "quickshot") runCapture(tab.id);
});

async function runCapture(tabId) {



  let debuggerAttached = false;



  try {
    console.log("[QuickShot] Step 1: Getting context...");
    const ctxEntry = await getCaptureContext(tabId);
    console.log("[QuickShot] Step 1: Done.");

    if (!ctxEntry) {
      toast("未识别到项目/地块编号或当前序号（1/N），请确认位于举证照片的大图查看器");
      return;
    }

    const { context, frameId } = ctxEntry;
    const { parcelId, projectId } = context;
    const settings = await getSettings();

    const derivedSequence = resolveSequence(context);
    const sequence = stabilizeSequence(parcelId || projectId, derivedSequence);

    if (sequence.current) {
      context.current = sequence.current;
      context.total = sequence.total || context.total;
      context.sequenceConfidence = sequence.confidence;
      context.sequenceSource = sequence.source;
      console.log('[QuickShot] sequence', parcelId, sequence);
    } else {
      console.log('[QuickShot] sequence-missing', parcelId, sequence);
    }

    const folder = deriveFolder(parcelId, projectId);
    const baseName = sanitizePathSegment(parcelId || projectId, "unknown");
    const outputRoot = settings.outputRoot || DEFAULT_SETTINGS.outputRoot;
    const filename = `${outputRoot}/${folder}/${baseName}.png`;

    // Step 2: Ensure "All Azimuths" checkbox is checked
    console.log("[QuickShot] Step 2: Checking 'All Azimuths' checkbox...");
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: ensureAllAzimuthsChecked,
    });
    console.log("[QuickShot] Step 2: Done.");

    console.log("[QuickShot] Step 3: Attaching debugger...");
    await attachDebugger(tabId);
    debuggerAttached = true;
    console.log("[QuickShot] Step 3: Done.");

    console.log("[QuickShot] Step 4: Capturing screenshot...");
    const screenshot = await captureScreenshotWithRetry(tabId);



    if (!screenshot?.data) throw new Error("截图数据为空，请稍后重试");



    await chrome.downloads.download({
      url: `data:image/png;base64,${screenshot.data}`,
      filename,
      conflictAction: "uniquify",
      saveAs: false,
    });

    toast(`已保存：${filename}`);
    return context;




  } catch (error) {



    console.error("[QuickShot] 捕获失败", error);



    toast(`截图失败：${error?.message || error}`);



  } finally {



    if (debuggerAttached) {



      try {



        await detachDebugger(tabId);



      } catch (detachError) {



        console.warn("[QuickShot] 分离调试器失败", detachError);



      }



    }



  }



}



function toast(message) {



  console.log("[QuickShot]", message);



}




function deriveFolder(parcelId, projectId) {
  if (parcelId) {
    const prefix = parcelId.split('-')[0] || '';
    if (prefix) return sanitizePathSegment(prefix, 'unknown');
  }
  if (projectId) {
    const trimmed = projectId.split('-')[0] || projectId;
    return sanitizePathSegment(trimmed, 'unknown');
  }
  return 'unknown';
}

function resolveSequence(context) {
  const initialCurrent = Number.parseInt(context?.current, 10) || 0;
  const initialTotal = Number.parseInt(context?.total, 10) || 0;

  let bestCurrent = initialCurrent;
  let bestTotal = initialTotal;
  let bestConfidence = initialCurrent ? 0.3 : 0;
  let bestSource = initialCurrent ? 'context' : '';

  const preferCandidate = (value, confidence, source) => {
    const parsed = Number.parseInt(value, 10);
    if (!parsed || Number.isNaN(parsed) || parsed <= 0) return;
    if (!bestCurrent) {
      bestCurrent = parsed;
      bestConfidence = confidence;
      bestSource = source;
      return;
    }
    if (confidence > bestConfidence + 0.05) {
      bestCurrent = parsed;
      bestConfidence = confidence;
      bestSource = source;
      return;
    }
    if (confidence >= bestConfidence - 0.05) {
      const withinTotal = !bestTotal || parsed <= bestTotal || confidence >= 0.8;
      if (withinTotal && (parsed === bestCurrent || Math.abs(parsed - bestCurrent) <= 1 || confidence >= bestConfidence)) {
        bestCurrent = parsed;
        bestConfidence = Math.max(bestConfidence, confidence);
        bestSource = source;
      }
    }
  };

  const pushRatio = (value, total, confidence, source) => {
    const match = value ? RATIO_PATTERN.exec(String(value)) : null;
    if (!match) return;
    const current = Number.parseInt(match[1], 10) || 0;
    const totalParsed = Number.parseInt(match[2], 10) || 0;
    if (totalParsed && (!bestTotal || totalParsed > bestTotal)) {
      bestTotal = totalParsed;
    }
    preferCandidate(current, confidence, source);
  };

  const debugList = Array.isArray(context?.debug) ? context.debug : [];

  for (const info of debugList) {
    if (!info) continue;

    if (info.carousel) {
      const { current, total } = info.carousel;
      if (total && (!bestTotal || total > bestTotal)) {
        bestTotal = total;
      }
      if (current) {
        preferCandidate(current, 0.85, 'carousel');
      }
    }

    if (Array.isArray(info.ratioMatches)) {
      for (const item of info.ratioMatches) {
        pushRatio(item, null, 0.65, 'ratio-text');
      }
    }

    if (Array.isArray(info.ratioElements)) {
      for (const node of info.ratioElements) {
        if (node?.text) pushRatio(node.text, null, 0.65, 'ratio-node');
      }
    }

    if (Array.isArray(info.counterMatches)) {
      for (const counter of info.counterMatches) {
        preferCandidate(counter, 0.55, 'counter');
      }
    }

    if (Array.isArray(info.totalHints)) {
      for (const hint of info.totalHints) {
        if (!hint) continue;
        const parsed = Number.parseInt(hint, 10);
        if (parsed && (!bestTotal || parsed > bestTotal)) {
          bestTotal = parsed;
        }
      }
    }

    if (Array.isArray(info.spinElements)) {
      for (const node of info.spinElements) {
        if (!node) continue;
        const meta = `${node.ariaLabel || ''} ${node.text || ''}`;
        const hasHint = INDEX_HINT_PATTERN.test(meta);
        const values = [
          node.ariaValueNow,
          node.value,
          node.ariaValueText,
          node.text,
        ];
        for (const raw of values) {
          if (!raw) continue;
          const parsed = Number.parseInt(String(raw).trim(), 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            preferCandidate(parsed, hasHint ? 0.6 : 0.4, hasHint ? 'spin-hint' : 'spin');
          }
        }
      }
    }
  }

  if (bestTotal && bestCurrent > bestTotal && bestConfidence < 0.8) {
    bestCurrent = Math.min(bestCurrent, bestTotal);
  }

  if (!bestCurrent) {
    bestCurrent = 1;
  }

  return { current: bestCurrent, total: bestTotal, confidence: bestConfidence, source: bestSource };
}

function stabilizeSequence(parcelId, sequence) {
  if (!parcelId) return sequence;
  const state = sequenceMemory.get(parcelId) || { last: 0, total: Number.parseInt(sequence?.total, 10) || 0 };
  const result = {
    current: Number.parseInt(sequence?.current, 10) || 0,
    total: Number.parseInt(sequence?.total, 10) || 0,
    confidence: sequence?.confidence ?? 0,
    source: sequence?.source || '',
  };

  if (!result.total && state.total) {
    result.total = state.total;
  }

  if (!result.current) {
    const fallback = state.last ? state.last + 1 : 1;
    result.current = result.total ? Math.min(fallback, result.total) : fallback;
    result.source = result.source || 'fallback-auto';
  } else if (state.last) {
    const delta = result.current - state.last;
    const totalBound = result.total || state.total || 0;
    const forwardJump = delta > 1 && result.confidence < 0.7;
    const backwardJump = delta < -1 && result.confidence < 0.7;

    if (forwardJump) {
      const fallback = totalBound ? Math.min(state.last + 1, totalBound) : state.last + 1;
      result.current = Math.max(fallback, 1);
      result.source = 'stabilized-forward';
    } else if (backwardJump) {
      const isWrapAround = result.current === 1 && totalBound && state.last >= totalBound - 1;
      if (!isWrapAround) {
        result.current = Math.max(result.current, 1);
        result.source = 'stabilized-backward';
      }
    }
  }

  if (result.total && result.current > result.total) {
    result.current = result.total;
  }

  sequenceMemory.set(parcelId, {
    last: result.current,
    total: result.total || state.total || 0,
    updatedAt: Date.now(),
  });

  return result;
}

async function getCaptureContext(tabId) {
  // Try to get IDs from content.js (label-based extraction)
  let labelIds = { projectId: "", parcelId: "" };
  try {
    labelIds = await chrome.tabs.sendMessage(tabId, { action: "getIds" });
    console.log("[QuickShot] Label-based IDs:", labelIds);
  } catch (e) {
    console.warn("[QuickShot] Failed to get IDs from content script (page might need reload):", e);
  }

  const injections = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: scrapeContext,
  });

  for (const entry of injections || []) {
    const raw = entry?.result;
    if (!raw) {
      toast(`frame ${entry?.frameId ?? 'main'} ctx: null`);
      continue;
    }

    const debugList = Array.isArray(raw.debug) ? raw.debug : (raw.debug ? [raw.debug] : []);

    let parcelId = raw.parcelId || '';
    let projectId = raw.projectId || '';
    let current = Number.parseInt(raw.current, 10) || 0;
    let total = Number.parseInt(raw.total, 10) || 0;

    // Override with label-based IDs if available
    if (labelIds?.projectId) projectId = labelIds.projectId;
    if (labelIds?.parcelId) parcelId = labelIds.parcelId;

    for (const info of debugList) {
      if (!info) continue;
      // Only use scraped IDs if we don't have label-based ones
      if (!parcelId && info.parcelId) parcelId = info.parcelId;
      if (!projectId && info.projectId) projectId = info.projectId;

      if (!current && info.current) current = Number.parseInt(info.current, 10) || current;
      if (!total && info.total) total = Number.parseInt(info.total, 10) || total;

      if ((!current || !total) && Array.isArray(info.ratioMatches)) {
        for (const ratio of info.ratioMatches) {
          if (!ratio) continue;
          const match = RATIO_PATTERN.exec(String(ratio));
          if (!match) continue;
          if (!current) current = Number.parseInt(match[1], 10) || current;
          if (!total) total = Number.parseInt(match[2], 10) || total;
          if (current && total) break;
        }
      }

      if ((!current || !total) && Array.isArray(info.ratioElements)) {
        for (const ratioNode of info.ratioElements) {
          if (!ratioNode?.text) continue;
          const match = RATIO_PATTERN.exec(ratioNode.text);
          if (!match) continue;
          if (!current) current = Number.parseInt(match[1], 10) || current;
          if (!total) total = Number.parseInt(match[2], 10) || total;
          if (current && total) break;
        }
      }

      if (!current && Array.isArray(info.spinElements)) {
        for (const spin of info.spinElements) {
          const candidates = [spin?.ariaValueNow, spin?.value, spin?.text];
          for (const candidate of candidates) {
            if (!candidate) continue;
            const parsed = Number.parseInt(String(candidate).trim(), 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              current = parsed;
              break;
            }
          }
          if (current) break;
        }
      }
    }

    if (!projectId && parcelId) {
      projectId = parcelId.split('-')[0] || '';
    }

    const normalizedCtx = {
      parcelId,
      projectId,
      current,
      total,
      href: raw.href || '',
      hasBody: raw.hasBody,
      hasDocumentElement: raw.hasDocumentElement,
      error: raw.error || '',
    };

    if (debugList.length) {
      normalizedCtx.debug = debugList.slice(0, 3).map((info) => ({
        source: info?.source || '',
        href: info?.href || raw.href || '',
        parcelId: info?.parcelId || '',
        projectId: info?.projectId || '',
        current: info?.current || 0,
        total: info?.total || 0,
        textHead: (info?.textHead || '').slice(0, 100),
        idMatches: Array.isArray(info?.idMatches) ? info.idMatches.slice(0, 3) : [],
        ratioMatches: Array.isArray(info?.ratioMatches) ? info.ratioMatches.slice(0, 3) : [],
        selectorsHit: info?.selectorsHit || {},
        ratioElements: Array.isArray(info?.ratioElements) ? info.ratioElements.slice(0, 2) : [],
        spinElements: Array.isArray(info?.spinElements) ? info.spinElements.slice(0, 2) : [],
        counterMatches: Array.isArray(info?.counterMatches) ? info.counterMatches.slice(0, 3) : [],
        totalHints: Array.isArray(info?.totalHints) ? info.totalHints.slice(0, 3) : [],
        carousel: info?.carousel ? {
          current: Number.parseInt(info.carousel.current, 10) || 0,
          total: Number.parseInt(info.carousel.total, 10) || 0,
          indicatorCount: Number.parseInt(info.carousel.indicatorCount, 10) || 0,
          itemCount: Number.parseInt(info.carousel.itemCount, 10) || 0,
        } : null,
      }));
    }

    const logPayload = {
      parcelId: normalizedCtx.parcelId,
      projectId: normalizedCtx.projectId,
      current: normalizedCtx.current,
      total: normalizedCtx.total,
      href: normalizedCtx.href,
      error: normalizedCtx.error,
      debug: normalizedCtx.debug,
    };

    toast(`frame ${entry?.frameId ?? 'main'} ctx: ${JSON.stringify(logPayload)}`);

    // We are more lenient now: if we have IDs (even without sequence), we can proceed, 
    // but the original logic required current/total for full functionality.
    // However, the user mainly wants correct naming.
    if ((normalizedCtx.parcelId || normalizedCtx.projectId)) {
      return {
        context: normalizedCtx,
        frameId: entry.frameId,
      };
    }
  }
  return null;
}
async function attachDebugger(tabId) {



  await new Promise((resolve, reject) => {



    chrome.debugger.attach({ tabId }, "1.3", () => {



      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);



      else resolve();



    });



  });



  await sendCDP(tabId, "Page.enable");



}



async function detachDebugger(tabId) {



  await new Promise((resolve) => {



    chrome.debugger.detach({ tabId }, () => resolve());



  });



}



function sendCDP(tabId, method, params) {



  return new Promise((resolve, reject) => {



    chrome.debugger.sendCommand({ tabId }, method, params || {}, (result) => {



      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);



      else resolve(result || {});



    });



  });



}



function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}



async function captureScreenshotWithRetry(tabId) {
  const metrics = await sendCDP(tabId, "Page.getLayoutMetrics");
  // Use cssLayoutViewport (visible area) instead of contentSize (full document)
  // This prevents capturing huge empty areas on single-page apps
  const viewport = metrics.cssLayoutViewport || metrics.layoutViewport;
  const width = Math.ceil(viewport?.clientWidth || metrics.contentSize?.width || 0);
  const height = Math.ceil(viewport?.clientHeight || metrics.contentSize?.height || 0);

  if (!width || !height) throw new Error("未能获取页面尺寸");

  let latest = null;
  for (let attempt = 0; attempt < BLANK_RETRY_LIMIT; attempt += 1) {
    const screenshot = await sendCDP(tabId, "Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false, // Only capture what's visible
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    latest = screenshot;
    if (!screenshot?.data) {
      await sleep(BLANK_RETRY_DELAY);
      continue;
    }
    const blank = await isScreenshotBlank(screenshot.data);
    if (!blank) {
      return screenshot;
    }
    console.warn('[QuickShot] Detected blank screenshot, retrying...', attempt + 1);
    await sleep(BLANK_RETRY_DELAY);
  }
  return latest;
}



async function isScreenshotBlank(base64Data) {
  try {
    const response = await fetch(`data:image/png;base64,${base64Data}`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const sampleWidth = Math.max(1, Math.min(200, bitmap.width));
    const sampleHeight = Math.max(1, Math.min(200, bitmap.height));
    const canvas = new OffscreenCanvas(sampleWidth, sampleHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
    const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
    let bright = 0;
    const total = sampleWidth * sampleHeight;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 245 && g > 245 && b > 245) bright += 1;
    }
    const ratio = bright / total;
    return ratio >= BLANK_THRESHOLD;
  } catch (err) {
    console.warn('[QuickShot] Failed to inspect screenshot', err);
    return false;
  }
}



function scrapeContext() {
  const ratioPattern = /(\d+)\s*[/\uFF0F]\s*(\d+)/;
  const ratioPatternGlobal = /(\d+)\s*[/\uFF0F]\s*(\d+)/g;
  const indexHintPattern = /(?:\u5e8f\u53f7|\u5f53\u524d|index|sequence)/i;
  const parcelPattern = /[A-Z]{1,2}\d{2}[A-Z0-9]+-\d+/;
  const parcelPatternGlobal = /[A-Z]{1,2}\d{2}[A-Z0-9]+-\d+/g;
  const projectPattern = /\b[A-Z]{1,2}\d{2}[A-Z0-9]+\b/;
  try {
    const contexts = [];
    const seenDocs = new WeakSet();

    function safeLocation(win) {
      if (!win) return "";
      try {
        return win.location && win.location.href ? win.location.href : "";
      } catch (error) {
        return "";
      }
    }

    function collectFromDoc(doc, source) {
      if (!doc) return;
      const body = doc.body;
      const html = doc.documentElement;
      const root = body || html;
      const href = safeLocation(doc.defaultView || doc.parentWindow);

      const entry = {
        parcelId: "",
        projectId: "",
        current: 0,
        total: 0,
        href,
        hasBody: !!body,
        hasDocumentElement: !!html,
        source,
        debug: {},
      };

      if (!root) {
        contexts.push(entry);
        return;
      }

      const rawText = root.innerText || "";
      const idMatches = (rawText.match(parcelPatternGlobal) || []).slice(0, 5);
      ratioPatternGlobal.lastIndex = 0;
      const ratioMatches = Array.from(rawText.matchAll(ratioPatternGlobal)).slice(0, 5).map((match) => match[0]);
      const counterMatches = [];
      const counterPattern = /第\s*(\d+)\s*张/g;
      let counterMatch;
      while ((counterMatch = counterPattern.exec(rawText))) {
        const parsed = Number.parseInt(counterMatch[1], 10);
        if (!Number.isNaN(parsed) && parsed > 0) counterMatches.push(parsed);
        if (counterMatches.length >= 5) break;
      }
      const totalHints = [];
      const totalPattern = /共\s*(\d+)\s*张/g;
      let totalMatch;
      while ((totalMatch = totalPattern.exec(rawText))) {
        const parsed = Number.parseInt(totalMatch[1], 10);
        if (!Number.isNaN(parsed) && parsed > 0) totalHints.push(parsed);
        if (totalHints.length >= 5) break;
      }
      const selectorsHit = {
        parcelLabel: !!root.querySelector('[title*="地块编号"], [title*="地块编号："], [data-field*="地块"], [aria-label*="地块编号"]'),
        projectLabel: !!root.querySelector('[title*="项目编号"], [aria-label*="项目编号"], [data-field*="项目编号"]'),
        spin: !!root.querySelector('[role="spinbutton"],[aria-valuenow],[aria-valuemin]'),
      };
      const ratioElements = Array.from(root.querySelectorAll('*')).filter((node) => {
        if (!node || node === root) return false;
        const text = (node.textContent || '').trim();
        if (!text || text.length > 40) return false;
        return ratioPattern.test(text);
      }).slice(0, 5).map((node) => ({
        tag: node.tagName,
        className: node.className || '',
        text: (node.textContent || '').trim(),
        ariaLabel: node.getAttribute('aria-label') || '',
      }));
      const spinElements = Array.from(root.querySelectorAll('[role="spinbutton"],[aria-valuenow],[aria-valuetext],[aria-valuemin],[data-role="spinbutton"],input[type="number"],input[type="text"]')).slice(0, 5).map((node) => ({
        tag: node.tagName,
        className: node.className || '',
        text: (node.textContent || '').trim().slice(0, 40),
        value: node.value !== undefined ? String(node.value) : '',
        ariaValueNow: node.getAttribute('aria-valuenow') || '',
        ariaValueText: node.getAttribute('aria-valuetext') || '',
        ariaLabel: node.getAttribute('aria-label') || '',
      }));
      const carousel = readCarouselState(root);

      entry.parcelId = readParcelId(root);
      entry.projectId = readProjectId(root);
      entry.current = readCurrentIndex(root) || carousel.current;
      entry.total = readTotal(root) || carousel.total;
      entry.debug = {
        textHead: rawText.slice(0, 120),
        idMatches,
        ratioMatches,
        counterMatches,
        totalHints,
        selectorsHit,
        ratioElements,
        spinElements,
        carousel,
      };
      contexts.push(entry);
    }

    function visit(win, depth) {
      if (!win || depth > 5) return;
      let doc;
      try {
        doc = win.document;
      } catch (error) {
        return;
      }
      if (!doc || seenDocs.has(doc)) return;
      seenDocs.add(doc);
      collectFromDoc(doc, `depth:${depth}`);

      const frames = win.frames || [];
      for (let i = 0; i < frames.length; i += 1) {
        try {
          visit(frames[i], depth + 1);
        } catch (error) {
          // ignore cross-origin frame errors
        }
      }
    }

    visit(window, 0);

    let parcelId = '';
    let projectId = '';
    let current = 0;
    let total = 0;
    let href = '';

    const debugContexts = [];

    for (const ctx of contexts) {
      if (!href && ctx.href) href = ctx.href;
      if (!parcelId && ctx.parcelId) parcelId = ctx.parcelId;
      if (!projectId && ctx.projectId) projectId = ctx.projectId;
      if (!current && ctx.current) current = ctx.current;
      if (!total && ctx.total) total = ctx.total;
      if (debugContexts.length < 5) {
        debugContexts.push({
          source: ctx.source,
          href: ctx.href,
          parcelId: ctx.parcelId,
          projectId: ctx.projectId,
          current: ctx.current,
          total: ctx.total,
          textHead: ctx.debug?.textHead || '',
          idMatches: ctx.debug?.idMatches || [],
          ratioMatches: ctx.debug?.ratioMatches || [],
          selectorsHit: ctx.debug?.selectorsHit || {},
          ratioElements: ctx.debug?.ratioElements || [],
          spinElements: ctx.debug?.spinElements || [],
        });
      }
    }

    if (!projectId && parcelId) {
      projectId = parcelId.split('-')[0] || '';
    }

    return {
      parcelId,
      projectId,
      current,
      total,
      href: href || safeLocation(window),
      hasBody: contexts[0]?.hasBody || false,
      hasDocumentElement: contexts[0]?.hasDocumentElement || false,
      debug: debugContexts,
    };
  } catch (error) {
    return {
      parcelId: '',
      projectId: '',
      current: 0,
      total: 0,
      href: typeof window !== 'undefined' ? window.location.href : '',
      error: error?.message || String(error),
    };
  }

  function readCarouselState(root) {
    if (!root) {
      return { current: 0, total: 0, indicatorCount: 0, itemCount: 0, indicatorCurrent: 0, itemCurrent: 0, dataCurrent: 0 };
    }

    const indicatorSelector = [
      ".el-carousel__indicator",
      "[class*=\"carousel__indicator\"]",
      "[data-slide-index]",
      "[data-index]",
      "[data-idx]",
    ].join(",");
    const indicators = Array.from(root.querySelectorAll(indicatorSelector));
    const indicatorCount = indicators.length;
    let indicatorCurrent = 0;

    indicators.forEach((indicator, idx) => {
      const className = indicator.className || "";
      const isActive = /is-active|active|current/i.test(className) || indicator.getAttribute("aria-current") === "true";
      if (!isActive) return;
      const label = indicator.getAttribute("aria-label") || indicator.textContent || "";
      const match = label.match(/\d+/);
      if (match) {
        indicatorCurrent = Number.parseInt(match[0], 10) || indicatorCurrent;
      } else {
        indicatorCurrent = idx + 1;
      }
      const dataIdx = indicator.getAttribute("data-index") || indicator.getAttribute("data-slide-index") || indicator.getAttribute("data-idx");
      if (dataIdx) {
        const parsed = Number.parseInt(dataIdx, 10);
        if (!Number.isNaN(parsed)) {
          indicatorCurrent = parsed <= 0 && indicatorCount > 1 ? parsed + 1 : parsed;
        }
      }
    });

    const itemSelector = [
      ".el-carousel__item",
      "[class*=\"carousel__item\"]",
      "[class*=\"swiper-slide\"]",
    ].join(",");
    const items = Array.from(root.querySelectorAll(itemSelector)).filter((node) => {
      const className = node.className || "";
      return !/is-cloned|clone/i.test(className);
    });
    const itemCount = items.length;
    let itemCurrent = 0;

    items.forEach((item, idx) => {
      const className = item.className || "";
      const ariaHidden = item.getAttribute("aria-hidden");
      const dataIdx = item.getAttribute("data-index") || item.getAttribute("data-idx");
      const isActive = /is-active|active|current|selected/i.test(className) || ariaHidden === "false";
      if (isActive) {
        itemCurrent = idx + 1;
      } else if (!itemCurrent && dataIdx) {
        const parsed = Number.parseInt(dataIdx, 10);
        if (!Number.isNaN(parsed)) {
          itemCurrent = parsed <= 0 && itemCount > 1 ? parsed + 1 : parsed;
        }
      }
    });

    const totalCandidates = [indicatorCount, itemCount].filter((value) => value > 0);
    const total = totalCandidates.length ? Math.max(...totalCandidates) : 0;

    const currentCandidates = [indicatorCurrent, itemCurrent].filter((value) => value > 0);
    const current = currentCandidates.length ? currentCandidates[0] : 0;

    return {
      current,
      total,
      indicatorCount,
      itemCount,
      indicatorCurrent,
      itemCurrent,
    };
  }

  function readParcelId(root) {
    if (!root) return '';
    const byText = root.innerText || '';
    const textMatch = byText.match(parcelPattern);
    if (textMatch) return textMatch[0];

    const selectors = ['[title*="地块编号"], [title*="地块编号："], [data-field*="地块"], [aria-label*="地块编号"]'];
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (!el) continue;
      const t = el.textContent || el.getAttribute('title') || '';
      const match = t.match(parcelPattern);
      if (match) return match[0];
    }

    const keywords = ['地块编号', '地块编号：', '地块编号:'];
    for (const key of keywords) {
      const label = Array.from(root.querySelectorAll('*')).find((node) => (node.textContent || '').trim() === key);
      if (!label) continue;
      const siblingText = label.nextElementSibling?.textContent || label.parentElement?.textContent || '';
      const match = siblingText.match(parcelPattern);
      if (match) return match[0];
    }

    return '';
  }

  function readProjectId(root) {
    if (!root) return '';
    const byText = root.innerText || '';
    const textMatch = byText.match(projectPattern);
    if (textMatch) return textMatch[0];

    const selectors = ['[title*="项目编号"], [aria-label*="项目编号"], [data-field*="项目编号"]'];
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (!el) continue;
      const t = el.textContent || el.getAttribute('title') || '';
      const matchSel = t.match(projectPattern);
      if (matchSel) return matchSel[0];
    }

    const keywords = ['项目编号', '项目编号：', '项目编号:'];
    for (const key of keywords) {
      const label = Array.from(root.querySelectorAll('*')).find((node) => (node.textContent || '').trim().startsWith(key));
      if (!label) continue;
      const combined = [
        label.textContent,
        label.nextElementSibling?.textContent,
        label.parentElement?.textContent,
      ].join(' ');
      const matchKey = combined.match(projectPattern);
      if (matchKey) return matchKey[0];
    }

    return '';
  }

  function readCurrentIndex(root) {
    if (!root) return 0;

    const byText = root.innerText || '';
    const ratio = byText.match(ratioPattern);
    if (ratio) {
      const parsed = parseInt(ratio[1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }

    const ratioElement = Array.from(root.querySelectorAll('*')).find((node) => {
      if (!node || node === root) return false;
      const text = (node.textContent || '').trim();
      if (!text || text.length > 40) return false;
      return ratioPattern.test(text);
    });
    if (ratioElement) {
      const match = (ratioElement.textContent || '').match(ratioPattern);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (!Number.isNaN(parsed) && parsed > 0) return parsed;
      }
    }

    const attrElement = Array.from(root.querySelectorAll('[aria-label],[title]')).find((node) => {
      const combined = `${node.getAttribute('aria-label') || ''} ${node.getAttribute('title') || ''}`.trim();
      return combined && ratioPattern.test(combined);
    });
    if (attrElement) {
      const combined = `${attrElement.getAttribute('aria-label') || ''} ${attrElement.getAttribute('title') || ''}`;
      const match = combined.match(ratioPattern);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (!Number.isNaN(parsed) && parsed > 0) return parsed;
      }
    }

    const spinNodes = Array.from(root.querySelectorAll('[role="spinbutton"],input[type="number"],input[type="text"]'));
    let fallback = 0;

    for (const spin of spinNodes) {
      const meta = [
        spin.getAttribute('aria-label'),
        spin.getAttribute('title'),
        spin.closest('label')?.textContent,
      ].filter(Boolean).join(' ');
      const hasHint = indexHintPattern.test(meta);
      const candidates = [
        spin.getAttribute('aria-valuenow'),
        spin.getAttribute('value'),
        spin.getAttribute('aria-valuetext'),
        typeof spin.value === 'string' ? spin.value : undefined,
        spin.textContent,
      ];
      for (const raw of candidates) {
        if (!raw) continue;
        const parsed = parseInt(String(raw).trim(), 10);
        if (Number.isNaN(parsed) || parsed <= 0) continue;
        if (hasHint) return parsed;
        if (!fallback) fallback = parsed;
      }
    }

    if (fallback) return fallback;
    return 0;
  }

  function readTotal(root) {
    if (!root) return 0;
    const byText = root.innerText || '';
    const ratio = byText.match(ratioPattern);
    if (ratio) {
      const parsed = parseInt(ratio[2], 10);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
    return 0;
  }
}

function ensureAllAzimuthsChecked() {
  const labels = Array.from(document.querySelectorAll('.el-checkbox__label'));
  const targetLabel = labels.find(el => el.textContent.trim().includes('全部方位角'));
  if (targetLabel) {
    const checkbox = targetLabel.closest('.el-checkbox');
    if (checkbox) {
      const isChecked = checkbox.classList.contains('is-checked') || checkbox.querySelector('.is-checked') || checkbox.querySelector('input:checked');
      if (!isChecked) {
        console.log("[QuickShot] All Azimuths not checked. Clicking it now.");
        checkbox.click();
        return true;
      } else {
        console.log("[QuickShot] All Azimuths is already checked.");
      }
    }
  } else {
    console.warn("[QuickShot] Could not find All Azimuths checkbox.");
  }
  return false;
}

async function startAutoCapture(tabId) {
  if (isAutoCapturing) {
    console.log("[QuickShot] Auto-capture already running");
    return;
  }
  isAutoCapturing = true;
  console.log("[QuickShot] Starting auto-capture...");
  try {
    await autoCaptureLoop(tabId);
  } catch (error) {
    console.error("[QuickShot] Auto-capture error:", error);
  } finally {
    isAutoCapturing = false;
    console.log("[QuickShot] Auto-capture stopped");
  }
}

function stopAutoCapture() {
  isAutoCapturing = false;
  console.log("[QuickShot] Stopping auto-capture...");
}

async function autoCaptureLoop(tabId) {
  let imageCount = 0;
  let lastContext = null;
  let stuckCount = 0;
  while (isAutoCapturing) {
    console.log(`[QuickShot] === Loop ${imageCount + 1} ===`);
    console.log(`[QuickShot] Capturing image ${imageCount + 1}...`);

    const context = await runCapture(tabId);
    imageCount++;

    console.log(`[QuickShot] Waiting 2s...`);
    await sleep(2000);

    let isLast = false;
    let usedContext = false;

    // Priority 1: Use context (current/total) if available
    if (context && context.current && context.total) {
      usedContext = true;
      if (context.current >= context.total) {
        isLast = true;
        console.log(`[QuickShot] Context indicates last image: ${context.current}/${context.total}`);
      } else {
        isLast = false;
        console.log(`[QuickShot] Context indicates more images: ${context.current}/${context.total}`);
      }
    }

    if (lastContext && context && context.current && lastContext.current) {
      if (context.current === lastContext.current) {
        stuckCount++;
        console.log(`[QuickShot] Detected stuck at index ${context.current}. Count: ${stuckCount}`);

        // Safety break only if stuck for a long time (e.g. 25 loops), 
        // assuming we are in an infinite loop with a broken button.
        if (stuckCount >= 25) {
          console.log(`[QuickShot] Stuck for 25 loops. Safety stop.`);
          isLast = true;
        }
      } else if (context.current < lastContext.current) {
        console.log(`[QuickShot] Detected index wrap-around ${lastContext.current} -> ${context.current}. Stopping.`);
        isLast = true;
      } else {
        stuckCount = 0; // Reset if we moved forward
      }
    } else {
      stuckCount = 0;
    }
    lastContext = context;

    // Priority 2: Fallback to DOM check if context is inconclusive and not already flagged as last
    if (!isLast && !usedContext) {
      const lastResults = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: checkIfLastImage,
      });
      isLast = lastResults.some(r => r.result === true);
      console.log(`[QuickShot] DOM check Is last?`, isLast);
    }

    if (isLast) {
      console.log("[QuickShot] Reached last image!");
      break;
    }

    console.log(`[QuickShot] Clicking next...`);
    const clickResults = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: clickNextButton,
    });

    // Check if any frame clicked a button
    const clickResult = clickResults.find(r => r.result && r.result !== "none")?.result || "none";
    console.log(`[QuickShot] Click result:`, clickResult);

    if (clickResult === "none") {
      console.warn("[QuickShot] Could not find next button in any frame.");
      break;
    }

    console.log(`[QuickShot] Waiting 1s for toast check...`);
    await sleep(1000);

    const toastResults = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: checkForLastImageToast,
    });
    const toastDetected = toastResults.some(r => r.result === true);
    if (toastDetected) {
      console.log("[QuickShot] Detected 'Already last image' toast. Stopping.");
      break;
    }

    console.log(`[QuickShot] Waiting 1.5s for load...`);
    await sleep(1500);
  }
  console.log(`[QuickShot] Completed! Captured ${imageCount} images.`);
}

function checkForLastImageToast() {
  if (document.body.innerText.includes("已经是最后一张了")) return true;
  const toasts = document.querySelectorAll('.el-message__content, .toast, .el-message');
  for (const toast of toasts) {
    if (toast.textContent.includes("已经是最后一张") || toast.textContent.includes("Last image")) return true;
  }
  return false;
}

function clickNextButton() {
  console.log("[QuickShot] Searching for next button...");
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // Priority 1: Standard Carousel Arrow (Element UI)
  const carouselArrows = document.querySelectorAll('.el-carousel__arrow--right');
  for (const btn of carouselArrows) {
    if (isVisible(btn) && !btn.disabled) {
      console.log("[QuickShot] Clicking .el-carousel__arrow--right");
      btn.click();
      return "clicked .el-carousel__arrow--right";
    }
  }

  // Priority 2: Text-based search for "下一张" (Next Image) or "Next" or ">"
  // We prioritize "下一张" as it is most specific to image switching
  const allButtons = document.querySelectorAll('button, [role="button"], span.btn-next, div.btn-next');
  for (const btn of allButtons) {
    if (!isVisible(btn)) continue;
    const text = (btn.innerText || '').trim();
    // Exact match or strong inclusion
    if (text === '下一张' || text === 'Next' || text === '>') {
      if (!btn.disabled && !btn.classList.contains('is-disabled')) {
        console.log(`[QuickShot] Clicking button with text "${text}"`);
        btn.click();
        return `clicked text "${text}"`;
      }
    }
    // Partial match for "下一张"
    if (text.includes('下一张')) {
      if (!btn.disabled && !btn.classList.contains('is-disabled')) {
        console.log(`[QuickShot] Clicking button containing "下一张"`);
        btn.click();
        return `clicked text "${text}"`;
      }
    }
  }

  // Priority 3: Caret Icon (Element UI) - often inside the button
  const caretIcons = document.querySelectorAll('.el-icon-caret-right, i.el-icon-caret-right');
  for (const icon of caretIcons) {
    if (isVisible(icon)) {
      const button = icon.closest('button') || icon.closest('[role="button"]') || icon.parentElement;
      if (button && !button.disabled && !button.classList.contains('is-disabled')) {
        console.log("[QuickShot] Clicking button with caret-right");
        button.click();
        return "clicked caret-right";
      }
    }
  }

  // Priority 4: Generic .right-btn (Low priority, as it might be 'Next Project')
  const rightBtns = document.querySelectorAll('.right-btn, span.right-btn');
  for (const container of rightBtns) {
    if (isVisible(container)) {
      const button = container.querySelector('button') || container;
      if (button && !button.disabled) {
        console.log("[QuickShot] Clicking .right-btn");
        button.click();
        return "clicked .right-btn";
      }
    }
  }

  console.log("[QuickShot] No next button found");
  return "none";
}

function checkIfLastImage() {
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  if (document.body.innerText.includes("已经是最后一张了")) return true;
  const toasts = document.querySelectorAll('.el-message__content, .toast');
  for (const toast of toasts) {
    if (toast.textContent.includes("已经是最后一张")) return true;
  }
  const nextBtns = document.querySelectorAll('.el-carousel__arrow--right, .btn-next, .right-btn');
  for (const btn of nextBtns) {
    if (isVisible(btn) && (btn.disabled || btn.classList.contains('is-disabled') || btn.classList.contains('disabled'))) {
      return true;
    }
  }
  return false;
}
