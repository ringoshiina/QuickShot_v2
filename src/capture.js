/**
 * QuickShot 截图核心模块
 * @module capture
 */

import { DEFAULT_SETTINGS, RATIO_PATTERN } from './constants.js';
import { getSettings } from './settings.js';
import { toast, sanitizePathSegment, deriveFolder } from './utils.js';
import { attachDebugger, detachDebugger, captureScreenshotWithRetry } from './debugger.js';
import { scrapeContext, ensureAllAzimuthsChecked } from './scraper.js';
import { resolveSequence, stabilizeSequence } from './sequence.js';

/**
 * 获取截图上下文信息
 * @param {number} tabId - 标签页 ID
 * @returns {Promise<Object|null>} 上下文对象或 null
 */
export async function getCaptureContext(tabId) {
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

        if ((normalizedCtx.parcelId || normalizedCtx.projectId)) {
            return {
                context: normalizedCtx,
                frameId: entry.frameId,
            };
        }
    }
    return null;
}

/**
 * 执行单次截图
 * @param {number} tabId - 标签页 ID
 * @returns {Promise<Object|undefined>} 上下文对象或 undefined
 */
export async function runCapture(tabId) {
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
