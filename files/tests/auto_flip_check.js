"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = {config: {auto_flip_board: true, flip: false}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/renderer/95_hub.js"), "utf8"), context);
const sync = vm.runInContext("hub_props.sync_auto_flip", context);
let flips = 0;
const hub = {
	tree: {node: {board: {active: "b"}}},
	toggle_flip: () => { context.config.flip = !context.config.flip; flips++; }
};

sync.call(hub);
assert.equal(context.config.flip, true);
sync.call(hub);
assert.equal(flips, 1);
hub.tree.node.board.active = "w";
sync.call(hub);
assert.equal(context.config.flip, false);
context.config.auto_flip_board = false;
hub.tree.node.board.active = "b";
sync.call(hub);
assert.equal(flips, 2);

console.log("Auto flip OK");
