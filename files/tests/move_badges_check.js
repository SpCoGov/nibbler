"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = {
	SortedMoveInfo: node => node.infos
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/renderer/85_move_badges.js"), "utf8"), context);

assert.deepEqual(Array.from(vm.runInContext("Object.keys(MOTIF_META)", context)), [
	"pin", "fork", "discovered_attack", "double_check", "skewer", "hanging_piece",
	"capture_defender", "trapped_piece", "sacrifice", "xray_attack", "clearance",
	"deflection", "interference", "attraction", "zugzwang", "advanced_pawn", "exposed_king"
]);

const info = (move, value) => ({move, __ghost: false, __touched: true, value: () => value});
const position = (best, played, reply) => {
	let parent = {infos: [best, played].filter(Boolean), table: {moveinfo: {[played.move]: played}}};
	return {parent, move: played.move, infos: reply ? [reply] : [], motifs: []};
};

assert.equal(context.engine_move_nag(position(info("e2e4", .60), info("d2d4", .58))), "");
let interesting = position(info("e2e4", .60), info("d2d4", .57));
interesting.motifs = ["fork"];
assert.equal(context.engine_move_nag(interesting), "!?");
assert.equal(context.engine_move_nag(position(info("e2e4", .60), info("d2d4", .55))), "?!");
assert.equal(context.engine_move_nag(position(info("e2e4", .60), info("d2d4", .50))), "?");
assert.equal(context.engine_move_nag(position(info("e2e4", .60), info("d2d4", .40))), "??");
assert.equal(context.engine_move_nag({
	parent: {infos: [info("e2e4", .60)], table: {moveinfo: {}}},
	move: "d2d4", infos: [info("e7e5", .60)], motifs: []
}), "??");
assert.equal(context.engine_move_nag(position(info("e2e4", .60), info("e2e4", .60), info("e7e5", .40))), "");
let good = info("e2e4", .65);
assert.equal(context.engine_move_nag({
	parent: {infos: [good, info("d2d4", .60)], table: {moveinfo: {e2e4: good}}},
	move: "e2e4", infos: [], motifs: []
}), "!");
let brilliant = info("e2e4", .61);
assert.equal(context.engine_move_nag({
	parent: {infos: [brilliant, info("d2d4", .60)], table: {moveinfo: {e2e4: brilliant}}},
	move: "e2e4", infos: [], motifs: ["sacrifice"]
}), "!!");

// A forced best move is good, not automatically brilliant; a bad sacrifice is still bad.
let forced = info("e2e4", .70);
assert.equal(context.engine_move_nag({
	parent: {infos: [forced, info("d2d4", .60)], table: {moveinfo: {e2e4: forced}}},
	move: "e2e4", infos: [], motifs: []
}), "!");
let unsound = position(info("e2e4", .70), info("d2d4", .50));
unsound.motifs = ["sacrifice"];
assert.equal(context.engine_move_nag(unsound), "??");
let already_won = position(info("e2e4", .96), info("d2d4", .95));
already_won.motifs = ["sacrifice"];
assert.equal(context.engine_move_nag(already_won), "!");

console.log("Engine NAG classification OK");
