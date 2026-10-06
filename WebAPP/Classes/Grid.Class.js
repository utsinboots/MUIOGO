import { UNITS, TAGS, STORAGE_OPERATIONS } from './Const.Class.js';
import { Message } from "./Message.Class.js";
import { JqxSources } from "./JqxSources.Class.js";
import { DataGrid } from "./DataGrid.Class.js";


export class Grid {

    static theme() {
        let theme = "bootstrap";
        return theme
    }
    static themeMaterial = "material";

    // static scrollToRow($divGrid, rowIndex) {
    //     var rowHeight = $divGrid.jqxGrid('rowsheight');
    //     console.log('rowHeight ', rowHeight)
    //     var gridTopOffset = $divGrid.offset().top;
    //     var scrollToPosition = gridTopOffset + (rowIndex * rowHeight) -25;
    //     console.log('gridTopOffset ',gridTopOffset,rowIndex, scrollToPosition)
    //     //scrollTop: scrollToPosition
    //     $('html, body').animate({
    //         scrollTop: scrollToPosition
    //     }, 100); // Adjust the duration as needed
    // }

    // Seasons: the name is fixed and only the description is editable, as in jqxGrid.
    static seGrid(rows, {onChange = null} = {}) {
        if (this.seGridInstance) this.seGridInstance.destroy();
        this.seGridInstance = new DataGrid('#osy-gridSe', {
            rows: rows,
            key: row => row.SeId,
            rangeSelection: false,
            layout: 'fitColumns',
            height: 'auto',
            columns: [
                { title: 'Season name', field: 'Se', widthGrow: 10, minWidth: 110 },
                { title: 'Description', field: 'Desc', widthGrow: 90, minWidth: 200, text: {} }
            ],
            onChange: onChange,
            onInvalid: message => Message.smallBoxWarning('Input message', message, 3000)
        });
        return this.seGridInstance;
    }

    // Day types: the name is fixed and only the description is editable, as in jqxGrid.
    static dtGrid(rows, {onChange = null} = {}) {
        if (this.dtGridInstance) this.dtGridInstance.destroy();
        this.dtGridInstance = new DataGrid('#osy-gridDt', {
            rows: rows,
            key: row => row.DtId,
            rangeSelection: false,
            layout: 'fitColumns',
            height: 'auto',
            columns: [
                { title: 'Day type name', field: 'Dt', widthGrow: 10, minWidth: 110 },
                { title: 'Description', field: 'Desc', widthGrow: 90, minWidth: 200, text: {} }
            ],
            onChange: onChange,
            onInvalid: message => Message.smallBoxWarning('Input message', message, 3000)
        });
        return this.dtGridInstance;
    }

    // Daily time brackets: the name is fixed and only the description is editable, as in jqxGrid.
    static dtbGrid(rows, {onChange = null} = {}) {
        if (this.dtbGridInstance) this.dtbGridInstance.destroy();
        this.dtbGridInstance = new DataGrid('#osy-gridDtb', {
            rows: rows,
            key: row => row.DtbId,
            rangeSelection: false,
            layout: 'fitColumns',
            height: 'auto',
            columns: [
                { title: 'Daily time bracket name', field: 'Dtb', widthGrow: 10, minWidth: 110 },
                { title: 'Description', field: 'Desc', widthGrow: 90, minWidth: 200, text: {} }
            ],
            onChange: onChange,
            onInvalid: message => Message.smallBoxWarning('Input message', message, 3000)
        });
        return this.dtbGridInstance;
    }

    // Time slices on the shared grid: the season, day type and bracket columns show names and store IDs.
    static tsGrid(timeslices, seasons, daytypes, dailytimebrackets, seNames, dtNames, dtbNames, {onChange = null, onAdd = null, onDelete = null} = {}) {
        let uniqueName = (value, slice) => timeslices.some(other => other !== slice && String(other.Ts).trim() == value)
            ? 'Year split name should be unique!' : null;
        // Options are read when an editor opens, so seasons added meanwhile are offered.
        let choices = (items, idField, nameField) => () => items.map(item => ({ value: item[idField], text: item[nameField], title: item.Desc }));
        let label = names => id => names[id] || id || '';

        if (this.tsGridInstance) this.tsGridInstance.destroy();
        this.tsGridInstance = new DataGrid('#osy-gridTs', {
            rows: timeslices,
            key: slice => slice.TsId,
            rangeSelection: false,
            layout: 'fitColumns',
            columns: [
                { title: 'Year split name', field: 'Ts', sortable: true, menu: true, widthGrow: 15, minWidth: 110, text: { validate: uniqueName } },
                { title: 'Description', field: 'Desc', widthGrow: 35, minWidth: 150, text: {} },
                { title: 'Season', field: 'SE', hozAlign: 'center', widthGrow: 13, minWidth: 90, select: { options: choices(seasons, 'SeId', 'Se'), label: label(seNames) } },
                { title: 'Day type', field: 'DT', hozAlign: 'center', widthGrow: 13, minWidth: 90, select: { options: choices(daytypes, 'DtId', 'Dt'), label: label(dtNames) } },
                { title: 'Daily time bracket', field: 'DTB', hozAlign: 'center', widthGrow: 14, minWidth: 110, select: { options: choices(dailytimebrackets, 'DtbId', 'Dtb'), label: label(dtbNames) } },
                {
                    titleHtml: '<span id="osy-addTs" class="btn btn-white btn-osy btn-xs"><i class="fa fa-plus"></i> Add year split</span>',
                    headerClick: event => {
                        if (onAdd && event.target.closest('#osy-addTs')) onAdd();
                    },
                    widthGrow: 10,
                    minWidth: 95,
                    action: {
                        html: '<span class="osy-datagrid-action deleteTs"><i class="fa fa-times danger"></i> Delete</span>',
                        visible: slice => timeslices.indexOf(slice) !== 0,
                        onClick: slice => {
                            if (onDelete) onDelete(slice);
                        }
                    }
                }
            ],
            onChange: onChange,
            onInvalid: message => Message.smallBoxWarning('Input message', message, 3000)
        });
        return this.tsGridInstance;
    }

