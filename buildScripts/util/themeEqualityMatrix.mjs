/**
 * @module buildScripts/util/themeEqualityMatrix
 * @summary Declarative component, state, part, property, and engine-package matrix for `theme-equality.mjs`.
 *
 * Maps every engine directory under `resources/css/src` (excluding `apps/` and `examples/`) to either
 * one or more rendered component/variant cells mounted in `test/playwright/component/apps/theme-equality/`
 * (with per-state target selectors and element/pseudo-element parts) or an explicit architectural reason
 * why no idle rendered instance exists.
 */
import fs from 'node:fs';

export const THEMES = Object.freeze([
    'neo-theme-neo-light',
    'neo-theme-neo-dark',
    'neo-theme-light',
    'neo-theme-dark',
    'neo-theme-cyberpunk'
]);

export const SCOPES = Object.freeze([
    'inherited',
    'scoped'
]);

export const STATES = Object.freeze([
    'default',
    'hover',
    'active',
    'focus',
    'selected',
    'pressed',
    'disabled',
    'invalid',
    'readonly'
]);

export const PAINTED_PROPERTIES = Object.freeze([
    'background-color',
    'background-image',
    'color',
    'border-color',
    'border-width',
    'outline',
    'outline-offset',
    'box-shadow',
    'fill',
    'stroke',
    'opacity',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'letter-spacing',
    'line-height',
    'text-decoration-line',
    'text-decoration-color',
    'text-transform',
    'border-radius',
    'padding',
    'width',
    'height'
]);

const BUTTON_STATES = ['default', 'hover', 'active', 'focus', 'pressed', 'disabled'];
const BUTTON_PARTS  = ['.neo-button', '.neo-button-text', '.neo-button-glyph', '.neo-button-badge'];
const FIELD_STATES  = ['default', 'hover', 'focus', 'disabled', 'invalid', 'readonly'];
const FIELD_PARTS   = ['.neo-textfield', '.neo-textfield-label', '.neo-textfield-input'];

/**
 * @summary Normalizes a declarative part entry (`string` selector or `{selector, pseudo, id?}`) into a canonical descriptor.
 * @param {String|Object} part Raw part entry from `COMPONENT_MATRIX`.
 * @returns {Object} Normalized `{id, selector, pseudo}`.
 */
export function normalizePartSpec(part) {
    if (typeof part === 'string') {
        return {id: part, selector: part, pseudo: null}
    }

    const pseudo = part.pseudo || null;

    return {
        id      : part.id || `${part.selector}${pseudo || ''}`,
        selector: part.selector,
        pseudo
    }
}

/**
 * Representative component and variant probes mounted inside isolated stage cells (`#eq-cell-<cellId>`).
 * @type {Object[]}
 */
