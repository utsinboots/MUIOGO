import { DataModel } from "./DataModel.Class.js";

let _sectorRules = null;        // sector_rules.json loaded once per session
let _techColorCache = {};       // { 'casename:TechId': { sector, color } } — cleared on model save or case switch
let _currentCaseName = null;    // tracks active case to detect switches and invalidate cache

// Minimal safe object returned when sector_rules.json fails to load.
// All inference steps will find nothing and fall through to 'Unknown' → grey.
const _EMPTY_RULES = { sectorPriority: [], secondaryFlows: [], emissionsFlows: [], sectors: {}, sectorColors: {} };

// Fetches sector_rules.json once and caches it for the session lifetime.
// On fetch failure, returns _EMPTY_RULES so all nodes degrade to grey without breaking the diagram.
export async function getSectorRules() {
    if (_sectorRules) return _sectorRules;
    try {
        const response = await fetch('Config/sector_rules.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        _sectorRules = await response.json();
    } catch (e) {
        console.warn('SectorColors: could not load sector_rules.json, falling back to grey nodes.', e);
        _sectorRules = _EMPTY_RULES;
    }
    return _sectorRules;
}

// Runs inference once per tech per case and stores { sector, color } so getCachedTechColor
// and getCachedTechSector can both be called without re-running the full inference logic.
// Key includes casename so the same TechId in two different models doesn't share a cached result.
function _populateCache(tech, commData, sectorRules) {
    const key = (_currentCaseName || '') + ':' + tech.TechId;
    if (_techColorCache[key]) return _techColorCache[key];
    const sector = DataModel.inferTechSector(tech, commData, sectorRules);
    const color = DataModel.getSectorColor(sector, sectorRules);
    _techColorCache[key] = { sector, color };
    return _techColorCache[key];
}

// Returns the inferred hex color for a technology node. Used by RESViewer.Model during Sankey construction.
export function getCachedTechColor(tech, commData, sectorRules) {
    try {
        return _populateCache(tech, commData, sectorRules).color;
    } catch (e) {
        console.warn('SectorColors: color inference failed for tech', tech && tech.TechId, e);
        return '#aaaaaa';
    }
}

// Returns the inferred sector name for a technology. Used by renderSectorLegend to collect used sectors.
export function getCachedTechSector(tech, commData, sectorRules) {
    try {
        return _populateCache(tech, commData, sectorRules).sector;
    } catch (e) {
        console.warn('SectorColors: sector inference failed for tech', tech && tech.TechId, e);
        return 'Unknown';
    }
}

// Clears the tech color cache. Called on page load and after model save (technologies, OAR,
// commodities, or units may have changed, so previously inferred colors could be stale).
export function clearTechColorCache(newCaseName) {
    _techColorCache = {};
    if (newCaseName !== undefined) _currentCaseName = newCaseName;
}

// Virtual system nodes added by the RES builder — not real model technologies.
// Excluded from legend collection so their hardcoded colors don't add spurious entries.
const _VIRTUAL_TECH_IDS = new Set(['DS', 'DT', 'FD']);

// Renders a horizontal sector legend into elementId.
//
// Legend labels generated (from sector_rules.json, in sectorPriority order):
//   Energy      #e67e22  orange   — electricity, fuels, power generation
//   Water       #2980b9  blue     — water supply, groundwater, irrigation
//   Land        #27ae60  green    — land use, forest, grassland, plantation
//   Agriculture #f1c40f  yellow   — crops, food, livestock
//   Transport   #8e44ad  purple   — mobility, freight, biofuels for transport
//   Climate     #c0392b  red      — GHG emissions, carbon accounting
//   Mixed       #795548  brown    — technology with OAR spanning multiple sectors
//   Unknown     #95a5a6  grey     — no commodity/unit/name rule matched (shown if any real tech is Unknown)
//
// Only sectors present in the current diagram are shown. Virtual nodes (DS/DT/FD) are excluded.
// Colors and labels are read from sector_rules.json — edit that file to change them.
export function renderSectorLegend(elementId, techIds, techData, commData, sectorRules) {
    const $el = document.getElementById(elementId);
    if (!$el) return;
    if (!sectorRules) { $el.innerHTML = ''; return; }

    const usedSectors = new Set();
    techIds.forEach(function (techId) {
        if (_VIRTUAL_TECH_IDS.has(techId)) return;
        const tech = techData[techId];
        if (tech) usedSectors.add(getCachedTechSector(tech, commData, sectorRules));
    });

    const priority = sectorRules.sectorPriority || Object.keys(sectorRules.sectors);
    const items = [];
    // Named sectors in priority order
    priority.forEach(function (sector) {
        if (usedSectors.has(sector)) {
            items.push({ sector, color: (sectorRules.sectors[sector] || {}).color || '#aaaaaa' });
            usedSectors.delete(sector);
        }
    });
    // Mixed and any other unlisted sectors before Unknown
    usedSectors.forEach(function (sector) {
        if (sector !== 'Unknown') {
            items.push({ sector, color: (sectorRules.sectorColors || {})[sector] || '#aaaaaa' });
            usedSectors.delete(sector);
        }
    });
    // Unknown always last — real grey nodes deserve a legend entry
    if (usedSectors.has('Unknown')) {
        items.push({ sector: 'Unknown', color: (sectorRules.sectorColors || {})['Unknown'] || '#95a5a6' });
    }

    if (items.length === 0) { $el.innerHTML = ''; return; }

    const html = items.map(function (item) {
        return '<span style="display:inline-flex;align-items:center;margin-right:14px;">'
            + '<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:'
            + item.color + ';margin-right:5px;flex-shrink:0;"></span>'
            + '<span style="font-size:12px;color:#555;">' + item.sector + '</span>'
            + '</span>';
    }).join('');

    $el.innerHTML = '<div style="display:flex;flex-wrap:wrap;align-items:center;padding:2px 0;">' + html + '</div>';
}

// Called at the start of each render. Clears the cache if the active model has changed
// so colors from a previously loaded model don't bleed into the newly selected one.
export function syncCaseName(casename) {
    if (_currentCaseName !== casename) {
        _techColorCache = {};
        _currentCaseName = casename;
    }
}
