import { ResultAggregator } from "./ResultAggregator.Class.js";
import { WijmoResultAdapter } from "./WijmoResultAdapter.Class.js";

const PARITY_STORAGE_KEY = 'muiogo-result-aggregator-parity';
const ABSOLUTE_TOLERANCE = 1e-10;
const RELATIVE_TOLERANCE = 1e-12;
const MAX_REPORTED_DIFFERENCES = 20;

// TEMPORARY MIGRATION CHECK (#527): Remove this file after approved Wijmo parity fixtures are captured.
export class TempResultParityChecker {

    static isEnabled() {
        return localStorage.getItem(PARITY_STORAGE_KEY) == '1';
    }

    // Compare the active Wijmo view with the neutral aggregator without changing either result.
    static run(engine, items, context = {}) {
        if (!this.isEnabled()) return null;
        if (engine.valueFields.length != 1) return null;
        const startedAt = performance.now();
        try {
            const configuration = WijmoResultAdapter.configuration(engine, items);
            const aggregateResult = ResultAggregator.aggregate(items, configuration);
            const wijmoResult = this.wijmoResult(engine);
            const report = this.compare(wijmoResult, aggregateResult, {
                context: context,
                configuration: configuration,
                engine: engine,
                items: items,
                duration: performance.now() - startedAt
            });
            this.publish(report);
            return report;
        } catch (error) {
            const report = {
                status: 'ERROR',
                context: context,
                message: error instanceof Error ? error.message : String(error),
                durationMilliseconds: performance.now() - startedAt
            };
            this.publish(report);
            return report;
        }
    }

    // Normalize Wijmo's encoded pivotView bindings into explicit result keys.
    static wijmoResult(engine) {
        const rowFieldCount = engine.rowFields.length;
        const columnFieldCount = engine.columnFields.length;
        const cells = [];
        const totals = [];
        const rowKeys = new Map();
        const columnKeys = new Map();

        (engine.pivotView.items || []).forEach(item => {
            Object.keys(item).filter(binding => binding != '$rowKey').forEach(binding => {
                const keys = engine.getKeys(item, binding);
                if (!keys || !keys.rowKey || !keys.colKey) return;
                const rowKey = keys.rowKey.values.map(value => ResultAggregator.keyValue(value));
                const columnKey = keys.colKey.values.map(value => ResultAggregator.keyValue(value));
                const value = ResultAggregator.numberValue(item[binding]);
                const cell = {
                    rowKey: rowKey,
                    columnKey: columnKey,
                    rowLevel: rowKey.length,
                    columnLevel: columnKey.length,
                    values: { Value: value },
                    sourceItem: item,
                    binding: binding
                };
                if (rowKey.length == rowFieldCount && columnKey.length == columnFieldCount) {
                    rowKeys.set(ResultAggregator.keyID(rowKey), rowKey);
                    columnKeys.set(ResultAggregator.keyID(columnKey), columnKey);
                    cells.push(cell);
                } else {
                    totals.push(cell);
                }
            });
        });

        return {
            rowKeys: Array.from(rowKeys.values()),
            columnKeys: Array.from(columnKeys.values()),
            cells: cells,
            totals: totals
        };
    }

    // Compare keys, cells, totals, and raw values while recording every mismatch category.
    static compare(wijmoResult, aggregateResult, options) {
        const mismatches = { count: 0, items: [] };
        const rowOrderMatches = this.compareKeyOrder('row', wijmoResult.rowKeys, aggregateResult.rowKeys, mismatches);
        const columnOrderMatches = this.compareKeyOrder('column', wijmoResult.columnKeys, aggregateResult.columnKeys, mismatches);
        const regular = this.compareCells('cell', wijmoResult.cells, aggregateResult.cells, mismatches);
        const total = this.compareCells('total', wijmoResult.totals, aggregateResult.totals.cells, mismatches);
        const detail = this.compareDetails(wijmoResult, options, mismatches);
        return {
            status: mismatches.count ? 'FAIL' : 'PASS',
            context: options.context,
            configuration: this.configurationSummary(options.configuration),
            rowOrderMatches: rowOrderMatches,
            columnOrderMatches: columnOrderMatches,
            wijmoCells: wijmoResult.cells.length,
            aggregatorCells: aggregateResult.cells.length,
            wijmoTotals: wijmoResult.totals.length,
            aggregatorTotals: aggregateResult.totals.cells.length,
            detailSamples: detail.samples,
            wijmoDetailRecords: detail.wijmoRecords,
            aggregatorDetailRecords: detail.aggregatorRecords,
            maximumAbsoluteDifference: Math.max(regular.maximumAbsoluteDifference, total.maximumAbsoluteDifference),
            mismatchCount: mismatches.count,
            differences: mismatches.items,
            durationMilliseconds: options.duration
        };
    }

    // Compare representative regular and total cells against Wijmo's detail lookup.
    static compareDetails(wijmoResult, options, mismatches) {
        const samples = this.detailSamples(wijmoResult.cells).concat(this.detailSamples(wijmoResult.totals));
        const itemIndexes = new Map(options.items.map((item, index) => [item, index]));
        let wijmoRecords = 0;
        let aggregatorRecords = 0;
        samples.forEach(cell => {
            const wijmoDetail = options.engine.getDetail(cell.sourceItem, cell.binding) || [];
            const aggregatorDetail = ResultAggregator.getDetail(
                options.items,
                options.configuration,
                cell.rowKey,
                cell.columnKey
            );
            wijmoRecords += wijmoDetail.length;
            aggregatorRecords += aggregatorDetail.length;
            const left = this.detailIDs(wijmoDetail, itemIndexes);
            const right = this.detailIDs(aggregatorDetail, itemIndexes);
            if (left.length == right.length && left.every((identifier, index) => identifier == right[index])) return;
            this.recordMismatch(mismatches, {
                type: 'detail',
                rowKey: cell.rowKey,
                columnKey: cell.columnKey,
                wijmoCount: wijmoDetail.length,
                aggregatorCount: aggregatorDetail.length
            });
        });
        return { samples: samples.length, wijmoRecords: wijmoRecords, aggregatorRecords: aggregatorRecords };
    }

