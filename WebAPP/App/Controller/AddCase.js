import { Message } from "../../Classes/Message.Class.js";
import { DefaultObj } from "../../Classes/DefaultObj.Class.js";
import { Base } from "../../Classes/Base.Class.js";
import { SyncS3 } from "../../Classes/SyncS3.Class.js";
import { Html } from "../../Classes/Html.Class.js";
import { Grid } from "../../Classes/Grid.Class.js";
import { DataGrid } from "../../Classes/DataGrid.Class.js";
import { Osemosys } from "../../Classes/Osemosys.Class.js";
import { SmartAdmin } from "../../Classes/SmartAdmin.Class.js";
import { Model } from "../Model/AddCase.Model.js";
import { Navbar } from "./Navbar.js";
import { DEF } from "../../Classes/Definition.Class.js";
import { Sidebar } from "./Sidebar.js";
import { NavigationGuard } from "../../Classes/NavigationGuard.Class.js";

export default class AddCase {
    static onLoad() {
        Base.getSession()
            .then(response => {
                let casename = response.session;
                const promise = [];
                let genData = Osemosys.getData(casename, 'genData.json');
                promise.push(genData);
                const resData = Osemosys.getResultData(casename, 'resData.json');
                promise.push(resData);
                const PARAMETERS = Osemosys.getParamFile();
                promise.push(PARAMETERS);
                const INDICATORS = Osemosys.getParamFile('Indicators.json');
                promise.push(INDICATORS);
                return Promise.all(promise);
            })
            .then(data => {
                let [genData, resData, PARAMETERS, INDICATORS] = data;
                let model = new Model(genData, resData, PARAMETERS, INDICATORS, "AddCase");
                
                this.initPage(model);
            })
            .catch(error => {
                Message.danger(error);
            });
    }
    static refreshPage(casename) {
        Base.setSession(casename)
            .then(response => {
                Message.clearMessages();
                const promise = [];
                let genData = Osemosys.getData(casename, 'genData.json');
                promise.push(genData);
                const resData = Osemosys.getResultData(casename, 'resData.json');
                promise.push(resData);
                const PARAMETERS = Osemosys.getParamFile();
                promise.push(PARAMETERS);
                const INDICATORS = Osemosys.getParamFile('Indicators.json');
                promise.push(INDICATORS);
                return Promise.all(promise);
            })
            .then(data => {
                let [genData, resData, PARAMETERS, INDICATORS] = data;
                let model = new Model(genData, resData, PARAMETERS, INDICATORS, "AddCase");
                AddCase.initPage(model);
            })
            .catch(error => {
                Message.bigBoxDanger(error);
            })
    }
    // Collects the model configuration data from the page and returns it as an object
    static getModelConfigurationData(model) {
        const years = [];
        $.each($('input[type="checkbox"]:checked'), function (key, value) {
            years.push($(value).attr("id"));
        });

        return {
            "osy-version": "5.6",
            "osy-casename": $("#osy-casename").val().trim(),
            "osy-desc": $("#osy-desc").val().trim(),
            "osy-date": new Date().toDateString(),
            "osy-currency": $("#osy-currency").val(),
            "osy-mo": $("#osy-mo").val().trim(),
            "osy-tech": model.techs,
            "osy-stg": model.stg,
            "osy-techGroups": model.techGroups,
            "osy-comm": model.commodities,
            "osy-ts": model.timeslices,
            "osy-se": model.seasons,
            "osy-dt": model.daytypes,
            "osy-dtb": model.dailytimebrackets,
            "osy-emis": model.emissions,
            "osy-scenarios": model.scenarios,
            "osy-constraints": model.constraints,
            "osy-indicators": model.indicators,
            "osy-years": years
        };
    }

    // Creates a snapshot used to check for unsaved changes
    static getModelConfigurationSnapshot(model) {
        const data = AddCase.getModelConfigurationData(model);
        delete data["osy-date"];
        return JSON.stringify(data);
    }

