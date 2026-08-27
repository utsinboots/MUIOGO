const RESULT_SHOW_TOTALS = Object.freeze({
    None: 'none',
    GrandTotals: 'grand',
    Subtotals: 'subtotals'
});

// Group Results records into rows, columns, filtered values, and totals for charts and tables.
export class ResultAggregator {

    // Provide the supported row and column total modes used in Results configuration.
    static get ShowTotals() {
        return RESULT_SHOW_TOTALS;
    }

    static aggregate(items, configuration = {}) {
        if (!Array.isArray(items)) {
            throw new TypeError('ResultAggregator items must be an array.');
        }

        // Validate and prepare the selected fields, filters, and totals before grouping records.
        const rowDefinitions = this.fieldDefinitions(configuration.rowFields || []);
        const columnDefinitions = this.fieldDefinitions(configuration.columnFields || []);
        const rowFields = rowDefinitions.map(field => field.field);
        const columnFields = columnDefinitions.map(field => field.field);
        const valueFields = this.valueFields(configuration.valueFields || ['Value']);
        const filters = this.filterDefinitions(configuration.filters || []);
        const totalConfiguration = this.totalConfiguration(configuration.totals || {});
        this.validateLayout(rowFields, columnFields, valueFields);

        const rowKeys = [];
        const columnKeys = [];
        const rowIDs = new Set();
        const columnIDs = new Set();
        const aggregates = new Map();

        // Apply active filters before grouping records into row and column cells.
        items.forEach(item => {
            if (!this.matchesFilters(item, filters)) return;
            const rowKey = rowFields.map(field => this.keyValue(item[field]));
            const columnKey = columnFields.map(field => this.keyValue(item[field]));
            const rowID = this.keyID(rowKey);
            const columnID = this.keyID(columnKey);

            if (!rowIDs.has(rowID)) {
                rowIDs.add(rowID);
                rowKeys.push(rowKey);
            }
            if (!columnIDs.has(columnID)) {
                columnIDs.add(columnID);
                columnKeys.push(columnKey);
            }

            const cellID = this.cellID(rowID, columnID);
            let cell = aggregates.get(cellID);
            if (!cell) {
                cell = {
                    rowKey: rowKey,
                    columnKey: columnKey,
                    values: {},
                    counts: {}
                };
                valueFields.forEach(valueField => {
                    cell.values[valueField.field] = 0;
                    cell.counts[valueField.field] = 0;
                });
                aggregates.set(cellID, cell);
            }

            valueFields.forEach(valueField => {
                const value = this.numberValue(item[valueField.field]);
                if (value === null) return;
                cell.values[valueField.field] += value;
                cell.counts[valueField.field]++;
            });
        });

        // Create result cells containing the summed values for each row and column combination.
        const cells = Array.from(aggregates.values()).map(cell => {
            const values = {};
            valueFields.forEach(valueField => {
                values[valueField.field] = cell.counts[valueField.field]
                    ? cell.values[valueField.field]
                    : null;
            });
            return {
                rowKey: cell.rowKey.slice(),
                columnKey: cell.columnKey.slice(),
                values: values
            };
        });

        // Sort keys and cells so charts, grids, and exports receive stable ordering.
        rowKeys.sort((left, right) => this.compareKeys(left, right, rowDefinitions));
        columnKeys.sort((left, right) => this.compareKeys(left, right, columnDefinitions));
        const rowOrder = new Map(rowKeys.map((key, index) => [this.keyID(key), index]));
        const columnOrder = new Map(columnKeys.map((key, index) => [this.keyID(key), index]));
        cells.sort((left, right) => {
            const rowDifference = rowOrder.get(this.keyID(left.rowKey)) - rowOrder.get(this.keyID(right.rowKey));
            return rowDifference || columnOrder.get(this.keyID(left.columnKey)) - columnOrder.get(this.keyID(right.columnKey));
        });

        // Calculate requested subtotals separately so charts cannot treat them as regular data.
        const totals = this.buildTotals(cells, rowDefinitions, columnDefinitions, valueFields, totalConfiguration);

        return {
            rowFields: rowFields,
            columnFields: columnFields,
            valueFields: valueFields,
            filters: filters.map(filter => ({ field: filter.field, values: filter.values.slice() })),
            rowKeys: rowKeys,
            columnKeys: columnKeys,
            cells: cells,
            totals: totals
        };
    }

    // Return the filtered source records represented by a regular or total result cell.
    static getDetail(items, configuration, rowKey = [], columnKey = []) {
        if (!Array.isArray(items)) {
            throw new TypeError('ResultAggregator items must be an array.');
        }
        const rowFields = this.fieldDefinitions(configuration.rowFields || []).map(field => field.field);
        const columnFields = this.fieldDefinitions(configuration.columnFields || []).map(field => field.field);
        const filters = this.filterDefinitions(configuration.filters || []);
        if (!Array.isArray(rowKey) || rowKey.length > rowFields.length) {
            throw new Error('The result detail row key does not match the active layout.');
        }
        if (!Array.isArray(columnKey) || columnKey.length > columnFields.length) {
            throw new Error('The result detail column key does not match the active layout.');
        }
        return items.filter(item => this.matchesFilters(item, filters) &&
            this.matchesKey(item, rowFields, rowKey) &&
            this.matchesKey(item, columnFields, columnKey));
    }

