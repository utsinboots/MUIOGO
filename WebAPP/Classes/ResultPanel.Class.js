import { escapeHtml } from "./Html.Class.js";
import { ResultFieldSettings } from "./ResultFieldSettings.Class.js";
import { ResultLayoutState } from "./ResultLayoutState.Class.js";

const PANEL_AREAS = Object.freeze([
    Object.freeze({ key: 'filters', label: 'Filters', glyph: '▼' }),
    Object.freeze({ key: 'columns', label: 'Columns', glyph: '⫴' }),
    Object.freeze({ key: 'rows', label: 'Rows', glyph: '≡' }),
    Object.freeze({ key: 'values', label: 'Values', glyph: 'Σ' })
]);

// Results field panel: edits a ResultLayoutState by dragging fields between areas.
export class ResultPanel {

    static get Areas() {
        return PANEL_AREAS;
    }

    constructor(selector, state, options = {}) {
        if (!window.jQuery || typeof window.jQuery.fn.sortable != 'function') {
            throw new Error('The Results field panel could not be loaded.');
        }
        this.selector = selector;
        this.state = state;
        this.options = options;
        this.deferred = false;
        this.pending = false;
        this.unsubscribe = null;
        this.lists = null;
        // Stored as fields so destroy() can detach them and a rebuilt panel cannot double-fire.
        this.onChangeEvent = event => this.handleChange(event);
        this.onClickEvent = event => this.handleClick(event);
        this.build();
    }

    root() {
        return document.querySelector(this.selector);
    }

    displayText(value) {
        return typeof this.options.plainText == 'function'
            ? this.options.plainText(value)
            : String(value == null ? '' : value);
    }

    // Draw the fixed shell once; refresh() fills the field list and the four areas.
    build() {
        const root = this.root();
        if (!root) return;
        root.classList.add('result-panel');
        root.innerHTML =
            '<div class="result-panel-section"><label class="result-panel-title">Choose fields to add to report:</label>' +
            '<div class="result-panel-fields"></div></div>' +
            '<div class="result-panel-section"><label class="result-panel-title">Drag fields between areas below:</label>' +
            ResultPanel.Areas.map(area =>
                `<div class="result-panel-area" data-area="${area.key}">` +
                `<label class="result-panel-area-title"><span class="result-panel-glyph">${area.glyph}</span> ${area.label}</label>` +
                '<ul class="result-panel-list"></ul></div>').join('') +
            '</div>' +
            '<div class="result-panel-section result-panel-controls">' +
            '<label><input type="checkbox" class="result-panel-defer"> Defer Updates</label>' +
            '<button type="button" class="btn btn-default btn-sm result-panel-update" disabled>Update</button>' +
            '</div>';

        root.addEventListener('change', this.onChangeEvent);
        root.addEventListener('click', this.onClickEvent);
        this.bindSortables();
        this.unsubscribe = this.state.onChange(() => this.stateChanged());
        this.refresh();
    }

    handleChange(event) {
        const box = event.target.closest('.result-panel-field input[type="checkbox"]');
        if (box) return this.toggleField(box.value, box.checked);
        const defer = event.target.closest('.result-panel-defer');
        if (defer) this.setDeferred(defer.checked);
    }

    handleClick(event) {
        const remove = event.target.closest('.result-panel-remove');
        if (remove) {
            this.state.assign(remove.closest('.result-panel-chip').dataset.field, null);
            return;
        }
        const settings = event.target.closest('.result-panel-settings');
        if (settings) return this.openSettings(settings.closest('.result-panel-chip').dataset.field);
        if (event.target.closest('.result-panel-update')) this.apply();
    }

    openSettings(field) {
        ResultFieldSettings.open(field, this.state, {
            fieldValues: this.options.fieldValues,
            plainText: this.options.plainText
        });
    }

    // Let every area accept chips dragged from the other three.
    bindSortables() {
        const lists = window.jQuery(`${this.selector} .result-panel-list`);
        lists.sortable({
            connectWith: `${this.selector} .result-panel-list`,
            placeholder: 'result-panel-placeholder',
            forcePlaceholderSize: true,
            tolerance: 'pointer',
            cursor: 'move',
            // update fires once per affected list, so a transfer would sync twice; stop fires once.
            stop: () => this.syncFromDom()
        });
        this.lists = lists;
    }

