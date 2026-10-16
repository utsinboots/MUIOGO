import { Message } from "../../Classes/Message.Class.js";
import { Base } from "../../Classes/Base.Class.js";
import { Html } from "../../Classes/Html.Class.js";
import { Model } from "../Model/RYS.Model.js";
import { DataGrid } from "../../Classes/DataGrid.Class.js";
import { Osemosys } from "../../Classes/Osemosys.Class.js";
import { GROUPNAMES } from "../../Classes/Const.Class.js";
import { DEF } from "../../Classes/Definition.Class.js";
import { MessageSelect } from "./MessageSelect.js";

export default class RYS {
    static onLoad(group, param) {
        Message.loaderStart('Loading data...');
        Base.getSession()
            .then(response => {
                let start = performance.now();
                let casename = response['session'];
                if (casename) {
                    const promise = [];
                    promise.push(casename);
                    const genData = Osemosys.getData(casename, 'genData.json');
                    promise.push(genData);
                    const PARAMETERS = Osemosys.getParamFile();
                    promise.push(PARAMETERS);
                    const RYTdata = Osemosys.getData(casename, 'RYS.json');
                    promise.push(RYTdata);
                    promise.push(start);
                    //console.log('performance get data from API ', performance.now() - start);

                    return Promise.all(promise);
                } else {
                    Message.loaderEnd();
                    MessageSelect.init(RYS.refreshPage.bind(RYS));
                }
            })
            .then(data => {
                let [casename, genData, PARAMETERS, RYSdata, start] = data;
                //console.log('performance read data from promise ', performance.now() - start);
                let model = new Model(casename, genData, RYSdata, group, PARAMETERS, param);
                //console.log('performance model ', performance.now() - start);
                this.initPage(model);
                //console.log('performance idit page ', performance.now() - start);
                this.initEvents(model);
                //console.log('performance events ', performance.now() - start);
            })
            .catch(error => {
                Message.loaderEnd();
                Message.warning(error);
            });
    }


    static initPage(model) {
        Message.clearMessages();
        //Navbar.initPage(model.casename);
        Html.title(model.casename, model.PARAMNAMES[model.param], GROUPNAMES[model.group]);
        Html.ddlParams(model.PARAMETERS[model.group], model.param);

        // A model switch rebuilds the page in place, so the previous grid is released first.
        if (RYS.grid) RYS.grid.destroy();
        RYS.grid = new DataGrid('#osy-gridRYS', {
            rows: model.gridData[model.param],
            columns: model.columns,
            key: row => row.ScId + '|' + row.StgId,
            layout: 'fitColumns',
            decimals: model.d,
            rowClass: model.rowClass,
            onInvalid: message => Message.smallBoxWarning('Validation', message, 3000)
        });

        if (model.scenariosCount > 1) {
            Html.lblScenario( model.scenariosCount);
            Html.ddlScenarios(model.scenarios, model.scenarios[1]['ScenarioId']);
            RYS.applyScenarioFilter(model);
        }
    }

    // As with the jqxGrid filters: show rows with at least one value, plus every row of an opened scenario.
    static applyScenarioFilter(model, sc = null) {
        RYS.grid.setRowFilter(row => (sc !== null && row.Sc === sc) ||
            model.years.some(year => row[year] !== null && row[year] !== undefined));
    }

    static refreshPage(casename) {
        Message.loaderStart('Loading data...');
        Base.setSession(casename)
            .then(response => {
                const promise = [];
                promise.push(casename);
                const genData = Osemosys.getData(casename, 'genData.json');
                promise.push(genData);
                const PARAMETERS = Osemosys.getParamFile();
                promise.push(PARAMETERS);
                const RYTdata = Osemosys.getData(casename, 'RYS.json');
                promise.push(RYTdata);
                return Promise.all(promise);
            })
            .then(data => {
                let [casename, genData, PARAMETERS, RYSdata] = data;
                let model = new Model(casename, genData, RYSdata, 'RYS', PARAMETERS, PARAMETERS['RYS'][0]['id']);
                this.initPage(model);
                this.initEvents(model);
            })
            .catch(error => {
                Message.loaderEnd();
                Message.warning(error);
            });
    }

    static initEvents(model) {

        $("#casePicker").off('click');
        $("#casePicker").on('click', '.selectCS', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            var casename = $(this).attr('data-ps');
            Html.updateCasePicker(casename);
            RYS.refreshPage(casename);
            Message.smallBoxConfirmation("Confirmation!", "Model " + casename + " selected!", 3500);
        });

