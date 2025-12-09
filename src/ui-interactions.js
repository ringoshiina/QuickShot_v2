/**
 * QuickShot UI 交互函数（可注入）
 * @module ui-interactions
 */

export function clickNextButton() {
    function isVisible(el) {
        if (!el) return false;
        try {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        } catch (e) { return false; }
    }

    function isClickable(el) {
        if (!el || !isVisible(el)) return false;
        if (el.disabled) return false;
        if (el.classList.contains('is-disabled') || el.classList.contains('disabled')) return false;
        return true;
    }

    console.log("[QuickShot] Searching for next button...");

    const carouselSelectors = ['.el-carousel__arrow--right', '.el-carousel__arrow.el-carousel__arrow--right'];
    for (const selector of carouselSelectors) {
        try {
            const elements = document.querySelectorAll(selector);
            for (const btn of elements) {
                if (isClickable(btn)) {
                    console.log(`[QuickShot] Clicking carousel arrow: ${selector}`);
                    btn.click();
                    return `clicked ${selector}`;
                }
            }
        } catch (e) { }
    }

    const textPatterns = ['下一张', '下一张>', '下一张 >'];
    const excludePatterns = ['下一条', '下一项', '下一页', '祝捷', '用户', '普通用户'];
    const buttonSelectors = ['button', '[role="button"]', '.btn-next', '[class*="next-btn"]'];

    for (const selector of buttonSelectors) {
        try {
            const elements = document.querySelectorAll(selector);
            for (const btn of elements) {
                if (!isClickable(btn)) continue;
                const text = (btn.innerText || btn.textContent || '').trim();
                if (excludePatterns.some(ex => text.includes(ex))) continue;
                for (const pattern of textPatterns) {
                    if (text === pattern || (text.includes(pattern) && !text.includes('条'))) {
                        console.log(`[QuickShot] Clicking button with text "${text}"`);
                        btn.click();
                        return `clicked text "${text}"`;
                    }
                }
            }
        } catch (e) { }
    }

    const iconSelectors = ['.el-icon-caret-right', '.el-icon-arrow-right', 'i.el-icon-caret-right'];
    for (const selector of iconSelectors) {
        try {
            const icons = document.querySelectorAll(selector);
            for (const icon of icons) {
                if (!isVisible(icon)) continue;
                const button = icon.closest('button') || icon.closest('[role="button"]') || icon.parentElement;
                if (isClickable(button)) {
                    const parentText = (button.innerText || button.textContent || '').trim();
                    if (excludePatterns.some(ex => parentText.includes(ex))) continue;
                    console.log(`[QuickShot] Clicking icon button: ${selector}`);
                    button.click();
                    return `clicked icon ${selector}`;
                }
            }
        } catch (e) { }
    }

    console.log("[QuickShot] No next button found");
    return "none";
}

export function clickNextParcelButton() {
    console.log("[QuickShot] Searching for next parcel button...");
    const excludePatterns = ['用户', '普通用户', '头像', '个人', '登录'];
    const zdkButtons = document.querySelectorAll('div.zdkBtn, .zdkBtn');

    for (const el of zdkButtons) {
        const text = (el.textContent || '').trim();
        if (excludePatterns.some(ex => text.includes(ex))) continue;
        if (text.includes('下一个')) {
            const rect = el.getBoundingClientRect();
            if (rect.top > window.innerHeight * 0.3) {
                console.log(`[QuickShot] Clicking Next Parcel button: text="${text}"`);
                el.click();
                return true;
            }
        }
    }
    console.log("[QuickShot] Next Parcel button not found");
    return false;
}