    // Read the dropped layout out of all four lists and apply it as one batched change.
    syncFromDom() {
        const root = this.root();
        if (!root) return;
        const dropped = {};
        ResultPanel.Areas.forEach(area => {
            const list = root.querySelector(`.result-panel-area[data-area="${area.key}"] .result-panel-list`);
            dropped[area.key] = Array.from(list.querySelectorAll('.result-panel-chip')).map(chip => chip.dataset.field);
        });
        // stop also fires when a drag is cancelled or dropped back, which must not force a redraw.
        const current = this.state.areas();
        const moved = ResultPanel.Areas.some(area => dropped[area.key].length != current[area.key].length ||
            dropped[area.key].some((field, index) => field != current[area.key][index]));
        if (!moved) return;
        this.state.defer(state => {
            ResultPanel.Areas.forEach(area => {
                dropped[area.key].forEach((field, index) => state.assign(field, area.key, index));
            });
        });
    }

    // Ticking a field drops it into the area its catalogue entry belongs to, as the Wijmo panel did.
    toggleField(field, checked) {
        if (!checked) return this.state.assign(field, null);
        const entry = this.state.fields.find(item => item.field == field);
        this.state.assign(field, entry && entry.isMeasure ? 'values' : 'rows');
    }

    setDeferred(deferred) {
        this.deferred = deferred;
        if (!deferred && this.pending) this.apply();
        else this.updateControls();
    }

    // Repaint on every state change, then notify immediately or hold until Update is pressed.
    stateChanged() {
        this.refresh();
        if (this.deferred) {
            this.pending = true;
            this.updateControls();
            return;
        }
        this.apply();
    }

    // The one signal callers redraw on, so deferring here defers the grid and chart with it.
    apply() {
        this.pending = false;
        this.updateControls();
        if (typeof this.options.onApply == 'function') this.options.onApply(this.state);
    }

    updateControls() {
        const button = this.root() && this.root().querySelector('.result-panel-update');
        if (button) button.disabled = !this.deferred || !this.pending;
    }

    // Rebuild the field checkboxes and area chips to match the current state.
    refresh() {
        const root = this.root();
        if (!root) return;
        const areas = this.state.areas();
        const placed = new Set(Object.keys(areas).reduce((all, key) => all.concat(areas[key]), []));
        root.querySelector('.result-panel-fields').innerHTML = this.state.fields.map(field =>
            '<label class="result-panel-field">' +
            `<input type="checkbox" value="${escapeHtml(field.field)}"${placed.has(field.field) ? ' checked' : ''}> ` +
            `<span>${escapeHtml(this.displayText(field.header))}</span></label>`).join('');

        ResultPanel.Areas.forEach(area => {
            const list = root.querySelector(`.result-panel-area[data-area="${area.key}"] .result-panel-list`);
            list.innerHTML = areas[area.key].map(name => this.chip(name, area.key)).join('');
        });
    }

    // Value chips name their aggregation, which ResultLayoutState fixes for every measure.
    chip(field, area) {
        const entry = this.state.fields.find(item => item.field == field);
        const header = this.displayText(entry ? entry.header : field);
        const aggregation = ResultLayoutState.Aggregation;
        const suffix = area == 'values' ? ` (${aggregation.charAt(0).toUpperCase()}${aggregation.slice(1)})` : '';
        const label = escapeHtml(header) + escapeHtml(suffix);
        return `<li class="result-panel-chip" data-field="${escapeHtml(field)}">` +
            `<span class="result-panel-chip-label">${label}</span>` +
            `<button type="button" class="result-panel-settings" aria-label="Settings for ${escapeHtml(header)}" title="Field settings">&#9881;</button>` +
            `<button type="button" class="result-panel-remove" aria-label="Remove ${escapeHtml(header)}" title="Remove field">&times;</button></li>`;
    }

    destroy() {
        ResultFieldSettings.destroy();
        if (this.unsubscribe) this.unsubscribe();
        this.unsubscribe = null;
        const root = this.root();
        if (root) {
            root.removeEventListener('change', this.onChangeEvent);
            root.removeEventListener('click', this.onClickEvent);
        }
        if (this.lists) {
            // jQuery UI keeps the widget under this data key and calling destroy without one throws.
            this.lists.filter((index, list) => !!window.jQuery.data(list, 'ui-sortable')).sortable('destroy');
            this.lists = null;
        }
        if (root) {
            root.innerHTML = '';
            root.classList.remove('result-panel');
        }
    }
}