    static techChanged(model, tech, field, value) {
        if (field == 'CapUnitId' || field == 'ActUnitId') {
            Message.bigBoxWarning('Unit change warning!', 'Changing technology unit will not recalculate entered nor default values in the model.', 3000);
        }
        if (field == 'Tech') {
            model.techNames[tech.TechId] = value;
        }
    }

    static addTech(model) {
        let defaultTech = DefaultObj.defaultTech();
        //JSON parse stringify gives the new technology its own arrays
        let tech = JSON.parse(JSON.stringify(defaultTech[0], ['TechId', 'Tech', 'Desc', 'CapUnitId', 'ActUnitId', 'TG', 'IAR', 'OAR', "INCR", "ITCR", 'EAR']));
        model.techs.unshift(tech);
        model.techNames[tech.TechId] = tech.Tech;
        Grid.techGrid.addRow(tech);
        model.techCount++;
        $("#techCount").text(model.techCount);
    }

    // Deletes by TechId and removes the technology from constraints, indicators and storage on both paths.
    static deleteTech(model, techId) {
        let tech = model.techs.find(obj => obj.TechId == techId);
        if (!tech) return;
        if (model.techs.length <= 1) {
            Message.bigBoxWarning('Warning', 'You cannot delete. At least one technology is necessary.', 3000);
            return;
        }
        let remove = () => {
            let index = model.techs.findIndex(obj => obj.TechId == techId);
            if (index < 0) return;
            model.techs.splice(index, 1);
            Grid.techGrid.deleteRow(techId);
            delete model.techNames[techId];
            model.techCount--;
            $("#techCount").text(model.techCount);
            $.each(model.constraints, function (id, conObj) {
                conObj['CM'] = conObj['CM'].filter(item => item !== techId);
            });
            $.each(model.indicators, function (id, indObj) {
                indObj['Sets'] = indObj['Sets'].filter(item => item !== techId);
            });
            // Storage holds one technology to and one from storage, each a TechId string, empty as "".
            $.each(model.stg, function (id, stgObj) {
                if (stgObj['TTS'] === techId) { stgObj['TTS'] = ""; }
                if (stgObj['TFS'] === techId) { stgObj['TFS'] = ""; }
            });
        };
        if (tech.TG.length > 0) {
            Message.confirmationDialog('Technology deletion warning', `Technology <b>${tech.Tech}</b> has technology group membership(s). Deleting the technology could impact visualisation of results for previously run cases. Are you sure you want to proceed?`, remove);
        } else {
            remove();
        }
    }

    static techGroupChanged(model, group, field, value) {
        if (field == 'TechGroup') {
            model.techGroupNames[group.TechGroupId] = value;
        }
    }

    static addTechGroup(model) {
        let defaultTechGroup = DefaultObj.defaultTechGroup();
        let group = JSON.parse(JSON.stringify(defaultTechGroup[0], ['TechGroupId', 'TechGroup', 'Desc']));
        model.techGroups.push(group);
        model.techGroupNames[group.TechGroupId] = group.TechGroup;
        Grid.techGroupGridInstance.addRow(group, false);
        model.techGroupCount++;
        $("#techGroupCount").text(model.techGroupCount);
    }

    // Deletes by TechGroupId and drops the group from every technology that belonged to it.
    static deleteTechGroup(model, techGroupId) {
        let index = model.techGroups.findIndex(obj => obj.TechGroupId == techGroupId);
        if (index <= 0) return;
        model.techGroups.splice(index, 1);
        Grid.techGroupGridInstance.deleteRow(techGroupId);
        delete model.techGroupNames[techGroupId];
        model.techGroupCount--;
        $("#techGroupCount").text(model.techGroupCount);
        $.each(model.techs, function (id, techObj) {
            techObj['TG'] = techObj['TG'].filter(item => item !== techGroupId);
        });
        Grid.techGrid.refresh();
    }

    static commodityChanged(model, comm, field, value) {
        if (field == 'UnitId') {
            Message.bigBoxWarning('Unit change warning!', 'Changing commodity unit will not recalculate entered nor default values in the model.', 3000);
        }
        if (field == 'Comm') {
            model.commNames[comm.CommId] = value;
        }
    }