export const COMPONENT_MATRIX = Object.freeze([
    // app
    {
        id                 : 'app-content',
        package            : 'app',
        cellId             : 'app-content',
        stateTargetSelector: '.neo-list-item',
        stateTargets       : {
            hover: ['.neo-list-item', '.content-bottom-toolbar .neo-button']
        },
        states             : ['default', 'hover', 'selected'],
        parts              : [
            '.neo-app-content-container',
            '.neo-app-content-page-container',
            '.content-bottom-toolbar',
            '.content-bottom-toolbar .neo-button',
            {selector: '.content-bottom-toolbar-previous', pseudo: '::before'},
            {selector: '.content-bottom-toolbar-next',     pseudo: '::before'},
            '.neo-app-content-sections-list',
            '.neo-list-item'
        ]
    },
    // board
    {
        id                 : 'board',
        package            : 'board',
        cellId             : 'board',
        stateTargetSelector: '.neo-board-card',
        states             : ['default', 'hover', 'selected'],
        parts              : ['.neo-board', '.neo-board-column', '.neo-board-column-header', '.neo-board-card']
    },
    // button (all ui + size variants + segmented + split + theme-switcher)
    {
        id                 : 'button',
        package            : 'button',
        cellId             : 'button-default',
        stateTargetSelector: '.neo-button',
        states             : BUTTON_STATES,
        parts              : BUTTON_PARTS
    },
    {
        id                 : 'button[primary]',
        package            : 'button',
        cellId             : 'button-primary',
        stateTargetSelector: '.neo-button',
        states             : BUTTON_STATES,
        parts              : BUTTON_PARTS
    },
    {
        id                 : 'button[secondary]',
        package            : 'button',
        cellId             : 'button-secondary',
        stateTargetSelector: '.neo-button',
        states             : BUTTON_STATES,
        parts              : BUTTON_PARTS
    },
    {
        id                 : 'button[ghost]',
        package            : 'button',
        cellId             : 'button-ghost',
        stateTargetSelector: '.neo-button',
        states             : BUTTON_STATES,
        parts              : ['.neo-button', '.neo-button-text', '.neo-button-glyph']
    },
    {
        id                 : 'button[tertiary]',
        package            : 'button',
        cellId             : 'button-tertiary',
        stateTargetSelector: '.neo-button',
        states             : BUTTON_STATES,
        parts              : ['.neo-button', '.neo-button-text', '.neo-button-glyph']
    },
    {
        id                 : 'button[small]',
        package            : 'button',
        cellId             : 'button-small',
        stateTargetSelector: '.neo-button',
        states             : ['default'],
        parts              : ['.neo-button', '.neo-button-text']
    },
    {
        id                 : 'button[large]',
        package            : 'button',
        cellId             : 'button-large',
        stateTargetSelector: '.neo-button',
        states             : ['default'],
        parts              : ['.neo-button', '.neo-button-text']
    },
    {
        id                 : 'segmented-button',
        package            : 'button',
        cellId             : 'segmented-button',
        stateTargetSelector: '.neo-button:not(.pressed)',
        states             : ['default', 'hover', 'pressed', 'disabled'],
        parts              : ['.neo-segmented-button', '.neo-button.pressed', '.neo-button:not(.pressed)', '.neo-button-text']
    },
    {
        id                 : 'split-button',
        package            : 'button',
        cellId             : 'split-button',
        stateTargetSelector: '.neo-trigger-button',
        stateTargets       : {
            hover : ['.neo-button:not(.neo-trigger-button)', '.neo-trigger-button'],
            active: ['.neo-button:not(.neo-trigger-button)', '.neo-trigger-button'],
            focus : ['.neo-button:not(.neo-trigger-button)', '.neo-trigger-button']
        },
        states: ['default', 'hover', 'active', 'focus', 'pressed', 'disabled'],
        parts : ['.neo-split-button', '.neo-button:not(.neo-trigger-button)', '.neo-trigger-button']
    },
    {
        id                 : 'theme-switcher',
        package            : 'button',
        cellId             : 'theme-switcher',
        stateTargetSelector: '.neo-theme-switcher',
        states             : ['default', 'hover', 'active', 'focus'],
        parts              : ['.neo-theme-switcher', '.neo-button-glyph']
    },
    // calendar
    {
        id                 : 'calendar',
        package            : 'calendar',
        cellId             : 'calendar',
        stateTargetSelector: '.neo-c-m-day-number, .neo-cell',
        states             : ['default', 'focus'],
        parts              : ['.neo-calendar-maincontainer', '.neo-calendar-header-toolbar']
    },
    // code
    {
        id                 : 'live-preview',
        package            : 'code',
        cellId             : 'live-preview',
        stateTargetSelector: '.neo-code-live-preview',
        states             : ['default'],
        parts              : ['.neo-code-live-preview', '.live-preview-container', '.neo-tab-header-toolbar', '.neo-tab-strip', '.neo-tab-body-container']
    },
    // component
    {
        id                 : 'box-label',
        package            : 'component',
        cellId             : 'box-label',
        stateTargetSelector: '.neo-box-label',
        states             : ['default'],
        parts              : ['.neo-box-label']
    },
    {
        id                 : 'carousel',
        package            : 'component',
        cellId             : 'carousel',
        stateTargetSelector: '.neo-carousel-btn',
        states             : ['default', 'hover'],
        parts              : [
            '.neo-carousel',
            '.neo-carousel-inner',
            {selector: '.neo-carousel-inner', pseudo: '::before'},
            {selector: '.neo-carousel-inner', pseudo: '::after'},
            '.neo-carousel-btn',
            '.neo-carousel-item'
        ]
    },
    {
        id                 : 'chip',
        package            : 'component',
        cellId             : 'chip',
        stateTargetSelector: '.neo-chip',
        stateTargets       : {
            hover: '.neo-chip-close-button',
            focus: ['.neo-chip', '.neo-chip-close-button']
        },
        states: ['default', 'hover', 'focus', 'disabled'],
        parts : ['.neo-chip', '.neo-chip-glyph', '.neo-chip-text', '.neo-chip-close-button']
    },
    {
        id                 : 'clock',
        package            : 'component',
        cellId             : 'clock',
        stateTargetSelector: '.neo-clock',
        states             : ['default'],
        parts              : ['.neo-clock', '.neo-hours', '.neo-minutes']
    },
    {
        id                 : 'date-selector',
        package            : 'component',
        cellId             : 'date-selector',
        stateTargetSelector: '.neo-cell',
        stateTargets       : {
            focus: ['.neo-dateselector', '.neo-cell']
        },
        states             : ['default', 'hover', 'focus', 'selected', 'disabled'],
        parts              : ['.neo-dateselector', '.neo-cell']
    },
    {
        id                 : 'empty-state',
        package            : 'component',
        cellId             : 'empty-state',
        stateTargetSelector: '.neo-empty-state-action',
        states             : ['default', 'hover', 'active', 'focus'],
        parts              : ['.neo-empty-state', '.neo-empty-state-title', '.neo-empty-state-description', '.neo-empty-state-action']
    },
    {
        id                 : 'empty-state[plain]',
        package            : 'component',
        cellId             : 'empty-state-plain',
        stateTargetSelector: '.neo-empty-state',
        states             : ['default'],
        parts              : ['.neo-empty-state', '.neo-empty-state-title']
    },
    {
        id                 : 'icon',
        package            : 'component',
        cellId             : 'icon',
        stateTargetSelector: '.neo-icon',
        states             : ['default'],
        parts              : ['.neo-icon']
    },
    {
        id                 : 'label',
        package            : 'component',
        cellId             : 'label',
        stateTargetSelector: '.neo-label',
        states             : ['default'],
        parts              : ['.neo-label']
    },
    {
        id                 : 'markdown',
        package            : 'component',
        cellId             : 'markdown',
        stateTargetSelector: '.neo-markdown-component',
        states             : ['default'],
        parts              : ['.neo-markdown-component', 'blockquote', 'code', 'a']
    },
    {
        id                 : 'progress',
        package            : 'component',
        cellId             : 'progress',
        stateTargetSelector: '.neo-progress-wrapper',
        states             : ['default'],
        parts              : ['.neo-progress-wrapper', 'progress']
    },
    {
        id                 : 'splitter',
        package            : 'component',
        cellId             : 'splitter',
        stateTargetSelector: '.neo-splitter',
        states             : ['default', 'hover', 'active'],
        parts              : ['.neo-splitter']
    },
    {
        id                 : 'status-badge[neutral]',
        package            : 'component',
        cellId             : 'status-badge-neutral',
        stateTargetSelector: '.neo-status-badge',
        states             : ['default'],
        parts              : ['.neo-status-badge', '.neo-state-text']
    },
    {
        id                 : 'status-badge[info]',
        package            : 'component',
        cellId             : 'status-badge-info',
        stateTargetSelector: '.neo-status-badge',
        states             : ['default'],
        parts              : ['.neo-status-badge', '.neo-state-text']
    },
    {
        id                 : 'status-badge[success]',
        package            : 'component',
        cellId             : 'status-badge-success',
        stateTargetSelector: '.neo-status-badge',
        states             : ['default'],
        parts              : ['.neo-status-badge', '.neo-state-text']
    },
    {
        id                 : 'status-badge[alert]',
        package            : 'component',
        cellId             : 'status-badge-alert',
        stateTargetSelector: '.neo-status-badge',
        states             : ['default'],
        parts              : ['.neo-status-badge', '.neo-state-text']
    },
    {
        id                 : 'status-badge[error]',
        package            : 'component',
        cellId             : 'status-badge-error',
        stateTargetSelector: '.neo-status-badge',
        states             : ['default'],
        parts              : ['.neo-status-badge', '.neo-state-text']
    },
    {
        id                 : 'toast',
        package            : 'component',
        cellId             : 'toast',
        stateTargetSelector: '.neo-toast',
        states             : ['default'],
        parts              : ['.neo-toast', '.neo-toast-inner', '.neo-toast-text']
    },
    // container
    {
        id                 : 'container',
        package            : 'container',
        cellId             : 'container',
        stateTargetSelector: '.neo-container',
        states             : ['default'],
        parts              : ['.neo-container']
    },
    {
        id                 : 'panel',
        package            : 'container',
        cellId             : 'panel',
        stateTargetSelector: '.neo-panel',
        states             : ['default'],
        parts              : ['.neo-panel', '.neo-panel-header-text']
    },
    {
        id                 : 'accordion',
        package            : 'container',
        cellId             : 'accordion',
        stateTargetSelector: '.neo-accordion-item',
        states             : ['default'],
        parts              : ['.neo-accordion', '.neo-accordion-item']
    },
    // dashboard
    {
        id                 : 'dashboard',
        package            : 'dashboard',
        cellId             : 'dashboard',
        stateTargetSelector: '.neo-dashboard',
        states             : ['default'],
        parts              : ['.neo-dashboard', '.neo-panel']
    },
    // date
    {
        id                 : 'date-selector-container',
        package            : 'date',
        cellId             : 'date-selector-container',
        stateTargetSelector: '.neo-dateselector',
        states             : ['default'],
        parts              : ['.neo-dateselector', '.neo-day-view']
    },
    // desktop
    {
        id                 : 'desktop-taskbar',
        package            : 'desktop',
        cellId             : 'desktop-taskbar',
        stateTargetSelector: '.neo-desktop-start-button',
        states             : ['default', 'hover', 'pressed'],
        parts              : ['.neo-desktop-taskbar', '.neo-desktop-start-button', '.neo-desktop-task-list']
    },
    // dialog
    {
        id                 : 'dialog',
        package            : 'dialog',
        cellId             : 'dialog',
        stateTargetSelector: '.neo-header-toolbar .neo-button',
        stateTargets       : {
            hover : ['.neo-header-toolbar .neo-button', '.neo-footer-toolbar .neo-button'],
            active: ['.neo-header-toolbar .neo-button', '.neo-footer-toolbar .neo-button']
        },
        states             : ['default', 'hover', 'active'],
        parts              : [
            '.neo-dialog',
            '.neo-header-toolbar',
            '.neo-panel-header-text',
            '.neo-header-toolbar .neo-button',
            '.neo-header-toolbar .neo-button-glyph',
            '.neo-footer-toolbar',
            '.neo-footer-toolbar .neo-button'
        ]
    },
    // filter
    {
        id                 : 'filter-boolean',
        package            : 'filter',
        cellId             : 'filter-boolean',
        stateTargetSelector: '.neo-filter-booleancontainer',
        states             : ['default'],
        parts              : ['.neo-filter-booleancontainer', '.neo-radiofield']
    },
    {
        id                 : 'filter-number',
        package            : 'filter',
        cellId             : 'filter-number',
        stateTargetSelector: '.neo-filter-numbercontainer',
        states             : ['default'],
        parts              : ['.neo-filter-numbercontainer', '.neo-numberfield']
    },
    // form
    {
        id                 : 'form-container',
        package            : 'form',
        cellId             : 'form-container',
        stateTargetSelector: '.neo-form-container',
        states             : ['default'],
        parts              : ['.neo-form-container']
    },
    {
        id                 : 'fieldset',
        package            : 'form',
        cellId             : 'fieldset',
        stateTargetSelector: '.neo-fieldset',
        states             : ['default'],
        parts              : ['.neo-fieldset', '.neo-legend']
    },
    {
        id                 : 'textfield',
        package            : 'form',
        cellId             : 'textfield',
        stateTargetSelector: '.neo-textfield',
        stateTargets       : {
            hover: ['input.neo-textfield-input', '.neo-field-trigger']
        },
        inputSelector      : 'input.neo-textfield-input',
        states             : FIELD_STATES,
        parts              : ['.neo-textfield', '.neo-textfield-label', '.neo-textfield-sublabel', '.neo-input-wrapper', '.neo-textfield-input', '.neo-field-trigger']
    },
    {
        id                 : 'textfield[inline]',
        package            : 'form',
        cellId             : 'textfield-inline',
        stateTargetSelector: '.neo-textfield',
        inputSelector      : 'input.neo-textfield-input',
        states             : FIELD_STATES,
        parts              : ['.neo-textfield', '.neo-textfield-label', '.neo-textfield-input', '.neo-left-border', '.neo-center-border', '.neo-right-border']
    },
    {
        id                 : 'textarea',
        package            : 'form',
        cellId             : 'textarea',
        stateTargetSelector: '.neo-textarea',
        inputSelector      : 'textarea.neo-textfield-input',
        states             : FIELD_STATES,
        parts              : ['.neo-textarea', '.neo-textfield-label', '.neo-textfield-input']
    },
    {
        id                 : 'numberfield',
        package            : 'form',
        cellId             : 'numberfield',
        stateTargetSelector: '.neo-numberfield',
        stateTargets       : {
            hover: ['input.neo-textfield-input', '.neo-spin-button.neo-up']
        },
        inputSelector: 'input.neo-textfield-input',
        states       : FIELD_STATES,
        parts        : [...FIELD_PARTS, '.neo-input-wrapper', '.neo-field-trigger', '.neo-spin-button.neo-up']
    },
    {
        id                 : 'searchfield',
        package            : 'form',
        cellId             : 'searchfield',
        stateTargetSelector: '.neo-searchfield',
        inputSelector      : 'input.neo-textfield-input',
        states             : ['default', 'hover', 'focus', 'disabled'],
        parts              : ['.neo-searchfield', '.neo-textfield-input']
    },
    {
        id                 : 'selectfield',
        package            : 'form',
        cellId             : 'selectfield',
        stateTargetSelector: '.neo-selectfield',
        stateTargets       : {
            hover: '.neo-selectfield-input'
        },
        inputSelector      : '.neo-selectfield-input',
        states             : ['default', 'hover', 'focus', 'disabled', 'invalid'],
        parts              : ['.neo-selectfield', '.neo-selectfield-label', '.neo-selectfield-input']
    },
    {
        id                 : 'combobox',
        package            : 'form',
        cellId             : 'combobox',
        stateTargetSelector: '.neo-combobox',
        stateTargets       : {
            hover: ['input.neo-textfield-input', '.neo-field-trigger']
        },
        inputSelector      : 'input.neo-textfield-input',
        states             : ['default', 'hover', 'focus', 'disabled', 'invalid'],
        parts              : ['.neo-combobox', '.neo-input-wrapper', '.neo-textfield-input', '.neo-field-trigger']
    },
    {
        id                 : 'pickerfield',
        package            : 'form',
        cellId             : 'pickerfield',
        stateTargetSelector: '.neo-pickerfield',
        stateTargets       : {
            hover: ['input.neo-textfield-input', '.neo-field-trigger']
        },
        inputSelector      : 'input.neo-textfield-input',
        states             : ['default', 'hover', 'focus', 'disabled'],
        parts              : ['.neo-pickerfield', '.neo-input-wrapper', '.neo-textfield-input', '.neo-field-trigger']
    },
    {
        id                 : 'checkboxfield',
        package            : 'form',
        cellId             : 'checkboxfield',
        stateTargetSelector: '.neo-checkboxfield',
        inputSelector      : 'input.neo-checkbox-input',
        states             : ['default', 'hover', 'focus', 'disabled', 'invalid'],
        parts              : ['.neo-checkboxfield', '.neo-checkbox-label', '.neo-checkbox-icon', '.neo-checkbox-value-label']
    },
    {
        id                 : 'checkboxfield[checked]',
        package            : 'form',
        cellId             : 'checkboxfield-checked',
        stateTargetSelector: '.neo-checkboxfield',
        inputSelector      : 'input.neo-checkbox-input',
        states             : ['default', 'focus', 'disabled'],
        parts              : ['.neo-checkboxfield', '.neo-checkbox-label', '.neo-checkbox-icon', '.neo-checkbox-value-label']
    },
    {
        id                 : 'switchfield',
        package            : 'form',
        cellId             : 'switchfield',
        stateTargetSelector: '.neo-switchfield',
        stateTargets       : {
            hover   : 'input.neo-switchfield-input',
            focus   : 'input.neo-switchfield-input',
            disabled: '.neo-switchfield'
        },
        inputSelector: 'input.neo-switchfield-input',
        states       : ['default', 'hover', 'focus', 'disabled'],
        parts        : [
            '.neo-switchfield',
            'input.neo-switchfield-input',
            {selector: 'input.neo-switchfield-input', pseudo: '::before'},
            {selector: 'input.neo-switchfield-input', pseudo: '::after'},
            '.neo-checkbox-value-label'
        ]
    },
    {
        id                 : 'switchfield[checked]',
        package            : 'form',
        cellId             : 'switchfield-checked',
        stateTargetSelector: '.neo-switchfield',
        stateTargets       : {
            hover   : 'input.neo-switchfield-input',
            focus   : 'input.neo-switchfield-input',
            disabled: '.neo-switchfield'
        },
        inputSelector: 'input.neo-switchfield-input',
        states       : ['default', 'hover', 'focus', 'disabled'],
        parts        : [
            '.neo-switchfield',
            'input.neo-switchfield-input',
            {selector: 'input.neo-switchfield-input', pseudo: '::before'},
            {selector: 'input.neo-switchfield-input', pseudo: '::after'},
            '.neo-checkbox-value-label'
        ]
    },
    {
        id                 : 'rangefield',
        package            : 'form',
        cellId             : 'rangefield',
        stateTargetSelector: 'input.neo-rangefield-input',
        states             : ['default', 'focus', 'active', 'disabled'],
        parts              : ['.neo-rangefield', 'input.neo-rangefield-input']
    },
    {
        id                 : 'fileuploadfield',
        package            : 'form',
        cellId             : 'fileuploadfield',
        stateTargetSelector: '.neo-file-upload-field',
        states             : ['default', 'focus', 'disabled', 'invalid'],
        parts              : ['.neo-file-upload-field']
    },
    {
        id                 : 'chipfield',
        package            : 'form',
        cellId             : 'chipfield',
        stateTargetSelector: '.neo-chipfield',
        states             : ['default', 'focus', 'disabled'],
        parts              : ['.neo-chipfield', '.neo-input-wrapper']
    },
    // gantt
    {
        id                 : 'gantt',
        package            : 'gantt',
        cellId             : 'gantt',
        stateTargetSelector: '.neo-timeline-bar, .neo-gantt',
        states             : ['default', 'hover'],
        parts              : ['.neo-gantt', '.neo-grid-header-toolbar']
    },
    // grid
    {
        id                 : 'grid',
        package            : 'grid',
        cellId             : 'grid',
        stateTargetSelector: '.neo-grid-cell',
        stateTargets       : {
            hover: ['.neo-grid-cell', '.neo-grid-header-button'],
            focus: ['.neo-grid-cell', '.neo-grid-header-button']
        },
        states             : ['default', 'hover', 'focus', 'selected'],
        parts              : ['.neo-grid-container', '.neo-grid-header-button', '.neo-grid-row', '.neo-grid-cell', '.neo-grid-footer-toolbar']
    },
    // layout
    {
        id                 : 'layout-cube',
        package            : 'layout',
        cellId             : 'layout-cube',
        stateTargetSelector: '.neo-layout-cube',
        states             : ['default'],
        parts              : ['.neo-layout-cube', '.neo-plane', '.neo-face']
    },
    // list
    {
        id                 : 'list',
        package            : 'list',
        cellId             : 'list',
        stateTargetSelector: '.neo-list-item',
        states             : ['default', 'hover', 'active', 'focus', 'selected', 'disabled'],
        parts              : [
            '.neo-list-wrapper',
            '.neo-list',
            '.neo-list-item',
            {selector: '.neo-list-item', pseudo: '::before'}
        ]
    },
    {
        id                 : 'chip-list',
        package            : 'list',
        cellId             : 'chip-list',
        stateTargetSelector: '.neo-list-item',
        states             : ['default', 'hover', 'selected'],
        parts              : ['.neo-chip-list', '.neo-list-item', '.neo-chip']
    },
    {
        id                 : 'value-picker',
        package            : 'list',
        cellId             : 'value-picker',
        stateTargetSelector: '.neo-list-item',
        states             : ['default', 'hover', 'selected'],
        parts              : ['.neo-value-picker', '.neo-list-item']
    },
    // menu
    {
        id                 : 'menu-list',
        package            : 'menu',
        cellId             : 'menu-list',
        stateTargetSelector: '.neo-list-item',
        states             : ['default', 'hover', 'focus', 'disabled'],
        parts              : ['.neo-menu-list', '.neo-list-item']
    },
    // plugin
    {
        id                 : 'plugin-resizable',
        package            : 'plugin',
        cellId             : 'plugin-resizable',
        scopeSelector      : '.neo-resizable, .neo-popover',
        stateTargetSelector: '.neo-resizable',
        states             : ['default'],
        parts              : ['.neo-resizable', '.neo-popover']
    },
    // scheduler
    {
        id                 : 'scheduler',
        package            : 'scheduler',
        cellId             : 'scheduler',
        stateTargetSelector: '.neo-timeline-bar, .neo-scheduler',
        states             : ['default', 'hover'],
        parts              : ['.neo-scheduler', '.neo-timeline-header']
    },
    // sitemap
    {
        id                 : 'sitemap',
        package            : 'sitemap',
        cellId             : 'sitemap',
        stateTargetSelector: '.neo-action',
        states             : ['default', 'hover'],
        parts              : ['.neo-sitemap', '.neo-action']
    },
    // tab
    {
        id                 : 'tab-container',
        package            : 'tab',
        cellId             : 'tab-container',
        stateTargetSelector: '.neo-tab-header-button:not(.pressed)',
        states             : ['default', 'hover', 'active', 'focus', 'disabled'],
        parts              : [
            '.neo-tab-container',
            '.neo-tab-header-toolbar',
            '.neo-tab-header-button.pressed',
            '.neo-tab-header-button.pressed .neo-button-text',
            '.neo-tab-header-button.pressed .neo-button-glyph',
            '.neo-tab-header-button.pressed .neo-tab-button-indicator',
            '.neo-tab-header-button:not(.pressed)',
            '.neo-tab-header-button:not(.pressed) .neo-button-text',
            '.neo-tab-header-button:not(.pressed) .neo-button-glyph',
            '.neo-tab-strip',
            '.neo-active-tab-indicator'
        ]
    },
    {
        id                 : 'tab-container[inline]',
        package            : 'tab',
        cellId             : 'tab-container-inline',
        stateTargetSelector: '.neo-tab-header-button:not(.pressed)',
        states             : ['default'],
        parts              : [
            '.neo-tab-container',
            '.neo-tab-header-toolbar',
            '.neo-tab-header-button.pressed',
            '.neo-tab-header-button:not(.pressed)',
            '.neo-button-text'
        ]
    },
    {
        id                 : 'tab-container[standalone]',
        package            : 'tab',
        cellId             : 'tab-container-standalone',
        stateTargetSelector: '.neo-tab-header-button:not(.pressed)',
        states             : ['default'],
        parts              : [
            '.neo-tab-container',
            '.neo-tab-header-toolbar',
            '.neo-tab-header-button.pressed',
            '.neo-tab-header-button:not(.pressed)',
            '.neo-button-text'
        ]
    },
    // table
    {
        id                 : 'table',
        package            : 'table',
        cellId             : 'table',
        stateTargetSelector: '.neo-table-cell',
        stateTargets       : {
            focus: ['.neo-table-cell', '.neo-table-header-button']
        },
        states             : ['default', 'hover', 'focus', 'selected'],
        parts              : ['.neo-table-container', '.neo-table-header-button', '.neo-table-row', '.neo-table-cell']
    },
    // timeline
    {
        id                 : 'timeline',
        package            : 'timeline',
        cellId             : 'timeline',
        scopeSelector      : '.neo-timeline-event-editor, .neo-timeline-bar',
        stateTargetSelector: '.neo-timeline-event-editor',
        states             : ['default'],
        parts              : ['.neo-timeline-event-editor', '.neo-timeline-cell', '.neo-timeline-bar']
    },
    // toolbar
    {
        id                 : 'toolbar',
        package            : 'toolbar',
        cellId             : 'toolbar',
        stateTargetSelector: '.neo-toolbar',
        states             : ['default'],
        parts              : ['.neo-toolbar']
    },
    {
        id                 : 'breadcrumb',
        package            : 'toolbar',
        cellId             : 'breadcrumb',
        stateTargetSelector: '.neo-button:first-child',
        states             : ['default', 'hover', 'disabled'],
        parts              : [
            '.neo-breadcrumb-toolbar',
            '.neo-button:first-child',
            {selector: '.neo-button:first-child', pseudo: '::after'}
        ]
    },
    {
        id                 : 'paging-toolbar',
        package            : 'toolbar',
        cellId             : 'paging-toolbar',
        stateTargetSelector: '.neo-paging-toolbar',
        states             : ['default'],
        parts              : ['.neo-paging-toolbar']
    },
    // tooltip
    {
        id                 : 'tooltip',
        package            : 'tooltip',
        cellId             : 'tooltip',
        stateTargetSelector: '.neo-tooltip',
        states             : ['default'],
        parts              : ['.neo-tooltip']
    },
    // tree
    {
        id                 : 'tree-list',
        package            : 'tree',
        cellId             : 'tree-list',
        stateTargetSelector: '.neo-list-item',
        states             : ['default', 'hover', 'focus', 'selected'],
        parts              : [
            '.neo-tree-list',
            '.neo-list-item',
            {selector: '.neo-list-item-content', pseudo: '::before'}
        ]
    },
    // util
    {
        id                 : 'highlightjs',
        package            : 'util',
        cellId             : 'highlightjs',
        stateTargetSelector: 'pre.hljs',
        states             : ['default'],
        parts              : ['pre.hljs', '.hljs-keyword', '.hljs-number', '.hljs-comment', '.hljs-ln-numbers']
    }
]);

