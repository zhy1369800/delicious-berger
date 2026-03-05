// ==UserScript==
// @name         ChatGPT & SheerID 自动化验证循环助手 (全自动版)
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  自动点击验证，支持多文案按钮识别、禁用态等待、Try Again 与错误页回跳
// @author       Gemini
// @match        https://chatgpt.com/*
// @match        https://services.sheerid.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // === 配置区域 ===
    const CONFIG = {
        // 目标页面 URL 关键字（兼容 /veterans 与 /veterans-claim）
        targetUrlKeywords: ['/veterans', '/veterans-claim'],
        // 出错后回跳页面
        fallbackUrl: 'https://chatgpt.com/veterans-claim',
        // 错误页面 URL 片段
        errorUrlHost: 'services.sheerid.com',
        // 检测频率 (毫秒)
        interval: 800
    };

    // === 辅助函数：使用 XPath 查找元素 ===
    function getElementByXpath(path) {
        return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }

    function isVeteransPage() {
        const url = window.location.href.toLowerCase();
        return CONFIG.targetUrlKeywords.some((keyword) => url.includes(keyword));
    }

    function isElementEnabled(el) {
        if (!el) return false;
        if (el.disabled) return false;
        if (el.getAttribute('aria-disabled') === 'true') return false;
        if (el.getAttribute('data-visually-disabled') !== null) return false;
        return true;
    }

    function findClaimButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const candidates = ['verify eligibility', 'claim offer', 'claim now', '验证资格', '验证资格条件'];

        return buttons.find((btn) => {
            const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
            const matchText = candidates.some((item) => text.includes(item));
            const likelyPrimary = btn.className.includes('btn-primary') || btn.className.includes('btn');
            return matchText && likelyPrimary && isElementEnabled(btn);
        });
    }

    // === 主逻辑 ===
    // 场景一：在 ChatGPT 页面，寻找并点击验证按钮
    if (isVeteransPage()) {
        console.log('脚本：处于 ChatGPT veterans 页面，正在扫描可点击验证按钮...');

        const clickTimer = setInterval(() => {
            const btn = findClaimButton();

            if (btn) {
                console.log('脚本：已找到验证按钮，正在点击...');
                clearInterval(clickTimer);

                setTimeout(() => {
                    btn.click();
                }, 500);
            }
        }, CONFIG.interval);
    }

    // 场景二：在 SheerID 页面，监控错误状态
    else if (window.location.host.includes(CONFIG.errorUrlHost)) {
        console.log('脚本：处于 SheerID 页面，正在监控状态 (Limit Exceeded 或 Try Again)...');

        const errorTimer = setInterval(() => {
            // --- 检测 1: 是否有 "Try Again" 按钮 ---
            const tryAgainBtn = getElementByXpath("//a[contains(@class, 'sid-btn') and contains(., 'Try Again')]")
                || getElementByXpath("//button[contains(., 'Try Again')]");

            if (tryAgainBtn) {
                console.log("脚本：检测到 'Try Again' 按钮，准备点击...");
                clearInterval(errorTimer);

                setTimeout(() => {
                    tryAgainBtn.click();
                }, 500);
                return; // 结束当前循环
            }

            // --- 检测 2: 是否有 "Verification Limit Exceeded" 标题 ---
            const h1Element = document.querySelector('h1');
            if (h1Element && h1Element.innerText.trim() === 'Verification Limit Exceeded') {
                console.log("脚本：捕捉到 'Verification Limit Exceeded' 错误");
                clearInterval(errorTimer);

                console.log('脚本：准备强制返回上一页...');
                setTimeout(() => {
                    window.location.href = CONFIG.fallbackUrl;
                }, 1000);
            }

        }, CONFIG.interval);
    }

})();
