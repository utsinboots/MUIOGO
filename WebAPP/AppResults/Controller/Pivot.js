import { Message } from "../../Classes/Message.Class.js";
import { Base } from "../../Classes/Base.Class.js";
import { Html, escapeHtml } from "../../Classes/Html.Class.js";
import { Model } from "../Model/Pivot.Model.js";
import { Osemosys } from "../../Classes/Osemosys.Class.js";
import { DEF } from "../../Classes/Definition.Class.js";
import { MessageSelect } from "../../App/Controller/MessageSelect.js"
import { DataModelResult } from "../../Classes/DataModelResult.Class.js";
import { DefaultObj } from "../../Classes/DefaultObj.Class.js";
import { ResultAggregator } from "../../Classes/ResultAggregator.Class.js";
import { ResultGrid } from "../../Classes/ResultGrid.Class.js";
import { ResultLayoutState } from "../../Classes/ResultLayoutState.Class.js";
import { ResultPanel } from "../../Classes/ResultPanel.Class.js";
import { ResultFieldSettings } from "../../Classes/ResultFieldSettings.Class.js";

const ECHARTS_URL = 'References/echarts/echarts-6.1.0.min.js';

export default class Pivot {
    static loadECharts() {
        if (window.echarts) return Promise.resolve(window.echarts);
        return new Promise((resolve, reject) => {
            let script = document.getElementById('ogc-echarts-runtime');
            if (script) {
                script.addEventListener('load', () => resolve(window.echarts), { once: true });
                script.addEventListener('error', () => reject('Charts could not be loaded.'), { once: true });
                return;
            }
            script = document.createElement('script');
            script.id = 'ogc-echarts-runtime';
            script.src = ECHARTS_URL;
            script.async = true;
            script.addEventListener('load', () => resolve(window.echarts), { once: true });
            script.addEventListener('error', () => {
                script.remove();
                reject('Charts could not be loaded.');
            }, { once: true });
            document.head.appendChild(script);
        });
    }