    static detailSamples(cells) {
        if (!cells.length) return [];
        const indexes = new Set([0, Math.floor((cells.length - 1) / 2), cells.length - 1]);
        return Array.from(indexes).map(index => cells[index]);
    }

    static detailIDs(records, itemIndexes) {
        return records.map(record => itemIndexes.has(record)
            ? `item:${itemIndexes.get(record)}`
            : `value:${JSON.stringify(record)}`).sort();
    }

    static configurationSummary(configuration) {
        return {
            rowFields: configuration.rowFields,
            columnFields: configuration.columnFields,
            valueFields: configuration.valueFields,
            filters: configuration.filters.map(filter => ({
                field: filter.field,
                selectedValueCount: filter.values.length
            })),
            totals: configuration.totals
        };
    }

    static compareKeyOrder(kind, wijmoKeys, aggregatorKeys, mismatches) {
        const left = wijmoKeys.map(key => ResultAggregator.keyID(key));
        const right = aggregatorKeys.map(key => ResultAggregator.keyID(key));
        if (left.length == right.length && left.every((key, index) => key == right[index])) return true;
        this.recordMismatch(mismatches, {
            type: `${kind}-order`,
            wijmoCount: wijmoKeys.length,
            aggregatorCount: aggregatorKeys.length,
            wijmoSample: wijmoKeys.slice(0, MAX_REPORTED_DIFFERENCES),
            aggregatorSample: aggregatorKeys.slice(0, MAX_REPORTED_DIFFERENCES)
        });
        return false;
    }

    static compareCells(kind, wijmoCells, aggregatorCells, mismatches) {
        const wijmoMap = this.cellMap(kind, wijmoCells);
        const aggregatorMap = this.cellMap(kind, aggregatorCells);
        const identifiers = new Set(Array.from(wijmoMap.keys()).concat(Array.from(aggregatorMap.keys())));
        let maximumAbsoluteDifference = 0;

        identifiers.forEach(identifier => {
            const wijmoCell = wijmoMap.get(identifier);
            const aggregatorCell = aggregatorMap.get(identifier);
            if (!wijmoCell || !aggregatorCell) {
                this.recordMismatch(mismatches, this.cellDifference(kind, wijmoCell, aggregatorCell, 'missing'));
                return;
            }
            const wijmoValue = wijmoCell.values.Value;
            const aggregatorValue = aggregatorCell.values.Value;
            if (wijmoValue === null || aggregatorValue === null) {
                if (wijmoValue !== aggregatorValue) {
                    this.recordMismatch(mismatches, this.cellDifference(kind, wijmoCell, aggregatorCell, 'null'));
                }
                return;
            }
            const absoluteDifference = Math.abs(wijmoValue - aggregatorValue);
            maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference, absoluteDifference);
            const tolerance = ABSOLUTE_TOLERANCE + RELATIVE_TOLERANCE * Math.max(Math.abs(wijmoValue), Math.abs(aggregatorValue));
            if (absoluteDifference > tolerance) {
                this.recordMismatch(mismatches, this.cellDifference(kind, wijmoCell, aggregatorCell, 'value', absoluteDifference, tolerance));
            }
        });

        return {
            maximumAbsoluteDifference: maximumAbsoluteDifference
        };
    }

    static recordMismatch(mismatches, difference) {
        mismatches.count++;
        if (mismatches.items.length < MAX_REPORTED_DIFFERENCES) mismatches.items.push(difference);
    }

    static cellMap(kind, cells) {
        const map = new Map();
        cells.forEach(cell => {
            const identifier = `${kind}\u0000${ResultAggregator.keyID(cell.rowKey)}\u0000${ResultAggregator.keyID(cell.columnKey)}`;
            map.set(identifier, cell);
        });
        return map;
    }

    static cellDifference(kind, wijmoCell, aggregatorCell, reason, absoluteDifference, tolerance) {
        const source = wijmoCell || aggregatorCell;
        return {
            type: kind,
            reason: reason,
            rowKey: source ? source.rowKey : [],
            columnKey: source ? source.columnKey : [],
            wijmo: wijmoCell ? wijmoCell.values.Value : undefined,
            aggregator: aggregatorCell ? aggregatorCell.values.Value : undefined,
            absoluteDifference: absoluteDifference,
            tolerance: tolerance
        };
    }

    // Keep a bounded browser report history and print a concise diagnostic summary.
    static publish(report) {
        const reports = window.__muiogoResultAggregatorParityReports || [];
        reports.push(report);
        if (reports.length > 100) reports.shift();
        window.__muiogoResultAggregatorParityReports = reports;
        console.groupCollapsed(`[ResultAggregator parity] ${report.status} ${report.context.group || ''} ${report.context.param || ''}`);
        console.log(report);
        if (report.differences && report.differences.length) console.table(report.differences);
        console.groupEnd();
    }
}
