/**
 * QuickShot - Chrome Extension Service Worker 入口
 * 
 * 一键整页截图，并按 {项目编号}/{地块编号}.png 命名保存
 * 
 * @author QuickShot Team
 * @version 4.0
 */

import { runCapture } from './src/capture.js';
import { startAutoCapture, stopAutoCapture, getAutoCaptureStatus } from './src/automation.js';

// ============================================================================
// 消息处理
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getAutoCaptureStatus") {
    sendResponse({ isAutoCapturing: getAutoCaptureStatus() });
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

// ============================================================================
// 扩展图标点击处理
// ============================================================================

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  runCapture(tab.id);
});

// ============================================================================
// 快捷键处理
// ============================================================================

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === "quickshot") runCapture(tab.id);
});
