"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const info = {
	move: "e2e4", pv: ["e2e4", "e7e5"], subcycle: 1, __touched: false,
	nice_pv: () => ["e4", "e5"], value_string: () => "60.0", stats_list: () => []
};
const context = {
	config: {
		show_move_guidance: true, show_scores: true, show_cp: false,
		searchmoves_buttons: false, never_grayout_infolines: false,
		infobox_pv_move_numbers: false, max_info_lines: null, looker_api: null
	},
	infobox: {innerHTML: ""},
	SortedMoveInfo: () => [info], CompareArrays: () => false,
	OppositeColour: colour => colour === "w" ? "b" : "w"
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/renderer/82_infobox.js"), "utf8"), context);
const box = vm.runInContext("infobox_props", context);
box.displaying_error_log = () => false;
const node = {
	id: 1, destroyed: false, searchmoves: [], terminal_reason: () => "",
	table: {version: 1, nodes: 0}, board: {fullmove: 1}
};

box.draw_infobox(node, null, null, "w", null, false, null);
assert.match(context.infobox.innerHTML, /60\.0%/);
assert.match(context.infobox.innerHTML, /e4/);

context.config.show_move_guidance = false;
context.config.show_scores = false;
box.must_draw_infobox();
box.draw_infobox(node, null, null, "w", null, false, null);
assert.doesNotMatch(context.infobox.innerHTML, /60\.0%|e4|e5/);
assert.equal(box.info_clickers.length, 0);

console.log("Display controls OK");