    static techsGrid(techs, commodities, techGroups, emissions, commNames, emiNames, techGroupNames, {onChange = null, onAdd = null, onDelete = null} = {}) {
        ///settings units
        let UnitsArray = [];
        let UnitsSettings = JSON.parse(localStorage.getItem("osy-units"));
        if(UnitsSettings){
            UnitsArray = UnitsSettings
        }
        else{
            UnitsArray = UNITS;
        }

        let unitNames = {};
        $.each(UnitsArray, function (id, unit) {
            if (!(unit.id in unitNames)) unitNames[unit.id] = unit.name;
        });
        let units = {
            options: () => UnitsArray.map(unit => ({ value: unit.id, text: unit.name, group: unit.group })),
            label: id => unitNames[id] || id || ''
        };
        // Options are read when an editor opens, so items added in other tabs are offered.
        let choices = (items, idField, nameField) => () => items.map(item => ({ value: item[idField], text: item[nameField], title: item.Desc }));
        let labels = names => ids => (Array.isArray(ids) ? ids : []).map(id => names[id] || id).join(',');
        let comms = { options: choices(commodities, 'CommId', 'Comm'), label: labels(commNames) };

        // Unique among the other technologies, compared by row rather than by display position.
        let uniqueName = (value, tech) => techs.some(other => other !== tech && String(other.Tech).trim() == value)
            ? 'Technology name should be unique!' : null;

        if (this.techGrid) this.techGrid.destroy();
        this.techGrid = new DataGrid('#osy-gridTech', {
            rows: techs,
            key: tech => tech.TechId,
            rangeSelection: false,
            // Columns share the width in the proportions jqxGrid gave them, so the grid fits any window.
            layout: 'fitColumns',
            columns: [
                { title: 'Technology', field: 'Tech', sortable: true, menu: true, widthGrow: 8, minWidth: 95, text: { validate: uniqueName } },
                { title: 'Description', field: 'Desc', widthGrow: 15, minWidth: 110, text: {} },
                { title: 'Technology group', field: 'TG', hozAlign: 'center', widthGrow: 7, minWidth: 80, multi: { options: choices(techGroups, 'TechGroupId', 'TechGroup'), label: labels(techGroupNames) } },
                { title: 'Unit of capacity', field: 'CapUnitId', hozAlign: 'center', widthGrow: 7, minWidth: 70, select: units },
                { title: 'Unit of activity', field: 'ActUnitId', hozAlign: 'center', widthGrow: 7, minWidth: 70, select: units },
                { title: 'Input Activity Ratio', field: 'IAR', hozAlign: 'center', widthGrow: 10, minWidth: 85, multi: comms },
                { title: 'Output Activity Ratio', field: 'OAR', hozAlign: 'center', widthGrow: 10, minWidth: 85, multi: comms },
                { title: 'Input To New Capacity Ratio', field: 'INCR', hozAlign: 'center', widthGrow: 9, minWidth: 85, multi: comms },
                { title: 'Input To Total Capacity Ratio', field: 'ITCR', hozAlign: 'center', widthGrow: 9, minWidth: 85, multi: comms },
                { title: 'Emission Activity Ratio', field: 'EAR', hozAlign: 'center', widthGrow: 9, minWidth: 85, multi: { options: choices(emissions, 'EmisId', 'Emis'), label: labels(emiNames) } },
                {
                    titleHtml: '<span id="osy-addTech" class="btn btn-white btn-osy btn-xs"><i class="fa fa-plus"></i> Add technology</span>',
                    headerClick: event => {
                        if (onAdd && event.target.closest('#osy-addTech')) onAdd();
                    },
                    widthGrow: 9,
                    minWidth: 85,
                    action: {
                        html: '<span class="osy-datagrid-action deleteTech"><i class="fa fa-times danger"></i> Delete</span>',
                        onClick: tech => {
                            if (onDelete) onDelete(tech);
                        }
                    }
                }
            ],
            onChange: onChange,
            onInvalid: message => Message.smallBoxWarning('Input message', message, 3000)
        });
        return this.techGrid;
    }

