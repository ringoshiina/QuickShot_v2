import codecs
import re

# 读取原始文件
with codecs.open(r'C:\Users\Kuofu\Desktop\浏览器开发\QuickShot_v1.0.8\QuickShot_v1\sw.js', 'r', 'utf-8') as f:
    content = f.read()

# 修改1: 在第11行后添加 isAutoCapturing
content = content.replace(
    'let settingsCache = null;',
    'let settingsCache = null;\nlet isAutoCapturing = false;'
)

# 修改2: 在 chrome.storage.onChanged 后添加消息监听器
storage_listener = '''chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && ("outputRoot" in changes)) {
    settingsCache = null;
  }
});'''

replacement = storage_listener + '''

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

content = content.replace(storage_listener, replacement)

# 修改3: 在文件末尾添加所有函数
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
    console.log(`[QuickShot] Capturing image ${imageCount + 1}...`);
    
    await runCapture(tabId);
    imageCount++;
    
    await sleep(1000);
    
    const [isLast] = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: checkIfLastImage,
    });
    
    if (isLast?.result) {
      console.log("[QuickShot] Reached last image!");
      break;
    }
    
    const [clicked] = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: clickNextButton,
    });
    
    if (!clicked?.result) {
      console.warn("[QuickShot] Could not find next button.");
      break;
    }
    
    await sleep(1500);
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

  // 策略1: 查找 .right-btn 容器
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

  // 策略2: 查找 el-icon-caret-right 图标
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

# 追加函数
with codecs.open(r'C:\Users\Kuofu\Desktop\浏览器开发\QuickShot_v1.0.8\QuickShot_v1\sw.js', 'w', 'utf-8') as f:
    f.write(content + functions)

print("Successfully updated sw.js!")
