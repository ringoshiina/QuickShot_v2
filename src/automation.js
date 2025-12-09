/**
 * QuickShot 自动连拍模块
 * @module automation
 */

import { getSettings } from './settings.js';
import { sleep, toast } from './utils.js';
import { getCaptureContext, runCapture } from './capture.js';
import { cleanupSequenceMemory } from './sequence.js';
import {
    clickNextButton,
    clickNextParcelButton,
    clickFirstThumbnail,
    checkIfLastImage,
    checkForLastImageToast,
    showAlertFunc,
    waitForImageLoad,
    zoomInMap
} from './ui-interactions.js';
import {
    showProgressBadge,
    showRecordingBadge,
    clearBadge,
    showParcelSwitchNotification,
    showCompletionNotification
} from './badge.js';

/** 自动连拍状态标志 */
let isAutoCapturing = false;

/**
 * 获取自动连拍状态
 * @returns {boolean} 是否正在自动连拍
 */
export function getAutoCaptureStatus() {
    return isAutoCapturing;
}

/**
 * 开始自动连拍
 * @param {number} tabId - 标签页 ID
 */
export async function startAutoCapture(tabId) {
    if (isAutoCapturing) {
        console.log("[QuickShot] Auto-capture already running");
        return;
    }
    isAutoCapturing = true;
    console.log("[QuickShot] Starting auto-capture...");
    await showRecordingBadge(); // 显示 REC Badge
    try {
        await autoCaptureLoop(tabId);
    } catch (error) {
        console.error("[QuickShot] Auto-capture error:", error);
    } finally {
        isAutoCapturing = false;
        await clearBadge(); // 清除 Badge
        // 清理过期的序列记忆，防止内存泄漏
        cleanupSequenceMemory();
        console.log("[QuickShot] Auto-capture stopped, memory cleaned up");
    }
}

/**
 * 停止自动连拍
 */
export function stopAutoCapture() {
    isAutoCapturing = false;
    console.log("[QuickShot] Stopping auto-capture...");
}

/**
 * 自动连拍主循环
 * @param {number} tabId - 标签页 ID
 */
async function autoCaptureLoop(tabId) {
    let imageCount = 0;
    let lastContext = null;
    let stuckCount = 0;

    while (isAutoCapturing) {
        console.log(`[QuickShot] === Loop ${imageCount + 1} ===`);

        // Check max capture count
        const settings = await getSettings();
        if (settings.maxCaptureCount > 0 && imageCount >= settings.maxCaptureCount) {
            console.log(`[QuickShot] Reached max capture count (${settings.maxCaptureCount}). Stopping.`);
            break;
        }

        console.log(`[QuickShot] Capturing image ${imageCount + 1}...`);
        const context = await runCapture(tabId);
        imageCount++;

        // 更新进度 Badge
        await showProgressBadge(imageCount, context?.total || 0);

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
                if (stuckCount >= 25) {
                    console.log(`[QuickShot] Stuck for 25 loops. Safety stop.`);
                    isLast = true;
                }
            } else if (context.current < lastContext.current) {
                console.log(`[QuickShot] Detected index wrap-around ${lastContext.current} -> ${context.current}. Stopping.`);
                isLast = true;
            } else {
                stuckCount = 0;
            }
        } else {
            stuckCount = 0;
        }
        lastContext = context;

        // Priority 2: Fallback to DOM check if context is inconclusive
        if (!isLast && !usedContext) {
            const lastResults = await chrome.scripting.executeScript({
                target: { tabId, allFrames: true },
                func: checkIfLastImage,
            });
            isLast = lastResults.some(r => r.result === true);
            console.log(`[QuickShot] DOM check Is last?`, isLast);
        }

        if (isLast) {
            // 检查是否启用自动切换地块
            if (!settings.autoSwitchParcel) {
                console.log("[QuickShot] Reached last image. Auto-switch disabled, stopping.");
                await showAlert(tabId, "当前地块截图完成！（自动切换已禁用）");
                break;
            }
            console.log("[QuickShot] Reached last image! Attempting to switch to next parcel...");
            const switchSuccess = await switchParcel(tabId, settings.parcelSwitchDelay);
            if (switchSuccess) {
                console.log("[QuickShot] Parcel switch initiated. Continuing with next parcel.");
                lastContext = null;
                stuckCount = 0;
                await sleep(5000);
                continue;
            } else {
                console.log("[QuickShot] Parcel switch failed or no next parcel. Stopping.");
                await showAlert(tabId, "全部地块已截图完成！");
                break;
            }
        }

        console.log(`[QuickShot] Clicking next...`);
        const clickResults = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            func: clickNextButton,
        });

        const clickResult = clickResults.find(r => r.result && r.result !== "none")?.result || "none";
        console.log(`[QuickShot] Click result:`, clickResult);

        // 重试逻辑：如果第一次点击失败，等待后重试
        if (clickResult === "none") {
            console.warn("[QuickShot] First click attempt failed, retrying...");
            let retrySuccess = false;
            for (let retry = 1; retry <= 3; retry++) {
                await sleep(1000);
                console.log(`[QuickShot] Retry ${retry}/3...`);
                const retryResults = await chrome.scripting.executeScript({
                    target: { tabId, allFrames: true },
                    func: clickNextButton,
                });
                const retryResult = retryResults.find(r => r.result && r.result !== "none")?.result || "none";
                if (retryResult !== "none") {
                    console.log(`[QuickShot] Retry ${retry} succeeded:`, retryResult);
                    retrySuccess = true;
                    break;
                }
            }
            if (!retrySuccess) {
                console.warn("[QuickShot] Could not find next button after 3 retries.");
                break;
            }
        }

        console.log(`[QuickShot] Waiting 1s for toast check...`);
        await sleep(1000);

        const toastResults = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            func: checkForLastImageToast,
        });
        const toastDetected = toastResults.some(r => r.result === true);
        if (toastDetected) {
            // 检查是否启用自动切换地块
            if (!settings.autoSwitchParcel) {
                console.log("[QuickShot] Detected last image toast. Auto-switch disabled, stopping.");
                await showAlert(tabId, "当前地块截图完成！（自动切换已禁用）");
                break;
            }
            console.log("[QuickShot] Detected 'Already last image' toast. Attempting to switch to next parcel...");
            const switchSuccess = await switchParcel(tabId, settings.parcelSwitchDelay);
            if (switchSuccess) {
                console.log("[QuickShot] Parcel switch initiated (via toast). Continuing with next parcel.");
                lastContext = null;
                stuckCount = 0;
                await sleep(5000);
                continue;
            } else {
                console.log("[QuickShot] Parcel switch failed or no next parcel (via toast). Stopping.");
                await showAlert(tabId, "全部地块已截图完成！");
                break;
            }
        }

        // 动态等待图片加载完成，使用 captureDelay 作为超时保底
        console.log(`[QuickShot] Waiting for image load (timeout: ${settings.captureDelay || 2500}ms)...`);
        const waitResults = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            func: waitForImageLoad,
            args: [settings.captureDelay || 2500]
        });
        const waitResult = waitResults.find(r => r.result?.loaded)?.result || { loaded: false, reason: 'no-result' };
        console.log(`[QuickShot] Image load result:`, waitResult);
    }
    console.log(`[QuickShot] Completed! Captured ${imageCount} images.`);
    // 显示完成通知
    await showCompletionNotification(imageCount, 'QuickShot 输出目录');
}