    // Technology groups on the shared grid: the first group is the model default and cannot be deleted.
    static techGroupGrid(groups, {onChange = null, onAdd = null, onDelete = null} = {}) {
        let uniqueName = (value, group) => groups.some(other => other !== group && String(other.TechGroup).trim() == value)
            ? 'Technology group name should be unique!' : null;

        if (this.techGroupGridInstance) this.techGroupGridInstance.destroy();
        this.techGroupGridInstance = new DataGrid('#osy-gridTechGroup', {
            rows: groups,
            key: group => group.TechGroupId,
            rangeSelection: false,
            layout: 'fitColumns',
            height: 'auto',
            columns: [
                { title: 'Technology group name', field: 'TechGroup', sortable: true, menu: true, widthGrow: 20, minWidth: 140, text: { validate: uniqueName } },
                { title: 'Description', field: 'Desc', widthGrow: 70, minWidth: 180, text: {} },
                {
                    titleHtml: '<span id="osy-addTechGroup" class="btn btn-white btn-osy btn-xs"><i class="fa fa-plus"></i> Add group</span>',
                    headerClick: event => {
                        if (onAdd && event.target.closest('#osy-addTechGroup')) onAdd();
                    },
                    widthGrow: 10,
                    minWidth: 85,
                    action: {
                        html: '<span class="osy-datagrid-action deleteTechGroup"><i class="fa fa-times danger"></i> Delete</span>',
                        visible: group => groups.indexOf(group) !== 0,
                        onClick: group => {
                            if (onDelete) onDelete(group);
                        }
                    }
                }
            ],
            onChange: onChange,
            onInvalid: message => Message.smallBoxWarning('Input message', message, 3000)
        });
        return this.techGroupGridInstance;
    }

    // Units for the configuration grids: the Settings page may override the built-in list.
    static unitColumn() {
        let units = JSON.parse(localStorage.getItem("osy-units")) || UNITS;
        let names = {};
        $.each(units, function (id, unit) {
            if (!(unit.id in names)) names[unit.id] = unit.name;
        });
        return {
            options: () => units.map(unit => ({ value: unit.id, text: unit.name, group: unit.group })),
            label: id => names[id] || id || ''
        };
    }

    // Commodities on the shared grid; at least one must remain, so the last row keeps no Delete.
    static commGrid(commodities, {onChange = null, onAdd = null, onDelete = null} = {}) {
        let uniqueName = (value, comm) => commodities.some(other => other !== comm && String(other.Comm).trim() == value)
            ? 'Commodity name should be unique!' : null;

        if (this.commGridInstance) this.commGridInstance.destroy();
        this.commGridInstance = new DataGrid('#osy-gridComm', {
            rows: commodities,
            key: comm => comm.CommId,
            rangeSelection: false,
            layout: 'fitColumns',
            columns: [
                { title: 'Commodity name', field: 'Comm', sortable: true, menu: true, widthGrow: 20, minWidth: 120, text: { validate: uniqueName } },
                { title: 'Description', field: 'Desc', widthGrow: 50, minWidth: 160, text: {} },
                { title: 'Unit', field: 'UnitId', hozAlign: 'center', widthGrow: 20, minWidth: 90, select: this.unitColumn() },
                {
                    titleHtml: '<span id="osy-addComm" class="btn btn-white btn-osy btn-xs"><i class="fa fa-plus"></i> Add</span>',
                    headerClick: event => {
                        if (onAdd && event.target.closest('#osy-addComm')) onAdd();
                    },
                    widthGrow: 10,
                    minWidth: 85,
                    action: {
                        html: '<span class="osy-datagrid-action deleteComm"><i class="fa fa-times danger"></i> Delete</span>',
                        visible: () => commodities.length > 1,
                        onClick: comm => {
                            if (onDelete) onDelete(comm);
                        }
                    }
                }
            ],
            onChange: onChange,
            onInvalid: message => Message.smallBoxWarning('Input message', message, 3000)
        });
        return this.commGridInstance;
    }

    // Emissions on the shared grid: the first emission is the model default and cannot be deleted.
    static emisGrid(emissions, {onChange = null, onAdd = null, onDelete = null} = {}) {
        let uniqueName = (value, emis) => emissions.some(other => other !== emis && String(other.Emis).trim() == value)
            ? 'Emission name should be unique!' : null;

        if (this.emisGridInstance) this.emisGridInstance.destroy();
        this.emisGridInstance = new DataGrid('#osy-gridEmis', {
            rows: emissions,
            key: emis => emis.EmisId,
            rangeSelection: false,
            layout: 'fitColumns',
            height: 'auto',
            columns: [
                { title: 'Emission name', field: 'Emis', sortable: true, menu: true, widthGrow: 20, minWidth: 120, text: { validate: uniqueName } },
                { title: 'Description', field: 'Desc', widthGrow: 50, minWidth: 160, text: {} },
                { title: 'Unit', field: 'UnitId', hozAlign: 'center', widthGrow: 20, minWidth: 90, select: this.unitColumn() },
                {
                    titleHtml: '<span id="osy-addEmis" class="btn btn-white btn-osy btn-xs"><i class="fa fa-plus"></i> Add emission</span>',
                    headerClick: event => {
                        if (onAdd && event.target.closest('#osy-addEmis')) onAdd();
                    },
                    widthGrow: 10,
                    minWidth: 85,
                    action: {
                        html: '<span class="osy-datagrid-action deleteEmis"><i class="fa fa-times danger"></i> Delete</span>',
                        visible: emis => emissions.indexOf(emis) !== 0,
                        onClick: emis => {
                            if (onDelete) onDelete(emis);
                        }
                    }
                }
            ],
            onChange: onChange,
            onInvalid: message => Message.smallBoxWarning('Input message', message, 3000)
        });
        return this.emisGridInstance;
    }

