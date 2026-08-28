import { escapeHtml } from "./Html.Class.js";
import { ResultAggregator } from "./ResultAggregator.Class.js";

// Number formats offered for the measure, matching the set MUIO added to the Wijmo field editor.
const NUMBER_FORMATS = Object.freeze(['n0', 'n1', 'n2', 'n3', 'n4']);

// One dialog element is reused for every field so repeated opens cannot accumulate listeners.
let sharedDialog = null;
let activeEditor = null;

const handlers = {
    input: event => activeEditor && activeEditor.handleInput(event),
    change: event => activeEditor && activeEditor.handleChange(event),
    click: event => activeEditor && activeEditor.handleClick(event),
    hidden: () => { activeEditor = null; }
};

function dialogElement() {
    if (sharedDialog) return sharedDialog;
    const dialog = document.createElement('div');
    dialog.className = 'modal fade result-field-settings';
    dialog.tabIndex = -1;
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML =
        '<div class="modal-dialog" role="document"><div class="modal-content">' +
        '<div class="modal-header"><h4 class="modal-title"></h4></div>' +
        '<div class="modal-body">' +
        '<div class="result-field-row"><label for="resultFieldHeader">Header:</label>' +
        '<input id="resultFieldHeader" class="form-control result-field-header" type="text" readonly></div>' +
        '<div class="result-field-row"><label>Summary:</label><input class="form-control result-field-summary" type="text" readonly></div>' +
        '<div class="result-field-row"><label>Show As:</label><input class="form-control" type="text" value="No calculation" readonly></div>' +
        '<div class="result-field-row"><label>Weigh by:</label><input class="form-control" type="text" value="(none)" readonly></div>' +
        '<div class="result-field-row result-field-sort-section"><label for="resultFieldSort">Sort:</label>' +
        '<select id="resultFieldSort" class="form-control result-field-sort"><option value="asc">Ascending</option>' +
        '<option value="desc">Descending</option></select></div>' +
        '<div class="result-field-row"><label>Filter:</label><div class="result-field-filter-actions">' +
        '<button type="button" class="btn btn-default result-field-edit">Edit&hellip;</button>' +
        '<button type="button" class="btn btn-default result-field-clear">Clear</button></div></div>' +
        '<div class="result-field-filter-editor" hidden>' +
        '<label class="sr-only" for="resultFieldSearch">Search filter values</label>' +
        '<input id="resultFieldSearch" type="text" class="form-control result-field-search" placeholder="Search values">' +
        '<div class="result-field-actions">' +
        '<button type="button" class="btn btn-link btn-sm result-field-all">Select all</button>' +
        '<button type="button" class="btn btn-link btn-sm result-field-none">Select none</button>' +
        '<span class="result-field-count"></span></div>' +
        '<div class="result-field-values"></div>' +
        '<p class="result-field-hint">Select at least one value to apply.</p></div>' +
        '<div class="result-field-row result-field-format-section"><label for="resultFieldFormat">Format:</label>' +
        `<select id="resultFieldFormat" class="form-control result-field-format">${NUMBER_FORMATS.map(format =>
            `<option value="${format}">${format == 'n0' ? 'Integer (n0)' : `Number (${format})`}</option>`).join('')}</select></div>` +
        '<div class="result-field-row result-field-sample-row"><label>Sample:</label>' +
        '<input class="form-control result-field-sample" type="text" readonly></div>' +
        '</div><div class="modal-footer">' +
        '<button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>' +
        '<button type="button" class="btn btn-default result-field-apply">OK</button>' +
        '</div></div></div>';
    document.body.appendChild(dialog);
    dialog.addEventListener('input', handlers.input);
    dialog.addEventListener('change', handlers.change);
    dialog.addEventListener('click', handlers.click);
    if (window.jQuery) window.jQuery(dialog).on('hidden.bs.modal', handlers.hidden);
    sharedDialog = dialog;
    return dialog;
}

// Field settings dialog: sort direction, filter values and measure number format.
export class ResultFieldSettings {

    // Open the dialog for one field. Nothing is written to the state until Apply.
    static open(field, state, options = {}) {
        const entry = state.fields.find(item => item.field == field);
        if (!entry) return null;
        activeEditor = new ResultFieldSettings(entry, state, options);
        activeEditor.show();
        return activeEditor;
    }

    // Drop the shared dialog and its listeners, for callers tearing the Results page down.
    static destroy() {
        if (!sharedDialog) return;
        if (window.jQuery && typeof window.jQuery(sharedDialog).modal == 'function') {
            window.jQuery(sharedDialog).removeClass('fade').modal('hide');
        }
        sharedDialog.removeEventListener('input', handlers.input);
        sharedDialog.removeEventListener('change', handlers.change);
        sharedDialog.removeEventListener('click', handlers.click);
        if (window.jQuery) window.jQuery(sharedDialog).off('hidden.bs.modal', handlers.hidden);
        sharedDialog.remove();
        sharedDialog = null;
        activeEditor = null;
    }

    constructor(entry, state, options) {
        this.entry = entry;
        this.state = state;
        this.options = options;
        this.text = value => (typeof options.plainText == 'function' ? options.plainText(value) : String(value == null ? '' : value));
        // Raw values are kept against a stable identity so numbers and strings cannot collide.
        this.values = new Map();
        (typeof options.fieldValues == 'function' ? options.fieldValues(entry.field) || [] : [])
            .forEach(value => this.values.set(ResultAggregator.keyID([ResultAggregator.keyValue(value)]), value));
        const active = state.filters[entry.field];
        // No stored filter means every value is included, which is not the same as none selected.
        this.selected = new Set(active ? active.map(value => this.availableKey(value)).filter(key => key != null) : this.values.keys());
        this.descending = state.descending[entry.field] === true;
        this.search = '';
    }

