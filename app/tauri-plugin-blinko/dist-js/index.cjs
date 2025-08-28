'use strict';

var core = require('@tauri-apps/api/core');

async function setStatusBarColor(hexColor) {
    await core.invoke('plugin:blinko|setcolor', {
        payload: {
            hex: hexColor,
        },
    });
    return null;
}
async function openAppSettings() {
    await core.invoke('plugin:blinko|open_app_settings');
}

exports.openAppSettings = openAppSettings;
exports.setStatusBarColor = setStatusBarColor;
