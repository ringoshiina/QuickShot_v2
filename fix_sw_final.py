import codecs

# 读取文件
with codecs.open(r'C:\Users\Kuofu\Desktop\浏览器开发\QuickShot_v1.0.8\QuickShot_v1\sw.js', 'r', 'utf-8') as f:
    content = f.read()

# 修改1: 添加 isAutoCapturing 变量
content content.replace(
    'let settingsCache = null;',
    'let settingsCache = null;\nlet isAutoCapturing = false;'
, 1)

# 修改2: 添加消息监听器
old_listener = '''chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && ("outputRoot" in changes)) {
    settingsCache = null;
  }
});'''

new_listener = old_listener + '''

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
});'''

content = content.replace(old_listener, new_listener, 1)

# 修改3: 添加所有函数（注意增加了等待时间）
functions = '''
function ensureAllAzimuthsChecked() {
  const labels = Array.from(document.querySelectorAll('.el-checkbox__label'));
  const targetLabel = labels.find(el => el.textContent.trim().includes('全部方位角'));
  
  if (targetLabel) {
    const checkbox = targetLabel.closest('.el-checkbox');
    if (checkbox) {
      const isChecked = checkbox.classList.contains('is-checked') || 
                        checkbox.querySelector('.is-checked') || 
                        checkbox.querySelector('input:checked');
      
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
  
  while (isAutoCapturing) {
    console.log(`[QuickShot] === Loop ${imageCount + 1} ===`);
    console.log(`[QuickShot] Capturing image ${imageCount + 1}...`);
    
    await runCapture(tabId);
    imageCount++;
    
    console.log(`[QuickShot] Waiting 2s before checking...`);
    await sleep(2000);
    
    const [isLast] = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: checkIfLastImage,
    });
    
    console.log(`[QuickShot] Is last image?`, isLast?.result);
    
    if (isLast?.result) {
      console.log("[QuickShot] Reached last image!");
      break;
    }
    
    console.log(`[QuickShot] Clicking next button...`);
    const [clicked] = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: clickNextButton,
    });
    
    console.log(`[QuickShot] Click result:`, clicked?.result);
    
    if (!clicked?.result) {
      console.warn("[QuickShot] Could not find next button.");
      break;
    }
    
    console.log(`[QuickShot] Waiting 2.5s for next image...`);
    await sleep(2500);
  }
  
  console.log(`[QuickShot] Completed! Captured ${imageCount} images.`);
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

  const rightBtns = document.querySelectorAll('.right-btn, span.right-btn');
  console.log("[QuickShot] .right-btn:", rightBtns.length);
  
  for (const container of rightBtns) {
    if (isVisible(container)) {
      const button = container.querySelector('button');
      if (button && !button.disabled) {
        console.log("[QuickShot] Clicking .right-btn button");
        button.click();
        return true;
      }
    }
  }

  const caretIcons = document.querySelectorAll('.el-icon-caret-right, i.el-icon-caret-right');
  console.log("[QuickShot] caret-right:", caretIcons.length);
  
  for (const icon of caretIcons) {
    if (isVisible(icon)) {
      const button = icon.closest('button');
      if (button && !button.disabled) {
        console.log("[QuickShot] Clicking button with caret-right");
        button.click();
        return true;
      }
    }
  }

  console.log("[QuickShot] No next button found");
  return false;
}

function checkIfLastImage() {
  if (document.body.innerText.includes("已经是最后一张了")) {
    return true;
  }

  const toasts = document.querySelectorAll('.el-message__content, .toast');
  for (const toast of toasts) {
    if (toast.textContent.includes("已经是最后一张")) {
      return true;
    }
  }

  const nextBtns = document.querySelectorAll('.el-carousel__arrow--right, .btn-next, .right-btn');
  for (const btn of nextBtns) {
    if (btn.disabled) return true;
  }

  return false;
}
'''

# 写入文件
with codecs.open(r'C:\Users\Kuofu\Desktop\浏览器开发\QuickShot_v1.0.8\QuickShot_v1\sw.js', 'w', 'utf-8') as f:
    f.write(content + functions)

print("Successfully updated sw.js with longer wait times!")