    // Convert supported unit markup to Unicode text without parsing model HTML.
    static plainText(value) {
        const superscript = { '0':'⁰', '1':'¹', '2':'²', '3':'³', '4':'⁴', '5':'⁵', '6':'⁶', '7':'⁷', '8':'⁸', '9':'⁹', '+':'⁺', '-':'⁻' };
        const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
        return (value == null ? '' : String(value)).replace(/<sup>(.*?)<\/sup>/gi, (_, text) =>
            [...text].map(character => superscript[character] || character).join(''))
            .replace(/<[^>]*>/g, '')
            .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, name) => entities[name.toLowerCase()]);
    }

    // Default column field per result group, matching the layout MUIO opened each variable with.
    static GROUP_COLUMNS = Object.freeze({
        R: 'Optimal', RY: null, RYE: 'Emi', RYCn: 'Con', RYS: 'Stg',
        RYCTs: 'Comm', RYC: 'Comm', RYTC: 'Comm', RYTCMTs: 'Comm'
    });

    // Catalogue the fields present in the pivot records. Wijmo derived headers from the binding by
    // splitting camel case, and saved views reference those headers, so the same split is kept.
    static fieldCatalogue(items) {
        const sample = (items || [])[0] || {};
        return Object.keys(sample).map(name => ({
            field: name,
            header: name.replace(/([a-z])([A-Z])/g, '$1 $2'),
            isMeasure: name == 'Value',
            isNumeric: (items || []).some(item => typeof item[name] == 'number' && Number.isFinite(item[name]))
        }));
    }

    // Place the fields a group opens with, replacing the per-group blocks the engine needed.
    static applyDefaultLayout(state, group) {
        const column = Object.prototype.hasOwnProperty.call(Pivot.GROUP_COLUMNS, group)
            ? Pivot.GROUP_COLUMNS[group] : 'Tech';
        return state.defer(current => {
            current.resetFieldSettings();
            ['rows', 'columns', 'filters', 'values'].forEach(area => current.getAreas()[area].splice(0));
            // Clear filters with the layout so one variable cannot silently restrict the next.
            Object.keys(current.filters).forEach(name => current.setFilter(name, null));
            Object.keys(current.descending).forEach(name => current.setDescending(name, false));
            current.assignField('Case', 'rows');
            if (group != 'R') current.assignField('Year', 'rows');
            if (column) current.assignField(column, 'columns');
            current.assignField('Value', 'values');
        });
    }

    // Fill a native select from a list of records, keeping the current value when it still exists.
    static fillSelect(selector, items, valueKey, labelKey, selected) {
        const control = document.querySelector(selector);
        if (!control) return;
        control.innerHTML = (items || []).map(item => {
            const option = document.createElement('option');
            option.value = item[valueKey];
            option.textContent = Pivot.plainText(item[labelKey]);
            return option.outerHTML;
        }).join('');
        // outerHTML serializes the selected attribute, not the property, so set the live value here.
        if (selected != null) control.value = selected;
    }

    // Organize aggregated results into categories and series for chart rendering.
    static getChartModel(app) {
        const result = app.aggregateResult;
        if (!result) return { categories: [], categoryLabels: [], series: [], rowFields: [], categoryTuples: [] };

        // Row keys are the categories and column keys the series, both already ordered by the aggregator.
        const categoryTuples = result.rowKeys.map(key => key.map(value => Pivot.plainText(value)));
        const rowIndexes = new Map(result.rowKeys.map((key, index) => [ResultAggregator.keyID(key), index]));
        const columnIndexes = new Map(result.columnKeys.map((key, index) => [ResultAggregator.keyID(key), index]));
        const valueField = result.valueFields.length ? result.valueFields[0].field : 'Value';
        const series = result.columnKeys.map(key => ({
            name: Pivot.plainText(key.join(' - ')) || valueField,
            values: Array(result.rowKeys.length).fill(null)
        }));

        // Only regular cells appear here; the aggregator keeps subtotals in a separate collection.
        result.cells.forEach(cell => {
            const row = rowIndexes.get(ResultAggregator.keyID(cell.rowKey));
            const column = columnIndexes.get(ResultAggregator.keyID(cell.columnKey));
            if (row == null || column == null) return;
            const value = cell.values[valueField];
            series[column].values[row] = Number.isFinite(value) ? value : null;
        });

        const rowFieldNames = result.rowFields.slice();
        const displayedFields = rowFieldNames.map((_, index) => index)
            .filter(index => rowFieldNames[index] != 'Case');
        if (!displayedFields.length && rowFieldNames.length) displayedFields.push(rowFieldNames.length - 1);
        const categories = categoryTuples.map(values => values.join(' - ') || 'Value');
        const categoryLabels = categoryTuples.map(values =>
            displayedFields.map(index => values[index]).join(' - ') || 'Value');

        // rowFields and categoryTuples drive the grouped axis: the innermost field labels each bar.
        return { categories, categoryLabels, series, rowFields: rowFieldNames, categoryTuples };
    }

    // Category axis: the innermost field labels each bar, outer fields become nested bracket axes.
    static getCategoryAxis(chartModel, horizontal) {
        const tuples = chartModel.categoryTuples || [];
        const fieldCount = (chartModel.rowFields || []).length;
        const leafIndex = fieldCount - 1;
        const leafRotated = fieldCount >= 3;
        const leafAxis = {
            type: 'category',
            data: chartModel.categories,
            axisLabel: {
                hideOverlap: true,
                rotate: leafRotated ? 90 : 0,
                formatter: (_, index) => {
                    const tuple = tuples[index] || [];
                    const value = leafIndex >= 0 ? tuple[leafIndex] : null;
                    return Pivot.plainText(value != null && value !== '' ? value : chartModel.categoryLabels[index]);
                }
            }
        };
        if (fieldCount < 2 || tuples.length != chartModel.categories.length) return leafAxis;

        const leafHeight = leafRotated ? 46 : 24;
        const step = 22;
        const axes = [leafAxis];
        for (let field = 0; field < leafIndex; field++) {
            // A bracket starts wherever this field or any outer field changes value.
            const starts = [];
            tuples.forEach((tuple, index) => {
                if (index == 0) { starts.push(index); return; }
                const previous = tuples[index - 1] || [];
                for (let outer = 0; outer <= field; outer++) {
                    if (previous[outer] != tuple[outer]) { starts.push(index); return; }
                }
            });
            const midLabel = new Map();
            starts.forEach((start, groupIndex) => {
                const end = (groupIndex + 1 < starts.length ? starts[groupIndex + 1] : tuples.length) - 1;
                midLabel.set(Math.floor((start + end) / 2), Pivot.plainText((tuples[start] || [])[field]));
            });
            const boundaries = new Set(starts);
            const rank = leafIndex - field;
            axes.push({
                type: 'category',
                data: chartModel.categories,
                position: horizontal ? 'left' : 'bottom',
                offset: horizontal ? rank * 70 : leafHeight + (rank - 1) * step,
                // Dividers at each boundary, no continuous axis line: a line would join every group.
                axisLine: { show: false },
                axisTick: {
                    show: true,
                    alignWithLabel: false,
                    length: step,
                    interval: index => boundaries.has(index),
                    lineStyle: { color: '#c4cad4' }
                },
                axisLabel: {
                    interval: 0,
                    hideOverlap: true,
                    fontSize: 10,
                    color: '#333',
                    formatter: (_, index) => midLabel.get(index) || ''
                }
            });
        }
        return axes;
    }

    // Reserve room under the plot for the full legend; it grows with the number of series.
    static getLegendHeight(series) {
        const host = document.getElementById('pivotChart');
        const width = host && host.clientWidth ? host.clientWidth : 1200;
        const longest = series.reduce((count, item) => Math.max(count, String(item.name || '').length), 8);
        const entryWidth = 26 + longest * 6.5;
        const perRow = Math.max(1, Math.floor(width / entryWidth));
        const rows = Math.max(1, Math.ceil(series.length / perRow));
        return Math.min(rows, 8) * 16 + 4;
    }

    static getPercentSeries(series) {
        if (!series.length) return [];
        const totals = series[0].values.map((_, index) => series.reduce((sum, current) => {
            const value = current.values[index];
            return sum + (value == null ? 0 : Math.abs(value));
        }, 0));
        return series.map(itemSeries => ({
            name: itemSeries.name,
            values: itemSeries.values.map((value, index) => {
                if (value == null) return null;
                return totals[index] ? value / totals[index] * 100 : 0;
            })
        }));
    }

    static formatChartValue(value, format, percent = false, currency = 'USD') {
        if (value == null || value === '' || !Number.isFinite(Number(value))) return '';
        const match = /^(n|c|p)(\d*)(,*)$/i.exec(format || '');
        const decimals = match && match[2] !== '' ? Number(match[2]) : 2;
        const scaled = Number(value) / Math.pow(1000, match ? match[3].length : 0);
        const options = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
        if (!percent && match && match[1].toLowerCase() == 'c') {
            options.style = 'currency';
            options.currency = currency;
        } else if (!percent && match && match[1].toLowerCase() == 'p') options.style = 'percent';
        const formatted = scaled.toLocaleString(undefined, options);
        return percent ? `${formatted}%` : formatted;
    }

    static formatAxisTooltip(params, format, percent, currency) {
        const items = Array.isArray(params) ? params : [params];
        if (!items.length) return '';
        const lines = [escapeHtml(Pivot.plainText(items[0].axisValueLabel || items[0].name))];
        items.forEach(item => {
            const value = Array.isArray(item.value) ? item.value[item.value.length - 1] : item.value;
            lines.push(`${item.marker}${escapeHtml(Pivot.plainText(item.seriesName))}: ${Pivot.formatChartValue(value, format, percent, currency)}`);
        });
        return lines.join('<br>');
    }

    static updatePieSeriesControl(app, series) {
        const control = document.getElementById('cmbPieSeries');
        if (!control) return;
        control.hidden = app.pivotChart.chartType != 'pie' || series.length < 2;
        const fallback = series.find(item => item.values.some(value => value != null && value > 0)) || series[0];
        const selectedName = series.some(item => item.name == app.pivotChart.pieSeries) ?
            app.pivotChart.pieSeries : (fallback ? fallback.name : '');
        app.pivotChart.pieSeries = selectedName;
        control.innerHTML = series.map(item => {
            const option = document.createElement('option');
            option.value = item.name;
            option.textContent = item.name;
            return option.outerHTML;
        }).join('');
        // outerHTML serializes the selected attribute, not the property, so set the live value here.
        control.value = selectedName;
    }

    static getChartOption(app, model) {
        const chartModel = Pivot.getChartModel(app);
        const chartType = app.pivotChart.chartType;
        const percent = app.pivotChart.stacking == 'percent';
        const valueField = app.aggregateResult && app.aggregateResult.valueFields[0];
        const valueFormat = valueField ? valueField.format : model.stgDecimalPoints;
        const currency = model.genData['osy-currency'] || 'USD';
        const chartSeries = percent ? Pivot.getPercentSeries(chartModel.series) : chartModel.series;
        Pivot.updatePieSeriesControl(app, chartSeries);

        if (chartType == 'pie') {
            const selectedSeries = chartSeries.find(item => item.name == app.pivotChart.pieSeries) || chartSeries[0];
            const pieData = selectedSeries ? chartModel.categories
                .map((name, index) => ({ name, value: selectedSeries.values[index] }))
                .filter(item => item.value != null && item.value > 0) : [];
            return {
                color: model.ColorSchemes.osyScheme,
                aria: { enabled: true },
                tooltip: {
                    trigger: 'item',
                    confine: true,
                    formatter: item => `${item.marker}${escapeHtml(Pivot.plainText(item.name))}: ${Pivot.formatChartValue(item.value, valueFormat, percent, currency)}`
                },
                legend: {
                show: app.pivotChart.showLegend,
                // List every entry under the chart with small square chips instead of paging.
                type: 'plain',
                bottom: 0,
                selectedMode: false,
                icon: 'rect',
                itemWidth: 10,
                itemHeight: 10,
                itemGap: 12,
                textStyle: { fontSize: 11 }
            },
                graphic: pieData.length ? [] : [{
                    type: 'text',
                    left: 'center',
                    top: 'middle',
                    style: { text: 'No positive data is available for this series.', fill: '#666' }
                }],
                series: selectedSeries ? [{
                    name: selectedSeries.name,
                    type: 'pie',
                    center: ['50%', '50%'],
                    radius: ['25%', '65%'],
                    avoidLabelOverlap: true,
                    label: { show: true, position: 'outside', distanceToLabelLine: 3 },
                    labelLine: { show: true, length: 12, length2: 8 },
                    emphasis: { scale: true, scaleSize: 15 },
                    stillShowZeroSum: false,
                    data: pieData
                }] : []
            };
        }

        const horizontal = chartType == 'bar';
        const itemTooltip = chartType == 'column' || chartType == 'bar';
        const type = itemTooltip ? 'bar' : chartType == 'area' ? 'line' : chartType;
        const categoryAxis = Pivot.getCategoryAxis(chartModel, horizontal);
        const grouped = Array.isArray(categoryAxis);
        const levels = grouped ? categoryAxis.length - 1 : 0;
        const legendHeight = app.pivotChart.showLegend ? Pivot.getLegendHeight(chartSeries) : 12;
        const axisValue = {
            type: 'value',
            axisLabel: { formatter: value => Pivot.formatChartValue(value, valueFormat, percent, currency) }
        };

        return {
            color: model.ColorSchemes.osyScheme,
            aria: { enabled: true },
            tooltip: {
                trigger: itemTooltip ? 'item' : 'axis',
                confine: true,
                extraCssText: 'max-width: 320px; max-height: 70%; overflow-y: auto;',
                formatter: params => {
                    if (!itemTooltip) return Pivot.formatAxisTooltip(params, valueFormat, percent, currency);
                    const value = Array.isArray(params.value) ? params.value[params.value.length - 1] : params.value;
                    return `${params.marker}${escapeHtml(Pivot.plainText(params.seriesName))}<br>` +
                        `${escapeHtml(Pivot.plainText(params.name))}: ${Pivot.formatChartValue(value, valueFormat, percent, currency)}`;
                }
            },
            legend: {
                show: app.pivotChart.showLegend,
                // List every entry under the chart with small square chips instead of paging.
                type: 'plain',
                bottom: 0,
                selectedMode: false,
                icon: 'rect',
                itemWidth: 10,
                itemHeight: 10,
                itemGap: 12,
                textStyle: { fontSize: 11 }
            },
            grid: {
                top: 35,
                right: 30,
                // containLabel covers the axis labels; only the offset group levels need extra space.
                bottom: legendHeight + (!horizontal && grouped ? levels * 22 + 6 : 6),
                left: horizontal && grouped ? 75 + levels * 60 : 75,
                containLabel: true
            },
            xAxis: horizontal ? axisValue : categoryAxis,
            yAxis: horizontal ? categoryAxis : axisValue,
            series: chartSeries.map(itemSeries => ({
                name: itemSeries.name,
                type,
                data: itemSeries.values,
                stack: app.pivotChart.stacking == 'none' ? undefined : 'results',
                areaStyle: chartType == 'area' ? {} : undefined,
                connectNulls: false,
                emphasis: { focus: 'series' }
            }))
        };
    }

    static renderChart(app, model) {
        if (Pivot.activeApp != app || !window.echarts) return;
        const host = document.getElementById('pivotChart');
        if (!host) return;
        const option = Pivot.getChartOption(app, model);

        if (!option.series.length) {
            Pivot.disposeChart();
            host.textContent = 'No chart data is available for this view.';
            host.classList.add('pivot-chart-empty');
            return;
        }

        host.classList.remove('pivot-chart-empty');
        if (!Pivot.chart || Pivot.chart.isDisposed()) {
            host.textContent = '';
            Pivot.chart = window.echarts.init(host, null, { renderer: 'svg' });
        }
        Pivot.chart.setOption(option, true);
        Pivot.chart.resize();
    }

    static disposeChart() {
        if (Pivot.chart && !Pivot.chart.isDisposed()) Pivot.chart.dispose();
        Pivot.chart = null;
    }

    // Refresh the open-source grid from the same active layout used by the Wijmo panel.
    static renderResultGrid(app, model) {
        const configuration = app.state.configuration();
        app.resultConfiguration = configuration;
        app.aggregateResult = ResultAggregator.aggregate(model.pivotData, configuration);
        app.resultGrid.render(app.aggregateResult, app.state.numberFormat);
    }

    // Distinct values of one field, for the filter list in the field settings dialog.
    static fieldValues(items, field) {
        const values = new Map();
        (items || []).forEach(item => {
            const value = ResultAggregator.keyValue(item[field]);
            values.set(ResultAggregator.keyID([value]), value);
        });
        return Array.from(values.values());
    }

    // Render each Results output only after the active layout has finished updating.
    static renderResults(app, model) {
        if (Pivot.activeApp != app || app.updatingParam) return;
        Pivot.renderResultGrid(app, model);
        Pivot.renderChart(app, model);
    }

    static disposeResultGrid(app = Pivot.activeApp) {
        if (app && app.resultGrid) app.resultGrid.destroy();
    }

    static disposeResultPanel(app = Pivot.activeApp) {
        if (app && app.panel) app.panel.destroy();
        ResultFieldSettings.destroy();
    }

    // Surface anything a saved view asked for that the open-source layout does not reproduce.
    static reportLayoutWarnings(state) {
        if (state.warnings.length) {
            Message.smallBoxWarning('Saved view', state.warnings.map(warning => escapeHtml(warning)).join('<br>'), 6000);
        }
    }

    // Keep the totals controls aligned with the active default or saved-view layout.
    static syncTotalsControls(state) {
        const rowTotals = document.querySelector('#showRowTotals');
        const columnTotals = document.querySelector('#showColumnTotals');
        if (rowTotals) rowTotals.checked = state.totals.rows != ResultAggregator.ShowTotals.None;
        if (columnTotals) columnTotals.checked = state.totals.columns != ResultAggregator.ShowTotals.None;
    }

    static bindChartLifecycle(app) {
        $(window).off('.muiopivot');
        $(window).on('resize.muiopivot', () => {
            if (Pivot.chart && !Pivot.chart.isDisposed()) Pivot.chart.resize();
        });
        $(window).on('hashchange.muiopivot', () => {
            if (window.location.hash == '#/Pivot') return;
            Pivot.disposeChart();
            Pivot.disposeResultGrid(app);
            Pivot.disposeResultPanel(app);
            if (Pivot.activeApp == app) Pivot.activeApp = null;
            $(window).off('.muiopivot');
        });
    }

    static exportChart(model) {
        if (!Pivot.chart || Pivot.chart.isDisposed()) return;
        const safeName = `${model.casename}-${model.param}`.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
        // The on-screen legend already lists every entry, so the chart captures as it appears.
        const link = document.createElement('a');
        link.download = `muiogo-${safeName}.svg`;
        link.href = Pivot.chart.getDataURL({ type: 'svg', pixelRatio: 2, backgroundColor: '#ffffff' });
        link.click();
    }

    static onLoad() {
        Base.getSession()
            .then(response => {
                let casename = response['session'];
                if (casename) {
                    const promise = [];
                    promise.push(casename);
                    const genData = Osemosys.getData(casename, 'genData.json');
                    promise.push(genData);
                    const resData = Osemosys.getResultData(casename, 'resData.json');
                    promise.push(resData);
                    const VARIABLES = Osemosys.getParamFile('Variables.json');
                    promise.push(VARIABLES);
                    const INDICATORS = Osemosys.getParamFile('Indicators.json');
                    promise.push(INDICATORS);
                    const DUALS = Osemosys.getParamFile('Duals.json');
                    promise.push(DUALS);
                    const VIEWS = Osemosys.getResultData(casename,'viewDefinitions.json');
                    promise.push(VIEWS);
                    const DATA = Osemosys.getResultData(casename, 'RYT.json');
                    promise.push(DATA);
                    return Promise.all(promise);
                } else {
                    let er = {
                        "message": 'There is no model selected!',
                        "status_code": "CaseError"
                    }
                    return Promise.reject(er);
                    // MessageSelect.init(Pivot.refreshPage.bind(Pivot));
                    // throw new Error('No model selected');
                }
            })
            .then(data => {
                let [casename, genData, resData, VARIABLES, INDICATORS, DUALS, VIEWS, DATA] = data;
                let model = new Model(casename, genData, resData, VARIABLES, INDICATORS, DUALS, DATA, VIEWS);
                this.initPage(model);
            })
            .catch(error => {
                if (error.status_code == 'CaseError') {
                    MessageSelect.init(Pivot.refreshPage.bind(Pivot));
                }
                else if (error.status_code == 'ActivityError') {
                    MessageSelect.activity(Pivot.refreshPage.bind(Pivot), error.casename);
                }
                Message.warning(error);
            });
    }

    static refreshPage(casename) {
        Base.setSession(casename)
            .then(response => {
                const promise = [];
                promise.push(casename);
                const genData = Osemosys.getData(casename, 'genData.json');
                promise.push(genData);
                const resData = Osemosys.getResultData(casename, 'resData.json');
                promise.push(resData);
                const VARIABLES = Osemosys.getParamFile('Variables.json');
                promise.push(VARIABLES);
                const INDICATORS = Osemosys.getParamFile('Indicators.json');
                promise.push(INDICATORS);
                const DUALS = Osemosys.getParamFile('Duals.json');
                promise.push(DUALS);
                const VIEWS = Osemosys.getResultData(casename, 'viewDefinitions.json');
                promise.push(VIEWS);
                const DATA = Osemosys.getResultData(casename, 'RYT.json');
                promise.push(DATA);
                return Promise.all(promise);
            })
            .then(data => {
                let [casename, genData, resData, VARIABLES, INDICATORS, DUALS, VIEWS, DATA] = data;
                let model = new Model(casename, genData, resData, VARIABLES, INDICATORS, DUALS, DATA, VIEWS);
                model.refreshPage = true;
                this.initPage(model);
                //this.initEvents(model);
            })
            .catch(error => {
                setTimeout(function () {
                    if (error.status_code == 'CaseError') {
                        MessageSelect.init(Pivot.refreshPage.bind(Pivot));
                    }
                    else if (error.status_code == 'ActivityError') {
                        MessageSelect.activity(Pivot.refreshPage.bind(Pivot), error.casename);
                    }
                    Message.warning(error.message);
                }, 500);
            });
    }

    static initPage(model) {
        Message.clearMessages();
        Html.title(model.casename, model.VARNAMES[model.group][model.param], model.group);

        //console.log('model ', model)
        // add Grid-based layout for the PivotPanel
        // wijmo.olap.PivotPanel.controlTemplate = 
        // `<div>  
        //     <div class="field-list-label">  
        //         <label wj-part="g-flds"></label>  
        //     </div>  
        //     <div class="field-list pad">  
        //         <div wj-part="d-fields"></div>  
        //     </div>  
        //     <div class="drag-areas-label">  
        //         <label wj-part="g-drag"></label>  
        //     </div>  
        //     <table>
        //         <tbody>
        //             <tr>
        //                 <td width="50%">
        //                     <div class="filter-list pad">  
        //                     <label>  
        //                         <span class="wj-glyph wj-glyph-filter"></span>   
        //                         <span wj-part="g-flt"></span>  
        //                     </label>  
        //                     <div wj-part="d-filters"></div>  
        //                     </div>  
        //                 </td>
        //                 <td width="50%" style="border-left-style: solid;">
        //                     <div class="column-list pad bdr-left">  
        //                         <label>  
        //                             <span class="wj-glyph">⫴</span>   
        //                             <span wj-part="g-cols"></span>  
        //                         </label>  
        //                         <div wj-part="d-cols"></div>  
        //                     </div> 
        //                 </td>
        //             </tr>
        //             <tr style="border-top-style: solid;">
        //                 <td width="50%">
        //                     <div class="row-list pad bdr-top">  
        //                         <label>  
        //                             <span class="wj-glyph">≡</span>   
        //                             <span wj-part="g-rows"></span>  
        //                         </label>  
        //                         <div wj-part="d-rows"></div>  
        //                     </div>  
        //                 </td>
        //                 <td width="50%" style="border-left-style: solid;">
        //                     <div class="values-list pad bdr-left bdr-top">  
        //                         <label>  
        //                             <span class="wj-glyph">Σ</span>   
        //                             <span wj-part="g-vals"></span>  
        //                         </label>  
        //                         <div wj-part="d-vals"></div>  
        //                     </div> 
        //                 </td>
        //             </tr> 
        //         </tbody>
        //     </table>
        //     <div wj-part="d-prog" class="progress-bar"></div>  
        //     <div class="control-area" style="display:none">  
        //         <label>  
        //             <input wj-part="chk-defer" type="checkbox">   
        //             <span wj-part="g-defer">Defer Updates</span>  
        //         </label>  
        //         <button wj-part="btn-update" class="wj-btn wj-state-disabled" type="button" disabled>
        //             Update  
        //         </button>  
        //     </div>  
        // </div>`;

        if (model.refreshPage) {
            Pivot.disposeResultPanel();
            Pivot.disposeResultGrid();
        }
        Pivot.disposeChart();

        let app = {};
        app.state = new ResultLayoutState(Pivot.fieldCatalogue(model.pivotData), model.stgDecimalPoints);
        Pivot.applyDefaultLayout(app.state, model.group);
        model.DEFAULTVIEW = app.state.definition();

        app.panel = new ResultPanel('#pivotPanel', app.state, {
            plainText: value => Pivot.plainText(value),
            currency: model.genData['osy-currency'] || 'USD',
            fieldValues: field => Pivot.fieldValues(model.pivotData, field),
            onApply: () => {
                Pivot.syncTotalsControls(app.state);
                Pivot.renderResults(app, model);
            }
        });
        Pivot.syncTotalsControls(app.state);

        app.resultGrid = new ResultGrid('#pivotGrid', {
            plainText: value => Pivot.plainText(value),
            currency: model.genData['osy-currency'] || 'USD',
            getDetail: context => ResultAggregator.getDetail(
                model.pivotData,
                app.resultConfiguration,
                context.rowKey,
                context.columnKey
            ),
            removeField: fieldName => app.state.assignField(fieldName, null),
            editField: fieldName => ResultFieldSettings.open(fieldName, app.state, {
                plainText: value => Pivot.plainText(value),
                currency: model.genData['osy-currency'] || 'USD',
                fieldValues: field => Pivot.fieldValues(model.pivotData, field)
            }),
            // Year is the only dimension where reversing the order is meaningful for results.
            sortableFields: ['Year'],
            toggleFieldSort: fieldName => app.state.setDescending(fieldName, !app.state.descending[fieldName])
        });
        app.pivotChart = { header: '', chartType: 'column', stacking: 'normal', showLegend: true, pieSeries: '' };
        Pivot.activeApp = app;
        Pivot.renderResults(app, model);
        Pivot.bindChartLifecycle(app);

        Pivot.fillSelect('#cmbParams', model.VARIABLEOBJECT, 'value', 'name', model.param);
        $('#cmbParams').off('change').on('change', function () {
            if (this.value != null && model.TriggerUpdate) Pivot.updateParam(this.value, app, model);
        });

        $('#cmbChartType').html(model.ChartTypes.map(type =>
            `<option value="${type.value}">${type.name}</option>`).join(''));
        $('#cmbChartType').off('change').on('change', function () {
            app.pivotChart.chartType = this.value;
            Pivot.renderChart(app, model);
        });
        $('#cmbStackedChart').off('change').on('change', function () {
            app.pivotChart.stacking = this.value;
            Pivot.renderChart(app, model);
        });
        $('#cmbPieSeries').off('change').on('change', function () {
            app.pivotChart.pieSeries = this.value;
            Pivot.renderChart(app, model);
        });

        Pivot.fillSelect('#cmbViews', model.VIEWS, 'osy-viewId', 'osy-viewname', 'null');
        $('#cmbViews').off('change').on('change', function () {
            if (model.TriggerUpdate) Pivot.updateView(this.value, app, model);
        });

        Pivot.loadECharts()
            .then(() => {
                if (Pivot.activeApp != app) return;
                Pivot.renderChart(app, model);
            })
            .catch(error => Message.dangerOsy(error));

        this.initEvents(model, app);
    }

    static initEvents(model, app) {


        //console.log('model ', model)
        $("#casePicker").off('click');
        $("#casePicker").on('click', '.selectCS', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            var casename = $(this).attr('data-ps');
            Pivot.refreshPage(casename);
            Html.updateCasePicker(casename);
            Message.smallBoxConfirmation("Confirmation!", "Model " + casename + " selected!", 3500);
        });

        $("#createView").jqxValidator({
            hintType: 'label',
            animationDuration: 500,
            rules: [
                { input: '#osy-viewname', message: "View name is required field!", action: 'keyup', rule: 'required' },
                {
                    input: '#osy-viewname', message: "Entered view name is not allowed!", action: 'keyup', rule: function (input, commit) {
                        var casename = $("#osy-viewname").val();
                        var result = (/^[a-zA-Z0-9-_ ]*$/.test(casename));
                        return result;
                    }
                }
            ]
        });

        $("#btnSaveView").off('click');
        $("#btnSaveView").on('click', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            $("#createView").jqxValidator('validate')
        });

        $("#createView").off('validationSuccess');
        $("#createView").on('validationSuccess', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();

            var viewname = $("#osy-viewname").val();
            var desc = $("#osy-viewdesc").val();
            let param = model.param;
            let group = model.group;
            let viewId = DefaultObj.getId('VIEW');

            let POSTDATA = {
                "osy-viewId": viewId,
                "osy-viewname": viewname,
                "osy-viewdesc": desc,
                "osy-viewdef": app.state.definition()
            }

            Osemosys.saveView(model.casename, POSTDATA, param)
            .then(response => {
                Message.clearMessages();
                Message.bigBoxSuccess('Model message', response.message, 3000);
                POSTDATA['osy-varId'] = param;
                model.VIEWS.push(POSTDATA);
                // Html.ddlViews(model.VIEWS[model.param]);
                //Html.ddlViews(model.VIEWS);
                Pivot.fillSelect('#cmbViews', model.VIEWS, 'osy-viewId', 'osy-viewname', document.querySelector('#cmbViews').value);
                $('#createView').modal('toggle');
            })
            .catch(error => {
                Message.bigBoxDanger('Error message', error, null);
            })
        });

        $("#deleteView").off('click');
        $("#deleteView").on('click', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if ( model.VIEW != 'null' &&  model.VIEW != null){

                let viewUpdate = [];
                $.each(model.VIEWS, function (id, obj) {
                
                    if(obj['osy-viewId'] == model.VIEW){
                        model.VIEWS.splice(id, 1)
                        return false;
                    }
                    if(obj['osy-varId'] == model.param){
                        viewUpdate.push(obj);
                    }
                });
                // Html.ddlViews(model.VIEWS[model.param]);
                Pivot.fillSelect('#cmbViews', model.VIEWS, 'osy-viewId', 'osy-viewname', 'null');
                Osemosys.updateViews(model.casename, viewUpdate, model.param)
                .then(response => {
                    app.state.apply(model.DEFAULTVIEW);
                    app.pivotChart.header = '';
                    Message.clearMessages();
                    Message.smallBoxInfo('Model message', response.message, 3000);   
                })
                .catch(error => {
                    Message.bigBoxDanger('Error message', error, null);
                })
            }else{
                Message.smallBoxWarning('Model message', 'Default view cannot be deleted!', 3000);
            }
        });

        $("#csvExport").off('click');
        $('#csvExport').on('click', function () {
            app.resultGrid.downloadCSV('PivotGrid.csv');
        });
        
        $("#svgExport").off('click');
        $('#svgExport').on('click', function () {
            Pivot.exportChart(model);
        });

        $("#showRowTotals").off('click');
        $("#showRowTotals").click(function (e) {
            app.state.setTotals('rows', e.target.checked ?
                ResultAggregator.ShowTotals.Subtotals : ResultAggregator.ShowTotals.None);
        });
        
        $("#showColumnTotals").off('click');
        $("#showColumnTotals").click(function (e) {
            app.state.setTotals('columns', e.target.checked ?
                ResultAggregator.ShowTotals.Subtotals : ResultAggregator.ShowTotals.None);
        });

        $("#hideLegend").off('click');
        $("#hideLegend").click(function (e) {
            app.pivotChart.showLegend = !e.target.checked;
            Pivot.renderChart(app, model);
        });

        $("#showLog").off('click');
        $("#showLog").click(function (e) {
            e.preventDefault();
            $('#definition').html(`${DEF[model.group][model.param].definition}`);
            $('#definition').toggle('slow');
        });
    }

    static updateParam(param, app, model, view=null){
        Message.clearMessages();
        Message.loaderStart('Preparing pivot data...')
        app.updatingParam = true;
        model.group = model.VARGROUPS[param]['group'];
        model.param = param;
        Osemosys.getResultData(model.casename, model.group+'.json')
        .then(DATA => {
            //console.log('DATA ', DATA, model.group)
            if (DATA !== null && model.param in DATA && Object.getOwnPropertyNames(DATA[model.param]).length != 0){
                let pivotData = DataModelResult.getPivot(DATA, model.genData, model.VARIABLES, model.group, model.param);
                model.pivotData = pivotData;
                // Swap the catalogue for the new variable, then open it on that group's default layout.
                app.state.setFields(Pivot.fieldCatalogue(model.pivotData));
                Pivot.applyDefaultLayout(app.state, model.group);
                app.state.setNumberFormat(model.stgDecimalPoints);
                model.DEFAULTVIEW = app.state.definition();
                app.pivotChart.header = '';

                if (view != null) {
                    Html.title(model.casename, model.VARNAMES[model.group][model.param], model.group+' - '+view['osy-viewname'] +' view');
                    app.state.apply(view['osy-viewdef']);
                    app.pivotChart.header = view['osy-viewname'];
                }
                else {
                    model.TriggerUpdate = false;
                    document.querySelector('#cmbViews').value = 'null';
                    model.VIEW = 'null';
                    model.TriggerUpdate = true;
                    Html.title(model.casename, model.VARNAMES[model.group][model.param], model.group+' - Default view');
                }
                // A filter carried in from a saved view may name values this variable does not have.
                app.state.pruneFilterValues(model.pivotData);
                Pivot.reportLayoutWarnings(app.state);

                app.updatingParam = false;
                Pivot.renderResults(app, model);
                Message.loaderEnd();
            }
            else{
                app.updatingParam = false;
                Message.dangerOsy("Results do not contain values for variable <b>"+model.VARNAMES[model.group][model.param] + "</b> please check input data and rerun the model.")
                Message.loaderEnd();
            }

        })
        .catch(error => {
            app.updatingParam = false;
            Message.loaderEnd();
            Message.danger(error.message);
        }); 
    }

    static updateView(viewId, app, model){
        model.VIEW = viewId;
        if(model.VIEW == 'null'){
            app.state.apply(model.DEFAULTVIEW);
            app.state.pruneFilterValues(model.pivotData);
            app.pivotChart.header = '';
            Html.title(model.casename, model.VARNAMES[model.group][model.param], model.group+' Default view');
        }
        else{
            $.each(model.VIEWS, function (id, obj) {
                if(obj['osy-viewId'] == model.VIEW){
                    let param = obj['osy-varId'];
                    // console.log('model.VIEW ', model.VIEW)
                    // console.log('model.VIEWS ', model.VIEWS)
                    // console.log('obj ', obj)
                    // console.log('param ', param)
                    if (model.VAR_IDS.includes(param)){

                        if(param != model.param){
                            model.TriggerUpdate = false;
                            document.querySelector('#cmbParams').value = param;
                            model.TriggerUpdate = true;
                            Pivot.updateParam(param, app, model, obj);
                        }
                        else{
                            //console.log('OVDJE RADI HTML!!!')
                            app.state.apply(obj['osy-viewdef']);
                            app.state.pruneFilterValues(model.pivotData);
                            Pivot.reportLayoutWarnings(app.state);
                            app.pivotChart.header = obj['osy-viewname'];
                            Html.title(model.casename, model.VARNAMES[model.group][model.param], model.group+' - '+obj['osy-viewname'] +' view');
                        } 
                    }
                    else{
                        model.param = param;
                        Message.dangerOsy("Selected view is not longer suported. Please delete view and create new with existing variables.")
                    }
                }
            });
        }
    }
}