    // Storage on the shared grid: the technology columns hold one TechId each and may be empty.
    static stgGrid(storages, techs, techNames, {onChange = null, onAdd = null, onDelete = null} = {}) {
        let uniqueName = (value, storage) => storages.some(other => other !== storage && String(other.Stg).trim() == value)
            ? 'Storage name should be unique!' : null;
        let technologies = {
            options: () => [{ value: '', text: '' }].concat(techs.map(tech => ({ value: tech.TechId, text: tech.Tech, title: tech.Desc }))),
            label: id => techNames[id] || id || ''
        };
        let operations = {
            options: () => STORAGE_OPERATIONS.map(operation => ({ value: operation, text: operation })),
            label: operation => operation || ''
        };

        if (this.stgGridInstance) this.stgGridInstance.destroy();
        this.stgGridInstance = new DataGrid('#osy-gridStg', {
            rows: storages,
            key: storage => storage.StgId,
            rangeSelection: false,
            layout: 'fitColumns',
            height: 'auto',
            columns: [
                { title: 'Storage name', field: 'Stg', sortable: true, menu: true, widthGrow: 20, minWidth: 110, text: { validate: uniqueName } },
                { title: 'Description', field: 'Desc', widthGrow: 20, minWidth: 130, text: {} },
                { title: 'Unit', field: 'UnitId', hozAlign: 'center', widthGrow: 10, minWidth: 80, select: this.unitColumn() },
                { title: 'Technology to storage', field: 'TTS', hozAlign: 'center', widthGrow: 15, minWidth: 110, select: technologies },
                { title: 'Technology from storage', field: 'TFS', hozAlign: 'center', widthGrow: 15, minWidth: 110, select: technologies },
                { title: 'Storage operations', field: 'Operation', hozAlign: 'center', widthGrow: 10, minWidth: 95, select: operations },
                {
                    titleHtml: '<span id="osy-addStg" class="btn btn-white btn-osy btn-xs"><i class="fa fa-plus"></i> Add storage</span>',
                    headerClick: event => {
                        if (onAdd && event.target.closest('#osy-addStg')) onAdd();
                    },
                    widthGrow: 10,
                    minWidth: 85,
                    action: {
                        html: '<span class="osy-datagrid-action deleteStg"><i class="fa fa-times danger"></i> Delete</span>',
                        onClick: storage => {
                            if (onDelete) onDelete(storage);
                        }
                    }
                }
            ],
            onChange: onChange,
            onInvalid: message => Message.smallBoxWarning('Input message', message, 3000)
        });
        return this.stgGridInstance;
    }

    // Scenarios on the shared grid: the base scenario is the first row and cannot be deleted.
    static scenarioGrid(scenarios, {onChange = null, onAdd = null, onDelete = null} = {}) {
        let uniqueName = (value, scenario) => scenarios.some(other => other !== scenario && String(other.Scenario).trim() == value)
            ? 'Scenario name should be unique!' : null;

        if (this.scenarioGridInstance) this.scenarioGridInstance.destroy();
        this.scenarioGridInstance = new DataGrid('#osy-gridScenario', {
            rows: scenarios,
            key: scenario => scenario.ScenarioId,
            rangeSelection: false,
            layout: 'fitColumns',
            height: 'auto',
            columns: [
                { title: 'Scenario name', field: 'Scenario', sortable: true, menu: true, widthGrow: 20, minWidth: 120, text: { validate: uniqueName } },
                { title: 'Description', field: 'Desc', widthGrow: 70, minWidth: 200, text: {} },
                {
                    titleHtml: '<span id="osy-addScenario" class="btn btn-white btn-osy btn-xs"><i class="fa fa-plus"></i> Add scenario</span>',
                    headerClick: event => {
                        if (onAdd && event.target.closest('#osy-addScenario')) onAdd();
                    },
                    widthGrow: 10,
                    minWidth: 85,
                    action: {
                        html: '<span class="osy-datagrid-action deleteScenario"><i class="fa fa-times danger"></i> Delete</span>',
                        visible: scenario => scenarios.indexOf(scenario) !== 0,
                        onClick: scenario => {
                            if (onDelete) onDelete(scenario);
                        }
                    }
                }
            ],
            onChange: onChange,
            onInvalid: message => Message.smallBoxWarning('Input message', message, 3000)
        });
        return this.scenarioGridInstance;
    }

