import { ResultAggregator } from "./ResultAggregator.Class.js";

const RESULT_LAYOUT_VERSION = 1;
// ResultAggregator sums every value field, so callers configure and label them from this.
const RESULT_AGGREGATION = 'sum';
// Numeric settings Wijmo persisted inside saved views, mapped back by the legacy reader.
const WIJMO_TOTALS = Object.freeze({
    0: ResultAggregator.ShowTotals.None,
    1: ResultAggregator.ShowTotals.GrandTotals,
    2: ResultAggregator.ShowTotals.Subtotals
});
const WIJMO_AGGREGATE_SUM = 1;

// Store the model-specific Results field layout and provide ResultAggregator configuration.
export class ResultLayoutState {

    static get Version() {
        return RESULT_LAYOUT_VERSION;
    }

    static get Aggregation() {
        return RESULT_AGGREGATION;
    }

    static isTotalMode(mode) {
        return Object.values(ResultAggregator.ShowTotals).includes(mode);
    }

    constructor(fields = [], numberFormat = 'n2') {
        this.rows = [];
        this.columns = [];
        this.filterFields = [];
        this.values = [];
        this.filters = {};
        this.descending = {};
        this.totals = { rows: ResultAggregator.ShowTotals.None, columns: ResultAggregator.ShowTotals.None };
        this.numberFormat = numberFormat;
        this.warnings = [];
        this.listeners = [];
        this.fields = [];
        this.setFields(fields);
    }

    // Swap the catalogue when the variable changes, dropping entries the new fields do not have.
    setFields(fields) {
        this.fields = (fields || []).map(field => ({
            field: field.field,
            header: field.header == null ? field.field : field.header,
            isHtml: field.isHtml === true,
            // Declared by the caller: measures belong in Values, every other field in Rows.
            isMeasure: field.isMeasure === true
        }));
        const known = name => this.fields.some(field => field.field == name);
        return this.defer(() => {
            const areas = this.areas();
            Object.keys(areas).forEach(area => {
                areas[area].splice(0, areas[area].length, ...areas[area].filter(known));
            });
            [this.filters, this.descending].forEach(map => {
                Object.keys(map).forEach(name => { if (!known(name)) delete map[name]; });
            });
        });
    }

    // Saved views name fields by header ("Tech Desc") while data uses the binding ("TechDesc").
    resolve(name) {
        if (name == null) return null;
        const match = this.fields.find(field => field.field == name || field.header == name);
        return match ? match.field : null;
    }

    areas() {
        return { rows: this.rows, columns: this.columns, filters: this.filterFields, values: this.values };
    }

    // Move a field to one area, or out of all of them when area is null.
    assign(name, area, index = -1) {
        const field = this.resolve(name);
        if (!field) return this;
        const areas = this.areas();
        // Reject an unknown area before detaching the field, so a bad name cannot silently drop it.
        if (area != null && !areas[area]) throw new Error(`Unknown layout area: ${area}`);
        Object.keys(areas).forEach(key => {
            const position = areas[key].indexOf(field);
            if (position >= 0) areas[key].splice(position, 1);
        });
        if (area && areas[area]) {
            const target = areas[area];
            if (index < 0 || index > target.length) target.push(field);
            else target.splice(index, 0, field);
        }
        return this.changed();
    }

    setFilter(name, values) {
        const field = this.resolve(name);
        if (!field) return this;
        if (values == null) delete this.filters[field];
        else {
            if (typeof values == 'string' || typeof values[Symbol.iterator] != 'function') {
                throw new TypeError('Result filter values must be an iterable collection.');
            }
            this.filters[field] = Array.from(values);
        }
        return this.changed();
    }

    // Drop filter values absent from the new data, so a stale selection cannot empty the grid.
    pruneFilterValues(items) {
        const names = Object.keys(this.filters);
        if (!names.length) return this;
        // Collect values for every active filter during one pass over the result records.
        const present = new Map(names.map(name => [name, new Map()]));
        (items || []).forEach(item => {
            names.forEach(name => {
                const value = ResultAggregator.keyValue(item[name]);
                present.get(name).set(ResultAggregator.keyID([value]), value);
            });
        });
        return this.defer(() => {
            names.forEach(name => {
                const available = present.get(name);
                const kept = this.filters[name].map(value => {
                    const exact = available.get(ResultAggregator.keyID([ResultAggregator.keyValue(value)]));
                    if (exact !== undefined) return exact;
                    const matches = Array.from(available.values()).filter(item => String(item) == String(value));
                    return matches.length == 1 ? matches[0] : undefined;
                }).filter(value => value !== undefined);
                if (kept.length) this.filters[name] = kept;
                else delete this.filters[name];
            });
        });
    }

