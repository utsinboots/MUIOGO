"""
Browser tests for the RYT parameter grid on the shared Tabulator grid (#548).

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
# Low_prc / RSCPRC holds the demo's only RYT override: TAU for all 16 years.
OVERRIDE = "SC_cmjth|TEC_ssoh1"
BASE_ROW = "SC_0|TEC_egvvw"  # ACE_VEN_TEST
TABLE = "Tabulator.findTable('#osy-gridRYT')[0]"

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


# Named ryt_url rather than base_url: pytest-playwright's session-scoped base_url
# cannot depend on this module-scoped server.
@pytest.fixture(scope="module")
def ryt_url(storage):
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


def read_ryt(storage):
    return json.loads((storage / CASE / "RYT.json").read_text(encoding="utf-8"))


def changed_cells(before, after):
    """Cells whose value or JSON type differs, keyed by (param, scenario, tech, field)."""
    changes = {}
    for param, scenarios in before.items():
        for sc, rows in scenarios.items():
            new_rows = {row["TechId"]: row for row in after[param][sc]}
            for row in rows:
                for field, value in row.items():
                    new = new_rows[row["TechId"]].get(field)
                    if value != new or type(value) is not type(new):
                        changes[(param, sc, row["TechId"], field)] = new
    return changes


def serve_storage(route, storage):
    """Answer a static /DataStorage/ request from the temporary copy instead of WebAPP."""
    relative = unquote(urlparse(route.request.url).path).split("/DataStorage/", 1)[1]
    path = (storage / relative).resolve()
    if storage.resolve() in path.parents and path.is_file():
        route.fulfill(path=path)
    else:
        route.fulfill(status=404)


@pytest.fixture()
def grid(page, ryt_url, storage):
    page.route("**/DataStorage/**", lambda route: serve_storage(route, storage))
    page.set_viewport_size({"width": 1600, "height": 1000})
    page.goto(ryt_url)
    page.evaluate(
        """async (casename) => {
            localStorage.setItem('osy-model', 'clews');
            await fetch('/setSession', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                        body: JSON.stringify({case: casename})});
        }""",
        CASE,
    )
    page.goto(f"{ryt_url}/#/RYT/TAU")
    expect(page.locator("#osy-gridRYT.tabulator .tabulator-row").first).to_be_visible()
    return page


def select_param(page, param):
    page.select_option("#osy-ryt", param)
    expect(page.locator("#osy-ryt")).to_have_value(param)


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


def edit(page, key, field, text):
    cell(page, key, field).dblclick()
    editor = page.locator("#osy-gridRYT .tabulator-editing input")
    expect(editor).to_be_visible()
    editor.fill(text)
    editor.press("Enter")


def value(page, key, field):
    return page.evaluate(f"([key, field]) => {TABLE}.getRow(key).getData()[field]", [key, field])


def save(page):
    with page.expect_response(lambda response: response.url.endswith("/updateData") and response.status == 200):
        page.click("#osy-saveRYTdata")


def test_cleared_override_is_saved_as_null_after_switching_parameter(grid, storage):
    before = read_ryt(storage)
    edit(grid, OVERRIDE, "2021", "")
    # jqxGrid reloaded the grid from a copy holding 0 for cleared cells here.
    select_param(grid, "COTU")
    select_param(grid, "TAU")
    assert value(grid, OVERRIDE, "2021") is None
    save(grid)
    assert changed_cells(before, read_ryt(storage)) == {("TAU", "SC_cmjth", "TEC_ssoh1", "2021"): None}


def test_typed_zero_is_saved_as_zero(grid, storage):
    before = read_ryt(storage)
    edit(grid, OVERRIDE, "2022", "0")
    save(grid)
    assert changed_cells(before, read_ryt(storage)) == {("TAU", "SC_cmjth", "TEC_ssoh1", "2022"): 0}


def test_base_scenario_value_cannot_be_cleared(grid):
    edit(grid, BASE_ROW, "2020", "")
    expect(grid.locator("#osy-gridRYT .tabulator-validation-fail")).to_have_count(1)
    grid.keyboard.press("Escape")
    assert value(grid, BASE_ROW, "2020") == 999999


def test_negative_values_follow_parameter_rules(grid, storage):
    select_param(grid, "TAL")
    edit(grid, BASE_ROW, "2020", "-5")
    expect(grid.locator("#osy-gridRYT .tabulator-validation-fail")).to_have_count(1)
    grid.keyboard.press("Escape")
    assert value(grid, BASE_ROW, "2020") == 0

    select_param(grid, "CC")
    before = read_ryt(storage)
    edit(grid, "SC_0|TEC_0", "2021", "-5")
    save(grid)
    assert changed_cells(before, read_ryt(storage)) == {("CC", "SC_0", "TEC_0", "2021"): -5}


def test_saving_without_edits_keeps_values_and_types(grid, storage):
    # CC holds values such as 0.0001 that the default 3-decimal display shows as 0.000.
    select_param(grid, "CC")
    before = read_ryt(storage)
    save(grid)
    assert changed_cells(before, read_ryt(storage)) == {}


def test_edit_after_sorting_and_filtering_updates_the_intended_row(grid, storage):
    before = read_ryt(storage)
    title = grid.locator("#osy-gridRYT .tabulator-col[tabulator-field='Tech'] .tabulator-col-title")
    title.click()
    title.click()
    # The column menu replaces jqxGrid's: a condition, a value, then Filter.
    grid.locator("#osy-gridRYT .tabulator-col[tabulator-field='Tech'] .tabulator-header-popup-button").click()
    menu = grid.locator(".osy-grid-menu")
    expect(menu).to_be_visible()
    menu.locator("[data-part='firstValue']").fill("ACE")
    menu.locator("[data-act='filter']").click()
    grid.wait_for_function(f"() => {TABLE}.getData('active').every(row => row.Tech.toUpperCase().includes('ACE'))")
    edit(grid, BASE_ROW, "2025", "123.4567")
    save(grid)
    assert changed_cells(before, read_ryt(storage)) == {("TAU", "SC_0", "TEC_egvvw", "2025"): 123.4567}


def test_paste_writes_a_block_into_the_selected_rows(grid, storage):
    select_param(grid, "TAL")
    keys = grid.evaluate(f"() => {TABLE}.getRows('active').slice(0, 2).map(row => row.getData()._key)")
    before = read_ryt(storage)
    grid.context.grant_permissions(["clipboard-read", "clipboard-write"])
    grid.evaluate("text => navigator.clipboard.writeText(text)", "1\t2\n3\t4")
    cell(grid, keys[0], "2030").click()
    grid.keyboard.press("ControlOrMeta+V")
    grid.wait_for_function(f"() => {TABLE}.getRow('{keys[1]}').getData()['2031'] === 4")
    save(grid)
    first, second = (key.split("|")[1] for key in keys)
    assert changed_cells(before, read_ryt(storage)) == {
        ("TAL", "SC_0", first, "2030"): 1,
        ("TAL", "SC_0", first, "2031"): 2,
        ("TAL", "SC_0", second, "2030"): 3,
        ("TAL", "SC_0", second, "2031"): 4,
    }
