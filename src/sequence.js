/**
 * QuickShot 序列解析与稳定化
 * @module sequence
 */

import { RATIO_PATTERN, INDEX_HINT_PATTERN } from './constants.js';

/** 序列记忆存储 */
const sequenceMemory = new Map();

/**
 * 从上下文中解析序列号
 * @param {Object} context - 抓取的上下文对象
 * @returns {Object} { current, total, confidence, source }
 */
export function resolveSequence(context) {
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

/**
 * 稳定化序列号（防止跳跃和异常）
 * @param {string} parcelId - 地块编号
 * @param {Object} sequence - 解析后的序列
 * @returns {Object} 稳定化后的序列
 */
export function stabilizeSequence(parcelId, sequence) {
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

/**
 * 清理过期的序列记忆（防止内存泄漏）
 * @param {number} maxAgeMs - 最大存活时间（毫秒），默认 30 分钟
 */
export function cleanupSequenceMemory(maxAgeMs = 30 * 60 * 1000) {
    const now = Date.now();
    for (const [key, value] of sequenceMemory.entries()) {
        if (now - value.updatedAt > maxAgeMs) {
            sequenceMemory.delete(key);
        }
    }
}
