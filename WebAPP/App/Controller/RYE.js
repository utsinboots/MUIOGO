import { Message } from "../../Classes/Message.Class.js";
import { Base } from "../../Classes/Base.Class.js";
import { Html } from "../../Classes/Html.Class.js";
import { Model } from "../Model/RYE.Model.js";
import { DataGrid } from "../../Classes/DataGrid.Class.js";
import { Osemosys } from "../../Classes/Osemosys.Class.js";
import { GROUPNAMES } from "../../Classes/Const.Class.js";
import { DEF } from "../../Classes/Definition.Class.js";
import { MessageSelect } from "./MessageSelect.js";

export default class RYE {
    static onLoad(group, param) {
        Message.loaderStart('Loading data...');
        Base.getSession()
            .then(response => {
                let casename = response['session'];
                if (casename) {
                    const promise = [];
                    promise.push(casename);
                    const genData = Osemosys.getData(casename, 'genData.json');
                    promise.push(genData);
                    const PARAMETERS = Osemosys.getParamFile();
                    promise.push(PARAMETERS);
                    const RYEdata = Osemosys.getData(casename, 'RYE.json');
                    promise.push(RYEdata);
                    return Promise.all(promise);
                    ;
                } else {
                    Message.loaderEnd();
                    MessageSelect.init(RYE.refreshPage.bind(RYE));
                }
            })
            .then(data => {
                let [casename, genData, PARAMETERS, RYEdata] = data;
                let model = new Model(casename, genData, RYEdata, group, PARAMETERS, param);
                this.initPage(model);
                this.initEvents(model);
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
        if (RYE.grid) RYE.grid.destroy();
        RYE.grid = new DataGrid('#osy-gridRYE', {
            rows: model.gridData[model.param],
            columns: model.columns,
            key: row => row.ScId + '|' + row.EmisId,
            layout: 'fitColumns',
            decimals: model.d,
            rowClass: model.rowClass,
            onInvalid: message => Message.smallBoxWarning('Validation', message, 3000)
        });

        if (model.scenariosCount > 1) {
            Html.lblScenario( model.scenariosCount);
            Html.ddlScenarios(model.scenarios, model.scenarios[1]['ScenarioId']);
            RYE.applyScenarioFilter(model);
        }
    }

    // As with the jqxGrid filters: show rows with at least one value, plus every row of an opened scenario.
    static applyScenarioFilter(model, sc = null) {
        RYE.grid.setRowFilter(row => (sc !== null && row.Sc === sc) ||
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
                const RYEdata = Osemosys.getData(casename, 'RYE.json');
                promise.push(RYEdata);
                return Promise.all(promise);
            })
            .then(data => {
                let [casename, genData, PARAMETERS, RYEdata] = data;
                let model = new Model(casename, genData, RYEdata, 'RYE', PARAMETERS, PARAMETERS['RYE'][0]['id']);
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
            RYE.refreshPage(casename);
            Message.smallBoxConfirmation("Confirmation!", "Model " + casename + " selected!", 3500);
        });

        // Unbound first: refreshPage runs initEvents again, which used to attach a second save handler.
        $("#osy-saveRYEdata").off('click');
        $("#osy-saveRYEdata").on('click', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            let param = $("#osy-ryt").val();

            // The grid writes every edit back to model.gridData, so it is the data that is saved.
            let saveData = {};
            $.each(model.gridData[param], function (id, obj) {
                if (!saveData[obj.ScId]) { saveData[obj.ScId] = []; }
                let row = { EmisId: obj.EmisId };
                $.each(model.years, function (i, year) {
                    row[year] = obj[year];
                });
                saveData[obj.ScId].push(row);
            });
            Osemosys.updateData(saveData, param, "RYE.json")
            .then(response => {
                Message.bigBoxSuccess('Model message', response.message, 3000);
                //sync S3
                if (Base.AWS_SYNC == 1) {
                    Base.updateSync(model.casename, "RYE.json");
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
            RYE.grid.setRows(model.gridData[model.param]);
            RYE.applyScenarioFilter(model);
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
            RYE.applyScenarioFilter(model, sc);
            Message.smallBoxInfo('Info', 'Scenario data opened!', 2000);
        });

        $("#osy-hideScData").off('click');
        $("#osy-hideScData").on('click', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            Html.lblScenario( model.scenariosCount);
            RYE.applyScenarioFilter(model);
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
            RYE.grid.setRows(model.gridData[model.param]);
            Html.lblScenario( model.scenariosCount);
            RYE.applyScenarioFilter(model);
            Message.smallBoxInfo('Info', 'Scenario data removed!', 2000);
        });

        let res = true;
        $("#resizeColumns").off('click');
        $("#resizeColumns").click(function () {
            if (res) {
                RYE.grid.fitColumns(['Emis', 'Sc']);
            }
            else {
                RYE.grid.fitColumns();
            }
            res = !res;
        });

        $("#xlsAll").off('click');
        $("#xlsAll").click(function (e) {
            e.preventDefault();

            let ryeData = RYE.grid.visibleRows();
            let data = JSON.parse(JSON.stringify(ryeData, ['Sc', 'Emis', 'UnitId'].concat(model.years)));

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
            RYE.grid.setDecimals(model.d);
        });

        $("#decDown").off('click');
        $("#decDown").on('click', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            model.d = DataGrid.clampDecimals(model.d - 1);
            RYE.grid.setDecimals(model.d);
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