import { DataModel } from "../../Classes/DataModel.Class.js";
import { getCachedTechColor, getCachedTechSector } from "../../Classes/SectorColors.Class.js";

export class Model {
    
    constructor (casename, genData, RYTCMdata, sectorRules) {

        //let ActivityTechs = DataModel.activityTechs(techs);
        let ActivityComms = DataModel.activityComms(genData);
        let TechNames = DataModel.TechName(genData);
        let CommNames = DataModel.CommName(genData);
        let techData = DataModel.getTechData(genData);
        let commData = DataModel.getCommData(genData);

        // let TechUnits = DataModel.getTechUnits(genData);
        // let CommUnits = DataModel.getCommUnits(genData);

        //console.log('RYTCMdata ', RYTCMdata);
        //console.log('ActivityTechs ', ActivityTechs);
        //console.log('ActivityComms ', ActivityComms);
        // console.log('TechNames ', TechNames);
        // console.log('TechUnits ', TechUnits);
        // console.log('CommUnits ', CommUnits);

        let index = 0;
        let labelIndex = {};
        let color = [];
        let label = [];

        $.each(ActivityComms, function (IO, obj) {
            $.each(obj, function (tech, array) {
                if (typeof labelIndex[tech] === "undefined" ){
                    labelIndex[tech] = index;
                    //label.push(TechNames[tech]);
                    index++;
                    //color.push('#3a3f51');
                }
            });
        });

        let IAR = RYTCMdata.IAR.SC_0;
        let OAR = RYTCMdata.OAR.SC_0;

        let graphString = 'graph LR \n';

        $.each(OAR, function (idOAR, objOAR) {
            $.each(IAR, function (idIAR, objIAR) {
                if(objOAR.CommId == objIAR.CommId && objOAR.MoId == 1 && objIAR.MoId == 1){
                    graphString += `${labelIndex[objOAR.TechId]}[${TechNames[objOAR.TechId]}] -- ${CommNames[objIAR.CommId]} --> ${labelIndex[objIAR.TechId]}[${TechNames[objIAR.TechId]}] \n`;
                }
            });
        });

        // Color each Mermaid node by inferred CLEWs sector using the shared SectorColors cache.
        // Falls back to grey if tech is not found or sectorRules failed to load.
        $.each(labelIndex, function (techId, nodeId) {
            var tech = techData[techId];
            var nodeColor = sectorRules && tech
                ? getCachedTechColor(tech, commData, sectorRules)
                : '#aaaaaa';
            graphString += 'style ' + nodeId + ' fill:' + nodeColor + '\n';
        });

        this.casename = casename;
        this.graphString = graphString;
        this.sectorRules = sectorRules; // passed to renderSectorLegend after initPage
        this.techData = techData;       // needed by renderSectorLegend to look up each tech
        this.commData = commData;       // needed by getCachedTechSector inside renderSectorLegend
        this.labelIndex = labelIndex;   // maps TechId → Mermaid node index; used to get tech list for legend
    }
}