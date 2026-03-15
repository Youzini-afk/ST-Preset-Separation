/**
 * Preset Separation — SillyTavern Extension
 *
 * Decouples API connection settings from Chat Completion presets.
 * When enabled, switching a CC preset will only update dialogue parameters
 * (temperature, prompts, etc.) without touching the API source, model,
 * reverse proxy, or any other connection-related field.
 *
 * Strategy:
 *   1. Listen for OAI_PRESET_CHANGED_BEFORE  → snapshot current connection fields
 *   2. Listen for OAI_PRESET_CHANGED_AFTER   → restore connection fields from snapshot
 */

import { saveSettingsDebounced, eventSource, event_types } from '../../../script.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../extensions.js';
import { oai_settings, settingsToUpdate } from '../../openai.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MODULE_NAME = 'ST-Preset-Separation';
const LOG_PREFIX = '[PresetSep]';

const DEFAULT_SETTINGS = {
    enabled: false,
};

/**
 * Human-readable labels for important connection fields that we show in
 * the status panel.  Only a curated subset — we still protect ALL
 * is_connection fields regardless of whether they appear here.
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
/*  State                                                              */
/* ------------------------------------------------------------------ */

/** @type {Record<string, any> | null} */
let connectionSnapshot = null;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a Set of setting_name values that are connection-related,
 * derived from the exported settingsToUpdate map.
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
 * Capture the current values of all connection-type settings from
 * oai_settings into a plain object snapshot.
 */
function captureConnectionSnapshot() {
    const fields = getConnectionFields();
    const snap = {};
    for (const [settingName] of fields) {
        snap[settingName] = structuredClone(oai_settings[settingName]);
    }
    console.debug(`${LOG_PREFIX} Captured connection snapshot`, snap);
    return snap;
}

/**
 * Restore connection settings from a snapshot, updating both the
 * oai_settings object and the corresponding DOM elements.
 * @param {Record<string, any>} snapshot
 */
function restoreConnectionSnapshot(snapshot) {
    if (!snapshot) return;

    const fields = getConnectionFields();

    for (const [settingName, meta] of fields) {
        if (!(settingName in snapshot)) continue;

        const oldValue = snapshot[settingName];
        oai_settings[settingName] = oldValue;

        // Update corresponding DOM element
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

    // Trigger change events so ST's internal listeners catch up
    $('#chat_completion_source').trigger('change');

    console.debug(`${LOG_PREFIX} Restored connection snapshot`);
}

/* ------------------------------------------------------------------ */
/*  Event Handlers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Before a preset is applied — capture the current state.
 */
function onPresetChangedBefore(_event) {
    if (!extension_settings[MODULE_NAME]?.enabled) return;

    connectionSnapshot = captureConnectionSnapshot();
}

/**
 * After a preset is applied — restore connection settings from snapshot.
 */
function onPresetChangedAfter() {
    if (!extension_settings[MODULE_NAME]?.enabled) return;
    if (!connectionSnapshot) return;

    restoreConnectionSnapshot(connectionSnapshot);
    connectionSnapshot = null;

    // Save settings to persist the restored connection state
    saveSettingsDebounced();

    toastr.info('API 连接设置已保护，未随预设切换', 'Preset Separation', {
        timeOut: 2000,
        preventDuplicates: true,
    });

    // Refresh the status panel
    updateStatusPanel();
}

/* ------------------------------------------------------------------ */
/*  UI                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Refresh the info panel that shows which API connection is currently locked.
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

    // Show a subset of connection fields with current values
    for (const [settingName, label] of Object.entries(DISPLAY_FIELDS)) {
        const value = oai_settings[settingName];
        if (value === undefined || value === null || value === '') continue;

        const $item = $('<div class="preset-sep-info-item"></div>');
        $item.append(`<span class="label">${label}</span>`);
        $item.append(`<span class="value" title="${String(value)}">${String(value)}</span>`);
        $info.append($item);
    }

    // If nothing to show
    if ($info.children().length === 0) {
        $info.append('<div class="preset-sep-info-item"><span class="label">尚未检测到 API 连接信息</span></div>');
    }
}

/**
 * Toggle the enabled state and sync with ST's built-in bind_preset_to_connection.
 */
function onEnabledToggle() {
    const isEnabled = !!$('#preset_sep_enabled').prop('checked');
    extension_settings[MODULE_NAME].enabled = isEnabled;

    if (isEnabled) {
        // Set ST's built-in toggle to "unbound" so our approach works cleanly
        // even if ST checks this flag in the future.  We handle the restore
        // ourselves, so we want ST to still WRITE the connection fields from
        // the preset (so they show up transiently) and then we overwrite them.
        // Actually — the cleanest approach: keep bind_preset_to_connection = true
        // so ST applies everything, and we simply restore afterwards.
        // This means we DON'T need to touch bind_preset_to_connection at all.
        console.log(`${LOG_PREFIX} Enabled — API settings will be protected during preset switches.`);
    } else {
        console.log(`${LOG_PREFIX} Disabled — preset switches will work normally.`);
    }

    saveSettingsDebounced();
    updateStatusPanel();
}

/* ------------------------------------------------------------------ */
/*  Init                                                               */
/* ------------------------------------------------------------------ */

(async function init() {
    // Initialize extension settings
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }

    // Backfill any new default keys
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (extension_settings[MODULE_NAME][key] === undefined) {
            extension_settings[MODULE_NAME][key] = value;
        }
    }

    // Load and inject settings HTML
    const settingsHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
    $('#extensions_settings2').append(settingsHtml);

    // Restore UI state from saved settings
    $('#preset_sep_enabled').prop('checked', extension_settings[MODULE_NAME].enabled);

    // Bind UI events
    $('#preset_sep_enabled').on('change', onEnabledToggle);

    // Register event listeners for preset changes
    eventSource.on(event_types.OAI_PRESET_CHANGED_BEFORE, onPresetChangedBefore);
    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, onPresetChangedAfter);

    // Initial status panel render
    updateStatusPanel();

    console.log(`${LOG_PREFIX} Extension loaded.`);
})();