    static addCommodity(model) {
        let defaultComm = DefaultObj.defaultComm();
        let comm = JSON.parse(JSON.stringify(defaultComm[0], ['CommId', 'Comm', 'Desc', 'UnitId']));
        model.commodities.unshift(comm);
        model.commNames[comm.CommId] = comm.Comm;
        Grid.commGridInstance.addRow(comm);
        model.commCount++;
        $("#commCount").text(model.commCount);
    }

    // Deletes by CommId and drops the commodity from every technology that referenced it.
    static deleteCommodity(model, commId) {
        if (model.commodities.length <= 1) {
            Message.bigBoxWarning('Warning', 'You cannot delete. At least one commodity is necessary.', 3000);
            return;
        }
        let index = model.commodities.findIndex(obj => obj.CommId == commId);
        if (index < 0) return;
        model.commodities.splice(index, 1);
        Grid.commGridInstance.deleteRow(commId);
        delete model.commNames[commId];
        model.commCount--;
        $("#commCount").text(model.commCount);
        $.each(model.techs, function (id, techObj) {
            techObj['IAR'] = techObj['IAR'].filter(item => item !== commId);
            techObj['OAR'] = techObj['OAR'].filter(item => item !== commId);
            techObj['INCR'] = techObj['INCR'].filter(item => item !== commId);
            techObj['ITCR'] = techObj['ITCR'].filter(item => item !== commId);
        });
        Grid.techGrid.refresh();
    }

    static emissionChanged(model, emis, field, value) {
        if (field == 'UnitId') {
            Message.bigBoxWarning('Unit change warning!', 'Changing emission unit will not recalculate entered nor default values in the model.', 3000);
        }
        if (field == 'Emis') {
            model.emiNames[emis.EmisId] = value;
        }
    }

    static addEmission(model) {
        let defaultEmi = DefaultObj.defaultEmi();
        let emis = JSON.parse(JSON.stringify(defaultEmi[0], ['EmisId', 'Emis', 'Desc', 'UnitId']));
        model.emissions.push(emis);
        model.emiNames[emis.EmisId] = emis.Emis;
        Grid.emisGridInstance.addRow(emis, false);
        model.emisCount++;
        $("#emisCount").text(model.emisCount);
    }

    // Deletes by EmisId and drops the emission from every technology that referenced it.
    static deleteEmission(model, emisId) {
        let index = model.emissions.findIndex(obj => obj.EmisId == emisId);
        if (index <= 0) return;
        model.emissions.splice(index, 1);
        Grid.emisGridInstance.deleteRow(emisId);
        delete model.emiNames[emisId];
        model.emisCount--;
        $("#emisCount").text(model.emisCount);
        $.each(model.techs, function (id, techObj) {
            techObj['EAR'] = techObj['EAR'].filter(item => item !== emisId);
        });
        Grid.techGrid.refresh();
    }

    // Seasons, day types and daily time brackets differ only in their names and fields.
    static TIME_SETS = {
        season: { label: 'season', rows: 'seasons', names: 'seNames', count: 'seCount', idField: 'SeId', nameField: 'Se',
            sliceField: 'SE', sliceDefault: 'SE_0', create: model => DefaultObj.defaultSe(false, model.seCount), grid: () => Grid.seGridInstance },
        dayType: { label: 'day type', rows: 'daytypes', names: 'dtNames', count: 'dtCount', idField: 'DtId', nameField: 'Dt',
            sliceField: 'DT', sliceDefault: 'DT_0', create: model => DefaultObj.defaultDt(false, model.dtCount), grid: () => Grid.dtGridInstance },
        bracket: { label: 'daily time bracket', rows: 'dailytimebrackets', names: 'dtbNames', count: 'dtbCount', idField: 'DtbId', nameField: 'Dtb',
            sliceField: 'DTB', sliceDefault: 'DTB_0', create: model => DefaultObj.defaultDtb(false, model.dtbCount), grid: () => Grid.dtbGridInstance }
    };