export function clickFirstThumbnail() {
    console.log("[QuickShot] Searching for first thumbnail...");

    function isInDialog(el) {
        let current = el;
        while (current) {
            const className = (current.className || '').toLowerCase();
            if (className.includes('dialog') || className.includes('modal') || className.includes('el-dialog')) {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    }

    function isAvatarRelated(el) {
        let current = el;
        for (let i = 0; i < 8 && current; i++) {
            const text = (current.textContent || '').trim();
            const excludeTexts = ['用户', '普通用户', '头像', '个人信息', '点击更换头像'];
            for (const ex of excludeTexts) {
                if (text.includes(ex)) return true;
            }
            current = current.parentElement;
        }
        return false;
    }

    const containers = document.querySelectorAll('.demo-image__preview');
    console.log(`[QuickShot] Found ${containers.length} demo-image__preview elements`);

    for (const container of containers) {
        if (isInDialog(container)) continue;
        if (isAvatarRelated(container)) continue;
        const rect = container.getBoundingClientRect();
        if (rect.top < 100 || rect.left < window.innerWidth * 0.4) continue;
        if (rect.width < 50 || rect.height < 50) continue;
        const img = container.querySelector('img') || container;
        console.log(`[QuickShot] Clicking first thumbnail: left=${rect.left}, top=${rect.top}`);
        img.click();
        return true;
    }
    console.log("[QuickShot] First thumbnail not found");
    return false;
}

export function checkIfLastImage() {
    const lastImageTexts = ['已经是最后一张了', '已经是最后一张', '已是最后'];
    const bodyText = document.body.innerText || '';
    for (const text of lastImageTexts) {
        if (bodyText.includes(text)) return true;
    }
    const toastSelectors = ['.el-message__content', '.el-message', '.toast'];
    for (const selector of toastSelectors) {
        try {
            const toasts = document.querySelectorAll(selector);
            for (const toast of toasts) {
                const text = toast.textContent || '';
                for (const pattern of lastImageTexts) {
                    if (text.includes(pattern)) return true;
                }
            }
        } catch (e) { }
    }
    return false;
}

export function checkForLastImageToast() {
    const lastImageTexts = ['已经是最后一张了', '已经是最后一张'];
    const bodyText = document.body.innerText || '';
    for (const text of lastImageTexts) {
        if (bodyText.includes(text)) return true;
    }
    const toastSelectors = ['.el-message__content', '.toast', '.el-message'];
    for (const selector of toastSelectors) {
        try {
            const toasts = document.querySelectorAll(selector);
            for (const toast of toasts) {
                const text = toast.textContent || '';
                for (const pattern of lastImageTexts) {
                    if (text.includes(pattern)) return true;
                }
            }
        } catch (e) { }
    }
    return false;
}

export function showAlertFunc(msg) {
    alert(msg);
}

export function zoomInMap(levels = 1) {
    console.log(`[QuickShot] Attempting to zoom in map by ${levels} level(s)...`);

    // 策略 1：尝试调用 Esri/ArcGIS JavaScript API
    const esriViewNames = ['view', 'mapView', 'sceneView', '__esri_view__'];
    for (const name of esriViewNames) {
        const viewObj = window[name];
        if (viewObj && typeof viewObj.zoom !== 'undefined') {
            console.log(`[QuickShot] Found Esri view object: ${name}, current zoom: ${viewObj.zoom}`);
            try {
                // 方法 A：直接设置 zoom 属性
                viewObj.zoom = viewObj.zoom + levels;
                console.log(`[QuickShot] Set zoom to ${viewObj.zoom}`);
                return `esri-zoom-${name}`;
            } catch (e) {
                console.warn(`[QuickShot] Failed to set zoom via ${name}:`, e);
            }
        }
        if (viewObj && typeof viewObj.goTo === 'function') {
            console.log(`[QuickShot] Found Esri view with goTo: ${name}`);
            try {
                // 方法 B：使用 goTo 方法
                viewObj.goTo({ zoom: viewObj.zoom + levels });
                console.log(`[QuickShot] Called goTo with zoom ${viewObj.zoom + levels}`);
                return `esri-goTo-${name}`;
            } catch (e) {
                console.warn(`[QuickShot] Failed to call goTo via ${name}:`, e);
            }
        }
    }

    // 策略 2：查找页面上可能暴露的 view 对象
    const esriContainer = document.querySelector('.esri-view');
    if (esriContainer) {
        // 尝试从元素属性中获取 view
        const possibleProps = ['__view', '_view', 'view', '__esriView'];
        for (const prop of possibleProps) {
            if (esriContainer[prop] && typeof esriContainer[prop].zoom !== 'undefined') {
                console.log(`[QuickShot] Found view on element.${prop}`);
                try {
                    esriContainer[prop].zoom = esriContainer[prop].zoom + levels;
                    return `esri-element-${prop}`;
                } catch (e) {
                    console.warn(`[QuickShot] Failed to zoom via element.${prop}:`, e);
                }
            }
        }
    }

    // 策略 3：尝试 require 加载 Esri 模块
    if (typeof window.require === 'function') {
        try {
            window.require(['esri/views/MapView'], (MapView) => {
                console.log('[QuickShot] Loaded MapView via AMD, but cannot access instance');
            });
        } catch (e) {
            // AMD not available
        }
    }

    // 策略 4：模拟鼠标滚轮事件（可能不生效，但作为备用）
    const mapSelectors = ['.esri-view-surface', '.esri-view', 'canvas'];
    let mapElement = null;
    for (const selector of mapSelectors) {
        mapElement = document.querySelector(selector);
        if (mapElement) break;
    }

    if (mapElement) {
        const rect = mapElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        console.log(`[QuickShot] Fallback: wheel event at (${centerX}, ${centerY})`);

        for (let i = 0; i < levels; i++) {
            const wheelEvent = new WheelEvent('wheel', {
                deltaY: -120,
                deltaMode: 0,
                clientX: centerX,
                clientY: centerY,
                bubbles: true,
                cancelable: true,
                view: window
            });
            mapElement.dispatchEvent(wheelEvent);
        }

        // 也尝试双击
        const dblClickEvent = new MouseEvent('dblclick', {
            clientX: centerX,
            clientY: centerY,
            bubbles: true,
            cancelable: true,
            view: window
        });
        mapElement.dispatchEvent(dblClickEvent);

        return `fallback-wheel-dblclick`;
    }

    console.log('[QuickShot] Could not find any map element or API');
    return 'none';
}

/**
 * 等待主图片加载完成
 * 此函数在 iframe 中执行，查找最大的可见图片并等待其加载
 * @param {number} timeoutMs - 超时时间（毫秒）
 * @returns {Promise<Object>} 返回加载状态
 */
export function waitForImageLoad(timeoutMs = 5000) {
    return new Promise((resolve) => {
        console.log('[QuickShot] waitForImageLoad: Starting...');

        // 查找大图容器中的图片（Element UI 的 el-image 组件）
        const imageSelectors = [
            '.el-image__inner',           // Element UI 图片组件
            '.el-carousel__item.is-active img',  // 轮播图当前项
            '.preview-image img',          // 预览图片
            'img[src*="landcloud"]',       // Landcloud CDN 图片
            'img'                          // 兜底：任意图片
        ];

        let targetImg = null;
        let largestArea = 0;

        // 找到页面上最大的可见图片
        for (const selector of imageSelectors) {
            const imgs = document.querySelectorAll(selector);
            for (const img of imgs) {
                const rect = img.getBoundingClientRect();
                const area = rect.width * rect.height;
                // 只考虑足够大且在视口内的图片
                if (area > largestArea && rect.width > 200 && rect.height > 200) {
                    largestArea = area;
                    targetImg = img;
                }
            }
        }

        if (!targetImg) {
            console.log('[QuickShot] waitForImageLoad: No suitable image found');
            resolve({ loaded: false, reason: 'no-image-found', waitedMs: 0 });
            return;
        }

        console.log(`[QuickShot] waitForImageLoad: Found image ${targetImg.src?.substring(0, 50)}...`);

        // 如果图片已经加载完成
        if (targetImg.complete && targetImg.naturalWidth > 0) {
            console.log('[QuickShot] waitForImageLoad: Image already complete');
            resolve({ loaded: true, reason: 'already-complete', waitedMs: 0 });
            return;
        }

        const startTime = Date.now();
        let resolved = false;

        const cleanup = () => {
            if (resolved) return;
            resolved = true;
            targetImg.removeEventListener('load', onLoad);
            targetImg.removeEventListener('error', onError);
        };

        const onLoad = () => {
            const elapsed = Date.now() - startTime;
            console.log(`[QuickShot] waitForImageLoad: Image loaded after ${elapsed}ms`);
            cleanup();
            resolve({ loaded: true, reason: 'onload', waitedMs: elapsed });
        };

        const onError = () => {
            const elapsed = Date.now() - startTime;
            console.log(`[QuickShot] waitForImageLoad: Image load error after ${elapsed}ms`);
            cleanup();
            resolve({ loaded: false, reason: 'error', waitedMs: elapsed });
        };

        targetImg.addEventListener('load', onLoad);
        targetImg.addEventListener('error', onError);

        // 超时保底
        setTimeout(() => {
            if (resolved) return;
            const elapsed = Date.now() - startTime;
            console.log(`[QuickShot] waitForImageLoad: Timeout after ${elapsed}ms`);
            cleanup();
            // 超时时也检查一下是否已经加载
            const loaded = targetImg.complete && targetImg.naturalWidth > 0;
            resolve({ loaded, reason: 'timeout', waitedMs: elapsed });
        }, timeoutMs);
    });
}
