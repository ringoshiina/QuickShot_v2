/**
 * QuickShot DOM 抓取逻辑（可注入函数）
 * @module scraper
 * 
 * 注意：此文件中的函数设计为通过 chrome.scripting.executeScript 注入到页面中执行
 * 因此不能使用 ES Module 导入，所有依赖的常量需要内联
 */

/**
 * 从页面 DOM 中抓取上下文信息
 * 此函数将被注入到目标页面执行
 * @returns {Object} 包含 parcelId, projectId, current, total 等信息的对象
 */
export function scrapeContext() {
    // 内联常量（因为此函数会被注入到页面执行）
    const ratioPattern = /(\d+)\s*[/／]\s*(\d+)/;
    const ratioPatternGlobal = /(\d+)\s*[/／]\s*(\d+)/g;
    const indexHintPattern = /(?:序号|当前|index|sequence)/i;
    const parcelPattern = /[A-Z]{1,2}\d{2}[A-Z0-9]+(?:-\d+)+/;
    const parcelPatternGlobal = /[A-Z]{1,2}\d{2}[A-Z0-9]+(?:-\d+)+/g;
    const projectPattern = /\b[A-Z]{1,2}\d{2}[A-Z0-9]+\b/;

    try {
        const contexts = [];
        const seenDocs = new WeakSet();

        function safeLocation(win) {
            if (!win) return "";
            try {
                return win.location && win.location.href ? win.location.href : "";
            } catch (error) {
                return "";
            }
        }

        function collectFromDoc(doc, source) {
            if (!doc) return;
            const body = doc.body;
            const html = doc.documentElement;
            const root = body || html;
            const href = safeLocation(doc.defaultView || doc.parentWindow);

            const entry = {
                parcelId: "",
                projectId: "",
                current: 0,
                total: 0,
                href,
                hasBody: !!body,
                hasDocumentElement: !!html,
                source,
                debug: {},
            };

            if (!root) {
                contexts.push(entry);
                return;
            }

            const rawText = root.innerText || "";
            const idMatches = (rawText.match(parcelPatternGlobal) || []).slice(0, 5);
            ratioPatternGlobal.lastIndex = 0;
            const ratioMatches = Array.from(rawText.matchAll(ratioPatternGlobal)).slice(0, 5).map((match) => match[0]);

            const counterMatches = [];
            const counterPattern = /第\s*(\d+)\s*张/g;
            let counterMatch;
            while ((counterMatch = counterPattern.exec(rawText))) {
                const parsed = Number.parseInt(counterMatch[1], 10);
                if (!Number.isNaN(parsed) && parsed > 0) counterMatches.push(parsed);
                if (counterMatches.length >= 5) break;
            }

            const totalHints = [];
            const totalPattern = /共\s*(\d+)\s*张/g;
            let totalMatch;
            while ((totalMatch = totalPattern.exec(rawText))) {
                const parsed = Number.parseInt(totalMatch[1], 10);
                if (!Number.isNaN(parsed) && parsed > 0) totalHints.push(parsed);
                if (totalHints.length >= 5) break;
            }

            const selectorsHit = {
                parcelLabel: !!root.querySelector('[title*="地块编号"], [title*="地块编号："], [data-field*="地块"], [aria-label*="地块编号"]'),
                projectLabel: !!root.querySelector('[title*="项目编号"], [aria-label*="项目编号"], [data-field*="项目编号"]'),
                spin: !!root.querySelector('[role="spinbutton"],[aria-valuenow],[aria-valuemin]'),
            };

            const ratioElements = Array.from(root.querySelectorAll('*')).filter((node) => {
                if (!node || node === root) return false;
                const nodeText = (node.textContent || '').trim();
                if (!nodeText || nodeText.length > 40) return false;
                return ratioPattern.test(nodeText);
            }).slice(0, 5).map((node) => ({
                tag: node.tagName,
                className: node.className || '',
                text: (node.textContent || '').trim(),
                ariaLabel: node.getAttribute('aria-label') || '',
            }));

            const spinElements = Array.from(root.querySelectorAll('[role="spinbutton"],[aria-valuenow],[aria-valuetext],[aria-valuemin],[data-role="spinbutton"],input[type="number"],input[type="text"]')).slice(0, 5).map((node) => ({
                tag: node.tagName,
                className: node.className || '',
                text: (node.textContent || '').trim().slice(0, 40),
                value: node.value !== undefined ? String(node.value) : '',
                ariaValueNow: node.getAttribute('aria-valuenow') || '',
                ariaValueText: node.getAttribute('aria-valuetext') || '',
                ariaLabel: node.getAttribute('aria-label') || '',
            }));

            const parcelCandidates = Array.from(root.querySelectorAll('*'))
                .filter(node => node.textContent && node.textContent.includes('地块编号') && node.textContent.length < 100)
                .slice(0, 3)
                .map(node => ({
                    tag: node.tagName,
                    text: (node.textContent || '').trim(),
                    outerHTML: node.outerHTML ? node.outerHTML.slice(0, 200) : '',
                    hasSibling: !!node.nextElementSibling
                }));

            const carousel = readCarouselState(root);

            entry.parcelId = readParcelId(root);
            entry.projectId = readProjectId(root);
            entry.current = readCurrentIndex(root) || carousel.current;
            entry.total = readTotal(root) || carousel.total;
            entry.debug = {
                textHead: rawText.slice(0, 120),
                idMatches,
                ratioMatches,
                counterMatches,
                totalHints,
                selectorsHit,
                ratioElements,
                spinElements,
                carousel,
                parcelCandidates,
            };
            contexts.push(entry);
        }

        function visit(win, depth) {
            if (!win || depth > 5) return;
            let doc;
            try {
                doc = win.document;
            } catch (error) {
                return;
            }
            if (!doc || seenDocs.has(doc)) return;
            seenDocs.add(doc);
            collectFromDoc(doc, `depth:${depth}`);

            const frames = win.frames || [];
            for (let i = 0; i < frames.length; i += 1) {
                try {
                    visit(frames[i], depth + 1);
                } catch (error) {
                    // ignore cross-origin frame errors
                }
            }
        }

        visit(window, 0);

        let parcelId = '';
        let projectId = '';
        let current = 0;
        let total = 0;
        let href = '';

        const debugContexts = [];

        for (const ctx of contexts) {
            if (!href && ctx.href) href = ctx.href;
            if (!parcelId && ctx.parcelId) parcelId = ctx.parcelId;
            if (!projectId && ctx.projectId) projectId = ctx.projectId;
            if (!current && ctx.current) current = ctx.current;
            if (!total && ctx.total) total = ctx.total;
            if (debugContexts.length < 5) {
                debugContexts.push({
                    source: ctx.source,
                    href: ctx.href,
                    parcelId: ctx.parcelId,
                    projectId: ctx.projectId,
                    current: ctx.current,
                    total: ctx.total,
                    textHead: ctx.debug?.textHead || '',
                    idMatches: ctx.debug?.idMatches || [],
                    ratioMatches: ctx.debug?.ratioMatches || [],
                    selectorsHit: ctx.debug?.selectorsHit || {},
                    ratioElements: ctx.debug?.ratioElements || [],
                    ratioElements: ctx.debug?.ratioElements || [],
                    spinElements: ctx.debug?.spinElements || [],
                    parcelCandidates: ctx.debug?.parcelCandidates || [],
                });
            }
        }

        if (!projectId && parcelId) {
            projectId = parcelId.split('-')[0] || '';
        }

        return {
            parcelId,
            projectId,
            current,
            total,
            href: href || safeLocation(window),
            hasBody: contexts[0]?.hasBody || false,
            hasDocumentElement: contexts[0]?.hasDocumentElement || false,
            debug: debugContexts,
        };
    } catch (error) {
        return {
            parcelId: '',
            projectId: '',
            current: 0,
            total: 0,
            href: typeof window !== 'undefined' ? window.location.href : '',
            error: error?.message || String(error),
        };
    }

    // ============================================================================
    // 内部辅助函数
    // ============================================================================

    function readCarouselState(root) {
        if (!root) {
            return { current: 0, total: 0, indicatorCount: 0, itemCount: 0, indicatorCurrent: 0, itemCurrent: 0, dataCurrent: 0 };
        }

        const indicatorSelector = [
            ".el-carousel__indicator",
            '[class*="carousel__indicator"]',
            "[data-slide-index]",
            "[data-index]",
            "[data-idx]",
        ].join(",");
        const indicators = Array.from(root.querySelectorAll(indicatorSelector));
        const indicatorCount = indicators.length;
        let indicatorCurrent = 0;

        indicators.forEach((indicator, idx) => {
            const className = indicator.className || "";
            const isActive = /is-active|active|current/i.test(className) || indicator.getAttribute("aria-current") === "true";
            if (!isActive) return;
            const label = indicator.getAttribute("aria-label") || indicator.textContent || "";
            const match = label.match(/\d+/);
            if (match) {
                indicatorCurrent = Number.parseInt(match[0], 10) || indicatorCurrent;
            } else {
                indicatorCurrent = idx + 1;
            }
            const dataIdx = indicator.getAttribute("data-index") || indicator.getAttribute("data-slide-index") || indicator.getAttribute("data-idx");
            if (dataIdx) {
                const parsed = Number.parseInt(dataIdx, 10);
                if (!Number.isNaN(parsed)) {
                    indicatorCurrent = parsed <= 0 && indicatorCount > 1 ? parsed + 1 : parsed;
                }
            }
        });

        const itemSelector = [
            ".el-carousel__item",
            '[class*="carousel__item"]',
            '[class*="swiper-slide"]',
        ].join(",");
        const items = Array.from(root.querySelectorAll(itemSelector)).filter((node) => {
            const className = node.className || "";
            return !/is-cloned|clone/i.test(className);
        });
        const itemCount = items.length;
        let itemCurrent = 0;

        items.forEach((item, idx) => {
            const className = item.className || "";
            const ariaHidden = item.getAttribute("aria-hidden");
            const dataIdx = item.getAttribute("data-index") || item.getAttribute("data-idx");
            const isActive = /is-active|active|current|selected/i.test(className) || ariaHidden === "false";
            if (isActive) {
                itemCurrent = idx + 1;
            } else if (!itemCurrent && dataIdx) {
                const parsed = Number.parseInt(dataIdx, 10);
                if (!Number.isNaN(parsed)) {
                    itemCurrent = parsed <= 0 && itemCount > 1 ? parsed + 1 : parsed;
                }
            }
        });

        const totalCandidates = [indicatorCount, itemCount].filter((value) => value > 0);
        const total = totalCandidates.length ? Math.max(...totalCandidates) : 0;

        const currentCandidates = [indicatorCurrent, itemCurrent].filter((value) => value > 0);
        const current = currentCandidates.length ? currentCandidates[0] : 0;

        return {
            current,
            total,
            indicatorCount,
            itemCount,
            indicatorCurrent,
            itemCurrent,
        };
    }

    function readParcelId(root) {
        if (!root) return '';
        const byText = root.innerText || '';
        const textMatch = byText.match(parcelPattern);
        if (textMatch) return textMatch[0];

        const selectors = ['[title*="地块编号"], [title*="地块编号："], [data-field*="地块"], [aria-label*="地块编号"]'];
        for (const selector of selectors) {
            const el = root.querySelector(selector);
            if (!el) continue;
            const t = el.textContent || el.getAttribute('title') || '';
            const match = t.match(parcelPattern);
            if (match) return match[0];
        }

        const keywords = ['地块编号', '地块编号：', '地块编号:'];
        // Relaxed search: find elements containing the keyword
        const candidates = Array.from(root.querySelectorAll('*')).filter((node) => {
            // Filter for reasonable text length to avoid capturing large container blocks
            const txt = (node.textContent || '').trim();
            return txt && txt.length < 200 && keywords.some(k => txt.includes(k));
        });

        for (const label of candidates) {
            // Strategy 1: Pattern in the element text itself (e.g. "地块编号：P123...")
            let text = label.textContent || '';
            let match = text.match(parcelPattern);
            if (match) return match[0];

            // Strategy 2: Pattern in next sibling (e.g. <span>地块编号</span><span>P123...</span>)
            if (label.nextElementSibling) {
                text = label.nextElementSibling.textContent || '';
                match = text.match(parcelPattern);
                if (match) return match[0];
            }

            // Strategy 3: Pattern in parent (e.g. <div><span>地块编号</span> P123...</div>)
            if (label.parentElement) {
                text = label.parentElement.textContent || '';
                match = text.match(parcelPattern);
                if (match) return match[0];
            }
        }

        return '';
    }

    function readProjectId(root) {
        if (!root) return '';
        const byText = root.innerText || '';
        const textMatch = byText.match(projectPattern);
        if (textMatch) return textMatch[0];

        const selectors = ['[title*="项目编号"], [aria-label*="项目编号"], [data-field*="项目编号"]'];
        for (const selector of selectors) {
            const el = root.querySelector(selector);
            if (!el) continue;
            const t = el.textContent || el.getAttribute('title') || '';
            const matchSel = t.match(projectPattern);
            if (matchSel) return matchSel[0];
        }

        const keywords = ['项目编号', '项目编号：', '项目编号:'];
        for (const key of keywords) {
            const label = Array.from(root.querySelectorAll('*')).find((node) => (node.textContent || '').trim().startsWith(key));
            if (!label) continue;
            const combined = [
                label.textContent,
                label.nextElementSibling?.textContent,
                label.parentElement?.textContent,
            ].join(' ');
            const matchKey = combined.match(projectPattern);
            if (matchKey) return matchKey[0];
        }

        return '';
    }

    function readCurrentIndex(root) {
        if (!root) return 0;

        const byText = root.innerText || '';
        const ratio = byText.match(ratioPattern);
        if (ratio) {
            const parsed = parseInt(ratio[1], 10);
            if (!Number.isNaN(parsed) && parsed > 0) return parsed;
        }

        const ratioElement = Array.from(root.querySelectorAll('*')).find((node) => {
            if (!node || node === root) return false;
            const nodeText = (node.textContent || '').trim();
            if (!nodeText || nodeText.length > 40) return false;
            return ratioPattern.test(nodeText);
        });
        if (ratioElement) {
            const match = (ratioElement.textContent || '').match(ratioPattern);
            if (match) {
                const parsed = parseInt(match[1], 10);
                if (!Number.isNaN(parsed) && parsed > 0) return parsed;
            }
        }

        const attrElement = Array.from(root.querySelectorAll('[aria-label],[title]')).find((node) => {
            const combined = `${node.getAttribute('aria-label') || ''} ${node.getAttribute('title') || ''}`.trim();
            return combined && ratioPattern.test(combined);
        });
        if (attrElement) {
            const combined = `${attrElement.getAttribute('aria-label') || ''} ${attrElement.getAttribute('title') || ''}`;
            const match = combined.match(ratioPattern);
            if (match) {
                const parsed = parseInt(match[1], 10);
                if (!Number.isNaN(parsed) && parsed > 0) return parsed;
            }
        }

        const spinNodes = Array.from(root.querySelectorAll('[role="spinbutton"],input[type="number"],input[type="text"]'));
        let fallback = 0;

        for (const spin of spinNodes) {
            const meta = [
                spin.getAttribute('aria-label'),
                spin.getAttribute('title'),
                spin.closest('label')?.textContent,
            ].filter(Boolean).join(' ');
            const hasHint = indexHintPattern.test(meta);
            const candidates = [
                spin.getAttribute('aria-valuenow'),
                spin.getAttribute('value'),
                spin.getAttribute('aria-valuetext'),
                typeof spin.value === 'string' ? spin.value : undefined,
                spin.textContent,
            ];
            for (const raw of candidates) {
                if (!raw) continue;
                const parsed = parseInt(String(raw).trim(), 10);
                if (Number.isNaN(parsed) || parsed <= 0) continue;
                if (hasHint) return parsed;
                if (!fallback) fallback = parsed;
            }
        }

        if (fallback) return fallback;
        return 0;
    }

    function readTotal(root) {
        if (!root) return 0;
        const byText = root.innerText || '';
        const ratio = byText.match(ratioPattern);
        if (ratio) {
            const parsed = parseInt(ratio[2], 10);
            if (!Number.isNaN(parsed) && parsed > 0) return parsed;
        }
        return 0;
    }
}

/**
 * 确保"全部方位角"复选框被选中
 * 此函数将被注入到目标页面执行
 * @returns {boolean} 是否执行了点击操作
 */
export function ensureAllAzimuthsChecked() {
    const labels = Array.from(document.querySelectorAll('.el-checkbox__label'));
    const targetLabel = labels.find(el => el.textContent.trim().includes('全部方位角'));
    if (targetLabel) {
        const checkbox = targetLabel.closest('.el-checkbox');
        if (checkbox) {
            const isChecked = checkbox.classList.contains('is-checked') || checkbox.querySelector('.is-checked') || checkbox.querySelector('input:checked');
            if (!isChecked) {
                console.log("[QuickShot] All Azimuths not checked. Clicking it now.");
                checkbox.click();
                return true;
            } else {
                console.log("[QuickShot] All Azimuths is already checked.");
            }
        }
    } else {
        console.warn("[QuickShot] Could not find All Azimuths checkbox.");
    }
    return false;
}