    // Constraints on the shared grid: Tag is stored as a number and Technology holds a list of TechIds.
    static constraintGrid(techs, constraints, techNames, {onChange = null, onAdd = null, onDelete = null} = {}) {
        let uniqueName = (value, constraint) => constraints.some(other => other !== constraint && String(other.Con).trim() == value)
            ? 'Constraint name should be unique!' : null;
        let tagNames = {};
        $.each(TAGS, function (index, tag) { tagNames[tag.id] = tag.name; });
        let tags = {
            numeric: true,
            options: () => TAGS.map(tag => ({ value: tag.id, text: tag.name })),
            label: id => tagNames[id] || ''
        };
        let technologies = {
            options: () => techs.map(tech => ({ value: tech.TechId, text: tech.Tech, title: tech.Desc })),
            label: ids => (ids || []).map(id => techNames[id] || id).join(', ')
        };

        if (this.constraintGridInstance) this.constraintGridInstance.destroy();
        this.constraintGridInstance = new DataGrid('#osy-gridConstraint', {
            rows: constraints,
            key: constraint => constraint.ConId,
            rangeSelection: false,
            layout: 'fitColumns',
            height: 'auto',
            columns: [
                { title: 'Constraint name', field: 'Con', sortable: true, menu: true, widthGrow: 20, minWidth: 120, text: { validate: uniqueName } },
                { title: 'Description', field: 'Desc', widthGrow: 40, minWidth: 150, text: {} },
                { title: 'Tag', field: 'Tag', hozAlign: 'center', widthGrow: 10, minWidth: 90, select: tags },
                { title: 'Technology', field: 'CM', hozAlign: 'center', widthGrow: 20, minWidth: 110, multi: technologies },
                {
                    titleHtml: '<span id="osy-addConstraint" class="btn btn-white btn-osy btn-xs"><i class="fa fa-plus"></i> Add constraint</span>',
                    headerClick: event => {
                        if (onAdd && event.target.closest('#osy-addConstraint')) onAdd();
                    },
                    widthGrow: 10,
                    minWidth: 95,
                    action: {
                        html: '<span class="osy-datagrid-action deleteConstraint"><i class="fa fa-times danger"></i> Delete</span>',
                        onClick: constraint => {
                            if (onDelete) onDelete(constraint);
                        }
                    }
                }
            ],
            onChange: onChange,
            onInvalid: message => Message.smallBoxWarning('Input message', message, 3000)
        });
        return this.constraintGridInstance;
    }

    // Indicators on the shared grid: the commodities column stays hidden, as it was under jqxGrid.
    static indicatorGrid(techs, comms, indicators, indicatorTypes, techNames, commNames, {onChange = null, onAdd = null, onDelete = null} = {}) {
        let uniqueName = (value, indicator) => indicators.some(other => other !== indicator && String(other.Indicator).trim() == value)
            ? 'Indicator name should be unique!' : null;
        let typeNames = {};
        $.each(indicatorTypes, function (index, type) { typeNames[type.id] = type.value; });
        let names = lookup => ids => (ids || []).map(id => lookup[id] || id).join(', ');

        if (this.indicatorGridInstance) this.indicatorGridInstance.destroy();
        this.indicatorGridInstance = new DataGrid('#osy-gridIndicator', {
            rows: indicators,
            key: indicator => indicator.IndicatorId,
            rangeSelection: false,
            layout: 'fitColumns',
            height: 'auto',
            columns: [
                { title: 'Indicator name', field: 'Indicator', sortable: true, menu: true, widthGrow: 15, minWidth: 120, text: { validate: uniqueName } },
                { title: 'Description', field: 'Desc', widthGrow: 20, minWidth: 130, text: {} },
                {
                    title: 'Type', field: 'IndicatorTypeId', hozAlign: 'center', widthGrow: 20, minWidth: 110,
                    select: { options: () => indicatorTypes.map(type => ({ value: type.id, text: type.value })), label: id => typeNames[id] || id || '' }
                },
                {
                    title: 'Technologies', field: 'Techs', hozAlign: 'center', widthGrow: 35, minWidth: 130,
                    multi: { options: () => techs.map(tech => ({ value: tech.TechId, text: tech.Tech, title: tech.Desc })), label: names(techNames) }
                },
                {
                    title: 'Commodities', field: 'Comms', hozAlign: 'center', visible: false, widthGrow: 20, minWidth: 110,
                    multi: { options: () => comms.map(comm => ({ value: comm.CommId, text: comm.Comm, title: comm.Desc })), label: names(commNames) }
                },
                {
                    titleHtml: '<span id="osy-addIndicator" class="btn btn-white btn-osy btn-xs"><i class="fa fa-plus"></i> Add indicator</span>',
                    headerClick: event => {
                        if (onAdd && event.target.closest('#osy-addIndicator')) onAdd();
                    },
                    widthGrow: 10,
                    minWidth: 95,
                    action: {
                        html: '<span class="osy-datagrid-action deleteIndicator"><i class="fa fa-times danger"></i> Delete</span>',
                        onClick: indicator => {
                            if (onDelete) onDelete(indicator);
                        }
                    }
                }
            ],
            onChange: onChange,
            onInvalid: message => Message.smallBoxWarning('Input message', message, 3000)
        });
        return this.indicatorGridInstance;
    }