    // Match legacy string values to one unambiguous raw value from the current model.
    availableKey(value) {
        const exact = ResultAggregator.keyID([ResultAggregator.keyValue(value)]);
        if (this.values.has(exact)) return exact;
        const matches = Array.from(this.values).filter(entry => String(entry[1]) == String(value));
        return matches.length == 1 ? matches[0][0] : null;
    }

    show() {
        const dialog = dialogElement();
        this.dialog = dialog;
        dialog.querySelector('.modal-title').textContent = `Field settings: ${this.text(this.entry.header)}`;
        dialog.querySelector('.result-field-header').value = this.text(this.entry.header);
        dialog.querySelector('.result-field-summary').value = this.entry.isMeasure ? 'Sum' : 'Count';
        // Sorting a measure would order rows by nothing meaningful, so it is offered for dimensions.
        dialog.querySelector('.result-field-sort-section').hidden = this.entry.isMeasure === true;
        dialog.querySelector('.result-field-format-section').hidden = this.entry.isMeasure !== true;
        dialog.querySelector('.result-field-sample-row').hidden = this.entry.isMeasure !== true;
        dialog.querySelector('.result-field-sort').value = this.descending ? 'desc' : 'asc';
        dialog.querySelector('.result-field-format').value = this.state.numberFormat;
        this.updateSample();
        dialog.querySelector('.result-field-search').value = '';
        dialog.querySelector('.result-field-filter-editor').hidden = true;
        dialog.querySelector('.result-field-clear').disabled = !this.state.filters[this.entry.field];
        this.renderValues();
        if (window.jQuery && typeof window.jQuery(dialog).modal == 'function') window.jQuery(dialog).modal('show');
        else dialog.style.display = 'block';
        return this;
    }

    handleInput(event) {
        if (!event.target.closest('.result-field-search')) return;
        this.search = event.target.value.trim().toLowerCase();
        this.renderValues();
    }

    handleChange(event) {
        if (event.target.closest('.result-field-format')) this.updateSample();
        const box = event.target.closest('.result-field-value input');
        // Searching only hides rows, so the checked set is edited here and nowhere else.
        if (!box) return;
        if (box.checked) this.selected.add(box.value);
        else this.selected.delete(box.value);
        this.renderCount();
    }

    handleClick(event) {
        // Select all and none act on the rows currently shown, which is every row when not searching.
        if (event.target.closest('.result-field-all')) return this.setVisible(true);
        if (event.target.closest('.result-field-none')) return this.setVisible(false);
        if (event.target.closest('.result-field-edit')) {
            this.dialog.querySelector('.result-field-filter-editor').hidden = false;
            this.dialog.querySelector('.result-field-search').focus();
            return;
        }
        if (event.target.closest('.result-field-clear')) {
            this.selected = new Set(this.values.keys());
            event.target.closest('.result-field-clear').disabled = true;
            this.renderValues();
            return;
        }
        if (event.target.closest('.result-field-apply')) return this.apply();
    }

    updateSample() {
        const format = this.dialog.querySelector('.result-field-format').value;
        const decimals = Number(format.slice(1)) || 0;
        this.dialog.querySelector('.result-field-sample').value = Number(1234.5678).toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    visibleKeys() {
        return Array.from(this.values.keys()).filter(key =>
            !this.search || this.text(this.values.get(key)).toLowerCase().includes(this.search));
    }

    renderValues() {
        const keys = this.visibleKeys();
        this.dialog.querySelector('.result-field-values').innerHTML = keys.length
            ? keys.map(key => '<label class="result-field-value">' +
                `<input type="checkbox" value="${escapeHtml(key)}"${this.selected.has(key) ? ' checked' : ''}> ` +
                `<span>${escapeHtml(this.text(this.values.get(key)))}</span></label>`).join('')
            : '<p class="result-field-empty">No values match the search.</p>';
        this.renderCount();
    }

    // An empty selection would hide every row, so Apply stays disabled until something is chosen.
    renderCount() {
        const empty = this.values.size > 0 && this.selected.size == 0;
        this.dialog.querySelector('.result-field-count').textContent =
            `${this.selected.size} of ${this.values.size} selected`;
        this.dialog.querySelector('.result-field-hint').hidden = !empty;
        this.dialog.querySelector('.result-field-apply').disabled = empty;
    }

    setVisible(checked) {
        this.visibleKeys().forEach(key => {
            if (checked) this.selected.add(key);
            else this.selected.delete(key);
        });
        this.renderValues();
    }

    // Commit every setting as one change so the grid and chart redraw once.
    apply() {
        if (this.values.size > 0 && this.selected.size == 0) return;
        const field = this.entry.field;
        const descending = this.dialog.querySelector('.result-field-sort').value == 'desc';
        const format = this.dialog.querySelector('.result-field-format').value;
        this.state.defer(state => {
            if (this.entry.isMeasure) state.setNumberFormat(format);
            else state.setDescending(field, descending);
            // Selecting everything means no restriction, so later data is not silently excluded.
            if (this.selected.size == this.values.size) state.setFilter(field, null);
            else state.setFilter(field, Array.from(this.selected).map(key => this.values.get(key)));
        });
        if (window.jQuery && typeof window.jQuery(this.dialog).modal == 'function') window.jQuery(this.dialog).modal('hide');
        else this.dialog.style.display = 'none';
    }
}
