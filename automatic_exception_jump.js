// ==UserScript==
// @name         ChatGPT & SheerID 自动化验证循环助手 (全自动版)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  自动点击验证，支持失败后自动点击 Try Again 或跳转回试
// @author       Gemini
// @match        https://chatgpt.com/*
// @match        https://services.sheerid.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // === 配置区域 ===
    const CONFIG = {
        // 目标页面 URL 片段
        targetUrl: "chatgpt.com/veterans-claim",
        // 错误页面 URL 片段
        errorUrlHost: "services.sheerid.com",
        // 检测频率 (毫秒)
        interval: 800
    };

    // === 辅助函数：使用 XPath 查找元素 ===
    function getElementByXpath(path) {
        return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }

    // === 主逻辑 ===
    const currentUrl = window.location.href;

    // 场景一：在 ChatGPT 页面，寻找并点击“验证资格条件”按钮
    if (currentUrl.includes(CONFIG.targetUrl)) {
        console.log("脚本：处于 ChatGPT 页面，正在扫描按钮...");
        
        const clickTimer = setInterval(() => {
            // 精准查找：class包含'btn-primary'且文字包含'验证资格条件'的按钮
            const btn = getElementByXpath("//button[contains(@class, 'btn-primary') and contains(., '验证资格条件')]");

            if (btn) {
                console.log("脚本：已找到验证按钮，正在点击...");
                clearInterval(clickTimer);
                
                setTimeout(() => {
                    btn.click();
                }, 500);
            }
        }, CONFIG.interval);
    } 
    
    // 场景二：在 SheerID 页面，监控错误状态
    else if (window.location.host.includes(CONFIG.errorUrlHost)) {
        console.log("脚本：处于 SheerID 页面，正在监控状态 (Limit Exceeded 或 Try Again)...");
        
        const errorTimer = setInterval(() => {
            // --- 检测 1: 是否有 "Try Again" 按钮 ---
            // 根据你提供的 HTML: <a ... class="sid-btn sid-btn--dark"><span>Try Again</span></a>
            const tryAgainBtn = getElementByXpath("//a[contains(@class, 'sid-btn') and contains(., 'Try Again')]");

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
            if (h1Element && h1Element.innerText.trim() === "Verification Limit Exceeded") {
                console.log("脚本：捕捉到 'Verification Limit Exceeded' 错误");
                clearInterval(errorTimer);

                console.log("脚本：准备强制返回上一页...");
                setTimeout(() => {
                    window.location.href = "https://" + CONFIG.targetUrl;
                }, 1000);
            }

        }, CONFIG.interval);
    }

})();