    static matchesKey(item, fields, key) {
        return key.every((value, index) => Object.is(this.keyValue(item[fields[index]]), value));
    }

    // Preserve each dimension's name and requested sort direction.
    static fieldDefinitions(fields) {
        if (!Array.isArray(fields)) {
            throw new TypeError('ResultAggregator fields must be arrays.');
        }
        return fields.map(field => {
            const name = typeof field == 'string' ? field : field && field.field;
            if (!name || typeof name != 'string') {
                throw new TypeError('ResultAggregator fields must have a string name.');
            }
            return {
                field: name,
                descending: typeof field == 'object' && field !== null && field.descending === true
            };
        });
    }

    // Normalize object and array filter forms into exact-value selections.
    static filterDefinitions(filters) {
        if (filters === null || filters === undefined) return [];
        let definitions;
        if (Array.isArray(filters)) {
            definitions = filters;
        } else if (typeof filters == 'object') {
            definitions = Object.keys(filters).map(field => ({ field: field, values: filters[field] }));
        } else {
            throw new TypeError('ResultAggregator filters must be an array or object.');
        }
        return definitions.map(filter => {
            if (!filter || typeof filter.field != 'string' || !filter.field) {
                throw new TypeError('ResultAggregator filters must have a string field name.');
            }
            if (!Object.prototype.hasOwnProperty.call(filter, 'values')) {
                throw new TypeError('ResultAggregator filters must define selected values.');
            }
            const values = Array.isArray(filter.values) ? filter.values : [filter.values];
            return {
                field: filter.field,
                values: values.map(value => this.keyValue(value)),
                valueIDs: new Set(values.map(value => this.keyID([this.keyValue(value)])))
            };
        });
    }

    // Require every configured field filter to match its selected values.
    static matchesFilters(item, filters) {
        return filters.every(filter => filter.valueIDs.has(this.keyID([this.keyValue(item[filter.field])])));
    }

    // Normalize row and column total settings without using Wijmo enum values.
    static totalConfiguration(totals) {
        if (totals === null || totals === undefined) totals = {};
        if (typeof totals != 'object' || Array.isArray(totals)) {
            throw new TypeError('ResultAggregator totals must be an object.');
        }
        return {
            rows: this.normalizeTotalMode(totals.rows),
            columns: this.normalizeTotalMode(totals.columns)
        };
    }

    static normalizeTotalMode(mode) {
        if (mode === undefined || mode === null || mode === false || mode == this.ShowTotals.None) {
            return this.ShowTotals.None;
        }
        if (mode == this.ShowTotals.GrandTotals || mode == 'grandTotals') {
            return this.ShowTotals.GrandTotals;
        }
        if (mode === true || mode == this.ShowTotals.Subtotals) {
            return this.ShowTotals.Subtotals;
        }
        throw new Error(`Unsupported result total mode: ${mode}`);
    }