const NON_ENGINE_CSS_DIRS = new Set(['apps', 'examples']);

/**
 * Explicit coverage ledger for every engine package directory under `resources/css/src`.
 * @type {Object[]}
 */
export const ENGINE_PACKAGE_MATRIX = Object.freeze([
    {package: 'app',       rendered: true},
    {package: 'board',     rendered: true},
    {package: 'button',    rendered: true},
    {package: 'calendar',  rendered: true},
    {package: 'code',      rendered: true, note: 'Rendered via LivePreview container + TabContainer shell without booting the external Monaco worker.'},
    {package: 'component', rendered: true},
    {package: 'container', rendered: true},
    {package: 'dashboard', rendered: true},
    {package: 'date',      rendered: true},
    {package: 'desktop',   rendered: true},
    {package: 'dialog',    rendered: true},
    {
        package         : 'draggable',
        rendered        : false,
        unrenderedReason: 'Styles transient mid-gesture drag proxies (.neo-dragproxy, .neo-is-dragging, .neo-sort-source) that exist only during an active pointer drag.'
    },
    {package: 'filter',    rendered: true},
    {package: 'form',      rendered: true},
    {package: 'gantt',     rendered: true},
    {package: 'grid',      rendered: true},
    {package: 'layout',    rendered: true},
    {package: 'list',      rendered: true},
    {package: 'menu',      rendered: true},
    {package: 'plugin',    rendered: true},
    {package: 'scheduler', rendered: true},
    {package: 'sitemap',   rendered: true},
    {package: 'tab',       rendered: true},
    {package: 'table',     rendered: true},
    {package: 'timeline',  rendered: true},
    {package: 'toolbar',   rendered: true},
    {package: 'tooltip',   rendered: true},
    {package: 'tree',      rendered: true},
    {package: 'util',      rendered: true, note: 'HighlightJs is a static markup utility; its .hljs and .hljs-ln token elements are rendered in a Component host.'}
].map(entry => ({
    ...entry,
    components: COMPONENT_MATRIX.filter(c => c.package === entry.package).map(c => c.id)
})));

