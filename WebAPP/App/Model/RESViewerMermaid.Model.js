import { DataModel } from "../../Classes/DataModel.Class.js";

export class Model {
    
    constructor (casename, genData, RYTCMdata) {

        //let ActivityTechs = DataModel.activityTechs(techs);
        let ActivityComms = DataModel.activityComms(genData);
        let TechNames = DataModel.TechName(genData);
        let CommNames = DataModel.CommName(genData);
        let techData = DataModel.getTechData(genData); // for TechGroup color lookup
        let techGroupData = DataModel.getTechGroupData(genData); // for TechGroup color lookup

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

        var DEFAULT_TECHGROUP_COLOR = '#aaaaaa';

        // Apply TechGroup fill colors to each node in the Mermaid diagram
        $.each(labelIndex, function (techId, nodeId) {
            var tech = techData[techId];
            var color = DEFAULT_TECHGROUP_COLOR;

            if (tech && tech.TG && tech.TG.length > 0) {
                var group = techGroupData[tech.TG[0]];
                if (group && group.Color) {
                    color = group.Color;
                }
            }

            graphString += 'style ' + nodeId + ' fill:' + color + '\n';
        });

        this.casename = casename;
        this.graphString = graphString;
    }
}