    static addTimeSet(model, kind) {
        let set = AddCase.TIME_SETS[kind];
        let row = JSON.parse(JSON.stringify(set.create(model)[0], [set.idField, set.nameField, 'Desc']));
        model[set.rows].push(row);
        model[set.names][row[set.idField]] = row[set.nameField];
        set.grid().addRow(row, false);
        model[set.count]++;
        $("#" + set.count).text(model[set.count]);
    }

    // Removes the last row, as the counter control did, and points any time slice using it back at the default.
    static removeLastTimeSet(model, kind) {
        let set = AddCase.TIME_SETS[kind];
        if (model[set.count] <= 1) {
            Message.bigBoxWarning('Warning', `You cannot delete. At least one ${set.label} is necessary.`, 3000);
            return;
        }
        let row = model[set.rows][model[set.rows].length - 1];
        let id = row[set.idField];
        model[set.rows].pop();
        set.grid().deleteRow(id);
        delete model[set.names][id];
        $.each(model.timeslices, function (index, slice) {
            if (slice[set.sliceField] == id) slice[set.sliceField] = set.sliceDefault;
        });
        model[set.count]--;
        $("#" + set.count).text(model[set.count]);
    }

    static addScenario(model) {
        let defaultSc = DefaultObj.defaultScenario();
        let scenario = JSON.parse(JSON.stringify(defaultSc[0], ['ScenarioId', 'Scenario', 'Desc', 'Active']));
        model.scenarios.push(scenario);
        model.caserunByScenario[scenario.ScenarioId] = [];
        Grid.scenarioGridInstance.addRow(scenario, false);
        model.scenariosCount++;
        $("#scenariosCount").text(model.scenariosCount);
    }

    // A scenario used by a case run stays; otherwise its runs are cleared on the server first.
    static deleteScenario(model, scenarioId) {
        let index = model.scenarios.findIndex(obj => obj.ScenarioId == scenarioId);
        if (index <= 0) return;
        if (model.caserunByScenario[scenarioId] && model.caserunByScenario[scenarioId].length != 0) {
            Message.bigBoxDanger('Alert',
                `You cannot delete this scenario. It is used in ${model.caserunByScenario[scenarioId]}  caserun(s)!
                Please remove these scenario from caseruns before deletion.`, null);
            return;
        }
        Osemosys.deleteScenarioCaseRuns(model.casename, scenarioId)
            .then(response => {
                model.scenarios.splice(index, 1);
                Grid.scenarioGridInstance.deleteRow(scenarioId);
                model.scenariosCount--;
                $("#scenariosCount").text(model.scenariosCount);
                Message.smallBoxInfo(response.message);
            })
            .catch(error => {
                Message.bigBoxDanger(error);
            });
    }

    static timesliceChanged(model, slice, field, value) {
        if (field == 'Ts') {
            model.tsNames[slice.TsId] = value;
        }
    }

    static addTimeslice(model) {
        let defaultTs = DefaultObj.defaultTs();
        let slice = JSON.parse(JSON.stringify(defaultTs[0], ['TsId', 'Ts', 'Desc', 'SE', 'DT', 'DTB']));
        model.timeslices.push(slice);
        model.tsNames[slice.TsId] = slice.Ts;
        Grid.tsGridInstance.addRow(slice, false);
        model.tsCount++;
        $("#tsCount").text(model.tsCount);
    }

    static deleteTimeslice(model, tsId) {
        let index = model.timeslices.findIndex(obj => obj.TsId == tsId);
        if (index <= 0) return;
        model.timeslices.splice(index, 1);
        Grid.tsGridInstance.deleteRow(tsId);
        delete model.tsNames[tsId];
        model.tsCount--;
        $("#tsCount").text(model.tsCount);
    }

    static storageChanged(model, storage, field, value) {
        if (field == 'Stg') {
            model.stgNames[storage.StgId] = value;
        }
    }

