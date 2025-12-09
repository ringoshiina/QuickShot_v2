/**
 * QuickShot 工具函数
 * @module utils
 */

import { INVALID_SEGMENT_CHARS, DEFAULT_SETTINGS } from './constants.js';

/**
 * 简单延迟函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 清理输出根目录路径
 * @param {string} value - 原始路径值
 * @returns {string} 清理后的路径
 */
export function sanitizeOutputRoot(value) {
    if (!value) return DEFAULT_SETTINGS.outputRoot;
    const segments = String(value)
        .split(/[\\/]+/)
        .map((segment) => sanitizeSegment(segment))
        .filter(Boolean);
    return segments.join("/") || DEFAULT_SETTINGS.outputRoot;
}

/**
 * 清理路径片段
 * @param {string} value - 原始值
 * @param {string} fallback - 默认回退值
 * @returns {string} 清理后的路径片段
 */
export function sanitizePathSegment(value, fallback = "unknown") {
    const sanitized = sanitizeSegment(value);
    return sanitized || fallback;
}

/**
 * 清理单个路径片段（移除非法字符）
 * @param {string} value - 原始值
 * @returns {string} 清理后的值
 */
export function sanitizeSegment(value) {
    if (!value) return "";
    const cleaned = String(value)
        .replace(INVALID_SEGMENT_CHARS, "")
        .trim();
    if (cleaned === "." || cleaned === "..") {
        return "";
    }
    return cleaned;
}

/**
 * 根据地块/项目ID推导文件夹名
 * @param {string} parcelId - 地块编号
 * @param {string} projectId - 项目编号
 * @returns {string} 文件夹名
 */
export function deriveFolder(parcelId, projectId) {
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

/**
 * 日志输出（TODO: 后续可扩展为 chrome.notifications）
 * @param {string} message - 日志消息
 */
export function toast(message) {
    console.log("[QuickShot]", message);
}