/**
 * 切换到下一个地块
 * @param {number} tabId - 标签页 ID
 * @param {number} delay - 切换等待时间
 * @returns {Promise<boolean>} 是否成功切换
 */
async function switchParcel(tabId, delay) {
    console.log(`[QuickShot] Switching parcel. Waiting ${delay}ms before clicking next...`);

    // Get current parcel ID before switch
    const beforeContext = await getCaptureContext(tabId);
    const beforeParcelId = beforeContext?.context?.parcelId;

    // Step 1: Click "Next Parcel" button
    const clickNextResult = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: clickNextParcelButton,
    });

    const clickedNext = clickNextResult.some(r => r.result === true);
    if (!clickedNext) {
        console.warn("[QuickShot] Could not find 'Next Parcel' button.");
        return false;
    }

    // Step 2: Wait for the specified delay
    await sleep(delay);

    // Step 3: Click the first thumbnail
    console.log("[QuickShot] Clicking first thumbnail...");
    const clickThumbResult = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: clickFirstThumbnail,
    });

    const clickedThumb = clickThumbResult.some(r => r.result === true);
    if (!clickedThumb) {
        console.warn("[QuickShot] Could not find 'First Thumbnail'.");
        return false;
    }

    // Step 4: Verify if parcel ID changed
    await sleep(2000);
    const afterContext = await getCaptureContext(tabId);
    const afterParcelId = afterContext?.context?.parcelId;

    if (beforeParcelId && afterParcelId && beforeParcelId === afterParcelId) {
        console.warn(`[QuickShot] Parcel ID did not change (${beforeParcelId} -> ${afterParcelId}). Switch failed.`);
        return false;
    }

    // Step 5: 自动放大地图（尝试 2 级）
    console.log("[QuickShot] Auto-zooming map...");
    await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: zoomInMap,
        args: [2]
    });
    await sleep(500); // 等待地图动画完成

    // Step 6: 提示用户确认（如果自动缩放不够理想）
    console.log("[QuickShot] Prompting user to verify map zoom...");
    await showAlert(tabId, "已切换到新地块并尝试自动放大地图！如果箭头仍不清晰，请手动调整后点击确定继续。");

    return true;
}

/**
 * 显示 Alert 弹窗
 * @param {number} tabId - 标签页 ID
 * @param {string} message - 消息内容
 */
async function showAlert(tabId, message) {
    await chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        func: (msg) => { alert(msg); },
        args: [message]
    });
}
