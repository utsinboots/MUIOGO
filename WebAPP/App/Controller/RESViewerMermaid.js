import { Message } from "../../Classes/Message.Class.js";
import { Base } from "../../Classes/Base.Class.js";
import { Html } from "../../Classes/Html.Class.js";
import { Model } from "../Model/RESViewerMermaid.Model.js";
import { Osemosys } from "../../Classes/Osemosys.Class.js";
import { DEF } from "../../Classes/Definition.Class.js";
import { MessageSelect } from "./MessageSelect.js";
// SectorColors provides the shared sector inference cache and legend renderer used by both RES Viewer and Mermaid.
import { getSectorRules, syncCaseName, renderSectorLegend } from "../../Classes/SectorColors.Class.js";

export default class RESViewer {
    static onLoad() {
        Base.getSession()
            .then(response => {
                let casename = response['session'];
                if (casename) {
                    const promise = [];
                    promise.push(casename);
                    const genData = Osemosys.getData(casename, 'genData.json');
                    promise.push(genData);
                    const RYTCMdata = Osemosys.getData(casename, "RYTCM.json");
                    promise.push(RYTCMdata);
                    return Promise.all(promise);
                } else {
                    MessageSelect.init(RESViewer.refreshPage.bind(RESViewer));
                }
            })
            .then(async data => {
                let [casename, genData, RYTCMdata] = data;
                syncCaseName(genData['osy-casename']);
                const sectorRules = await getSectorRules();
                let model = new Model(casename, genData, RYTCMdata, sectorRules);
                this.initPage(model);
                this.initEvents(model);
            })
            .catch(error => {
                console.log('error ', error)
                Message.warning(error);
            });
    }

    static renderMermaid(){
		mermaid.init(undefined, document.querySelectorAll(".mermaid"));
	}


    // Collects TechIds from the Mermaid labelIndex and delegates to the shared legend renderer.
    static renderSectorLegend(model) {
        const techIds = Object.keys(model.labelIndex || {});
        renderSectorLegend('sectorLegendMermaid', techIds, model.techData, model.commData, model.sectorRules);
    }

    static initPage(model) {
        Message.clearMessages();
        mermaid.initialize({startOnLoad:false, maxTextSize: 900000});

   
        //loadScript("References/mermaid/mermaid.min.js");
        //mermaid.initialize({ startOnLoad: true });

        // mermaid.mermaidAPI.initialize({ startOnLoad:false }); 
        // $(function(){ 
        //     element = document.querySelector("#graphDiv"); 
        //     var insertSvg = function(svgCode, bindFunctions){
        //         element.innerHTML = svgCode; 
        //     }; 
        //     var graphDefinition = 'graph TB\na-->b'; 
        //     var graph = mermaid.mermaidAPI.render('graphDiv', graphDefinition, insertSvg); 
        // });


        $('.mermaid').removeAttr('data-processed');
        $('.mermaid').empty();
        $('.mermaid').append(model.graphString);

        
        // mermaid.flowchartConfig = {
        //     width: '100%'
        // }

        this.renderMermaid();
        this.renderSectorLegend(model);

        Html.title(model.casename, 'Model diagram', '');
    }

    static refreshPage(casename) {
        Base.setSession(casename)
            .then(response => {
                const promise = [];
                promise.push(casename);
                const genData = Osemosys.getData(casename, 'genData.json');
                promise.push(genData);
                const RYTCMdata = Osemosys.getData(casename, "RYTCM.json");
                promise.push(RYTCMdata);
                return Promise.all(promise);
            })
            .then(async data => {
                let [casename, genData, RYTCMdata] = data;
                syncCaseName(genData['osy-casename']);
                const sectorRules = await getSectorRules();
                let model = new Model(casename, genData, RYTCMdata, sectorRules);
                this.initPage(model);
                this.initEvents(model);
            })
            .catch(error => {
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
            RESViewer.refreshPage(casename);
            Message.smallBoxConfirmation("Confirmation!", "Model " + casename + " selected!", 3500);
        });

        $("#showLog").click(function (e) {
            e.preventDefault();
            $('#definition').html(`${DEF[model.group][model.param].definition}`);
            $('#definition').toggle('slow');
        });
    }
}