    static Grid($div, daGrid, columns, {groupable = false, filterable = false, clipboard = true, editable=true, pageable=false, sortable= false, autoshowfiltericon=true, autoheight= false, height = $(window).height() - 205}={}) {
        //setting page size
        // let pagesize = JSON.parse(localStorage.getItem("osy-pagesize"));
        // if(!pagesize){
        //     pagesize = '20';
        // }
        //let height = $(window).height() - 255;
        $div.jqxGrid({
            theme: this.theme(),
            width: '100%',
            //height:71+count*26,
            autoheight: autoheight,
            height: height,
            autoshowloadelement: true,
            showdefaultloadelement: true,
            rowsheight: 30,
            source: daGrid,
            columnsautoresize: true,
            columnsresize: true,
            groupable: groupable,
            filterable: filterable,
            autoshowfiltericon: autoshowfiltericon,
            sortable: sortable,
            pageable: pageable,
            // pagesize: pagesize,
            // pagesizeoptions: ['20', '100', '250', '500', '750', '1000'],
            // pagermode: "simple",
            //filtermode: 'excel',
            enableellipsis: true,
            enablekeyboarddelete: false,
            editable: editable,
            altrows: true,
            clipboard: clipboard,
            selectionmode: 'multiplecellsadvanced',
            enablehover: true,
            editmode: 'selectedcell',
            showsortcolumnbackground: false,
            showfiltercolumnbackground: false,
            autoshowcolumnsmenubutton: false,
            scrollmode: 'logical',
            // virtualmode: true,
            // rendergridrows: rendergridrows,
            cellhover: function (element, pageX, pageY, record) {

                //var cellValue = $(element.innerHTML).find('span').html(); // you can remove if any element not required in tooltip here
                var cellValue = $(element.innerHTML).text();

                let tootltipValue;
                var tooltipContent
                $.each(daGrid.records, function (id, obj) {
                    if (obj.Sc == cellValue) {
                        tootltipValue = obj.ScDesc;
                        tooltipContent = "<div>" + tootltipValue + "</div>";
                        return;

                    }
                    else if (obj.Tech == cellValue) {
                        tootltipValue = obj.TechDesc;
                        tooltipContent = "<div>" + tootltipValue + "</div>";
                        return;
                    }
                    else if (obj.Comm == cellValue) {
                        tootltipValue = obj.CommDesc;
                        tooltipContent = "<div>" + tootltipValue + "</div>";
                        return;
                    }
                    else if (obj.Emis == cellValue) {
                        tootltipValue = obj.EmiDesc;
                        tooltipContent = "<div>" + tootltipValue + "</div>";
                        return;
                    }
                    else if (obj.Con == cellValue) {
                        tootltipValue = obj.ConDesc;
                        tooltipContent = "<div>" + tootltipValue + "</div>";
                        return;
                    }
                });

                if (tootltipValue && tootltipValue.trim().length > 0) {
                    $(element).jqxTooltip({ content: tooltipContent });
                    $(element).jqxTooltip('open', pageX + 15, pageY + 15);
                } else {
                    $div.jqxTooltip('close');
                }
            },

            columns: columns          
            
        });

    }