    static addStorage(model) {
        let defaultStg = DefaultObj.defaultStg();
        let storage = JSON.parse(JSON.stringify(defaultStg[0], ['StgId', 'Stg', 'Desc', 'UnitId', 'TTS', 'TFS', 'Operation']));
        model.stg.push(storage);
        model.stgNames[storage.StgId] = storage.Stg;
        Grid.stgGridInstance.addRow(storage, false);
        model.stgCount++;
        $("#stgCount").text(model.stgCount);
    }

    static deleteStorage(model, stgId) {
        let index = model.stg.findIndex(obj => obj.StgId == stgId);
        if (index < 0) return;
        model.stg.splice(index, 1);
        Grid.stgGridInstance.deleteRow(stgId);
        delete model.stgNames[stgId];
        model.stgCount--;
        $("#stgCount").text(model.stgCount);
    }

    static addConstraint(model) {
        let defaultConstraint = DefaultObj.defaultConstraint();
        let constraint = JSON.parse(JSON.stringify(defaultConstraint[0], ['ConId', 'Con', 'Desc', 'Tag', 'CM']));
        model.constraints.push(constraint);
        Grid.constraintGridInstance.addRow(constraint, false);
        model.constraintsCount++;
        $("#constraintsCount").text(model.constraintsCount);
    }

    static deleteConstraint(model, conId) {
        let index = model.constraints.findIndex(obj => obj.ConId == conId);
        if (index < 0) return;
        model.constraints.splice(index, 1);
        Grid.constraintGridInstance.deleteRow(conId);
        model.constraintsCount--;
        $("#constraintsCount").text(model.constraintsCount);
    }

    static addIndicator(model) {
        let defaultIndicator = DefaultObj.defaultIndicator();
        let indicator = JSON.parse(JSON.stringify(defaultIndicator[0], ['IndicatorId', 'Indicator', 'Desc', 'IndicatorTypeId', 'Techs', 'Comms']));
        model.indicators.push(indicator);
        Grid.indicatorGridInstance.addRow(indicator, false);
        model.indicatorsCount++;
        $("#indicatorsCount").text(model.indicatorsCount);
    }

    static deleteIndicator(model, indicatorId) {
        let index = model.indicators.findIndex(obj => obj.IndicatorId == indicatorId);
        if (index < 0) return;
        model.indicators.splice(index, 1);
        Grid.indicatorGridInstance.deleteRow(indicatorId);
        model.indicatorsCount--;
        $("#indicatorsCount").text(model.indicatorsCount);
    }

