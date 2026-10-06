"""
Browser tests for the Technologies grid on the shared Tabulator grid (#548).

The Flask app is served in this process with Config.DATA_STORAGE pointed at a
temporary copy of CLEWs Demo, so no test writes to WebAPP/DataStorage. The page
reads model files as static /DataStorage/ URLs, so those requests are answered
from the same copy.

Runs only when pytest-playwright is installed (the dedicated CI job); the plain
pytest job skips this module.
"""

import json
import shutil
import threading
from pathlib import Path
from urllib.parse import unquote, urlparse

import pytest

pytest.importorskip("pytest_playwright")
from playwright.sync_api import expect
from werkzeug.serving import make_server

from app import app as flask_app
from Classes.Base import Config

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_STORAGE = REPO_ROOT / "WebAPP" / "DataStorage"
CASE = "CLEWs Demo"
TABLE = "Tabulator.findTable('#osy-gridTech')[0]"

expect.set_options(timeout=15_000)


@pytest.fixture(scope="module")
def storage(tmp_path_factory):
    """A DataStorage holding the shared parameter files and a copy of CLEWs Demo."""
    root = tmp_path_factory.mktemp("DataStorage")
    for item in SOURCE_STORAGE.iterdir():
        if item.is_file():
            shutil.copy2(item, root / item.name)
    shutil.copytree(SOURCE_STORAGE / CASE, root / CASE)
    return root