    // Aggregate base cells across every requested row and column prefix.
    static buildTotals(cells, rowDefinitions, columnDefinitions, valueFields, configuration) {
        const rowLevels = this.totalLevels(rowDefinitions.length, configuration.rows);
        const columnLevels = this.totalLevels(columnDefinitions.length, configuration.columns);
        const rowKeys = new Map();
        const columnKeys = new Map();
        const aggregates = new Map();

        cells.forEach(cell => {
            const rowOptions = [{ key: cell.rowKey, level: rowDefinitions.length, isTotal: false }]
                .concat(rowLevels.map(level => ({ key: cell.rowKey.slice(0, level), level: level, isTotal: true })));
            const columnOptions = [{ key: cell.columnKey, level: columnDefinitions.length, isTotal: false }]
                .concat(columnLevels.map(level => ({ key: cell.columnKey.slice(0, level), level: level, isTotal: true })));

            rowOptions.forEach(row => {
                columnOptions.forEach(column => {
                    if (!row.isTotal && !column.isTotal) return;
                    if (row.isTotal) rowKeys.set(this.keyID(row.key), row.key.slice());
                    if (column.isTotal) columnKeys.set(this.keyID(column.key), column.key.slice());
                    const totalID = this.cellID(this.keyID(row.key), this.keyID(column.key));
                    let total = aggregates.get(totalID);
                    if (!total) {
                        total = {
                            rowKey: row.key.slice(),
                            columnKey: column.key.slice(),
                            rowLevel: row.level,
                            columnLevel: column.level,
                            values: {},
                            counts: {}
                        };
                        valueFields.forEach(valueField => {
                            total.values[valueField.field] = 0;
                            total.counts[valueField.field] = 0;
                        });
                        aggregates.set(totalID, total);
                    }
                    valueFields.forEach(valueField => {
                        const value = cell.values[valueField.field];
                        if (value === null) return;
                        total.values[valueField.field] += value;
                        total.counts[valueField.field]++;
                    });
                });
            });
        });

        const sortedRowKeys = Array.from(rowKeys.values()).sort((left, right) =>
            left.length - right.length || this.compareKeys(left, right, rowDefinitions.slice(0, left.length)));
        const sortedColumnKeys = Array.from(columnKeys.values()).sort((left, right) =>
            left.length - right.length || this.compareKeys(left, right, columnDefinitions.slice(0, left.length)));
        const rowOrder = new Map(sortedRowKeys.map((key, index) => [this.keyID(key), index]));
        const columnOrder = new Map(sortedColumnKeys.map((key, index) => [this.keyID(key), index]));
        const totalCells = Array.from(aggregates.values()).map(total => {
            const values = {};
            valueFields.forEach(valueField => {
                values[valueField.field] = total.counts[valueField.field]
                    ? total.values[valueField.field]
                    : null;
            });
            return {
                rowKey: total.rowKey,
                columnKey: total.columnKey,
                rowLevel: total.rowLevel,
                columnLevel: total.columnLevel,
                values: values
            };
        }).sort((left, right) => {
            const leftRowOrder = left.rowLevel == rowDefinitions.length
                ? sortedRowKeys.length
                : rowOrder.get(this.keyID(left.rowKey));
            const rightRowOrder = right.rowLevel == rowDefinitions.length
                ? sortedRowKeys.length
                : rowOrder.get(this.keyID(right.rowKey));
            const rowDifference = leftRowOrder - rightRowOrder || this.compareKeys(left.rowKey, right.rowKey, rowDefinitions);
            if (rowDifference) return rowDifference;
            const leftColumnOrder = left.columnLevel == columnDefinitions.length
                ? sortedColumnKeys.length
                : columnOrder.get(this.keyID(left.columnKey));
            const rightColumnOrder = right.columnLevel == columnDefinitions.length
                ? sortedColumnKeys.length
                : columnOrder.get(this.keyID(right.columnKey));
            return leftColumnOrder - rightColumnOrder || this.compareKeys(left.columnKey, right.columnKey, columnDefinitions);
        });

        return {
            rows: configuration.rows,
            columns: configuration.columns,
            rowKeys: sortedRowKeys,
            columnKeys: sortedColumnKeys,
            cells: totalCells
        };
    }

    static totalLevels(fieldCount, mode) {
        if (mode == this.ShowTotals.None || fieldCount == 0) return [];
        if (mode == this.ShowTotals.GrandTotals) return [0];
        return Array.from({ length: fieldCount }, (value, level) => level);
    }

    // Restrict active measures to the supported MUIO Value sum workflow.
    static valueFields(fields) {
        if (!Array.isArray(fields)) {
            throw new TypeError('ResultAggregator value fields must be an array.');
        }
        if (fields.length > 1) {
            throw new Error('ResultAggregator supports at most one Value field.');
        }
        return fields.map(field => {
            const definition = typeof field == 'string' ? { field: field } : field;
            if (!definition || typeof definition.field != 'string' || !definition.field) {
                throw new TypeError('ResultAggregator value fields must have a string name.');
            }
            if (definition.field != 'Value') {
                throw new Error(`Unsupported result value field: ${definition.field}`);
            }
            const aggregation = definition.aggregation || 'sum';
            if (aggregation != 'sum') {
                throw new Error(`Unsupported result aggregation: ${aggregation}`);
            }
            return { field: definition.field, aggregation: aggregation };
        });
    }

    // Reject layouts that reuse dimensions or measures in conflicting roles.
    static validateLayout(rowFields, columnFields, valueFields) {
        const dimensions = rowFields.concat(columnFields);
        if (new Set(dimensions).size != dimensions.length) {
            throw new Error('A result field cannot be used in both rows and columns.');
        }
        valueFields.forEach(valueField => {
            if (dimensions.includes(valueField.field)) {
                throw new Error('A result value field cannot also be a row or column field.');
            }
        });
    }

    static keyValue(value) {
        return value === undefined ? null : value;
    }

    static numberValue(value) {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    // Compare compound keys by value type and configured direction.
    static compareKeys(left, right, definitions) {
        for (let index = 0; index < definitions.length; index++) {
            const comparison = this.compareValues(left[index], right[index]);
            if (comparison) return definitions[index].descending ? -comparison : comparison;
        }
        return 0;
    }

    static compareValues(left, right) {
        if (Object.is(left, right)) return 0;
        if (left === null || left === undefined) return 1;
        if (right === null || right === undefined) return -1;

        const order = { number: 0, string: 1, boolean: 2, bigint: 3, object: 4 };
        const leftType = typeof left;
        const rightType = typeof right;
        if (leftType != rightType) return (order[leftType] ?? 5) - (order[rightType] ?? 5);
        if (leftType == 'number') {
            if (Number.isNaN(left)) return Number.isNaN(right) ? 0 : 1;
            if (Number.isNaN(right)) return -1;
        }
        if (left < right) return -1;
        if (left > right) return 1;

        const leftText = JSON.stringify(left);
        const rightText = JSON.stringify(right);
        return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
    }

    static keyID(values) {
        return JSON.stringify(values.map(value => [typeof value, value]));
    }

    static cellID(rowID, columnID) {
        return `${rowID}\u0000${columnID}`;
    }
}