    static initPage(model) {
        Message.clearMessages();
        //$('a[href="#tabComms"]').click();
        //Navbar.initPage(model.casename, model.pageId);
        
        Html.title(model.casename, model.title, "create & edit");
        Html.genData(model);

        Grid.tsGrid(model.timeslices, model.seasons, model.daytypes, model.dailytimebrackets, model.seNames, model.dtNames, model.dtbNames, {
            onChange: (slice, field, value) => AddCase.timesliceChanged(model, slice, field, value),
            onAdd: () => AddCase.addTimeslice(model),
            onDelete: slice => AddCase.deleteTimeslice(model, slice.TsId)
        });
        Grid.seGrid(model.seasons);
        Grid.dtGrid(model.daytypes);
        Grid.dtbGrid(model.dailytimebrackets);
        Grid.commGrid(model.commodities, {
            onChange: (comm, field, value) => AddCase.commodityChanged(model, comm, field, value),
            onAdd: () => AddCase.addCommodity(model),
            onDelete: comm => AddCase.deleteCommodity(model, comm.CommId)
        });
        Grid.stgGrid(model.stg, model.techs, model.techNames, {
            onChange: (storage, field, value) => AddCase.storageChanged(model, storage, field, value),
            onAdd: () => AddCase.addStorage(model),
            onDelete: storage => AddCase.deleteStorage(model, storage.StgId)
        });
        Grid.techsGrid(model.techs, model.commodities, model.techGroups, model.emissions, model.commNames, model.emiNames, model.techGroupNames, {
            onChange: (tech, field, value) => AddCase.techChanged(model, tech, field, value),
            onAdd: () => AddCase.addTech(model),
            onDelete: tech => AddCase.deleteTech(model, tech.TechId)
        });
      
        Grid.techGroupGrid(model.techGroups, {
            onChange: (group, field, value) => AddCase.techGroupChanged(model, group, field, value),
            onAdd: () => AddCase.addTechGroup(model),
            onDelete: group => AddCase.deleteTechGroup(model, group.TechGroupId)
        });
        Grid.emisGrid(model.emissions, {
            onChange: (emis, field, value) => AddCase.emissionChanged(model, emis, field, value),
            onAdd: () => AddCase.addEmission(model),
            onDelete: emis => AddCase.deleteEmission(model, emis.EmisId)
        });
        Grid.scenarioGrid(model.scenarios, {
            onAdd: () => AddCase.addScenario(model),
            onDelete: scenario => AddCase.deleteScenario(model, scenario.ScenarioId)
        });
        Grid.constraintGrid(model.techs, model.constraints, model.techNames, {
            onAdd: () => AddCase.addConstraint(model),
            onDelete: constraint => AddCase.deleteConstraint(model, constraint.ConId)
        });

        Grid.indicatorGrid(model.techs, model.commodities, model.indicators, model.indicatorTypes, model.techNames, model.commNames, {
            onAdd: () => AddCase.addIndicator(model),
            onDelete: indicator => AddCase.deleteIndicator(model, indicator.IndicatorId)
        });

        if (model.casename == null) {
            $('#osy-save').show();
            $('#osy-update').hide();
            Message.info("Please select existing or create new model!");
        } else {
            $("#osy-new").show();
            $('#osy-update').show();
            $('#osy-save').hide();
        }
        // Set up events after the saved years are shown
        loadScript("References/smartadmin/js/plugin/ion-slider/ion.rangeSlider.min.js", () => {
            SmartAdmin.rangeSlider(model.years);
            this.initEvents(model);
        });
        pageSetUp();
    }

    static initEvents(model) {
        //console.log('model ', model)
        // Remember the last saved configuration to detect unsaved changes
        let savedSnapshot = AddCase.getModelConfigurationSnapshot(model);
        NavigationGuard.activate({
            hasChanges: () => AddCase.getModelConfigurationSnapshot(model) !== savedSnapshot,
            update: () => $("#osy-caseForm").jqxValidator("validate")
        });


        $("#casePicker").off('click');
        $("#casePicker").on('click', '.selectCS', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            var casename = $(this).attr('data-ps');
            NavigationGuard.requestLeave(() => {
                Html.updateCasePicker(casename);
                Sidebar.Reload(casename);
                AddCase.refreshPage(casename);
                Message.smallBoxInfo("Case selection", casename + " is selected!", 3000);
            });
        });

        function render(message, input) {
            if (this._message) {
                this._message.remove();
            }
            this._message = $("<span class='jqx-validator-error-label'>" + message + "</span>")
            this._message.appendTo("#yearsselectmsg");
            Message.smallBoxWarning("Selection", "Model has to have one year at least!", 3000);
            return this._message;
        }