    setDescending(name, descending) {
        const field = this.resolve(name);
        if (!field) return this;
        if (descending) this.descending[field] = true;
        else delete this.descending[field];
        return this.changed();
    }

    setTotals(area, mode) {
        if (area != 'rows' && area != 'columns') throw new Error(`Unknown totals area: ${area}`);
        if (!ResultLayoutState.isTotalMode(mode)) throw new Error(`Unknown totals mode: ${mode}`);
        this.totals[area] = mode;
        return this.changed();
    }

    setNumberFormat(format) {
        if (typeof format != 'string' || !format.trim()) throw new TypeError('Result number format must be a non-empty string.');
        this.numberFormat = format;
        return this.changed();
    }

    // Returns an unsubscribe function so a rebuilt panel does not leave stale listeners behind.
    onChange(listener) {
        if (typeof listener != 'function') return () => {};
        this.listeners.push(listener);
        return () => this.offChange(listener);
    }

    offChange(listener) {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) this.listeners.splice(index, 1);
        return this;
    }

    changed() {
        if (!this.deferred) this.listeners.slice().forEach(listener => listener(this));
        return this;
    }

    // Batch edits into one notification, as the panel's Defer Updates option needs.
    defer(apply) {
        const nested = this.deferred === true;
        this.deferred = true;
        try {
            apply(this);
        } finally {
            this.deferred = nested;
        }
        return nested ? this : this.changed();
    }

    // Build the field, filter, sorting, and total settings used to aggregate Results data.
    configuration() {
        const definition = name => ({ field: name, descending: this.descending[name] === true });
        return {
            rowFields: this.rows.map(definition),
            columnFields: this.columns.map(definition),
            valueFields: this.values.map(name => ({ field: name, aggregation: ResultLayoutState.Aggregation })),
            // Apply active filters regardless of their displayed field area to preserve Wijmo behavior.
            filters: Object.keys(this.filters)
                .map(name => ({ field: name, values: this.filters[name].slice() })),
            totals: { rows: this.totals.rows, columns: this.totals.columns }
        };
    }

    // MUIOGO saved-view format: fields by binding, so it stays readable once Wijmo is gone.
    definition() {
        const filters = {};
        Object.keys(this.filters).forEach(name => { filters[name] = this.filters[name].slice(); });
        return {
            version: ResultLayoutState.Version,
            rows: this.rows.slice(),
            columns: this.columns.slice(),
            filterFields: this.filterFields.slice(),
            values: this.values.slice(),
            filters: filters,
            descending: Object.keys(this.descending),
            totals: { rows: this.totals.rows, columns: this.totals.columns },
            numberFormat: this.numberFormat
        };
    }

    // Read both the existing Wijmo saved-view format and the versioned MUIOGO format.
    apply(definition) {
        const source = typeof definition == 'string' ? JSON.parse(definition) : definition;
        this.warnings = [];
        if (!source || typeof source != 'object') return this;
        return ResultLayoutState.isLegacy(source) ? this.applyLegacy(source) : this.applyDefinition(source);
    }

    static isLegacy(source) {
        return source.version == null &&
            (Array.isArray(source.fields) || (source.rowFields && source.rowFields.items));
    }

    warn(setting, detail) {
        this.warnings.push(detail ? `${setting}: ${detail}` : setting);
    }

    applyDefinition(source) {
        // Reject unknown formats instead of partially loading incompatible saved-view state.
        if (source.version !== ResultLayoutState.Version) {
            this.warn('Unsupported saved view version; view was not loaded', String(source.version));
            return this;
        }
        const claimed = new Set();
        const list = (names, area) => {
            if (names == null) return [];
            if (!Array.isArray(names)) {
                this.warn('Invalid field area', area);
                return [];
            }
            return names.map(name => ({ name: name, field: this.resolve(name) })).filter(entry => {
                if (!entry.field) {
                    this.warn('Unknown field', String(entry.name));
                    return false;
                }
                if (claimed.has(entry.field)) {
                    this.warn('Duplicate field placement ignored', entry.field);
                    return false;
                }
                claimed.add(entry.field);
                return true;
            }).map(entry => entry.field);
        };
        return this.defer(() => {
            this.rows = list(source.rows, 'rows');
            this.columns = list(source.columns, 'columns');
            this.filterFields = list(source.filterFields, 'filters');
            this.values = list(source.values, 'values');
            this.filters = {};
            Object.keys(source.filters || {}).forEach(name => {
                const field = this.resolve(name);
                const values = source.filters[name];
                if (!field) this.warn('Unknown filter field', name);
                else if (!Array.isArray(values)) this.warn('Invalid filter values', name);
                else this.filters[field] = values.slice();
            });
            this.descending = {};
            if (source.descending != null && !Array.isArray(source.descending)) {
                this.warn('Invalid descending fields');
            } else {
                (source.descending || []).forEach(name => {
                    const field = this.resolve(name);
                    if (field) this.descending[field] = true;
                    else this.warn('Unknown descending field', String(name));
                });
            }
            const totals = source.totals || {};
            ['rows', 'columns'].forEach(area => {
                if (totals[area] == null) return;
                if (ResultLayoutState.isTotalMode(totals[area])) this.totals[area] = totals[area];
                else this.warn('Invalid totals mode', `${area}: ${totals[area]}`);
            });
            if (typeof source.numberFormat == 'string' && source.numberFormat.trim()) {
                this.numberFormat = source.numberFormat;
            } else if (source.numberFormat != null) this.warn('Invalid number format');
        });
    }

    // Wijmo kept area membership under `{items:[...]}` and filters as `{showValues:{value:true}}`.
    applyLegacy(source) {
        const claimed = new Set();
        const list = area => ((source[area] && source[area].items) || [])
            .map(name => this.resolve(name)).filter(field => {
                if (!field || claimed.has(field)) {
                    if (field) this.warn('Duplicate field placement ignored', field);
                    return false;
                }
                claimed.add(field);
                return true;
            });
        return this.defer(() => {
            this.rows = list('rowFields');
            this.columns = list('columnFields');
            this.filterFields = list('filterFields');
            this.values = list('valueFields');
            this.filters = {};
            this.descending = {};
            (source.fields || []).forEach(entry => this.applyLegacyField(entry, source));
            const rows = WIJMO_TOTALS[source.showRowTotals];
            const columns = WIJMO_TOTALS[source.showColumnTotals];
            if (rows != null) this.totals.rows = rows;
            if (columns != null) this.totals.columns = columns;
            this.reportLegacyLayout(source);
        });
    }

    applyLegacyField(entry, source) {
        const field = this.resolve(entry.key != null ? entry.key : entry.binding);
        const label = (entry.key != null ? entry.key : entry.binding) || 'field';
        if (!field) {
            // Only worth reporting when the missing field was actually placed in the layout.
            const placed = ['rowFields', 'columnFields', 'filterFields', 'valueFields']
                .some(area => ((source[area] && source[area].items) || []).includes(label));
            if (placed) this.warn('Unknown field', label);
            return;
        }
        if (entry.descending === true) this.descending[field] = true;

        const filter = entry.filter || {};
        const values = filter.showValues;
        // Empty showValues means no value restriction, not "exclude everything".
        if (values && Object.keys(values).length) {
            this.filters[field] = Object.keys(values).filter(value => values[value]);
        }
        // Warn when a legacy text search cannot be reproduced from its saved selected values.
        if (filter.filterText && !(values && Object.keys(values).length)) {
            this.warn('Text filter not applied', `${label} (${filter.filterText})`);
        }
        if (filter.conditions || filter.and != null) this.warn('Condition filter not applied', label);

        if (this.values.includes(field)) {
            if (entry.aggregate != null && entry.aggregate != WIJMO_AGGREGATE_SUM) {
                this.warn('Only Sum is supported', `${label} used aggregate ${entry.aggregate}`);
            }
            if (entry.showAs) this.warn('Show As calculation not applied', label);
            // The value field's format drove the grid under Wijmo, so keep honouring it.
            if (entry.format) this.numberFormat = entry.format;
        }
    }

    reportLegacyLayout(source) {
        if (source.totalsBeforeData === true) this.warn('Totals are always shown after the data');
        if (source.showZeros === true) this.warn('Show zeros is not supported');
        if (WIJMO_TOTALS[source.showRowTotals] == null && source.showRowTotals != null) {
            this.warn('Unknown row totals mode', String(source.showRowTotals));
        }
        if (WIJMO_TOTALS[source.showColumnTotals] == null && source.showColumnTotals != null) {
            this.warn('Unknown column totals mode', String(source.showColumnTotals));
        }
    }
}
