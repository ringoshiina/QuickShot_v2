/**
 * QuickShot 设置管理模块
 * @module settings
 */

import { DEFAULT_SETTINGS } from './constants.js';
import { sanitizeOutputRoot } from './utils.js';

/** 设置缓存（避免重复读取 storage） */
let settingsCache = null;

/**
 * 监听设置变化并清除缓存
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync") {
        // 任何设置变化都清除缓存
        settingsCache = null;
        console.log("[QuickShot] Settings changed, cache cleared");
    }
});

/**
 * 获取当前设置（带缓存）
 * @returns {Promise<Object>} 设置对象
 */
export async function getSettings() {
    if (settingsCache) return settingsCache;
    const settings = await readSettingsFromStorage();
    settingsCache = settings;
    return settings;
}

/**
 * 从 chrome.storage.sync 读取设置
 * @returns {Promise<Object>} 设置对象
 */
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
                captureDelay: Number.parseInt(items.captureDelay, 10) || 2500,
                maxCaptureCount: Number.parseInt(items.maxCaptureCount, 10) || 0,
                parcelSwitchDelay: Number.parseInt(items.parcelSwitchDelay, 10) || 3500,
                autoSwitchParcel: items.autoSwitchParcel !== false,
            });
        });
    });
}