        $("#osy-caseForm").jqxValidator({
            hintType: 'label',
            animationDuration: 500,
            rules: [
                { input: '#osy-casename', message: "Model name is required field!", action: 'keyup', rule: 'required' },
                {
                    input: '#osy-casename', message: "Entered model name is not allowed!", action: 'keyup', rule: function (input, commit) {
                        var casename = $("#osy-casename").val();
                        var result = (/^[a-zA-Z0-9-_ ]*$/.test(casename));
                        return result;
                    }
                },
                { input: '#osy-mo', message: "Mode of operation is required field!", action: 'keyup', rule: 'required' },
                {
                    input: '#osy-mo', message: "Mode of operation should positive value!", action: 'keyup', rule: function (input, commit) {
                        var dr = $("#osy-mo").val();
                        return dr < 1 || isNaN(dr) ? false : true;
                    }
                },
                // { input: '#osy-ns', message: "Number of seasons is required field!", action: 'keyup', rule: 'required' },
                // {
                //     input: '#osy-ns', message: "Number of seasons should be zero or positive value!", action: 'keyup', rule: function (input, commit) {
                //         var dr = $("#osy-ns").val();
                //         return dr < 0 || isNaN(dr) ? false : true;
                //     }
                // },
                // { input: '#osy-dt', message: "Day type is required field!", action: 'keyup', rule: 'required' },
                // {
                //     input: '#osy-dt', message: "Day type should be zero or positive value!", action: 'keyup', rule: function (input, commit) {
                //         var dr = $("#osy-dt").val();
                //         return dr < 0 || isNaN(dr) ? false : true;
                //     }
                // },
                // { input: '#osy-date', message: "Date is required field!", action: 'change', rule: 'required' },
                // {
                //     input: '#osy-years', message: 'Select at least one year', action: 'change', hintRender: render, rule: function () {
                //         var elements = $('#osy-years').find('input[type=checkbox]');
                //         var check = false;
                //         var result = $.grep(elements, function (element, index) {
                //             if (element.checked == true)
                //                 check = true;
                //         });
                //         return (check);
                //     }
                // }
            ]
        });

