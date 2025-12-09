/**
 * QuickShot Badge 和通知模块
 * @module badge
 */

/**
 * 更新扩展图标 Badge
 * @param {string} text - Badge 文本（最多4个字符）
 * @param {string} color - Badge 背景颜色
 */
export async function setBadge(text, color = '#4CAF50') {
    try {
        await chrome.action.setBadgeText({ text: text || '' });
        await chrome.action.setBadgeBackgroundColor({ color });
    } catch (e) {
        console.warn('[QuickShot] Failed to set badge:', e);
    }
}

/**
 * 显示截图进度 Badge
 * @param {number} current - 当前截图序号
 * @param {number} total - 总数（可选）
 */
export async function showProgressBadge(current, total) {
    const text = total > 0 ? `${current}/${total}` : `${current}`;
    // 限制最多4个字符
    const displayText = text.length > 4 ? `${current}` : text;
    await setBadge(displayText, '#2196F3');
}

/**
 * 显示录制中 Badge
 */
export async function showRecordingBadge() {
    await setBadge('REC', '#F44336');
}

/**
 * 清除 Badge
 */
export async function clearBadge() {
    await setBadge('');
}

/**
 * 显示 Chrome 通知
 * @param {string} title - 通知标题
 * @param {string} message - 通知内容
 * @param {string} type - 通知类型：'basic', 'progress'
 * @returns {Promise<string>} 通知 ID
 */
export async function showNotification(title, message, type = 'basic') {
    try {
        const notificationId = `quickshot-${Date.now()}`;
        await chrome.notifications.create(notificationId, {
            type,
            iconUrl: 'icon.png',
            title,
            message,
            priority: 2
        });
        return notificationId;
    } catch (e) {
        console.warn('[QuickShot] Failed to show notification:', e);
        return null;
    }
}

/**
 * 显示地块切换提示通知（替代 alert）
 * @returns {Promise<string>} 通知 ID
 */
export async function showParcelSwitchNotification() {
    return await showNotification(
        '已切换到新地块',
        '请手动调整地图缩放级别（按键盘+放大），使方位角箭头清晰可见。调整完成后继续截图。'
    );
}

/**
 * 显示截图完成通知
 * @param {number} count - 截图数量
 * @param {string} folder - 保存文件夹
 */
export async function showCompletionNotification(count, folder) {
    return await showNotification(
        '截图完成！',
        `共截取 ${count} 张图片，保存至: ${folder}`
    );
}