# Named tech_url rather than base_url: pytest-playwright's session-scoped base_url
# cannot depend on this module-scoped server.
@pytest.fixture(scope="module")
def tech_url(storage):
    """The app served in this process, reading and writing only the temporary DataStorage."""
    patch = pytest.MonkeyPatch()
    patch.setattr(Config, "DATA_STORAGE", storage)
    patch.setitem(flask_app.config, "SECRET_KEY", flask_app.config.get("SECRET_KEY") or "test-secret-key")
    server = make_server("127.0.0.1", 0, flask_app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    thread.join(timeout=10)
    patch.undo()


def read_techs(storage):
    data = json.loads((storage / CASE / "genData.json").read_text(encoding="utf-8"))
    return data, {tech["TechId"]: tech for tech in data["osy-tech"]}


@pytest.fixture()
def grid(page, tech_url, storage):
    served = []

    def serve_storage(route):
        """Answer a static /DataStorage/ request from the temporary copy instead of WebAPP."""
        relative = unquote(urlparse(route.request.url).path).split("/DataStorage/", 1)[1]
        path = (storage / relative).resolve()
        if storage.resolve() in path.parents and path.is_file():
            served.append(relative)
            route.fulfill(path=path)
        else:
            route.fulfill(status=404)

    page.route("**/DataStorage/**", serve_storage)
    page.set_viewport_size({"width": 1600, "height": 1000})
    page.goto(tech_url)
    page.evaluate(
        """async (casename) => {
            localStorage.setItem('osy-model', 'clews');
            await fetch('/setSession', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                        body: JSON.stringify({case: casename})});
        }""",
        CASE,
    )
    page.goto(f"{tech_url}/#/AddCase")
    page.click("a#Techs")
    expect(page.locator("#osy-gridTech.tabulator .tabulator-row").first).to_be_visible()
    # Fails loudly if the app stops reading model files through /DataStorage/ and the test copy is bypassed.
    assert f"{CASE}/genData.json" in served, served
    return page


def cell(page, key, field):
    # Tabulator's scroll promises do not always settle, so wait for the rendered cell instead.
    page.evaluate(
        f"([key, field]) => {{ {TABLE}.scrollToRow(key, 'center', false); {TABLE}.scrollToColumn(field, 'middle', false); }}",
        [key, field],
    )
    return page.wait_for_function(
        f"""([key, field]) => {{
            const element = {TABLE}.getRow(key).getCell(field).getElement();
            return element.isConnected && element;
        }}""",
        arg=[key, field],
    ).as_element()


def delete_button(page, key):
    page.evaluate(f"key => {{ {TABLE}.scrollToRow(key, 'center', false); }}", key)
    return page.wait_for_function(
        f"""key => {{
            const button = {TABLE}.getRow(key).getElement().querySelector('.deleteTech');
            return button && button.isConnected && button;
        }}""",
        arg=key,
    ).as_element()


def edit_text(page, key, field, text):
    cell(page, key, field).dblclick()
    editor = page.locator("#osy-gridTech .tabulator-editing input")
    expect(editor).to_be_visible()
    editor.fill(text)
    editor.press("Enter")


def value(page, key, field):
    return page.evaluate(f"([key, field]) => {TABLE}.getRow(key).getData()[field]", [key, field])


def save(page):
    with page.expect_response(lambda response: response.url.endswith("/saveCase") and response.status == 200):
        page.click("#osy-update")


def test_grid_is_measured_after_the_tab_is_shown(grid):
    # Built in a hidden tab, the grid had an 18px header until it was redrawn on shown.bs.tab.
    grid.wait_for_function("() => document.querySelector('#osy-gridTech .tabulator-header').getBoundingClientRect().height > 30")
    assert grid.evaluate(f"() => {TABLE}.getDataCount()") == int(grid.locator("#techCount").inner_text())


def test_rename_and_description_are_saved_by_technology_id(grid, storage):
    before, _ = read_techs(storage)
    edit_text(grid, "TEC_egvvw", "Tech", "ACE_RENAMED")
    edit_text(grid, "TEC_egvvw", "Desc", "  Renamed in test  ")
    save(grid)
    after, techs = read_techs(storage)
    assert techs["TEC_egvvw"]["Tech"] == "ACE_RENAMED"
    assert techs["TEC_egvvw"]["Desc"] == "Renamed in test"
    others = lambda data: [tech for tech in data["osy-tech"] if tech["TechId"] != "TEC_egvvw"]
    assert others(after) == others(before)


def test_duplicate_technology_name_is_rejected(grid):
    edit_text(grid, "TEC_gdyzm", "Tech", "CoalPower")
    expect(grid.locator("#osy-gridTech .tabulator-validation-fail")).to_have_count(1)
    grid.keyboard.press("Escape")
    assert value(grid, "TEC_gdyzm", "Tech") == "AAA_VEN"


def test_edit_after_sorting_and_filtering_updates_the_intended_row(grid, storage):
    before, _ = read_techs(storage)
    title = grid.locator("#osy-gridTech .tabulator-col[tabulator-field='Tech'] .tabulator-col-title")
    title.click()
    title.click()
    # The column menu replaces jqxGrid's: a condition, a value, then Filter.
    grid.locator("#osy-gridTech .tabulator-col[tabulator-field='Tech'] .tabulator-header-popup-button").click()
    menu = grid.locator(".osy-grid-menu")
    expect(menu).to_be_visible()
    menu.locator("[data-part='firstValue']").fill("MIN")
    menu.locator("[data-act='filter']").click()
    grid.wait_for_function(f"() => {TABLE}.getData('active').every(row => row.Tech.toUpperCase().includes('MIN'))")
    edit_text(grid, "TEC_0", "Desc", "Filtered edit")
    save(grid)
    after, techs = read_techs(storage)
    assert techs["TEC_0"]["Desc"] == "Filtered edit"
    others = lambda data: [tech for tech in data["osy-tech"] if tech["TechId"] != "TEC_0"]
    assert others(after) == others(before)


def test_commodity_multi_select_saves_ids(grid, storage):
    cell(grid, "TEC_urpvw", "IAR").dblclick()
    popup = grid.locator(".osy-datagrid-popup")
    expect(popup).to_be_visible()
    expect(popup.locator(".muio-multiselect-all")).to_have_count(0)
    popup.locator(".muio-multiselect-search").fill("AAPPLE123")
    item = popup.locator(".muio-multiselect-item", has_text="AAPPLE123")
    # The commodity's description (CLEWs Demo) is shown as the item tooltip.
    expect(item).to_have_attribute("title", "TEST1")
    item.click()
    grid.mouse.click(5, 5)
    expect(popup).to_have_count(0)
    _, before = read_techs(storage)
    save(grid)
    _, techs = read_techs(storage)
    saved = techs["TEC_urpvw"]["IAR"]
    # The grid stores ticked items in list order, as jqxGrid did, so membership is what matters.
    assert sorted(saved) == sorted(before["TEC_urpvw"]["IAR"] + ["COM_b8gjq"])
    assert len(saved) == len(set(saved))


def choose_unit(page, key, field, label):
    """Pick a unit by its list label, e.g. "MW (Capacity)"."""
    cell(page, key, field).dblclick()
    editor = page.locator("#osy-gridTech .tabulator-editing input")
    expect(editor).to_be_visible()
    # Tabulator builds the option list when the input is focused or clicked, not when the editor opens.
    editor.click()
    option = page.locator(".tabulator-edit-list .tabulator-edit-list-item", has_text=label)
    expect(option).to_be_visible()
    # The input opens holding the current unit's label, so it is replaced rather than appended to.
    editor.press("ControlOrMeta+A")
    editor.press_sequentially(label.split(" (")[0])
    expect(option).to_be_visible()
    option.click()


def test_unit_choice_saves_unit_ids_and_survives_reload(grid, storage):
    choose_unit(grid, "TEC_tcmdh", "CapUnitId", "MW (Capacity)")
    expect(grid.get_by_text("Unit change warning!")).to_be_visible()
    choose_unit(grid, "TEC_tcmdh", "ActUnitId", "TJ (Energy)")
    save(grid)
    _, techs = read_techs(storage)
    assert techs["TEC_tcmdh"]["CapUnitId"] == "MW"
    assert techs["TEC_tcmdh"]["ActUnitId"] == "TJ"

    grid.reload()
    grid.click("a#Techs")
    expect(grid.locator("#osy-gridTech.tabulator .tabulator-row").first).to_be_visible()
    assert value(grid, "TEC_tcmdh", "CapUnitId") == "MW"
    assert value(grid, "TEC_tcmdh", "ActUnitId") == "TJ"
    assert cell(grid, "TEC_tcmdh", "CapUnitId").text_content().strip() == "MW"


def test_add_technology_puts_a_default_row_first(grid, storage):
    count = int(grid.locator("#techCount").inner_text())
    grid.locator("#osy-addTech").click()
    expect(grid.locator("#techCount")).to_have_text(str(count + 1))
    key = grid.evaluate(f"() => {TABLE}.getRows()[0].getData()._key")
    save(grid)
    data, techs = read_techs(storage)
    assert data["osy-tech"][0]["TechId"] == key
    assert techs[key]["Desc"] == "Default technology"
    assert len(data["osy-tech"]) == count + 1


def test_delete_without_group_removes_only_that_technology(grid, storage):
    before, _ = read_techs(storage)
    delete_button(grid, "TEC_ttjhn").click()
    save(grid)
    after, techs = read_techs(storage)
    assert "TEC_ttjhn" not in techs
    assert after["osy-tech"] == [tech for tech in before["osy-tech"] if tech["TechId"] != "TEC_ttjhn"]


def test_delete_group_member_confirms_and_removes_constraint_references(grid, storage):
    before, _ = read_techs(storage)
    assert any("TEC_zkcws" in constraint["CM"] for constraint in before["osy-constraints"])
    delete_button(grid, "TEC_zkcws").click()
    grid.get_by_role("button", name="Yes", exact=True).click()
    save(grid)
    after, techs = read_techs(storage)
    assert "TEC_zkcws" not in techs
    assert not any("TEC_zkcws" in constraint["CM"] for constraint in after["osy-constraints"])


def test_delete_clears_the_storage_link(grid, storage):
    before, _ = read_techs(storage)
    assert before["osy-stg"][0]["TTS"] == "TEC_mzxsr"
    delete_button(grid, "TEC_mzxsr").click()
    save(grid)
    after, techs = read_techs(storage)
    assert "TEC_mzxsr" not in techs
    assert after["osy-stg"][0]["TTS"] == ""
    assert after["osy-stg"][0]["TFS"] == before["osy-stg"][0]["TFS"]
