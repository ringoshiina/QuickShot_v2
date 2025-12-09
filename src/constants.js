/**
 * QuickShot 常量定义
 * @module constants
 */

// ============================================================================
// 默认设置
// ============================================================================

/** 默认设置对象 */
export const DEFAULT_SETTINGS = Object.freeze({
    outputRoot: "F24",
    captureDelay: 2500,
    maxCaptureCount: 0,
    parcelSwitchDelay: 3500,
    autoSwitchParcel: true,
});

/** 匹配序号比例格式，如 "1/10" 或 "3／5" */
export const RATIO_PATTERN = /(\d+)\s*[/／]\s*(\d+)/;
export const RATIO_PATTERN_GLOBAL = /(\d+)\s*[/／]\s*(\d+)/g;

/** 匹配序号相关提示词 */
export const INDEX_HINT_PATTERN = /(?:序号|当前|index|sequence)/i;

/** 匹配非法路径字符 */
export const INVALID_SEGMENT_CHARS = /[<>:"\\/|?*\r\n]+/g;

/** 匹配地块编号格式，如 "F24ABC-1-2" */
export const PARCEL_PATTERN = /[A-Z]{1,2}\d{2}[A-Z0-9]+(?:-\d+)+/;
export const PARCEL_PATTERN_GLOBAL = /[A-Z]{1,2}\d{2}[A-Z0-9]+(?:-\d+)+/g;

/** 匹配项目编号格式，如 "F24ABC" */
export const PROJECT_PATTERN = /\b[A-Z]{1,2}\d{2}[A-Z0-9]+\b/;

// ============================================================================
// 截图相关常量
// ============================================================================

/** 空白截图重试次数上限 */
export const BLANK_RETRY_LIMIT = 3;

/** 空白截图重试间隔（毫秒） */
export const BLANK_RETRY_DELAY = 700;

/** 空白截图判定阈值（白色像素占比） */
export const BLANK_THRESHOLD = 0.94;

// ============================================================================
// UI 选择器
// ============================================================================

/** Element UI 轮播图指示器选择器 */
export const CAROUSEL_INDICATOR_SELECTORS = [
    ".el-carousel__indicator",
    '[class*="carousel__indicator"]',
    "[data-slide-index]",
    "[data-index]",
    "[data-idx]",
].join(",");

/** Element UI 轮播图条目选择器 */
export const CAROUSEL_ITEM_SELECTORS = [
    ".el-carousel__item",
    '[class*="carousel__item"]',
    '[class*="swiper-slide"]',
].join(",");

/** 下一张按钮选择器列表（按优先级排序） */
export const NEXT_BUTTON_SELECTORS = [
    ".el-carousel__arrow--right",
    ".btn-next",
    ".right-btn",
    '[class*="next-btn"]',
    ".el-icon-caret-right",
];

/** 地块编号标签选择器 */
export const PARCEL_LABEL_SELECTORS = [
    '[title*="地块编号"]',
    '[title*="地块编号："]',
    '[data-field*="地块"]',
    '[aria-label*="地块编号"]',
].join(", ");

/** 项目编号标签选择器 */
export const PROJECT_LABEL_SELECTORS = [
    '[title*="项目编号"]',
    '[aria-label*="项目编号"]',
    '[data-field*="项目编号"]',
].join(", ");