        $("#osy-new").on('click', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            // Check for unsaved changes before starting a new model
            NavigationGuard.requestLeave(() => {
                AddCase.refreshPage(null);
                //Sidebar.Load(null, null)
                Sidebar.Reload(null);

                $("#osy-new").hide();
                $('#osy-update').hide();
                $('#osy-save').show();
                Message.smallBoxConfirmation("Confirmation!", "Configure new Model!", 3500);
            });
        });

        $("#osy-save").off('click');
        $("#osy-save").on('click', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            $("#osy-caseForm").jqxValidator('validate')
        });

        $("#osy-update").off('click');
        $("#osy-update").on('click', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            $("#osy-caseForm").jqxValidator('validate')
        });

        $("#osy-caseForm").off('validationSuccess');
        $("#osy-caseForm").on('validationSuccess', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();

            Message.loaderStart('Saving model data')
            const POSTDATA = AddCase.getModelConfigurationData(model);
            const casename = POSTDATA["osy-casename"];

            Osemosys.saveCase(POSTDATA)
            .then(response => {
                Message.loaderEnd()
                if (response.status_code == "created") {
                    savedSnapshot = AddCase.getModelConfigurationSnapshot(model);
                    $("#osy-new").show();
                    $('#osy-update').show();
                    $('#osy-save').hide();
                    Message.clearMessages();
                    Message.bigBoxSuccess('Model message', response.message, 3000);
                    Html.appendCasePicker(casename, casename);
                    Sidebar.Reload(casename);
                    $("#osy-case").html(casename);
                    if (Base.AWS_SYNC == 1) {
                        SyncS3.deleteResultsPreSync(casename)
                            .then(response => {
                                SyncS3.uploadSync(casename);
                            });
                    }
                }
                if (response.status_code == "edited") {
                    savedSnapshot = AddCase.getModelConfigurationSnapshot(model);
                    Html.title(casename, 'Model configuration', 'create & edit');
                    $("#osy-new").show();
                    Navbar.initPage(casename);
                    Sidebar.Reload(casename);
                    Message.bigBoxInfo('Model message', response.message, 3000);
                    if (Base.AWS_SYNC == 1) {
                        SyncS3.deleteResultsPreSync(casename)
                            .then(response => {
                                SyncS3.uploadSync(casename);
                            });
                    }
                }
                if (response.status_code == "exist") {
                    $("#osy-new").show();
                    Message.bigBoxWarning('Model message', response.message, 3000);
                }
            })
            .catch(error => {
                Message.loaderEnd()
                Message.bigBoxDanger('Error message', error, null);
            })
        });

        //TECHNOLOGIES: handled through Grid.techsGrid callbacks (see initPage)

        //TECHNOLOGY GROUPS: handled through Grid.techGroupGrid callbacks (see initPage)

        //TIMESLICES: handled through Grid.tsGrid callbacks (see initPage)

        //SEASONS, DAY TYPES AND DAILY TIME BRACKETS: the grids show them, the counters add and remove rows
        $('#osy-caseForm').undelegate("#osy-addSeNumber", "click");
        $('#osy-caseForm').delegate("#osy-addSeNumber", "click", function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            AddCase.addTimeSet(model, 'season');
        });

        $('#osy-caseForm').undelegate("#deleteSeNumber", "click");
        $('#osy-caseForm').delegate("#deleteSeNumber", "click", function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            AddCase.removeLastTimeSet(model, 'season');
        });

        $('#osy-caseForm').undelegate("#osy-addDtNumber", "click");
        $('#osy-caseForm').delegate("#osy-addDtNumber", "click", function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            AddCase.addTimeSet(model, 'dayType');
        });

        $('#osy-caseForm').undelegate("#deleteDtNumber", "click");
        $('#osy-caseForm').delegate("#deleteDtNumber", "click", function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            AddCase.removeLastTimeSet(model, 'dayType');
        });

        $('#osy-caseForm').undelegate("#osy-addDtbNumber", "click");
        $('#osy-caseForm').delegate("#osy-addDtbNumber", "click", function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            AddCase.addTimeSet(model, 'bracket');
        });

        $('#osy-caseForm').undelegate("#deleteDtbNumber", "click");
        $('#osy-caseForm').delegate("#deleteDtbNumber", "click", function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            AddCase.removeLastTimeSet(model, 'bracket');
        });

        //COMMODITIES and EMISSIONS: handled through their grid callbacks (see initPage)

        //STORAGE: handled through Grid.stgGrid callbacks (see initPage)

        //SCENARIOS: handled through Grid.scenarioGrid callbacks (see initPage)

        //CONSTRAINTS: handled through Grid.constraintGrid callbacks (see initPage)

        //INDICATORS: handled through Grid.indicatorGrid callbacks (see initPage)

        //TABS CHANGE EVENT
        $(".nav-tabs li a").off('click');
        $('.nav-tabs li a').on("click", function (event, ui) {
            var id = $(this).attr('id');
            // console.log('tab id ', id)
            //update tech grid to update IAR OAR EAR with new added or removed comms and emis
            // Redraw once the pane is shown: a grid measured while hidden has no header height or widths.
            $(this).one('shown.bs.tab', () => DataGrid.refreshVisible());
        });

        //YEARS EVENTS
        $("#osy-checkAll").on("click", function (event) {
            event.preventDefault();
            var elements = $('#osy-years').find('input[type=checkbox]');
            $.grep(elements, function (element, index) {
                element.checked = true;
            });
            $("#osy-caseForm").jqxValidator('validateInput', '#osy-years');
        });

        $("#osy-uncheckAll").on("click", function (event) {
            event.preventDefault();
            var elements = $('#osy-years').find('input[type=checkbox]');
            $.grep(elements, function (element, index) {
                element.checked = false;
            });
            $("#osy-caseForm").jqxValidator('validateInput', '#osy-years');
        });

        $("#osy-x2").on("click", function (event) {
            event.preventDefault();
            var elements = $('#osy-years').find('input[type=checkbox]');
            $.grep(elements, function (element, index) {
                if ((index) % 2 == 0)
                    element.checked = true;
            });
            $("#osy-caseForm").jqxValidator('validateInput', '#osy-years');
        });

        $("#osy-x5").on("click", function (event) {
            event.preventDefault();
            var elements = $('#osy-years').find('input[type=checkbox]');
            $.grep(elements, function (element, index) {
                if ((index) % 5 == 0)
                    element.checked = true;
            });
            $("#osy-caseForm").jqxValidator('validateInput', '#osy-years');
        });

        $("#showLog").click(function (e) {
            e.preventDefault();
            $('#definition').html(`
                <h5>${DEF[model.pageId].title}</h5>
                ${DEF[model.pageId].definition}
            `);
            $('#definition').toggle('slow');
        });
    }
}