        // Unbound first: refreshPage runs initEvents again, which used to attach a second save handler.
        $("#osy-saveRYSdata").off('click');
        $("#osy-saveRYSdata").on('click', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            let param = $("#osy-ryt").val();

            // The grid writes every edit back to model.gridData, so it is the data that is saved.
            let saveData = {};
            $.each(model.gridData[param], function (id, obj) {
                if (!saveData[obj.ScId]) { saveData[obj.ScId] = []; }
                let row = { StgId: obj.StgId };
                $.each(model.years, function (i, year) {
                    row[year] = obj[year];
                });
                saveData[obj.ScId].push(row);
            });

            Osemosys.updateData(saveData, param, "RYS.json")
                .then(response => {
                    Message.bigBoxSuccess('Model message', response.message, 3000);
                    //sync S3
                    if (Base.AWS_SYNC == 1) {
                        Base.updateSync(model.casename, "RYS.json");
                    }
                })
                .catch(error => {
                    Message.bigBoxDanger('Error message', error, null);
                })
        });

        //change of ddl parameters
        $('#osy-ryt').off('change');
        $('#osy-ryt').on('change', function () {
            Html.title(model.casename, model.PARAMNAMES[this.value], GROUPNAMES[model.group]);
            model.param = this.value;
            RYS.grid.setRows(model.gridData[model.param]);
            RYS.applyScenarioFilter(model);
            Html.lblScenario( model.scenariosCount);
            $('#definition').html(`${DEF[model.group][model.param].definition}`);
        });

        $("#osy-scenarios").off('click');
        $("#osy-scenarios").on('click', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
        });

        $("#osy-openScData").off('click');
        $("#osy-openScData").on('click', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            var sc = $("#osy-scenarios").val();
            Html.lblScenario(sc);
            RYS.applyScenarioFilter(model, sc);
            Message.smallBoxInfo('Info', 'Scenario data opened!', 2000);
        });

        $("#osy-hideScData").off('click');
        $("#osy-hideScData").on('click', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            Html.lblScenario( model.scenariosCount);
            RYS.applyScenarioFilter(model);
            Message.smallBoxInfo('Info', 'Scenario data hidden!', 2000);
        });

        $("#osy-removeScData").off('click');
        $("#osy-removeScData").on('click', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            var sc = $("#osy-scenarios").val();

            $.each(model.gridData[model.param], function (id, obj) {
                if (obj.Sc == sc) {
                    $.each(model.years, function (i, year) {
                        obj[year] = null;
                    });
                }
            });

            RYS.grid.setRows(model.gridData[model.param]);

            Html.lblScenario( model.scenariosCount);
            RYS.applyScenarioFilter(model);
            Message.smallBoxInfo('Info', 'Scenario data removed!', 2000);
        });

        $("#resizeColumns").off('click');
        let res = true;
        $("#resizeColumns").click(function () {
            if (res) {
                RYS.grid.fitColumns(['Stg', 'Sc']);
            }
            else {
                RYS.grid.fitColumns();
            }
            res = !res;
        });

        $("#xlsAll").off('click');
        $("#xlsAll").click(function (e) {
            e.preventDefault();
            let rysData = RYS.grid.visibleRows();
            let data = JSON.parse(JSON.stringify(rysData, ['Sc', 'Stg'].concat(model.years)));

            Base.prepareCSV(model.casename, data)
            .then(response =>{
                Message.smallBoxInfo('Case study message', response.message, 3000);
                $('#csvDownload').trigger('click');
                window.location = $('#csvDownload').attr('href');
            })
            .catch(error=>{
                Message.bigBoxDanger('Error message', error, null);
            })
        });

        $("#decUp").off('click');
        $("#decUp").on('click', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            model.d = DataGrid.clampDecimals(model.d + 1);
            RYS.grid.setDecimals(model.d);
        });

        $("#decDown").off('click');
        $("#decDown").on('click', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            model.d = DataGrid.clampDecimals(model.d - 1);
            RYS.grid.setDecimals(model.d);
        });

        $("#showLog").off('click');
        $("#showLog").on('click', function (e) {
            e.preventDefault();
            $('#definition').html(`${DEF[model.group][model.param].definition}`);
            $('#definition').toggle('slow');
        });
        Message.loaderEnd();
    }
}