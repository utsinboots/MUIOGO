import { ResultAggregator } from "./ResultAggregator.Class.js";

export class ResultGrid {

    constructor(selector, options = {}) {
        if (!window.Tabulator) throw new Error('The Results grid could not be loaded.');
        this.selector = selector;
        this.options = options;
        this.table = null;
        this.detailTable = null;
        this.detailDialog = null;
        this.result = null;
        this.valueColumns = [];
        this.columnSignature = '';
        this.autoScrollCleanup = null;
        this.clipboardCleanup = null;
    }

    // Render the neutral aggregation result without modifying its cells or keys.
    render(result, numberFormat = 'n2') {
        const view = this.view(result);
        this.result = result;
        this.valueColumns = view.columns;
        const contextMenu = (event, cell) => this.cellMenu(cell);
        const columns = result.rowFields.map((field, index) => ({
            title: field,
            field: `row_${index}`,
            formatter: cell => this.rowField(cell, index),
            accessorClipboard: (value, data) => this.displayText(data[`row_${index}_display`]),
            // Units carry markup (10<sup>3</sup>km<sup>2</sup>); exports need text, not tags.
            accessorDownload: value => ResultGrid.csvSafe(this.displayText(value)),
            contextMenu: contextMenu,
            // Wijmo keeps row fields sorted; a header click toggles direction for sortableFields.
            headerSort: false,
            cssClass: this.isSortable(field) ? 'result-grid-row-field result-grid-sortable' : 'result-grid-row-field',
            headerClick: () => {
                if (this.isSortable(field) && typeof this.options.toggleFieldSort == 'function') {
                    this.options.toggleFieldSort(field);
                }
            },
            minWidth: 110
        })).concat(view.columns.map((entry, index) => ({
            title: this.keyLabel(entry),
            // The header renders markup in the grid, so exports take a plain-text copy of it.
            titleDownload: this.displayText(this.keyLabel(entry)),
            titleClipboard: this.displayText(this.keyLabel(entry)),
            field: `value_${index}`,
            cssClass: entry.isTotal ? 'result-grid-total-column' : '',
            hozAlign: 'right',
            headerHozAlign: 'left',
            headerSort: false,
            formatter: cell => this.number(cell.getValue(), numberFormat),
            accessorClipboard: value => this.number(value, numberFormat),
            contextMenu: contextMenu,
            minWidth: 105
        })));
        const columnSignature = columns.map(column => column.field).join('|');

        if (this.table && this.columnSignature != columnSignature) {
            this.clearSelectionHighlight();
            if (this.autoScrollCleanup) this.autoScrollCleanup();
            if (this.clipboardCleanup) this.clipboardCleanup();
            this.table.destroy();
            this.table = null;
        }
        this.columnSignature = columnSignature;
        if (this.table) {
            this.clearSelectionHighlight();
            this.table.replaceData(view.rows);
            return;
        }
        this.table = new Tabulator(this.selector, {
            data: view.rows,
            columns: columns,
            layout: 'fitData',
            maxHeight: '45vh',
            // Render only the columns in view: result sets reach dozens of technology columns.
            renderHorizontal: 'virtual',
            movableColumns: false,
            selectableRange: 1,
            selectableRangeColumns: true,
            selectableRangeRows: true,
            // Open with nothing selected instead of Tabulator's default first-cell range.
            selectableRangeInitializeDefault: false,
            clipboard: true,
            clipboardCopyRowRange: 'range',
            clipboardCopyStyled: false,
            clipboardCopyConfig: {
                rowHeaders: false,
                columnHeaders: false,
                columnGroups: false,
                rowGroups: false,
                columnCalcs: false
            },
            placeholder: 'No result data is available for this view.',
            columnDefaults: { resizable: 'header', vertAlign: 'middle' },
            rowFormatter: row => {
                const data = row.getData();
                const element = row.getElement();
                element.classList.toggle('result-grid-total', data._isTotal);
                element.classList.toggle('result-grid-outer-total', data._isOuterTotal);
                element.classList.toggle('result-grid-grand-total', data._isGrandTotal);
                element.classList.toggle('result-grid-group-start', data._groupStart);
            }
        });
        this.table.on('cellDblClick', (event, cell) => {
            if (this.isValueCell(cell)) this.showDetail(cell);
        });
        this.table.on('renderComplete', () => this.paintRangeHighlight());
        this.table.on('rangeChanged', () => this.paintRangeHighlight());
        this.table.on('tableBuilt', () => {
            this.bindRangeAutoScroll();
            this.bindRangeClipboard();
        });
    }

