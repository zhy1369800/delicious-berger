// ==UserScript==
// @name         身份认证全自动助手 (V14.1 自动刷新版)
// @namespace    http://tampermonkey.net/
// @version      14.1
// @description  V14.0基础增加：若填表卡死超过10次循环（约15秒），自动刷新页面重试
// @author       You
// @match        https://*.sheerid.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';

    const isSheerIdHost = window.location.hostname === 'services.sheerid.com' || window.location.hostname.endsWith('.sheerid.com');
    if (!isSheerIdHost) return;
    // --- 核心配置 ---
    const FIELD_MAP = {
        status: '#sid-military-status',
        branch: '#sid-branch-of-service',
        firstName: '#sid-first-name',
        lastName: '#sid-last-name',
        bMonth: '#sid-birthdate__month',
        bDay: '#sid-birthdate-day',
        bYear: '#sid-birthdate-year',
        dMonth: '#sid-discharge-date__month',
        dDay: '#sid-discharge-date-day',
        dYear: '#sid-discharge-date-year',
        email: '#sid-email'
    };

    const SUBMIT_BTN_SELECTOR = '#sid-submit-btn-collect-info';

    // 🔥 固定配置
    const FIXED_STATUS = "Military Veteran or Retiree";
    const FIXED_DISCHARGE_YEAR = "2025";
    const FIXED_EMAIL = "";
    const MIN_BIRTH_YEAR = 1930;

    const MONTH_MAP = {
        "01": "January", "02": "February", "03": "March", "04": "April",
        "05": "May", "06": "June", "07": "July", "08": "August",
        "09": "September", "10": "October", "11": "November", "12": "December"
    };

    // --- 状态管理 ---
    function getQueue() { return GM_getValue('global_auth_queue', []); }
    function saveQueue(arr) { GM_setValue('global_auth_queue', arr); updateUI(); }

    function getCurrentTask() { return GM_getValue('current_active_task', null); }
    function setCurrentTask(task) { GM_setValue('current_active_task', task); }

    function getSubmitState() { return GM_getValue('is_submitting_flag', false); }
    function setSubmitState(bool) { GM_setValue('is_submitting_flag', bool); }

    function getIsRunning() { return GM_getValue('is_script_running', false); }
    function setIsRunning(bool) { GM_setValue('is_script_running', bool); updateUI(); }

    // 🔥【V14.1 新增】定义计数器，记录重试次数
    let retryCounter = 0;

    // --- 页面初始化 ---
    function initLogic() {
        const justSubmitted = getSubmitState();
        if (justSubmitted) {
            console.log("检测到上一次提交完成，清除任务，准备下一位。");
            setCurrentTask(null);
            setSubmitState(false);
        }
    }

    // --- UI 创建 ---
    function createPanel() {
        const div = document.createElement('div');
        div.style = "position: fixed; bottom: 50px; right: 20px; width: 360px; background: #fff; border: 2px solid #6610f2; box-shadow: 0 5px 25px rgba(0,0,0,0.3); z-index: 999999; padding: 15px; border-radius: 8px; font-family: sans-serif; font-size: 13px;";

        div.innerHTML = `
            <div style="font-weight:bold; color:#6610f2; margin-bottom:10px; border-bottom:1px solid #ddd; padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:14px;">⏭️ 认证助手 V14.1</span>
                <span id="queue_count" style="background:#dc3545; color:white; padding:4px 12px; border-radius:20px; font-size:18px; font-weight:bold; box-shadow: 0 2px 5px rgba(220,53,69,0.5);">0</span>
            </div>

            <div id="status_area" style="margin-bottom: 10px; color: #333; min-height: 20px; font-weight:bold;">初始化中...</div>

            <div style="display:flex; gap:8px; margin-bottom: 10px;">
                <button id="btn_toggle" style="flex:2; padding: 12px; border: none; border-radius: 4px; font-weight: bold; font-size: 15px; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    初始化中...
                </button>
                <button id="btn_skip" style="flex:1; padding: 12px; background: #ffc107; color: #000; border: none; border-radius: 4px; font-weight: bold; font-size: 13px; cursor: pointer; border: 1px solid #e0a800;">
                    ⏭️ 跳过
                </button>
            </div>

            <div id="import_section">
                <textarea id="bulk_input" placeholder="粘贴 Name: ... 数据" style="width: 100%; height: 80px; margin-bottom: 5px; font-size:12px; border:1px solid #ccc; padding:5px; display:block;"></textarea>
                <div style="display:flex; gap:5px; margin-bottom: 5px;">
                    <button id="btn_import" style="flex:1; padding: 8px; cursor: pointer; background:#0d6efd; color:white; border:none; border-radius:4px;">📥 存入数据</button>
                    <button id="btn_reset" style="flex:1; padding: 8px; cursor: pointer; background:#dc3545; color:white; border:none; border-radius:4px;">🗑️ 清空数据</button>
                </div>
            </div>
        `;
        (document.body || document.documentElement).appendChild(div);
        return div;
    }

    const panel = createPanel();
    const statusArea = document.getElementById('status_area');
    const queueCount = document.getElementById('queue_count');
    const inputArea = document.getElementById('bulk_input');
    const btnToggle = document.getElementById('btn_toggle');
    const btnSkip = document.getElementById('btn_skip');
    const btnImport = document.getElementById('btn_import');
    const btnReset = document.getElementById('btn_reset');

    // --- 辅助函数 ---
    function getExactBranch(text) {
        const upper = text.toUpperCase();
        if (upper.includes("SPACE FORCE")) return "Space Force";
        if (upper.includes("AIR NATIONAL GUARD") || upper.includes("ANG")) return "Air National Guard";
        if (upper.includes("AIR FORCE RESERVE") || upper.includes("USAFR")) return "Air Force Reserve";
        if (upper.includes("AIR FORCE") || upper.includes("USAF")) return "Air Force";
        if (upper.includes("ARMY NATIONAL GUARD") || upper.includes("ARNG") || upper.includes("NG")) return "Army";
        if (upper.includes("ARMY RESERVE") || upper.includes("USAR")) return "Army Reserve";
        if (upper.includes("ARMY") || upper.includes("USA")) return "Army";
        if (upper.includes("COAST GUARD RESERVE")) return "Coast Guard Reserve";
        if (upper.includes("COAST GUARD") || upper.includes("USCG")) return "Coast Guard";
        if (upper.includes("MARINE CORPS FORCE RESERVE")) return "Marine Corps Force Reserve";
        if (upper.includes("MARINE") || upper.includes("USMC")) return "Marine Corps";
        if (upper.includes("NAVY RESERVE") || upper.includes("USNR")) return "Navy Reserve";
        if (upper.includes("NAVY") || upper.includes("USN")) return "Navy";
        return "Army";
    }

    function parseRawData(text) {
        const parsedList = [];
        let skippedCount = 0;
        const blocks = text.split(/Name:\s*\n/g);
        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            const nameLine = block.split('\n')[0].trim();
            let lastName = "", firstName = "";
            if (nameLine.includes(',')) {
                const parts = nameLine.split(',');
                lastName = parts[0].trim();
                firstName = parts[1].trim();
            } else { lastName = nameLine; }

            const branch = getExactBranch(block);
            const dobMatch = block.match(/Date of Birth:\s*\n(\d{2})\/(\d{2})\/(\d{4})/);
            const bMonth = dobMatch ? MONTH_MAP[dobMatch[1]] : "";
            const bDay = dobMatch ? dobMatch[2] : "";
            const bYear = dobMatch ? dobMatch[3] : "";
            const dodMatch = block.match(/Date of Death:\s*\n(\d{2})\/(\d{2})\/(\d{4})/);
            const dMonth = dodMatch ? MONTH_MAP[dodMatch[1]] : "";
            const dDay = dodMatch ? dodMatch[2] : "";

            if (bYear && parseInt(bYear, 10) < MIN_BIRTH_YEAR) {
                skippedCount++;
                continue;
            }

            if (firstName && lastName) {
                parsedList.push([
                    FIXED_STATUS, branch, firstName, lastName,
                    bMonth, bDay, bYear,
                    dMonth, dDay, FIXED_DISCHARGE_YEAR, FIXED_EMAIL
                ]);
            }
        }
        return { list: parsedList, skipped: skippedCount };
    }

    function simulateClick(element) {
        if (!element) return;
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        element.click();
    }

    function setNativeValue(element, value) {
        if (!element) return;
        const lastValue = element.value;
        element.value = value;
        const tracker = element._valueTracker;
        if (tracker) tracker.setValue(lastValue);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function randomLetters(length = 4) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        let out = "";
        for (let i = 0; i < length; i++) {
            out += chars[Math.floor(Math.random() * chars.length)];
        }
        return out;
    }
    // --- ⚡ 核心自动化逻辑 (已加入超时刷新) ---
    async function runAutomation() {
        const queue = getQueue();
        const isRunning = getIsRunning();

        // 暂停状态：清空计数器，不执行
        if (!isRunning) {
            retryCounter = 0;
            return;
        }

        let currentTask = getCurrentTask();

        // 1. 获取任务
        if (!currentTask && queue.length > 0) {
            currentTask = queue.shift();
            currentTask[11] = `${currentTask[2]} ${randomLetters(4)}`;
            saveQueue(queue);
            setCurrentTask(currentTask);
            retryCounter = 0; // 新任务开始，重置计数
        }

        // 2. 完成
        if (!currentTask) {
            statusArea.innerHTML = "✅ 所有数据已处理完毕。";
            statusArea.style.color = "green";
            setIsRunning(false);
            return;
        }

        // 🔥【V14.1】计数与超时检测
        retryCounter++;
        const maxRetries = 10;
        
        statusArea.innerHTML = `正在处理: <span style="color:#0d6efd">${currentTask[2]} ${currentTask[3]}</span> <span style="font-size:12px;color:gray;">(尝试 ${retryCounter}/${maxRetries})</span>`;
        statusArea.style.color = "#333";

        // 如果超过最大重试次数，并且当前并没有在提交中（防止误刷），则刷新页面
        if (retryCounter > maxRetries) {
            if (!getSubmitState()) {
                console.log("⚠️ 填表卡死或元素未加载，自动刷新重试...");
                location.reload(); 
                return;
            }
        }

        const statusEl = document.querySelector(FIELD_MAP.status);
        const nameEl = document.querySelector(FIELD_MAP.firstName);

        // A. 填写 Status
        if (statusEl) {
             if (statusEl.value !== FIXED_STATUS) {
                 statusEl.focus();
                 simulateClick(statusEl);
                 await new Promise(r => setTimeout(r, 100));

                 setNativeValue(statusEl, FIXED_STATUS);
                 statusEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

                 await new Promise(r => setTimeout(r, 500));
             }
        }

        // B. 填写详细信息
        if (nameEl) {
            const branchEl = document.querySelector(FIELD_MAP.branch);
            if(branchEl) {
                branchEl.focus();
                simulateClick(branchEl);
                await new Promise(r => setTimeout(r, 50));
                setNativeValue(branchEl, currentTask[1]);
                branchEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                await new Promise(r => setTimeout(r, 100));
            }

            setNativeValue(document.querySelector(FIELD_MAP.firstName), currentTask[11] || `${currentTask[2]} ${randomLetters(4)}`);
            setNativeValue(document.querySelector(FIELD_MAP.lastName), currentTask[3]);

            const bmEl = document.querySelector(FIELD_MAP.bMonth);
            if(bmEl) {
                bmEl.focus();
                simulateClick(bmEl);
                await new Promise(r => setTimeout(r, 50));
                setNativeValue(bmEl, currentTask[4]);
                bmEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }
            setNativeValue(document.querySelector(FIELD_MAP.bDay), currentTask[5]);
            setNativeValue(document.querySelector(FIELD_MAP.bYear), currentTask[6]);

            const dmEl = document.querySelector(FIELD_MAP.dMonth);
            if(dmEl) {
                dmEl.focus();
                simulateClick(dmEl);
                await new Promise(r => setTimeout(r, 50));
                setNativeValue(dmEl, currentTask[7]);
                dmEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }
            setNativeValue(document.querySelector(FIELD_MAP.dDay), currentTask[8]);
            setNativeValue(document.querySelector(FIELD_MAP.dYear), currentTask[9]);
            setNativeValue(document.querySelector(FIELD_MAP.email), currentTask[10]);

            const submitBtn = document.querySelector(SUBMIT_BTN_SELECTOR);
            if (submitBtn && submitBtn.getAttribute('aria-disabled') !== 'true') {
                setSubmitState(true);
                submitBtn.click();
            }
        }
    }

    // --- UI 更新 ---
    function updateUI() {
        const queue = getQueue();
        const isRunning = getIsRunning();
        queueCount.innerText = queue.length;

        if (isRunning) {
            btnToggle.innerText = "⏸️ 运行中";
            btnToggle.style.backgroundColor = "#198754";
            btnToggle.style.color = "#fff";
        } else {
            if (queue.length > 0) {
                btnToggle.innerText = "▶️ 启动";
                btnToggle.style.backgroundColor = "#0d6efd";
                btnToggle.style.color = "#fff";
                statusArea.innerText = "⏸️ 已暂停";
            } else {
                btnToggle.innerText = "🚫 无数据";
                btnToggle.style.backgroundColor = "#e9ecef";
                btnToggle.style.color = "#6c757d";
            }
        }
    }

    // --- 按钮事件 ---
    btnToggle.onclick = () => {
        const queue = getQueue();
        if (queue.length === 0 && !getCurrentTask()) return alert("请先导入数据！");
        setIsRunning(!getIsRunning());
        // 每次手动点击开关，都重置计数器
        retryCounter = 0; 
    };

    // 🔥 跳过按钮逻辑
    btnSkip.onclick = () => {
        const current = getCurrentTask();
        if (!current && getQueue().length === 0) return alert("没有任务可以跳过");

        // 1. 清除当前任务
        setCurrentTask(null);
        setSubmitState(false);
        retryCounter = 0; // 重置计数

        // 2. 如果没在运行，自动开启运行以便填入下一个
        if (!getIsRunning()) {
            setIsRunning(true);
        }

        // 3. UI 反馈
        statusArea.innerHTML = "⏭️ 已跳过！正在载入下一位...";
        statusArea.style.color = "orange";

        // 4. 立即触发一次循环，覆盖旧数据
        setTimeout(runAutomation, 100);
    };

    btnImport.onclick = () => {
        const text = inputArea.value;
        if (!text) return;
        try {
            const result = parseRawData(text);
            const newData = result.list;
            const skipped = result.skipped;

            if (newData.length === 0 && skipped === 0) return alert("无有效数据");

            const currentQueue = getQueue();
            saveQueue(currentQueue.concat(newData));
            inputArea.value = "";

            let msg = `✅ 成功导入 ${newData.length} 人。`;
            if (skipped > 0) msg += `\n🚫 自动过滤 ${skipped} 人 (<1930)。`;
            alert(msg);
        } catch (e) { alert("解析错误"); }
    };

    btnReset.onclick = () => {
        if(confirm("确定清空全部？")) {
            saveQueue([]);
            setCurrentTask(null);
            setSubmitState(false);
            setIsRunning(false);
            retryCounter = 0;
            location.reload();
        }
    };

    initLogic();
    updateUI();

    function loop() {
        runAutomation();
        setTimeout(loop, 1500);
    }
    setTimeout(loop, 1000);

})();
