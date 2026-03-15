/**
 * Preset Separation — SillyTavern 扩展插件
 *
 * 解耦 API 连接设置与对话补全预设。
 * 启用后，切换对话补全预设时仅更新对话参数（温度、提示词等），
 * 不会改变 API Source、模型、反向代理等连接相关设置。
 *
 * 实现策略：
 *   1. 监听 OAI_PRESET_CHANGED_BEFORE → 快照当前连接设置
 *   2. 监听 OAI_PRESET_CHANGED_AFTER  → 从快照恢复连接设置
 */

import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { oai_settings, settingsToUpdate } from '../../../openai.js';

/* ------------------------------------------------------------------ */
/*  常量                                                                */
/* ------------------------------------------------------------------ */

const MODULE_NAME = 'third-party/ST-Preset-Separation';
const LOG_PREFIX = '[PresetSep]';

/** 默认设置 */
const DEFAULT_SETTINGS = {
    enabled: false,
};

/**
 * 在状态面板中展示的连接字段人类可读标签。
 * 仅展示精选子集 —— 无论是否在此列出，所有 is_connection 字段都会被保护。
 */
const DISPLAY_FIELDS = {
    chat_completion_source: 'API Source',
    openai_model:           'OpenAI Model',
    claude_model:           'Claude Model',
    google_model:           'Google Model',
    openrouter_model:       'OpenRouter Model',
    mistralai_model:        'Mistral Model',
    custom_model:           'Custom Model',
    custom_url:             'Custom URL',
    reverse_proxy:          'Reverse Proxy',
    deepseek_model:         'DeepSeek Model',
    groq_model:             'Groq Model',
};

/* ------------------------------------------------------------------ */
/*  状态                                                                */
/* ------------------------------------------------------------------ */

/** @type {Record<string, any> | null} 连接设置快照 */
let connectionSnapshot = null;

/* ------------------------------------------------------------------ */
/*  工具函数                                                            */
/* ------------------------------------------------------------------ */

/**
 * 从 settingsToUpdate 映射表中提取所有 is_connection 为 true 的字段。
 * @returns {Map<string, {selector: string, settingName: string, isCheckbox: boolean}>}
 */
function getConnectionFields() {
    const map = new Map();
    for (const [key, [selector, settingName, isCheckbox, isConnection]] of Object.entries(settingsToUpdate)) {
        if (isConnection) {
            map.set(settingName, { selector, settingName, isCheckbox });
        }
    }
    return map;
}

/**
 * 捕获当前所有连接类型设置的值，存入快照对象。
 */
function captureConnectionSnapshot() {
    const fields = getConnectionFields();
    const snap = {};
    for (const [settingName] of fields) {
        snap[settingName] = structuredClone(oai_settings[settingName]);
    }
    console.debug(`${LOG_PREFIX} 已捕获连接设置快照`, snap);
    return snap;
}

/**
 * 从快照恢复连接设置，同时更新 oai_settings 对象和对应的 DOM 元素。
 * @param {Record<string, any>} snapshot 连接设置快照
 */
function restoreConnectionSnapshot(snapshot) {
    if (!snapshot) return;

    const fields = getConnectionFields();

    for (const [settingName, meta] of fields) {
        if (!(settingName in snapshot)) continue;

        const oldValue = snapshot[settingName];
        oai_settings[settingName] = oldValue;

        // 更新对应的 DOM 元素
        const $el = $(meta.selector);
        if ($el.length === 0) continue;

        if (meta.isCheckbox) {
            $el.prop('checked', oldValue);
        } else if ($el.is('select')) {
            $el.val(oldValue);
        } else {
            $el.val(oldValue);
        }
    }

    // 触发 change 事件，让 ST 内部监听器同步状态
    $('#chat_completion_source').trigger('change');

    console.debug(`${LOG_PREFIX} 已从快照恢复连接设置`);
}

/* ------------------------------------------------------------------ */
/*  事件处理                                                            */
/* ------------------------------------------------------------------ */

/**
 * 预设应用前 —— 捕获当前连接设置快照。
 */
function onPresetChangedBefore(_event) {
    if (!extension_settings[MODULE_NAME]?.enabled) return;

    connectionSnapshot = captureConnectionSnapshot();
}

/**
 * 预设应用后 —— 从快照恢复连接设置。
 */
function onPresetChangedAfter() {
    if (!extension_settings[MODULE_NAME]?.enabled) return;
    if (!connectionSnapshot) return;

    restoreConnectionSnapshot(connectionSnapshot);
    connectionSnapshot = null;

    // 保存设置以持久化恢复后的连接状态
    saveSettingsDebounced();

    showProtectionToast();

    // 刷新状态面板
    updateStatusPanel();
}

