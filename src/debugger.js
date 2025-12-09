/**
 * QuickShot Chrome Debugger 封装
 * @module debugger
 */

import { BLANK_RETRY_LIMIT, BLANK_RETRY_DELAY, BLANK_THRESHOLD } from './constants.js';
import { sleep } from './utils.js';

/**
 * 附加调试器到标签页
 * @param {number} tabId - 标签页 ID
 * @returns {Promise<void>}
 */
export async function attachDebugger(tabId) {
    await new Promise((resolve, reject) => {
        chrome.debugger.attach({ tabId }, "1.3", () => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve();
        });
    });
    await sendCDP(tabId, "Page.enable");
}

/**
 * 从标签页分离调试器
 * @param {number} tabId - 标签页 ID
 * @returns {Promise<void>}
 */
export async function detachDebugger(tabId) {
    await new Promise((resolve) => {
        chrome.debugger.detach({ tabId }, () => resolve());
    });
}

/**
 * 发送 CDP (Chrome DevTools Protocol) 命令
 * @param {number} tabId - 标签页 ID
 * @param {string} method - CDP 方法名
 * @param {Object} params - 参数对象
 * @returns {Promise<Object>} 响应结果
 */
export function sendCDP(tabId, method, params) {
    return new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId }, method, params || {}, (result) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(result || {});
        });
    });
}

/**
 * 带重试的截图捕获
 * @param {number} tabId - 标签页 ID
 * @returns {Promise<Object>} 截图数据对象 { data: base64 }
 */
export async function captureScreenshotWithRetry(tabId) {
    const metrics = await sendCDP(tabId, "Page.getLayoutMetrics");
    // Use cssLayoutViewport (visible area) instead of contentSize (full document)
    const viewport = metrics.cssLayoutViewport || metrics.layoutViewport;
    const width = Math.ceil(viewport?.clientWidth || metrics.contentSize?.width || 0);
    const height = Math.ceil(viewport?.clientHeight || metrics.contentSize?.height || 0);

    if (!width || !height) throw new Error("未能获取页面尺寸");

    let latest = null;
    for (let attempt = 0; attempt < BLANK_RETRY_LIMIT; attempt += 1) {
        const screenshot = await sendCDP(tabId, "Page.captureScreenshot", {
            format: "png",
            fromSurface: true,
            captureBeyondViewport: false,
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

/**
 * 检测截图是否为空白
 * @param {string} base64Data - Base64 编码的图片数据
 * @returns {Promise<boolean>} 是否为空白
 */
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