/**
 * @summary Verifies that every engine package directory under `resources/css/src` is accounted for in `ENGINE_PACKAGE_MATRIX`.
 * @param {String} cssSrcRoot Path to `resources/css/src`.
 * @returns {Object} Validation report `{ok, diskPackages, missingPackages, invalidRendered, invalidUnrendered, extraPackages}`.
 */
export function validateEnginePackageMatrix(cssSrcRoot) {
    const diskPackages = fs.readdirSync(cssSrcRoot, {withFileTypes: true})
        .filter(entry => entry.isDirectory() && !NON_ENGINE_CSS_DIRS.has(entry.name))
        .map(entry => entry.name)
        .sort();

    const byName            = new Map(ENGINE_PACKAGE_MATRIX.map(entry => [entry.package, entry])),
          missingPackages   = diskPackages.filter(pkg => !byName.has(pkg)),
          extraPackages     = ENGINE_PACKAGE_MATRIX.map(e => e.package).filter(pkg => !diskPackages.includes(pkg)),
          invalidRendered   = ENGINE_PACKAGE_MATRIX.filter(e => e.rendered && e.components.length === 0).map(e => e.package),
          invalidUnrendered = ENGINE_PACKAGE_MATRIX.filter(e => !e.rendered && (!e.unrenderedReason || !e.unrenderedReason.trim())).map(e => e.package);

    return {
        ok: missingPackages.length === 0
            && extraPackages.length === 0
            && invalidRendered.length === 0
            && invalidUnrendered.length === 0,
        diskPackages,
        missingPackages,
        extraPackages,
        invalidRendered,
        invalidUnrendered
    }
}
