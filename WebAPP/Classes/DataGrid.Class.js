import { escapeHtml } from "./Html.Class.js";
import { MultiSelect } from "./MultiSelect.Class.js";

// Editable Tabulator grid for the screens migrating off jqxGrid. Edits are written back to the caller's
// own rows by key, so sorting or filtering never changes which record an edit lands on.
export class DataGrid {

    // options: rows, columns, key(row), decimals, layout, height ('auto' grows with the rows), rangeSelection,
    //          rowClass(row), onChange(row, field, value), onInvalid(message)
    constructor(selector, options) {
        if (!window.Tabulator) throw new Error('The grid could not be loaded.');
        this.element = document.querySelector(selector);
        if (!this.element) throw new Error('The grid container ' + selector + ' was not found.');
        this.options = options;
        this.decimals = DataGrid.clampDecimals(options.decimals === undefined ? 3 : options.decimals);
        this.sourceByKey = new Map();
        this.editors = new Map();
        this.columnFilters = new Map();
        this.columnFilterState = new Map();
        this.rowFilter = null;
        this.syncing = false;
        this.resizeTimer = null;
        // Debounced on a timer rather than an animation frame, which a hidden tab never runs.
        this.onResize = () => {
            if (this.resizeTimer) clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this.resizeTimer = null;
                this.fitHeight();
            }, 120);
        };

        // Small grids grow with their rows, as jqxGrid's autoheight did; the rest fill the window.
        this.autoHeight = options.height === 'auto';
        const settings = {
            data: this.tableRows(options.rows || []),
            index: '_key',
            columns: options.columns.map(spec => this.column(spec)),
            height: this.autoHeight ? undefined : this.availableHeight(),
            // fitColumns shares the width out as jqxGrid's percentage columns did, so narrow windows do not scroll.
            layout: options.layout || 'fitData',
            movableColumns: false,
            editTriggerEvent: 'dblclick',
            // Like jqxGrid, an invalid value keeps the editor open instead of being stored.
            validationMode: 'blocking',
            placeholder: options.placeholder || 'No data',
            // headerSortTristate is a column option: a third click clears the sort and its arrow, as jqxGrid did.
            columnDefaults: { resizable: 'header', vertAlign: 'middle', headerSort: false, headerSortTristate: true },
            rowFormatter: row => {
                const source = this.source(row);
                const className = source && options.rowClass ? options.rowClass(source) : null;
                if (className) row.getElement().classList.add(className);
            }
        };
        // Grids that had no cell selection in jqxGrid (e.g. technologies) keep no range selection, paste or clear.
        if (options.rangeSelection !== false) {
            Object.assign(settings, {
                // Cell ranges only: jqxGrid never selected a whole column or row from its header.
                selectableRange: 1,
                selectableRangeClearCells: true,
                selectableRangeClearCellsValue: '',
                clipboard: true,
                clipboardCopyStyled: false,
                clipboardCopyConfig: { rowHeaders: false, columnHeaders: false },
                clipboardCopyRowRange: 'range',
                clipboardPasteParser: 'range',
                clipboardPasteAction: 'range'
            });
        }

        this.element.classList.add('osy-datagrid');
        DataGrid.instances.add(this);
        this.table = new Tabulator(this.element, settings);
        this.ready = new Promise(resolve => this.table.on('tableBuilt', resolve));
        this.table.on('cellEdited', cell => this.syncRows([cell.getRow()]));
        this.table.on('clipboardPasted', (clipboard, rowData, rows) => this.syncRows(rows || []));
        // Range clears and pastes do not all raise cellEdited, so every data change is reconciled.
        this.table.on('dataChanged', () => this.syncRows(this.table.getRows()));
        this.table.on('validationFailed', (cell, value) => {
            const editor = this.editors.get(cell.getField());
            if (editor) this.warn(editor.problem(editor.parse(value), this.source(cell.getRow())));
        });
        window.addEventListener('resize', this.onResize);
        // Also refit when only the container changes, e.g. the sidebar collapsing.
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(this.onResize);
            this.resizeObserver.observe(this.element);
        }
    }

    // Map a MUIOGO column spec to a Tabulator column.
    column(spec) {
        const column = {
            title: spec.titleHtml || escapeHtml(spec.title || ''),
            field: spec.field,
            frozen: spec.frozen === true,
            headerSort: spec.sortable === true,
            hozAlign: spec.hozAlign || 'left',
            headerHozAlign: 'center',
            minWidth: spec.minWidth || 60
        };
        // Share of the width under the fitColumns layout, standing in for jqxGrid's column percentages.
        if (spec.widthGrow) column.widthGrow = spec.widthGrow;
        if (spec.visible === false) column.visible = false;
        if (spec.headerClick) column.headerClick = spec.headerClick;
        if (spec.tooltipField) {
            column.tooltip = (event, cell) => DataGrid.tooltip(cell.getData()[spec.tooltipField]);
        }
        if (spec.menu) {
            // jqxGrid's column menu: sorting and a two-condition filter, in the application's own markup.
            column.headerPopupIcon = '<i class="fa fa-bars"></i>';
            column.headerPopup = (event, columnComponent) => this.columnMenu(spec.field);
            // Marks the heading so its sort arrow and menu button get room at the right.
            column.cssClass = 'osy-datagrid-menu-col';
        }
        if (spec.html) {
            column.formatter = cell => DataGrid.markup(cell.getValue());
        }
        if (spec.number) this.addEditor(column, spec.field, this.numberEditor(spec));
        if (spec.text) this.addEditor(column, spec.field, DataGrid.textEditor(spec.text));
        if (spec.select) this.addEditor(column, spec.field, DataGrid.selectEditor(spec.select));
        if (spec.multi) this.addEditor(column, spec.field, this.multiEditor(spec.multi));
        if (spec.action) {
            Object.assign(column, {
                hozAlign: 'center',
                minWidth: spec.minWidth || 110,
                cssClass: 'osy-datagrid-action-cell',
                // visible(row) hides the action on rows that may not be removed, e.g. a model's default entry.
                formatter: cell => {
                    const source = this.source(cell.getRow());
                    return source && spec.action.visible && !spec.action.visible(source) ? '' : spec.action.html;
                },
                cellClick: (event, cell) => {
                    const source = this.source(cell.getRow());
                    if (!source || (spec.action.visible && !spec.action.visible(source))) return;
                    spec.action.onClick(source);
                }
            });
        }
        return column;
    }

    // An editor is { parse(value), problem(value, row) -> message|null, column: Tabulator column options }.
    addEditor(column, field, editor) {
        this.editors.set(field, editor);
        Object.assign(column, editor.column, {
            mutatorEdit: value => editor.parse(value),
            mutatorClipboard: value => editor.parse(value),
            validator: {
                // Re-committing an unchanged value is always allowed, even if it predates the rule.
                type: (cell, value) => {
                    const source = this.source(cell.getRow());
                    const parsed = editor.parse(value);
                    return DataGrid.same(parsed, source ? source[field] : undefined) || editor.problem(parsed, source) === null;
                },
                parameters: {}
            }
        });
    }

    // rules: nullable(row), validate(value, row) -> message|null
    numberEditor(spec) {
        const rules = spec.number;
        return {
            parse: DataGrid.parseNumber,
            problem: (value, source) => {
                if (Number.isNaN(value)) return 'Enter a number.';
                if (value === null) return rules.nullable && rules.nullable(source) ? null : 'A value is required.';
                return rules.validate ? rules.validate(value, source) : null;
            },
            column: {
                hozAlign: 'right',
                minWidth: spec.minWidth || 70,
                editor: 'number',
                editorParams: { selectContents: true, verticalNavigation: 'table' },
                formatter: cell => this.format(cell.getValue())
            }
        };
    }

    // rules: validate(value, row) -> message|null. Values are trimmed, as jqxGrid's handlers did.
    static textEditor(rules) {
        return {
            parse: value => value == null ? '' : String(value).trim(),
            problem: (value, source) => rules.validate ? rules.validate(value, source) : null,
            column: {
                editor: 'input',
                editorParams: { selectContents: true },
                formatter: cell => escapeHtml(cell.getValue() == null ? '' : String(cell.getValue()))
            }
        };
    }

    // One value from a searchable list. rules: options() -> [{value, text, group}], label(value)
    static selectEditor(rules) {
        return {
            // numeric keeps a stored number a number, e.g. a constraint's Tag.
            parse: value => value == null || value === '' ? '' : (rules.numeric ? Number(value) : String(value)),
            problem: value => rules.options().some(option => option.value === value) ? null : 'Choose a value from the list.',
            column: {
                editor: 'list',
                editorParams: {
                    valuesLookup: () => DataGrid.listValues(rules.options()),
                    autocomplete: true,
                    listOnEmpty: true,
                    allowEmpty: false
                },
                formatter: cell => DataGrid.markup(rules.label(cell.getValue()))
            }
        };
    }

    // Several values, chosen with checkboxes. rules: options() -> [{value, text, title}], label(values)
    multiEditor(rules) {
        return {
            parse: value => Array.isArray(value) ? value.slice() : (value == null || value === '' ? [] : String(value)),
            problem: value => {
                if (!Array.isArray(value)) return 'Choose values from the list.';
                const known = new Set(rules.options().map(option => option.value));
                return value.every(id => known.has(id)) ? null : 'Choose values from the list.';
            },
            column: {
                editor: (cell, onRendered, success, cancel) => this.openMultiSelect(cell, rules, success, cancel),
                formatter: cell => escapeHtml(rules.label(cell.getValue()))
            }
        };
    }

    // Opens above the grid so the scroll area cannot clip it; an outside click or Enter keeps, Escape cancels.
    openMultiSelect(cell, rules, success, cancel) {
        const current = Array.isArray(cell.getValue()) ? cell.getValue() : [];
        const holder = document.createElement('div');
        holder.textContent = rules.label(current);

        const popup = document.createElement('div');
        popup.className = 'osy-datagrid-popup';
        document.body.appendChild(popup);
        const items = rules.options().map(option => Object.assign({}, option, { $checked: current.includes(option.value) }));
        const select = new MultiSelect(popup, {
            itemsSource: items,
            displayMemberPath: 'text',
            titleMemberPath: 'title',
            showSelectAllCheckbox: false
        });
        const rect = cell.getElement().getBoundingClientRect();
        popup.style.left = Math.round(rect.left + window.scrollX) + 'px';
        popup.style.top = Math.round(rect.bottom + window.scrollY) + 'px';
        select.setOpen(true);

        let done = false;
        const finish = keep => {
            if (done) return;
            done = true;
            document.removeEventListener('mousedown', onOutside, true);
            popup.removeEventListener('keydown', onKey);
            const value = items.filter(item => item.$checked).map(item => item.value);
            select.destroy();
            popup.remove();
            if (keep) success(value); else cancel();
        };
        const onOutside = event => {
            if (!popup.contains(event.target)) finish(true);
        };
        const onKey = event => {
            if (event.key == 'Escape') finish(false);
            if (event.key == 'Enter') finish(true);
        };
        document.addEventListener('mousedown', onOutside, true);
        popup.addEventListener('keydown', onKey);
        return holder;
    }

    // Tabulator gets copies keyed by the caller's row identity; the caller's rows are updated in syncRows.
    tableRows(rows) {
        this.sourceByKey.clear();
        return rows.map(row => {
            const key = this.options.key(row);
            this.sourceByKey.set(key, row);
            return Object.assign({}, row, { _key: key });
        });
    }

    source(row) {
        return this.sourceByKey.get(row.getData()._key);
    }

    // Write valid changes back to the caller's rows and undo anything else, such as a paste into a label column.
    syncRows(rows) {
        if (this.syncing) return;
        this.syncing = true;
        const problems = [];
        try {
            rows.forEach(row => {
                const data = row.getData();
                const source = this.sourceByKey.get(data._key);
                if (!source) return;
                const restore = {};
                Object.keys(data).forEach(field => {
                    if (field == '_key') return;
                    const editor = this.editors.get(field);
                    if (!editor) {
                        if (!DataGrid.same(data[field], source[field])) restore[field] = source[field];
                        return;
                    }
                    const value = editor.parse(data[field]);
                    if (!DataGrid.same(value, source[field])) {
                        const problem = editor.problem(value, source);
                        if (problem) {
                            problems.push(problem);
                            restore[field] = source[field];
                            return;
                        }
                        source[field] = value;
                        if (this.options.onChange) this.options.onChange(source, field, value);
                    }
                    if (!DataGrid.same(value, data[field])) restore[field] = value;
                });
                if (Object.keys(restore).length) row.update(restore);
            });
        } finally {
            this.syncing = false;
        }
        if (problems.length) this.warn(problems[0]);
    }

    warn(message) {
        if (message && this.options.onInvalid) this.options.onInvalid(message);
    }

    // Replace the displayed rows, keeping the current sort and filter.
    setRows(rows) {
        return this.ready.then(() => this.table && this.table.replaceData(this.tableRows(rows)));
    }

    // Show a row the caller has already added to its own data.
    addRow(row, top = true) {
        return this.ready.then(() => {
            if (!this.table) return;
            const key = this.options.key(row);
            this.sourceByKey.set(key, row);
            return this.table.addRow(Object.assign({}, row, { _key: key }), top);
        });
    }

    // Remove a row the caller has already removed from its own data.
    deleteRow(key) {
        this.sourceByKey.delete(key);
        return this.ready.then(() => this.table && this.table.deleteRow(key));
    }

    // Re-measure and re-render, e.g. when a grid built in a hidden tab is shown or a lookup name changed.
    refresh() {
        return this.ready.then(() => {
            if (!this.table || !this.element.offsetParent) return;
            if (!this.autoHeight) this.table.setHeight(this.availableHeight());
            this.table.redraw(true);
        });
    }

    // Grids built inside a hidden tab have no size until it opens, so the one now on screen is redrawn.
    static refreshVisible() {
        DataGrid.instances.forEach(grid => {
            if (document.body.contains(grid.element)) grid.refresh(); else grid.destroy();
        });
    }

    // predicate(row) receives the caller's row; null clears it. Column menu filters apply on top.
    setRowFilter(predicate) {
        this.rowFilter = predicate || null;
        return this.applyFilters();
    }

    applyFilters() {
        return this.ready.then(() => {
            if (!this.table) return;
            const rowFilter = this.rowFilter;
            const columnFilters = [...this.columnFilters.values()];
            if (!rowFilter && !columnFilters.length) {
                this.table.clearFilter();
                return;
            }
            this.table.setFilter(data => {
                const source = this.sourceByKey.get(data._key);
                if (rowFilter && !rowFilter(source)) return false;
                return columnFilters.every(test => test(source));
            });
        });
    }

    // The column menu: sort commands and the "Show rows where" filter jqxGrid offered.
    columnMenu(field) {
        const state = this.columnFilterState.get(field) ||
            { first: 'contains', firstValue: '', operator: 'and', second: 'contains', secondValue: '' };
        const options = DataGrid.CONDITIONS
            .map(condition => `<option value="${condition.value}">${escapeHtml(condition.label)}</option>`).join('');
        const menu = document.createElement('div');
        menu.className = 'osy-grid-menu';
        menu.innerHTML =
            '<button type="button" class="osy-grid-menu-item" data-act="asc"><i class="fa fa-sort-amount-asc"></i> Sort Ascending</button>' +
            '<button type="button" class="osy-grid-menu-item" data-act="desc"><i class="fa fa-sort-amount-desc"></i> Sort Descending</button>' +
            '<button type="button" class="osy-grid-menu-item" data-act="nosort"><i class="fa fa-ban"></i> Remove Sort</button>' +
            '<div class="osy-grid-menu-divider"></div>' +
            '<div class="osy-grid-menu-label">Show rows where:</div>' +
            `<select class="osy-grid-menu-condition" data-part="first">${options}</select>` +
            '<input type="text" class="osy-grid-menu-value" data-part="firstValue">' +
            '<select class="osy-grid-menu-operator" data-part="operator"><option value="and">And</option><option value="or">Or</option></select>' +
            `<select class="osy-grid-menu-condition" data-part="second">${options}</select>` +
            '<input type="text" class="osy-grid-menu-value" data-part="secondValue">' +
            '<div class="osy-grid-menu-actions">' +
            '<button type="button" class="btn btn-default btn-xs" data-act="filter">Filter</button>' +
            '<button type="button" class="btn btn-default btn-xs" data-act="clear">Clear</button>' +
            '</div>';
        menu.querySelectorAll('[data-part]').forEach(element => { element.value = state[element.dataset.part]; });
        menu.addEventListener('click', event => {
            const action = event.target.closest('[data-act]');
            if (!action) return;
            const act = action.dataset.act;
            if (act == 'asc' || act == 'desc') this.table.setSort(field, act);
            if (act == 'nosort') this.table.clearSort();
            if (act == 'clear') {
                this.columnFilters.delete(field);
                this.columnFilterState.delete(field);
                this.applyFilters();
            }
            if (act == 'filter') {
                const next = {};
                menu.querySelectorAll('[data-part]').forEach(element => { next[element.dataset.part] = element.value; });
                this.columnFilterState.set(field, next);
                this.columnFilters.set(field, row => DataGrid.matchesFilter(row[field], next));
                this.applyFilters();
            }
            DataGrid.closePopup(menu);
        });
        return menu;
    }

    // The caller's rows in display order, after sorting and filtering.
    visibleRows() {
        if (!this.table) return [];
        return this.table.getData('active').map(data => this.sourceByKey.get(data._key));
    }

    setDecimals(decimals) {
        this.decimals = DataGrid.clampDecimals(decimals);
        return this.ready.then(() => this.table && this.table.redraw(true));
    }

    // Fit the given columns (or all columns) to their content.
    fitColumns(fields = null) {
        return this.ready.then(() => {
            if (!this.table) return;
            this.table.getColumns().forEach(column => {
                if (!fields || fields.includes(column.getField())) column.setWidth(true);
            });
        });
    }

    // Fill the window below the grid instead of a height fixed when the page loaded.
    availableHeight() {
        const top = this.element.getBoundingClientRect().top;
        return Math.max(300, Math.floor(window.innerHeight - top - 30));
    }

    // Refit height and column widths on a real size change only: a redraw cancels an open editor.
    fitHeight() {
        if (!document.body.contains(this.element)) {
            this.destroy();
            return;
        }
        if (!this.table || this.element.querySelector('.tabulator-editing')) return;
        const width = this.element.clientWidth;
        const height = window.innerHeight;
        if (this.lastSize && this.lastSize.width === width && this.lastSize.height === height) return;
        this.lastSize = { width, height };
        if (!this.autoHeight) this.table.setHeight(this.availableHeight());
        this.table.redraw();
    }

    destroy() {
        DataGrid.instances.delete(this);
        window.removeEventListener('resize', this.onResize);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.resizeObserver = null;
        if (this.resizeTimer) clearTimeout(this.resizeTimer);
        this.resizeTimer = null;
        if (this.table) this.table.destroy();
        this.table = null;
    }

    format(value) {
        if (value === null || value === undefined || value === '') return 'n/a';
        const number = Number(value);
        if (!Number.isFinite(number)) return escapeHtml(String(value));
        return number.toLocaleString('en-US', { minimumFractionDigits: this.decimals, maximumFractionDigits: this.decimals });
    }

    // Empty input, n/a and whitespace become null; anything that is not a finite number becomes NaN.
    static parseNumber(value) {
        if (value === null || value === undefined) return null;
        if (typeof value == 'number') return Number.isFinite(value) ? value : NaN;
        let text = String(value).trim();
        if (text === '' || text.toLowerCase() === 'n/a') return null;
        if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, '');
        const number = Number(text);
        return Number.isFinite(number) ? number : NaN;
    }

    static same(a, b) {
        if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
        return Object.is(a, b);
    }

    static clampDecimals(decimals) {
        return Math.min(10, Math.max(0, parseInt(decimals, 10) || 0));
    }

    // Flat options with the group in the label, e.g. "10³km² (Area)": Tabulator's search finds nothing in grouped options.
    static listValues(options) {
        return options.map(option => ({
            label: DataGrid.plainText(option.text) + (option.group ? ' (' + option.group + ')' : ''),
            value: option.value
        }));
    }

    // Unit labels such as 10<sup>3</sup>m<sup>3</sup> as text for inputs and search: 10³m³.
    static plainText(value) {
        const superscripts = '⁰¹²³⁴⁵⁶⁷⁸⁹';
        return String(value == null ? '' : value)
            .replace(/<sup>(\d+)<\/sup>/gi, (match, digits) => digits.replace(/\d/g, digit => superscripts[digit]))
            .replace(/<[^>]*>/g, '');
    }

    // Unit labels use <sup>/<sub>; everything else is shown as text.
    static markup(value) {
        return escapeHtml(value == null ? '' : String(value)).replace(/&lt;(\/?)(sup|sub)&gt;/gi, '<$1$2>');
    }

    // Live grids, so a tab change can redraw whichever became visible.
    static instances = new Set();

    // The text conditions jqxGrid listed, in its order and wording.
    static CONDITIONS = [
        { value: 'empty', label: 'empty' },
        { value: 'not_empty', label: 'not empty' },
        { value: 'contains', label: 'contains' },
        { value: 'contains_cs', label: 'contains(match case)' },
        { value: 'not_contains', label: 'does not contain' },
        { value: 'not_contains_cs', label: 'does not contain(match case)' },
        { value: 'starts', label: 'starts with' },
        { value: 'starts_cs', label: 'starts with(match case)' },
        { value: 'ends', label: 'ends with' },
        { value: 'ends_cs', label: 'ends with(match case)' },
        { value: 'equal', label: 'equal' },
        { value: 'equal_cs', label: 'equal(match case)' }
    ];

    // The second condition counts only once it has something to test, as in jqxGrid.
    static matchesFilter(value, state) {
        const first = DataGrid.matchesCondition(value, state.first, state.firstValue);
        const secondUsed = state.secondValue !== '' || state.second == 'empty' || state.second == 'not_empty';
        if (!secondUsed) return first;
        const second = DataGrid.matchesCondition(value, state.second, state.secondValue);
        return state.operator == 'or' ? (first || second) : (first && second);
    }

    static matchesCondition(value, condition, term) {
        const text = value == null ? '' : String(value);
        if (condition == 'empty') return text.trim() === '';
        if (condition == 'not_empty') return text.trim() !== '';
        if (term === '') return true;
        const caseSensitive = condition.endsWith('_cs');
        const subject = caseSensitive ? text : text.toLowerCase();
        const needle = caseSensitive ? term : term.toLowerCase();
        switch (condition.replace('_cs', '')) {
            case 'contains': return subject.includes(needle);
            case 'not_contains': return !subject.includes(needle);
            case 'starts': return subject.startsWith(needle);
            case 'ends': return subject.endsWith(needle);
            case 'equal': return subject === needle;
        }
        return true;
    }

    // A menu command closes its popup: Tabulator hides on a document mousedown, then the container is removed.
    static closePopup(menu) {
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        const popup = menu.closest('.tabulator-popup');
        if (popup) popup.remove();
    }

    static tooltip(text) {
        if (text == null || !String(text).trim()) return false;
        const node = document.createElement('div');
        node.textContent = String(text);
        return node;
    }
}
