import codecs

# 读取文件
with codecs.open(r'C:\Users\Kuofu\Desktop\浏览器开发\QuickShot_v1.0.8\QuickShot_v1\sw.js', 'r', 'utf-8-sig') as f:
    lines = f.read lines()

# 找到插入位置并修改
output_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # 第1处：在 settingsCache = null 后添加 isAutoCapturing
    if 'let settingsCache = null;' in line and 'isAutoCapturing' not in ''.join(lines[max(0,i-2):i+3]):
        output_lines.append(line)
        output_lines.append('let isAutoCapturing = false;\n')
        i += 1
        continue
    
    # 第2处：在 chrome.storage.onChanged 的闭合括号后添加消息监听器
    if i < len(lines) - 1 and 'chrome.storage.onChanged' in line:
        # 找到这个监听器的结束位置
        output_lines.append(line)
        i += 1
        bracket_count = 1
        while i < len(lines) and bracket_count > 0:
            current_line = lines[i]
            output_lines.append(current_line)
            bracket_count += current_line.count('{') - current_line.count('}')
            i += 1
        
        # 现在添加消息监听器
        if 'chrome.runtime.onMessage' not in ''.join(lines[max(0,i-10):min(len(lines),i+10)]):
            output_lines.append('\n')
            output_lines.append('chrome.runtime.onMessage.addListener((request, sender, send Response) => {\n')
            output_lines.append('  if (request.action === "getAutoCaptureStatus") {\n')
            output_lines.append('    sendResponse({ isAutoCapturing });\n')
            output_lines.append('    return true;\n')
            output_lines.append('  }\n')
            output_lines.append('  if (request.action === "startAutoCapture") {\n')
            output_lines.append('    if (request.tabId) {\n')
            output_lines.append('      startAutoCapture(request.tabId);\n')
            output_lines.append('      sendResponse({ success: true });\n')
            output_lines.append('    }\n')
            output_lines.append('    return true;\n')
            output_lines.append('  }\n')
            output_lines.append('  if (request.action === "stopAutoCapture") {\n')
            output_lines.append('    stopAutoCapture();\n')
            output_lines.append('    sendResponse({ success: true });\n')
            output_lines.append('    return true;\n')
            output_lines.append('  }\n')
            output_lines.append('});\n')
        continue
    
    output_lines.append(line)
    i += 1

# 第3处：在文件末尾追加所有函数
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
    f.writelines(output_lines)
    f.write(functions)

print("Successfully updated sw.js!")
