import { DataModel } from "../../Classes/DataModel.Class.js";

export class Model {

    constructor(casename, genData, RYTsdata, group, PARAMETERS, param) {
        this.d = 3;
        if (casename) {

            let years = genData['osy-years'];
            let scenarios = genData['osy-scenarios'];

            //let timeslices = DataModel.Timeslices(genData);
            let RYDtbgrid = DataModel.RYDtbgrid(genData, RYTsdata);
            //let RYTschart = DataModel.RYTschart(genData, RYTsdata);

            let scClass = {};

            //datafieldsChart.push({ name: 'Year', type: 'string' });
            $.each(scenarios, function (id, obj) {
                scClass[obj.ScenarioId] = 'SC_' + id;
                //datafieldsChart.push({ name: obj.ScenarioId, type: 'number' });
                //series.push({ dataField: obj.ScenarioId, displayText: obj.Scenario });
            });

            // Every RYDtb parameter must be zero or more.
            let validate = value => value >= 0 ? null : 'Value must be positive!';
            // The base scenario always needs a value; an empty override falls back to the scenario below it.
            let nullable = row => row.ScId !== 'SC_0';

            // Columns share the width so the grid fills the page, scrolling only once the years hit their minimum.
            let columns = [
                { title: 'Scenario', field: 'Sc', frozen: true, sortable: true, widthGrow: 1.2, minWidth: 70, tooltipField: 'ScDesc' },
                { title: 'Dailytimebracket', field: 'Dtb', frozen: true, hozAlign: 'center', sortable: true, widthGrow: 1.6, minWidth: 90 }
            ];
            $.each(years, function (id, year) {
                columns.push({ title: year, field: year, widthGrow: 1, minWidth: 55, number: { nullable: nullable, validate: validate } });
            });


            let PARAMNAMES = {};
            $.each(PARAMETERS[group], function (id, obj) {
                PARAMNAMES[obj.id] = obj.value;
            });

            this.casename = casename;
            this.years = years;
            this.scenarios = scenarios;
            this.scenariosCount = scenarios.length;
            this.columns = columns;
            this.rowClass = row => scClass[row.ScId];
            this.gridData = RYDtbgrid;
            this.genData = genData;
            this.param = param;
            this.PARAMNAMES = PARAMNAMES;
            this.group = group;
            this.PARAMETERS = PARAMETERS;
        } else {
            this.casename = null;
            this.years = null;
            this.columns = null;
            this.gridData = null;
            this.genData = null;
            this.param = param;
            this.PARAMNAMES = PARAMNAMES;
            this.group = group;
            this.PARAMETERS = PARAMETERS;
        }

    }
}