/* ------------------------------------------------------------------ */
/*  动画对勾 & 自定义 Toast                                              */
/* ------------------------------------------------------------------ */

/**
 * 创建一个带动画的 SVG 圆圈对勾元素。
 * @param {number} size CSS 尺寸，单位 px（默认 18）
 * @returns {string} HTML 字符串
 */
function createAnimatedCheck(size = 18) {
    return `<svg class="preset-sep-check" width="${size}" height="${size}" viewBox="0 0 52 52">
        <circle class="preset-sep-check-circle" cx="26" cy="26" r="22" fill="none" stroke-width="3"/>
        <path   class="preset-sep-check-tick"   fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" stroke-width="4"/>
    </svg>`;
}

/**
 * 显示自定义样式的保护成功 Toast 通知。
 */
function showProtectionToast() {
    const source = oai_settings.chat_completion_source || '—';
    // 查找当前非空的模型字段用于展示
    const modelFields = [
        'openai_model', 'claude_model', 'google_model',
        'openrouter_model', 'mistralai_model', 'custom_model',
        'deepseek_model', 'groq_model',
    ];
    let model = '—';
    for (const f of modelFields) {
        if (oai_settings[f]) { model = oai_settings[f]; break; }
    }

    const html = `
        <div class="preset-sep-toast">
            <div class="preset-sep-toast-body">
                <div class="preset-sep-toast-title">API 连接已保护</div>
                <div class="preset-sep-toast-detail">
                    <span>${source}</span> · <span>${model}</span>
                </div>
            </div>
        </div>`;

    toastr.success(html, '', {
        timeOut: 2500,
        escapeHtml: false,
        preventDuplicates: true,
        toastClass: 'toast preset-sep-toast-wrapper',
    });
}

/* ------------------------------------------------------------------ */
/*  界面                                                                */
/* ------------------------------------------------------------------ */

/**
 * 刷新状态面板，展示当前被锁定保护的 API 连接信息。
 */
function updateStatusPanel() {
    const $status = $('#preset_sep_status');
    const $info = $('#preset_sep_info');

    if (!extension_settings[MODULE_NAME]?.enabled) {
        $status.addClass('hidden');
        return;
    }

    $status.removeClass('hidden');
    $info.empty();

    // 展示精选的连接字段及其当前值
    for (const [settingName, label] of Object.entries(DISPLAY_FIELDS)) {
        const value = oai_settings[settingName];
        if (value === undefined || value === null || value === '') continue;

        const $item = $('<div class="preset-sep-info-item"></div>');
        $item.append(createAnimatedCheck());
        $item.append(`<span class="label">${label}</span>`);
        $item.append(`<span class="value" title="${String(value)}">${String(value)}</span>`);
        $info.append($item);
    }

    // 如果没有可展示的字段
    if ($info.children().length === 0) {
        $info.append('<div class="preset-sep-info-item"><span class="label">尚未检测到 API 连接信息</span></div>');
    }
}

/**
 * 切换启用/禁用状态。
 */
function onEnabledToggle() {
    const isEnabled = !!$('#preset_sep_enabled').prop('checked');
    extension_settings[MODULE_NAME].enabled = isEnabled;

    if (isEnabled) {
        // 保持 bind_preset_to_connection = true，让 ST 正常写入所有设置，
        // 我们在 AFTER 事件中恢复连接字段即可。
        console.log(`${LOG_PREFIX} 已启用 —— 预设切换时将保护 API 连接设置。`);
    } else {
        console.log(`${LOG_PREFIX} 已禁用 —— 预设切换将恢复默认行为。`);
    }

    saveSettingsDebounced();
    updateStatusPanel();
}

/* ------------------------------------------------------------------ */
/*  初始化                                                              */
/* ------------------------------------------------------------------ */

(async function init() {
    // 初始化扩展设置
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }

    // 回填新增的默认值
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (extension_settings[MODULE_NAME][key] === undefined) {
            extension_settings[MODULE_NAME][key] = value;
        }
    }

    // 加载并注入设置面板 HTML
    const settingsHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
    $('#extensions_settings2').append(settingsHtml);

    // 从已保存的设置恢复 UI 状态
    $('#preset_sep_enabled').prop('checked', extension_settings[MODULE_NAME].enabled);

    // 绑定 UI 事件
    $('#preset_sep_enabled').on('change', onEnabledToggle);

    // 注册预设切换事件监听器
    eventSource.on(event_types.OAI_PRESET_CHANGED_BEFORE, onPresetChangedBefore);
    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, onPresetChangedAfter);

    // 初始渲染状态面板
    updateStatusPanel();

    console.log(`${LOG_PREFIX} 扩展已加载。`);
})();