    static VirtualGrid($div, daGrid, columns, gridrows, groupable = false, filterable = false, clipboard = true, editable=true) {

        var generatedata = function (startindex, endindex) {
            var data = {};
            for (var i = startindex; i < endindex; i++) {
                data[i] = gridrows[i];
            }
            return data;
        }

        var rendergridrows = function (params) {
            var data = generatedata(params.startindex, params.endindex);
            return data;
        }

        $div.jqxGrid({
            theme: this.theme(),
            width: '100%',
            //height:71+count*26,
            autoheight: true,
            autoshowloadelement: true,
            rowsheight: 30,
            source: daGrid,
            columnsautoresize: true,
            columnsresize: true,
            //groupable: groupable,
            filterable: filterable,
            autoshowfiltericon: false,
            sortable: true,
            //pageable: true,
            // pagesize: '20',
            // pagesizeoptions: ['20', '100', '250', '500', '750', '1000'],
            // pagermode: "simple",
            virtualmode: true,
            //filtermode: 'excel',
            autoshowfiltericon: false,
            enableellipsis: true,
            enablekeyboarddelete: false,
            editable: editable,
            altrows: true,
            clipboard: clipboard,
            selectionmode: 'multiplecellsadvanced',
            enablehover: true,
            editmode: 'selectedcell',
            showsortcolumnbackground: false,
            showfiltercolumnbackground: false,
            autoshowfiltericon: true,
            virtualmode: true,
            rendergridrows: rendergridrows,
            cellhover: function (element, pageX, pageY, record) {

                //var cellValue = $(element.innerHTML).find('span').html(); // you can remove if any element not required in tooltip here
                var cellValue = $(element.innerHTML).text();

                let tootltipValue;
                var tooltipContent
                $.each(daGrid.records, function (id, obj) {
                    if (obj.Sc == cellValue) {
                        tootltipValue = obj.ScDesc;
                        tooltipContent = "<div>" + tootltipValue + "</div>";
                        return;

                    }
                    else if (obj.Tech == cellValue) {
                        tootltipValue = obj.TechDesc;
                        tooltipContent = "<div>" + tootltipValue + "</div>";
                        return;
                    }
                    else if (obj.Comm == cellValue) {
                        tootltipValue = obj.CommDesc;
                        tooltipContent = "<div>" + tootltipValue + "</div>";
                        return;
                    }
                    else if (obj.Emis == cellValue) {
                        tootltipValue = obj.EmiDesc;
                        tooltipContent = "<div>" + tootltipValue + "</div>";
                        return;
                    }
                    else if (obj.Con == cellValue) {
                        tootltipValue = obj.ConDesc;
                        tooltipContent = "<div>" + tootltipValue + "</div>";
                        return;
                    }
                });

                if (tootltipValue && tootltipValue.trim().length > 0) {
                    $(element).jqxTooltip({ content: tooltipContent });
                    $(element).jqxTooltip('open', pageX + 15, pageY + 15);
                } else {
                    $div.jqxTooltip('close');
                }
            },

            columns: columns
        });

    }

