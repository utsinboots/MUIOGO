import { DataModel } from "../../Classes/DataModel.Class.js";
import { Functions } from "../../Classes/Functions.Class.js";

export class Model {

    constructor(casename, genData, RYSdata, group, PARAMETERS, param) {

        let paramData = DataModel.getParamData(PARAMETERS);
        // let decimal = Functions.getDecimalPlaces(paramData[group][param]['default']);
        // this.d = decimal;
        // this.decimal = 'd' + this.d;

        this.d = 3;

        if (casename) {

            let years = genData['osy-years'];
            let stgs = genData['osy-stg'];
            let scenarios = genData['osy-scenarios'];
            this.param = param;

            let RYSgrid = DataModel.RYSgrid(genData, RYSdata, PARAMETERS);
            let PARAMNAMES = DataModel.ParamName(PARAMETERS[group]);

            let scClass = {};
            $.each(scenarios, function (id, obj) {
                scClass[obj.ScenarioId] = 'SC_' + id;
            });

            // Every RYS parameter must be zero or more.
            let validate = value => value >= 0 ? null : 'Value must be positive!';
            // The base scenario always needs a value; an empty override falls back to the scenario below it.
            let nullable = row => row.ScId !== 'SC_0';

            // Columns share the width so the grid fills the page, scrolling only once the years hit their minimum.
            let columns = [
                { title: 'Scenario', field: 'Sc', frozen: true, sortable: true, widthGrow: 1.2, minWidth: 70, tooltipField: 'ScDesc' },
                { title: 'Storage', field: 'Stg', frozen: true, sortable: true, menu: true, widthGrow: 1.6, minWidth: 90, tooltipField: 'StgDesc' },
                { title: 'Unit', field: 'UnitId', frozen: true, hozAlign: 'center', widthGrow: 0.8, minWidth: 55, html: true }
            ];
            $.each(years, function (id, year) {
                columns.push({ title: year, field: year, widthGrow: 1, minWidth: 55, number: { nullable: nullable, validate: validate } });
            });

            this.casename = casename;
            this.years = years;
            this.stgs = stgs;
            this.param = param;
            this.stgCount = stgs.length
            this.scenarios = scenarios;
            this.scenariosCount = scenarios.length;
            this.columns = columns;
            this.rowClass = row => scClass[row.ScId];
            this.gridData = RYSgrid;
            this.genData = genData;
            this.paramData = paramData;
            this.PARAMNAMES = PARAMNAMES;
            this.group = group;
            this.PARAMETERS = PARAMETERS
        } else {
            this.casename = null;
            this.years = null;
            this.stgs = null;
            this.columns = null;
            this.gridData = null;
            this.genData = null;
            this.PARAMNAMES = null;
            this.param = param;
            this.group = group;
            this.PARAMETERS = PARAMETERS
        }

    }
}