    // Mark the selected columns' headers and each row's innermost field cell, from the current ranges.
    paintRangeHighlight() {
        const root = document.querySelector(this.selector);
        if (!root || !this.table) return;
        this.clearSelectionHighlight();

        const leafField = `row_${this.result.rowFields.length - 1}`;
        const fields = new Set();
        (this.table.getRanges() || []).forEach(range => {
            (range.getColumns() || []).forEach(column => fields.add(column.getField()));
            (range.getRows() || []).forEach(row => {
                const cell = (row.getCells() || []).find(item => item.getColumn().getField() == leafField);
                if (cell) cell.getElement().classList.add('result-grid-range-row-header');
            });
        });
        fields.forEach(field => {
            const header = root.querySelector(`.tabulator-col[tabulator-field="${field}"]`);
            if (header) header.classList.add('result-grid-range-header');
        });
    }

    // Copy the selected range as TSV with row-field values and column headers, as Wijmo did.
    bindRangeClipboard() {
        const root = document.querySelector(this.selector);
        if (!root || this.clipboardCleanup) return;
        const onCopy = event => {
            const text = this.rangeText();
            if (text == null) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.clipboardData) event.clipboardData.setData('text/plain', text);
        };
        root.addEventListener('copy', onCopy, true);
        this.clipboardCleanup = () => {
            root.removeEventListener('copy', onCopy, true);
            this.clipboardCleanup = null;
        };
    }

    rangeText() {
        if (!this.table) return null;
        const ranges = this.table.getRanges() || [];
        if (!ranges.length) return null;
        const rows = ranges[0].getRows() || [];
        const columns = (ranges[0].getColumns() || []).filter(column => this.isValueField(column.getField()));
        if (!rows.length || !columns.length) return null;

        const fieldCount = this.result.rowFields.length;
        const header = this.result.rowFields.slice()
            .concat(columns.map(column => this.displayText(column.getDefinition().title)));
        const lines = [header.join('\t')];
        rows.forEach(row => {
            const data = row.getData();
            const labels = [];
            for (let index = 0; index < fieldCount; index++) {
                labels.push(this.displayText(data[`row_${index}`]));
            }
            columns.forEach(column => {
                const value = data[column.getField()];
                labels.push(value === null || value === undefined ? '' : value);
            });
            lines.push(labels.join('\t'));
        });
        return lines.join('\n');
    }

    isValueField(field) {
        return /^value_\d+$/.test(field || '');
    }

    // Tabulator's range module has no drag auto-scroll, so scroll while dragging near an edge.
    bindRangeAutoScroll() {
        const holder = document.querySelector(`${this.selector} .tabulator-tableholder`);
        if (!holder || this.autoScrollCleanup) return;
        const margin = 45;
        const step = 14;
        let dragging = false;
        let timer = null;
        let dx = 0;
        let dy = 0;

        const stopTimer = () => {
            if (timer) clearInterval(timer);
            timer = null;
        };
        const onMove = event => {
            if (!dragging) return;
            const box = holder.getBoundingClientRect();
            dx = event.clientX > box.right - margin ? step : event.clientX < box.left + margin ? -step : 0;
            dy = event.clientY > box.bottom - margin ? step : event.clientY < box.top + margin ? -step : 0;
            if (!dx && !dy) return stopTimer();
            if (!timer) {
                timer = setInterval(() => {
                    holder.scrollLeft += dx;
                    holder.scrollTop += dy;
                }, 30);
            }
        };
        const onUp = () => {
            dragging = false;
            stopTimer();
        };
        const onDown = () => { dragging = true; };

        holder.addEventListener('mousedown', onDown);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        this.autoScrollCleanup = () => {
            stopTimer();
            holder.removeEventListener('mousedown', onDown);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            this.autoScrollCleanup = null;
        };
    }

    // Build ordered display rows and columns from regular and total cells.
    view(result) {
        const rows = this.orderedEntries(result.rowKeys, result.totals.rowKeys);
        const columns = result.valueFields.length
            ? this.orderedEntries(result.columnKeys, result.totals.columnKeys)
            : [];
        const groups = this.rowGroups(rows, result.rowFields.length);
        const cells = new Map(result.cells.concat(result.totals.cells).map(cell => [
            ResultAggregator.cellID(ResultAggregator.keyID(cell.rowKey), ResultAggregator.keyID(cell.columnKey)),
            cell.values.Value
        ]));

        return {
            columns: columns,
            rows: rows.map((row, rowIndex) => {
                const data = {
                    id: rowIndex,
                    _isTotal: row.isTotal,
                    // Depth of the total: the fewer fields it keys on, the wider it aggregates.
                    _isGrandTotal: row.isTotal && row.key.length == 0,
                    _isOuterTotal: row.isTotal && row.key.length > 0 && row.key.length < result.rowFields.length,
                    _rowKey: row.key.slice(),
                    _rowGroups: groups[rowIndex],
                    _groupStart: groups[rowIndex].some((group, index) =>
                        group && group.start && index < groups[rowIndex].length - 1 && rowIndex > 0)
                };
                this.rowLabels(row, result.rowFields.length).forEach((value, index) => {
                    data[`row_${index}`] = value;
                    // A total shows only its marker; blank the display only, so exports stay labelled.
                    const marker = row.isTotal && index == row.key.length;
                    const totalKeyCell = row.isTotal && index < row.key.length;
                    data[`row_${index}_display`] = marker ? value
                        : groups[rowIndex][index].display && !totalKeyCell ? value : '';
                });
                columns.forEach((column, index) => {
                    const cellID = ResultAggregator.cellID(ResultAggregator.keyID(row.key), ResultAggregator.keyID(column.key));
                    data[`value_${index}`] = cells.has(cellID) ? cells.get(cellID) : null;
                });
                return data;
            })
        };
    }

    // Place each repeated row label at the visual center of its hierarchical group.
    rowGroups(rows, fieldCount) {
        // end: true by default, so a level a row does not reach still draws its bottom rule.
        const groups = rows.map(() => Array.from({ length: fieldCount }, () => ({ start: false, end: true, display: false })));
        for (let level = 0; level < fieldCount; level++) {
            let start = 0;
            while (start < rows.length) {
                // A row joins a level only when its key reaches it, so a Year subtotal stays in its Case.
                if (rows[start].key.length <= level) {
                    start++;
                    continue;
                }
                const prefix = rows[start].key.slice(0, level + 1);
                let end = start;
                while (end + 1 < rows.length && rows[end + 1].key.length > level &&
                    this.samePrefix(rows[end + 1].key, prefix)) end++;
                // Centre the label on a row that can show it; subtotals blank the values they total.
                const candidates = [];
                for (let index = start; index <= end; index++) {
                    if (!(rows[index].isTotal && level < rows[index].key.length)) candidates.push(index);
                }
                const middle = candidates.length ? candidates[Math.floor((candidates.length - 1) / 2)] : -1;
                for (let index = start; index <= end; index++) {
                    groups[index][level] = { start: index == start, end: index == end, display: index == middle };
                }
                start = end + 1;
            }
        }
        return groups;
    }

    // Apply group boundary classes while resetting recycled Tabulator cells.
    rowField(cell, index) {
        const data = cell.getRow().getData();
        const group = data._rowGroups[index];
        const element = cell.getElement();
        element.classList.toggle('result-grid-group-first-cell', group.start);
        element.classList.toggle('result-grid-group-last-cell', group.end);
        element.classList.toggle('result-grid-group-middle-cell', group.display);
        return data[`row_${index}_display`];
    }

    // Place each subtotal after its final child and grand totals at the end.
    orderedEntries(keys, totalKeys) {
        const totals = new Map(totalKeys.map(key => [ResultAggregator.keyID(key), key]));
        const entries = [];
        keys.forEach((key, index) => {
            entries.push({ key: key, isTotal: false });
            const next = keys[index + 1];
            for (let length = key.length - 1; length >= 0; length--) {
                const prefix = key.slice(0, length);
                const prefixID = ResultAggregator.keyID(prefix);
                if (totals.has(prefixID) && (!next || !this.samePrefix(next, prefix))) {
                    entries.push({ key: totals.get(prefixID), isTotal: true });
                    totals.delete(prefixID);
                }
            }
        });
        totals.forEach(key => entries.push({ key: key, isTotal: true }));
        return entries;
    }

    samePrefix(key, prefix) {
        return prefix.every((value, index) => Object.is(key[index], value));
    }

    isSortable(field) {
        const sortable = this.options.sortableFields;
        return Array.isArray(sortable) ? sortable.includes(field) : false;
    }

    rowLabels(entry, fieldCount) {
        const labels = entry.key.slice();
        // A total over no field at all spans the whole result, so name it accordingly.
        if (entry.isTotal) labels.push(entry.key.length ? 'Subtotal' : 'Grand Total');
        while (labels.length < fieldCount) labels.push('');
        return labels;
    }

    keyLabel(entry) {
        if (!entry.key.length) return 'Value';
        return entry.key.join(' / ') + (entry.isTotal ? ' Total' : '');
    }

    // Provide the PivotGrid-compatible commands that apply to the selected cell.
    cellMenu(cell) {
        const field = this.targetField(cell);
        const items = [];
        if (field) {
            items.push({
                label: '<i class="fa fa-times"></i> Remove Field',
                disabled: typeof this.options.removeField != 'function',
                action: () => this.options.removeField(field)
            });
            items.push({
                label: '<i class="fa fa-cog"></i> Field Settings&hellip;',
                disabled: typeof this.options.editField != 'function',
                action: () => this.options.editField(field)
            });
        }
        if (this.isValueCell(cell)) {
            items.push({ separator: true });
            items.push({
                label: '<i class="fa fa-list-alt"></i> Show Detail&hellip;',
                disabled: typeof this.options.getDetail != 'function',
                action: () => this.showDetail(cell)
            });
        }
        return items;
    }

    targetField(cell) {
        const field = cell.getColumn().getField();
        const rowMatch = /^row_(\d+)$/.exec(field);
        if (rowMatch) return this.result.rowFields[Number(rowMatch[1])];
        return this.isValueCell(cell) && this.result.valueFields.length ? this.result.valueFields[0].field : null;
    }

    isValueCell(cell) {
        return this.isValueField(cell.getColumn().getField());
    }

    // Resolve the row and column keys represented by a displayed value cell.
    cellContext(cell) {
        const columnIndex = Number(cell.getColumn().getField().slice('value_'.length));
        const column = this.valueColumns[columnIndex];
        return {
            rowKey: cell.getRow().getData()._rowKey.slice(),
            columnKey: column ? column.key.slice() : [],
            rowHeader: cell.getRow().getData()._rowKey.map(value => this.displayText(value)).join(' / ') || 'All rows',
            columnHeader: column ? this.displayText(this.keyLabel(column)) : 'All columns',
            value: cell.getValue()
        };
    }

    // Convert stored HTML labels into safe plain text for dialogs and exports.
    displayText(value) {
        return typeof this.options.plainText == 'function' ? this.options.plainText(value) : String(value ?? '');
    }

    // Open a read-only MUIOGO detail grid for the records summarized by a cell.
    showDetail(cell) {
        if (!this.isValueCell(cell) || typeof this.options.getDetail != 'function') return;
        const context = this.cellContext(cell);
        const records = this.options.getDetail(context);
        this.openDetailDialog(Array.isArray(records) ? records : [], context);
    }

    // Create the reusable Bootstrap dialog without inserting result values as HTML.
    createDetailDialog() {
        if (this.detailDialog) return this.detailDialog;
        const dialog = document.createElement('div');
        dialog.className = 'modal fade result-grid-detail-dialog';
        dialog.tabIndex = -1;
        dialog.setAttribute('role', 'dialog');
        dialog.innerHTML = '<div class="modal-dialog modal-lg" role="document"><div class="modal-content">' +
            '<div class="modal-header"><button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>' +
            '<h4 class="modal-title">Detail View</h4></div><div class="modal-body"><p class="result-grid-detail-summary"></p>' +
            '<div class="result-grid-detail-table"></div></div><div class="modal-footer">' +
            '<button type="button" class="btn btn-default" data-dismiss="modal">Close</button></div></div></div>';
        document.body.appendChild(dialog);
        this.detailDialog = dialog;
        return dialog;
    }

    openDetailDialog(records, context) {
        const dialog = this.createDetailDialog();
        const summary = dialog.querySelector('.result-grid-detail-summary');
        summary.textContent = `${context.rowHeader} | ${context.columnHeader} | ${records.length.toLocaleString()} item${records.length == 1 ? '' : 's'}`;
        const detailRecords = records.map(record => Object.fromEntries(Object.entries(record).map(([field, value]) => [
            field,
            typeof value == 'string'
                ? this.displayText(value)
                : value
        ])));
        const render = () => {
            if (this.detailTable) this.detailTable.destroy();
            this.detailTable = new Tabulator(dialog.querySelector('.result-grid-detail-table'), {
                data: detailRecords,
                autoColumns: true,
                layout: 'fitDataStretch',
                maxHeight: '55vh',
                placeholder: 'No detail records are available for this cell.',
                columnDefaults: { headerSort: true, resizable: 'header' }
            });
        };
        if (window.jQuery && typeof window.jQuery(dialog).modal == 'function') {
            window.jQuery(dialog).one('shown.bs.modal', render).modal('show');
        } else {
            dialog.style.display = 'block';
            dialog.classList.add('in');
            render();
        }
    }

    clearSelectionHighlight() {
        const root = document.querySelector(this.selector);
        if (!root) return;
        root.querySelectorAll('.result-grid-range-header, .result-grid-range-row-header').forEach(element => {
            element.classList.remove('result-grid-range-header', 'result-grid-range-row-header');
        });
    }

    // Match the configured Wijmo-style decimal precision for displayed values.
    number(value, format) {
        if (value === null || value === undefined) return '';
        const match = /^n(\d+)$/.exec(format || '');
        const decimals = match ? Number(match[1]) : 2;
        return Number(value).toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    // Neutralise formula injection: Excel and Calc execute cells starting with = + - @.
    static csvSafe(value) {
        if (typeof value != 'string' || value === '') return value;
        return /^[\t\r]*[=+\-@]/.test(value) ? `'${value}` : value;
    }

    downloadCSV(fileName = 'PivotGrid.csv') {
        if (this.table) this.table.download('csv', fileName);
    }

    destroy() {
        if (this.autoScrollCleanup) this.autoScrollCleanup();
        if (this.clipboardCleanup) this.clipboardCleanup();
        if (this.table) this.table.destroy();
        if (this.detailTable) this.detailTable.destroy();
        if (this.detailDialog) this.detailDialog.remove();
        this.table = null;
        this.detailTable = null;
        this.detailDialog = null;
        this.columnSignature = '';
    }
}
