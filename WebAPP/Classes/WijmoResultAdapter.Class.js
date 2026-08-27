import { ResultAggregator } from "./ResultAggregator.Class.js";

// TEMPORARY MIGRATION (#527): remove after the native Results panel replaces Wijmo.
export class WijmoResultAdapter {

    // Translate the active Wijmo layout into renderer-neutral aggregation settings.
    static configuration(engine, items) {
        const valueFields = Array.from(engine.valueFields);
        if (valueFields.length > 1 || (valueFields.length && valueFields[0].binding != 'Value')) {
            throw new Error('MUIO Results supports only the Value field.');
        }
        if (valueFields.length &&
            (valueFields[0].aggregate != wijmo.Aggregate.Sum || valueFields[0].showAs != wijmo.olap.ShowAs.NoCalculation)) {
            throw new Error('MUIO Results currently requires Value sum with no Show As calculation.');
        }
        return {
            rowFields: Array.from(engine.rowFields).map(field => this.fieldDefinition(field)),
            columnFields: Array.from(engine.columnFields).map(field => this.fieldDefinition(field)),
            valueFields: valueFields.length ? [{ field: 'Value', aggregation: 'sum' }] : [],
            filters: this.filters(engine, items),
            totals: {
                rows: this.totalMode(engine.showRowTotals),
                columns: this.totalMode(engine.showColumnTotals)
            }
        };
    }

    static fieldDefinition(field) {
        if (!field || !field.binding) throw new Error('The active Wijmo field has no source binding.');
        return { field: field.binding, descending: field.descending === true };
    }

    // Convert active Wijmo filters into the exact raw values accepted by each filter.
    static filters(engine, items) {
        return Array.from(engine.fields).filter(field => field.filter && field.filter.isActive).map(field => {
            const values = new Map();
            items.forEach(item => {
                const value = item[field.binding];
                if (!field.filter.apply(item)) return;
                const normalized = ResultAggregator.keyValue(value);
                values.set(ResultAggregator.keyID([normalized]), normalized);
            });
            return { field: field.binding, values: Array.from(values.values()) };
        });
    }

    static totalMode(mode) {
        if (mode == wijmo.olap.ShowTotals.None) return ResultAggregator.ShowTotals.None;
        if (mode == wijmo.olap.ShowTotals.GrandTotals) return ResultAggregator.ShowTotals.GrandTotals;
        if (mode == wijmo.olap.ShowTotals.Subtotals) return ResultAggregator.ShowTotals.Subtotals;
        throw new Error(`Unsupported Wijmo total mode: ${mode}`);
    }
}
