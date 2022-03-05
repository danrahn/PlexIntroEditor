/** Helper class that holds theme-related settings. */
class ThemeSetting {

    /** Whether the user is in dark mode. */
    dark;

    /** Whether the user set the theme.
     * If `false`, the theme is based on the browser theme. */
    userSet;

    /**
     * @param {boolean} dark Whether dark theme is set.
     * @param {boolean} userSet Whether the current theme was set by the user.
     */
    constructor(dark, userSet) {
        this.dark = dark;
        this.userSet = userSet;
    }
}

/** Generic implementation for a feature that can be blocked by a server setting. */
class BlockableSetting {
    /** Whether this setting is enabled by the user */
    #enabled = false;

    /** Whether the correlating server setting is disabled, therefore
     * blocking it client-side regardless of the user's preference. */
    #blocked = false;

    /** Enable/disable this feature. No-op of the setting is blocked by the server. */
    enable(enabled) { if (!this.#blocked) { this.#enabled = enabled; } }

    /** @returns Whether this feature is currently enabled */
    enabled() { return this.#enabled && !this.#blocked; }

    /** @returns Whether this feature would be enabled if the server wasn't blocking it. */
    enabledIgnoringBlock() { return this.#enabled; }

    /** @returns Whether the setting is disabled because the corresponding server setting is disabled. */
    blocked() { return this.#blocked; }

    /** Block this setting because the corresponding server setting is disabled. */
    block() { this.#blocked = true; }

    constructor(enabled) {
        this.#enabled = enabled;
    }
}

class PreviewThumbnailsSetting extends BlockableSetting {
    static settingsKey = 'useThumbnails';
}

class ExtendedMarkerStatsSetting extends BlockableSetting {
    static settingsKey = 'extendedMarkerStats';
}

/**
 * `ClientSettings` is responsible for holding the local user settings for Plex Intro Editor.
 */
class ClientSettings {
    /** Key used for getting and retrieving settings from {@linkcode localStorage} */
    static #settingsKey = 'plexIntro_settings';

    /** Settings related to the current color theme.
     * @type {ThemeSetting} */
    theme;

    /** Whether thumbnails appear when adding/editing markers.
     * @type {PreviewThumbnailsSetting} */
    previewThumbnails;

    /** Whether extended marker statistics should be shown when displaying shows/seasons
     * @type {ExtendedMarkerStatsSetting} */
    extendedMarkerStats;

    /**
     * Create an instance of ClientSettings based on the values stored in {@linkcode localStorage}.
     * Default values are used if the `localStorage` key doesn't exist. */
    constructor() {
        let json;
        try {
            json = JSON.parse(localStorage.getItem(ClientSettings.#settingsKey));
            if (!json) {
                json = {};
            }
        } catch (e) {
            json = {};
        }

        let themeData = this.#valueOrDefault(json, 'theme', { dark : false, userSet : false });
        this.theme = new ThemeSetting(
            this.#valueOrDefault(themeData, 'dark', false),
            this.#valueOrDefault(themeData, 'userSet', false));
        this.previewThumbnails = new PreviewThumbnailsSetting(this.#valueOrDefault(json, PreviewThumbnailsSetting.settingsKey, true));
        this.extendedMarkerStats = new ExtendedMarkerStatsSetting(this.#valueOrDefault(json, ExtendedMarkerStatsSetting.settingsKey, true));
    }

    /** Save the current settings to {@linkcode localStorage}. */
    save() {
        localStorage.setItem(ClientSettings.#settingsKey, this.#serialize());
    }

    /** Returns a stringified version of the current client settings. */
    #serialize() {
        let json = {};
        json.theme = this.theme;

        // BlockableSettings can't be serialized by default, so grab the one field that matters explicitly.
        json[this.previewThumbnails.settingsKey] = this.previewThumbnails.enabledIgnoringBlock();
        json[this.extendedMarkerStats.settingsKey] = this.extendedMarkerStats.enabledIgnoringBlock();
        return JSON.stringify(json);
    }

    /**
     * Retrieve the given `key` from `object`, or `defaultValue` if it doesn't exist.
     * @param {object} object
     * @param {string} key
     * @param {*} defaultValue
     */
    #valueOrDefault(object, key, defaultValue) {
        if (!object.hasOwnProperty(key)) {
            return defaultValue;
        }

        return object[key];
    }
}

/**
 * `ClientSettingsUI` is responsible for displaying the
 * settings dialog and saving any changes that were made.
 */
class ClientSettingsUI {
    /** The owning `ClientSettingsManager`.
     * @type {ClientSettingsManager} */
    #settingsManager;

    /** The callback to invoke after settings are applied */
    #currentCallback = null;

    /**
     * @param {ClientSettingsManager} settingsManager
     */
    constructor(settingsManager) {
        this.#settingsManager = settingsManager;
    }

    /**
     * Show the settings overlay.
     * Currently has three options:
     * * Dark Mode: toggles dark mode, and is linked to the main dark mode toggle
     * * Show Thumbnails: Toggles whether thumbnails are shown when editing/adding markers.
     *   Only visible if app settings have thumbnails enabled.
     * * Show extended marker information: Toggles whether we show marker breakdowns at the
     *   show and season level, not just at the episode level. Only visible if app settings
     *   have extended marker stats enabled.
     * @param {Function<boolean>} callback The callback to invoke if settings are applied.
     */
    showSettings(callback) {
        this.#currentCallback = callback;
        let options = [];
        options.push(this.#buildSettingCheckbox('Dark Mode', 'darkModeSetting', this.#settingsManager.isDarkTheme()));
        if (!this.#settingsManager.thumbnailsBlockedByServer()) {
            options.push(this.#buildSettingCheckbox(
                'Show Thumbnails',
                'showThumbnailsSetting',
                this.#settingsManager.useThumbnails(),
                'When editing markers, display thumbnails that<br>correspond to the current timestamp (if available)'));
        }

        if (!this.#settingsManager.extendedMarkerStatsBlocked()) {
            options.push(this.#buildSettingCheckbox(
                'Extended Marker Stats',
                'extendedStatsSetting',
                this.#settingsManager.showExtendedMarkerInfo(),
                `When browsing shows/seasons, show a breakdown<br>of how many episodes have markers.`
            ));
        }

        options.push(buildNode('hr'));

        let container = appendChildren(buildNode('div', { id : 'settingsContainer'}),
            buildNode('h3', {}, 'Settings'),
            buildNode('hr')
        );

        options.forEach(option => container.appendChild(option));
        const buildButton = (text, id, callback, style='') => buildNode(
            'input', {
                type : 'button',
                value : text,
                id : id,
                style : style
            },
            0,
            {
                click : callback
            });

        appendChildren(container.appendChild(buildNode('div', { class : 'formInput' })),
            appendChildren(buildNode('div', { class : 'settingsButtons' }),
                buildButton('Cancel', 'cancelSettings', Overlay.dismiss, 'margin-right: 10px'),
                buildButton('Apply', 'applySettings', this.#applySettings.bind(this))
            )
        );

        Overlay.build({ dismissible : true, centered : false, noborder: true }, container);
    }

    /**
     * Helper method that builds a label+checkbox combo for use in the settings dialog.
     * @param {string} label The string label for the setting.
     * @param {string} name The HTML name for the setting.
     * @param {boolean} checked Whether the checkbox should initially be checked.
     * @param {string} [tooltip=''] Hover tooltip, if any.
     * @returns A new checkbox setting for the settings dialog.
     */
    #buildSettingCheckbox(label, name, checked, tooltip='') {
        let labelNode = buildNode('label', { for : name }, label + ': ');
        if (tooltip) {
            Tooltip.setTooltip(labelNode, tooltip);
        }

        let checkbox = buildNode('input', { type : 'checkbox', name : name, id : name });
        if (checked) {
            checkbox.setAttribute('checked', 'checked');
        }
        return appendChildren(buildNode('div', { class : 'formInput' }),
            labelNode,
            checkbox
        );
    }

    /** Apply and save settings after the user chooses to commit their changes. */
    #applySettings() {
        let shouldResetView = false;
        if ($('#darkModeSetting').checked != this.#settingsManager.isDarkTheme()) {
            $('#darkModeCheckbox').click();
        }

        /** @type {HTMLInputElement} */
        const thumbnails = $('#showThumbnailsSetting');
        if (thumbnails) {
            shouldResetView = shouldResetView || thumbnails.checked != this.#settingsManager.useThumbnails();
            this.#settingsManager.setThumbnails(thumbnails.checked);
        }

        /** @type {HTMLInputElement} */
        const extended = $('#extendedStatsSetting');
        if (extended) {
            shouldResetView = shouldResetView || extended.checked != this.#settingsManager.showExtendedMarkerInfo();
            this.#settingsManager.setExtendedStats(extended.checked);
        }

        this.#settingsManager.save();
        Overlay.dismiss();
        this.#currentCallback(shouldResetView);
        this.#currentCallback = null;
    }
}

/**
 * Main manager that keeps track of client-side settings.
 */
class ClientSettingsManager {
    /** a `link` element that is used to swap between light and dark theme.
     * @type {HTMLElement} */
    #themeStyle;

    /** The current client settings.
     * @type {ClientSettings} */
    #settings;

    /** The query that will listen to browser theme changes.
     * @type {MediaQueryList} */
    #themeQuery;

    /** The theme toggle that lives outside of the settings dialog.
     * @type {HTMLInputElement} */
    #checkbox;

    /** The UI manager that handles displaying the settings dialog.
     * @type {ClientSettingsUI} */
    #uiManager;

    constructor() {
        this.#settings = new ClientSettings();
        this.#uiManager = new ClientSettingsUI(this);
        this.#themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
        if (!this.isThemeUserSet()) {
            // Theme wasn't set by the user, make sure it matches the system theme if possible.
            this.#settings.theme.dark = this.#themeQuery != 'not all' && this.#themeQuery.matches;
        }

        const href = `Client/Style/theme${this.isDarkTheme() ? 'Dark' : 'Light'}.css`;
        this.#themeStyle = buildNode('link', { rel : 'stylesheet', type : 'text/css', href : href });
        $$('head').appendChild(this.#themeStyle);

        this.#checkbox = $('#darkModeCheckbox');
        this.#checkbox.checked = this.isDarkTheme();
        this.#checkbox.addEventListener('change', (e) => this.toggleTheme(e.target.checked, true /*manual*/));

        ThemeColors.setDarkTheme(this.isDarkTheme());
        this.toggleTheme(this.isDarkTheme(), this.isThemeUserSet());

        // After initialization, start the system theme listener.
        this.#themeQuery.addEventListener('change', this.#onSystemThemeChanged);

        // index.html hard-codes the dark theme icon. Adjust if necessary.
        if (!this.isDarkTheme()) {
            $('#settings').src = '/i/212121/settings.svg';
        }
    }

    /** @returns Whether dark theme is currently enabled. */
    isDarkTheme() { return this.#settings.theme.dark; }

    /**
     * @returns Whether the current theme was set by the user.
     * If `false, the theme is based on the current browser theme. */
    isThemeUserSet() { return this.#settings.theme.userSet; }

    /** @returns Whether thumbnails should be displayed when adding/editing markers. */
    useThumbnails() { return this.#settings.previewThumbnails.enabled(); }

    /** @returns Whether the server doesn't have preview thumbnails enabled. */
    thumbnailsBlockedByServer() { return this.#settings.previewThumbnails.blocked(); }

    /**
     * Sets whether thumbnails should be displayed when adding/editing markers.
     * This is a no-op if {@linkcode PreviewThumbnailsSetting.blocked()} is `true`.
     * @param {boolean} useThumbnails
     */
    setThumbnails(useThumbnails) {
        this.#settings.previewThumbnails.enable(useThumbnails);
    }

    /** @returns Whether extended marker statistics should be displayed when navigating shows/seasons */
    showExtendedMarkerInfo() { return this.#settings.extendedMarkerStats.enabled(); }

    /** @returns Whether the server doesn't have extended marker statistics enabled. */
    extendedMarkerStatsBlocked() { return this.#settings.extendedMarkerStats.blocked(); }

    /**
     * Sets whether extra marker information should be displayed when navigating shows/seasons.
     * This is a no-ope if {@linkcode ExtendedMarkerStatsSetting.blocked()} is `true`.
     * @param {boolean} showStats 
     */
    setExtendedStats(showStats) {
        this.#settings.extendedMarkerStats.enable(showStats);
    }

    /** Save the currently active settings to {@linkcode localStorage} */
    save() {
        this.#settings.save();
    }

    /** Display the settings dialog.
     * @param {Function<bool>} callback Function to invoke if settings are applied.
    */
    showSettings(callback) { this.#uiManager.showSettings(callback); }

    /**
     * Toggle light/dark theme.
     * @param {boolean} isDark Whether dark mode is enabled.
     * @param {boolean} manual Whether we're toggling due to user interaction, or due to a change in the system theme.
     * @returns {boolean} Whether we actually toggled the theme.
     */
    toggleTheme(isDark, manual) {
        if (isDark == this.isDarkTheme()) {
            return false;
        }

        if (manual) {
            this.#settings.theme.dark = isDark;
            this.#settings.theme.userSet = true;
            this.#settings.save();
        } else if (this.#settings.theme.userSet) {
            // System theme change, but the user has manually set the theme.
            return false;
        }

        if (isDark) {
            this.#themeStyle.href = 'Client/Style/themeDark.css';
        } else {
            this.#themeStyle.href = 'Client/Style/themeLight.css';
        }

        this.#adjustIcons();
        return true;
    }

    /**
     * Called after the client retrieves the server config. Enables the settings
     * icon and determines whether the server is blocking various UI options.
     * @param {object} serverConfig
     */
    parseServerConfig(serverConfig) {
        // Now that we have the server config, we can show the settings icon.
        $('#settings').classList.remove('hidden');
        if (!serverConfig.useThumbnails) {
            // If thumbnails aren't available server-side, don't make them an option client-side.
            this.#settings.previewThumbnails.block();
        }

        if (!serverConfig.extendedMarkerStats) {
            // Similarly, don't allow extended marker information if the server isn't set to collect it.
            this.#settings.extendedMarkerStats.block();
        }
    }

    /**
     * Callback invoked when the system browser theme changes.
     * @param {MediaQueryListEvent} e
     */
    #onSystemThemeChanged(e) {
        if (this.toggleTheme(e.matches, false /*manual*/)) {
            this.#checkbox.checked = e.matches;
        }
    }

    /** After changing the theme, make sure any theme-sensitive icons are also adjusted. */
    #adjustIcons() {
        ThemeColors.setDarkTheme(this.#settings.theme.dark);
        for (const icon of $('img[src^="/i/"]')) {
            const split = icon.src.split('/');
            icon.src = `/i/${ThemeColors.get(icon.getAttribute('theme'))}/${split[split.length - 1]}`;
        }
    }
}

// Hack for VSCode intellisense.
if (typeof __dontEverDefineThis !== 'undefined') {
    const { $, $$, buildNode, appendChildren  } = require('./Common');
    const { Overlay } = require('./inc/Overlay');
    const { ThemeColors } = require('./ThemeColors');
    module.exports = { ClientSettingsManager };
}