    // TEST FILTER 
    static applyGridFilter($divGrid, years, sc = null) {
        $divGrid.jqxGrid('clearfilters');
        //filter column 2
        if (sc !== null) {
            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRFilter($divGrid, sc = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $divGrid.jqxGrid('addfilter', 'value', filtergroup1);

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRTFilter($divGrid, techs, sc = null, param = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && param != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = param;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Param', filtergroup3);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(techs, function (id, tech) {
            $divGrid.jqxGrid('addfilter', tech.TechId, filtergroup1);
        });
        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }
    
    static applyRSTMFilter($divGrid, sc = null, param = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && param != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = param;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Param', filtergroup3);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';
        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $divGrid.jqxGrid('addfilter', 'Value', filtergroup1);
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRSFilter($divGrid, stgs, sc = null, param = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && param != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = param;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Param', filtergroup3);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(stgs, function (id, stg) {
            $divGrid.jqxGrid('addfilter', stg.StgId, filtergroup1);
        });
        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }
    static applyREFilter($divGrid, emis, sc = null, param = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && param != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = param;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Param', filtergroup3);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(emis, function (id, emi) {
            $divGrid.jqxGrid('addfilter', emi.EmisId, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }
    
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////Legacy filters
    static applyRYFilter($divGrid, years, sc = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRYCFilter($divGrid, years, sc = null, comm = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && comm != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = comm;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Comm', filtergroup3);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRYCnFilter($divGrid, years, sc = null, con = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && con != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = con;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Con', filtergroup3);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRYEFilter($divGrid, years, sc = null, emi = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && emi != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = emi;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Emis', filtergroup3);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRYTFilter($divGrid, years, sc = null, tech = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && tech != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = tech;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Tech', filtergroup3);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRYTMFilter($divGrid, years, sc = null, tech = null, mo = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && mo != null && tech != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = mo;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'MoId', filtergroup3);

            var filtergroup4 = new $.jqx.filter();
            filtergroup4.operator = 'and';
            var filtertype4 = 'stringfilter';
            var filter_or_operator4 = 0;
            var filtervalue4 = tech;
            var filtercondition4 = 'EQUAL_CASE_SENSITIVE';

            var filter4 = filtergroup4.createfilter(filtertype4, filtervalue4, filtercondition4);
            filtergroup4.addfilter(filter_or_operator4, filter4);
            $divGrid.jqxGrid('addfilter', 'Tech', filtergroup4);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRYTsFilter($divGrid, years, sc = null, ts = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && ts != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = ts;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'YearSplit', filtergroup3);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRYTTsFilter($divGrid, years, sc = null, tech = null, ts = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && ts != null && tech != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = ts;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Timeslice', filtergroup3);

            var filtergroup4 = new $.jqx.filter();
            filtergroup4.operator = 'and';
            var filtertype4 = 'stringfilter';
            var filter_or_operator4 = 0;
            var filtervalue4 = tech;
            var filtercondition4 = 'EQUAL_CASE_SENSITIVE';

            var filter4 = filtergroup4.createfilter(filtertype4, filtervalue4, filtercondition4);
            filtergroup4.addfilter(filter_or_operator4, filter4);
            $divGrid.jqxGrid('addfilter', 'Tech', filtergroup4);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRYTCFilter($divGrid, years, sc = null, tech = null, comm = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && comm != null && tech != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = comm;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Comm', filtergroup3);

            var filtergroup4 = new $.jqx.filter();
            filtergroup4.operator = 'and';
            var filtertype4 = 'stringfilter';
            var filter_or_operator4 = 0;
            var filtervalue4 = tech;
            var filtercondition4 = 'EQUAL_CASE_SENSITIVE';

            var filter4 = filtergroup4.createfilter(filtertype4, filtervalue4, filtercondition4);
            filtergroup4.addfilter(filter_or_operator4, filter4);
            $divGrid.jqxGrid('addfilter', 'Tech', filtergroup4);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRYTCnFilter($divGrid, years, sc = null, tech = null, con = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && con != null && tech != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = con;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Con', filtergroup3);

            var filtergroup4 = new $.jqx.filter();
            filtergroup4.operator = 'and';
            var filtertype4 = 'stringfilter';
            var filter_or_operator4 = 0;
            var filtervalue4 = tech;
            var filtercondition4 = 'EQUAL_CASE_SENSITIVE';

            var filter4 = filtergroup4.createfilter(filtertype4, filtervalue4, filtercondition4);
            filtergroup4.addfilter(filter_or_operator4, filter4);
            $divGrid.jqxGrid('addfilter', 'Tech', filtergroup4);
        }
        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRYTEFilter($divGrid, years, sc = null, tech = null, emi = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && emi != null && tech != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = emi;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Emis', filtergroup3);

            var filtergroup4 = new $.jqx.filter();
            filtergroup4.operator = 'and';
            var filtertype4 = 'stringfilter';
            var filter_or_operator4 = 0;
            var filtervalue4 = tech;
            var filtercondition4 = 'EQUAL_CASE_SENSITIVE';

            var filter4 = filtergroup4.createfilter(filtertype4, filtervalue4, filtercondition4);
            filtergroup4.addfilter(filter_or_operator4, filter4);
            $divGrid.jqxGrid('addfilter', 'Tech', filtergroup4);
        }
        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyRYCTsFilter($divGrid, years, sc = null, comm = null, ts = null) {
        //$('#jqxLoader').jqxLoader('open');
        //$("#jqxLoader").jqxLoader({theme: 'darkblue', imagePosition:"top", isModal:true,width: 500, height: 70, text: "Uploading Hourly Data Paterns..." });
        $divGrid.jqxGrid('clearfilters');

        //filter column 2
        if (sc !== null && ts != null && comm != null) {

            var filtergroup2 = new $.jqx.filter();
            filtergroup2.operator = 'and';
            var filtertype2 = 'stringfilter';
            var filter_or_operator2 = 0;
            var filtervalue2 = sc;
            var filtercondition2 = 'EQUAL_CASE_SENSITIVE';

            var filter2 = filtergroup2.createfilter(filtertype2, filtervalue2, filtercondition2);
            filtergroup2.addfilter(filter_or_operator2, filter2);
            $divGrid.jqxGrid('addfilter', 'Sc', filtergroup2);

            var filtergroup3 = new $.jqx.filter();
            filtergroup3.operator = 'and';
            var filtertype3 = 'stringfilter';
            var filter_or_operator3 = 0;
            var filtervalue3 = ts;
            var filtercondition3 = 'EQUAL_CASE_SENSITIVE';

            var filter3 = filtergroup3.createfilter(filtertype3, filtervalue3, filtercondition3);
            filtergroup3.addfilter(filter_or_operator3, filter3);
            $divGrid.jqxGrid('addfilter', 'Timeslice', filtergroup3);

            var filtergroup4 = new $.jqx.filter();
            filtergroup4.operator = 'and';
            var filtertype4 = 'stringfilter';
            var filter_or_operator4 = 0;
            var filtervalue4 = comm;
            var filtercondition4 = 'EQUAL_CASE_SENSITIVE';

            var filter4 = filtergroup4.createfilter(filtertype4, filtervalue4, filtercondition4);
            filtergroup4.addfilter(filter_or_operator4, filter4);
            $divGrid.jqxGrid('addfilter', 'Comm', filtergroup4);
        }

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyViewDataFilter($divGrid, years) {

        $divGrid.jqxGrid('clearfilters');

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $.each(years, function (id, year) {
            $divGrid.jqxGrid('addfilter', year, filtergroup1);
        });

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
    }

    static applyTEviewDataFilter($divGrid) {
        $divGrid.jqxGrid('clearfilters');

        //filter colum 1 null values
        var filtergroup1 = new $.jqx.filter();
        filtergroup1.operator = 'or';
        var filtertype1 = 'numericfilter';
        var filter_or_operator1 = 1;
        var filtervalue1 = null;
        var filtercondition1 = 'NOT_NULL';

        var filter1 = filtergroup1.createfilter(filtertype1, filtervalue1, filtercondition1);
        filtergroup1.addfilter(filter_or_operator1, filter1);
        $divGrid.jqxGrid('addfilter', 'value', filtergroup1);

        // // apply the filters.
        $divGrid.jqxGrid('applyfilters');
        //$('#loadermain').hide(); 
    }
}
