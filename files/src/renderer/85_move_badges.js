"use strict";

// Lichess puzzle-theme names are the canonical vocabulary. Detection is an
// independent, real-time implementation over Nibbler's Position API.

const MOTIF_VALUES = Object.freeze({p:1, n:3, b:3, r:5, q:9, k:100});
const MOTIF_META = Object.freeze({
	pin:             {icon:"│", colour:"#8b70d6", name:"Pin", description:"A piece cannot move without exposing a more valuable piece."},
	fork:            {icon:"Y", colour:"#b06bd6", name:"Fork", description:"The moved piece attacks at least two valuable pieces."},
	discovered_attack:{icon:"↗", colour:"#d86f45", name:"Discovered attack", description:"The move uncovers an attack from another piece."},
	double_check:    {icon:"++", colour:"#d64f4f", name:"Double check", description:"Two pieces check the king at the same time."},
	skewer:          {icon:"⇥", colour:"#8b70d6", name:"Skewer", description:"A valuable piece is attacked in front of another piece."},
	hanging_piece:   {icon:"H", colour:"#d69a45", name:"Hanging piece", description:"The move wins an undefended piece."},
	capture_defender:{icon:"D×", colour:"#d66f45", name:"Capture the defender", description:"The move captures a piece that was defending another target."},
	trapped_piece:   {icon:"□", colour:"#d69a45", name:"Trapped piece", description:"The move leaves an attacked piece without a safe escape."},
	sacrifice:       {icon:"S", colour:"#d64f4f", name:"Sacrifice", description:"The move deliberately offers material for a tactical gain."},
	xray_attack:     {icon:"X", colour:"#8b70d6", name:"X-Ray attack", description:"A sliding piece attacks through another piece."},
	clearance:       {icon:"↔", colour:"#4a8fa8", name:"Clearance", description:"The move clears a line for another piece."},
	deflection:      {icon:"↪", colour:"#d86f45", name:"Deflection", description:"The move attacks a defender and draws it away from its duty."},
	interference:    {icon:"⊥", colour:"#4a8fa8", name:"Interference", description:"The move interrupts a defensive line between pieces."},
	attraction:      {icon:"◎", colour:"#d86f45", name:"Attraction", description:"The move lures a piece onto a vulnerable square."},
	zugzwang:        {icon:"Z", colour:"#7777aa", name:"Zugzwang", description:"Every available reply worsens the opponent's position."},
	advanced_pawn:   {icon:"↑", colour:"#4a9f68", name:"Advanced pawn", description:"A pawn has advanced deep into enemy territory."},
	exposed_king:    {icon:"K!", colour:"#d64f4f", name:"Exposed king", description:"The king lacks shelter and is vulnerable to attack."},
});
const NAG_META = Object.freeze({
	"!!":{colour:"#55aa66", name:"Brilliant move"}, "!":{colour:"#55aa66", name:"Good move"},
	"!?":{colour:"#55aabb", name:"Interesting move"}, "?!":{colour:"#d69a45", name:"Dubious move"},
	"?":{colour:"#d65b45", name:"Mistake"}, "??":{colour:"#d64545", name:"Blunder"},
});
// Expected-score loss: Chess.com V2's public error bands, applied directly to
// the WDL-aware 0..1 values Nibbler already receives from the engine.
const NAG_LIMIT = Object.freeze({near_best:0.02, inaccuracy:0.05, mistake:0.10, blunder:0.20, playable:0.40, won:0.90});
const MOTIF_PRIORITY = Object.freeze({
	pin:0, fork:1, discovered_attack:2, double_check:3, skewer:4, hanging_piece:5,
	capture_defender:6, trapped_piece:7, sacrifice:8, xray_attack:9, clearance:10,
	deflection:11, interference:12, attraction:13, zugzwang:14, advanced_pawn:15, exposed_king:16,
});

function motif_sliders(piece) {
	let p = piece.toLowerCase();
	let diagonal = [[1,1],[1,-1],[-1,1],[-1,-1]];
	let straight = [[1,0],[-1,0],[0,1],[0,-1]];
	if (p === "b") return diagonal;
	if (p === "r") return straight;
	if (p === "q") return diagonal.concat(straight);
	return [];
}

function motif_attacks(board, source) {
	let piece = board.piece(source);
	let p = piece.toLowerCase();
	let points = [];
	let add = (x, y) => { let point = Point(x, y); if (point) points.push(point); };
	if (p === "p") {
		let dy = piece === "P" ? -1 : 1;
		add(source.x - 1, source.y + dy);
		add(source.x + 1, source.y + dy);
	} else if (p === "n") {
		for (let [dx, dy] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(source.x + dx, source.y + dy);
	} else if (p === "k") {
		for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) add(source.x + dx, source.y + dy);
	} else {
		for (let [dx, dy] of motif_sliders(piece)) {
			for (let n = 1; n < 8; n++) {
				let point = Point(source.x + dx * n, source.y + dy * n);
				if (!point) break;
				points.push(point);
				if (board.piece(point)) break;
			}
		}
	}
	return points;
}

function motif_attackers(board, target, colour) {
	let attackers = [];
	for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
		let source = Point(x, y);
		if (board.colour(source) === colour && motif_attacks(board, source).includes(target)) attackers.push(source);
	}
	return attackers;
}

function motif_move_square(node) {
	if (!node || !node.parent || !node.move) return null;
	let from = Point(node.move.slice(0, 2));
	let to = Point(node.move.slice(2, 4));
	let before = node.parent.board;
	if (!from || !to) return null;
	let piece = before.piece(from);
	if (piece.toLowerCase() === "k" && before.colour(from) === before.colour(to)) {
		return Point(to.x > from.x ? 6 : 2, from.y);
	}
	return to;
}

function detect_move_motifs(node) {
	if (!node || !node.parent || !node.move) return [];
	let before = node.parent.board;
	let after = node.board;
	let from = Point(node.move.slice(0, 2));
	let to = Point(node.move.slice(2, 4));
	let dest = motif_move_square(node);
	let moved = before.piece(from);
	let colour = before.colour(from);
	let opponent = colour === "w" ? "b" : "w";
	let role = moved.toLowerCase();
	let motifs = [];
	let push = id => { if (!motifs.includes(id)) motifs.push(id); };
	let value = point => MOTIF_VALUES[after.piece(point).toLowerCase()] || 0;
	let same_square = (a, b) => a && b && a.s === b.s;

	let enemy_king = after.find(opponent === "w" ? "K" : "k")[0];
	let checkers = enemy_king ? motif_attackers(after, enemy_king, colour) : [];
	if (checkers.length > 1) push("double_check");

	// A move that vacates a line creates either a discovered attack or clearance.
	let opened_line = false;
	for (let x = 0; x < 8 && !opened_line; x++) for (let y = 0; y < 8 && !opened_line; y++) {
		let target = Point(x, y);
		if (after.colour(target) !== opponent || value(target) < 3) continue;
		let old_sources = motif_attackers(before, target, colour).map(point => point.s);
		opened_line = motif_attackers(after, target, colour).some(source =>
			!same_square(source, dest) && motif_sliders(after.piece(source)).length && !old_sources.includes(source.s));
	}
	if (opened_line) {
		if (checkers.some(source => !same_square(source, dest))) push("discovered_attack");
		else push("clearance");
	}

	if (["b", "r", "q"].includes(role)) {
		for (let [dx, dy] of motif_sliders(moved)) {
			let hits = [];
			for (let n = 1; n < 8; n++) {
				let point = Point(dest.x + dx * n, dest.y + dy * n);
				if (!point) break;
				if (after.piece(point)) hits.push(point);
				if (hits.length === 2) break;
			}
			if (hits.length === 2 && hits.every(p => after.colour(p) === opponent)) {
				let first = value(hits[0]);
				let second = value(hits[1]);
				if (second > first) push("pin");
				if (first > second) push("skewer");
			}
			if (hits.length === 2 && after.colour(hits[1]) === opponent && value(hits[1]) >= 3) push("xray_attack");
		}
	}

	let fork_targets = motif_attacks(after, dest).filter(point =>
		after.colour(point) === opponent && MOTIF_VALUES[after.piece(point).toLowerCase()] >= MOTIF_VALUES[role]);
	if (fork_targets.length >= 2) push("fork");

	let castle = role === "k" && before.colour(from) === before.colour(to);
	let captured = castle ? "" : before.piece(to);

	// Captures of loose pieces and defenders.
	if (captured && !motif_attackers(before, to, opponent).length) push("hanging_piece");
	if (captured) {
		let defended_targets = motif_attacks(before, to).filter(point =>
			before.colour(point) === opponent && MOTIF_VALUES[before.piece(point).toLowerCase()] >= 3);
		if (defended_targets.some(target => after.piece(target) && motif_attackers(after, target, colour).length)) push("capture_defender");
	}

	// Attacking a defender of a more valuable target is a deflection threat.
	for (let defender of motif_attacks(after, dest)) {
		if (after.colour(defender) !== opponent) continue;
		let defended = motif_attacks(after, defender).filter(target => after.colour(target) === opponent);
		if (defended.some(target => value(target) > value(defender))) push("deflection");
	}

	// A non-pawn piece is trapped if every pseudo-legal escape remains attacked.
	for (let target of motif_attacks(after, dest)) {
		let target_role = after.piece(target).toLowerCase();
		if (after.colour(target) !== opponent || !["n", "b", "r", "q"].includes(target_role)) continue;
		let escapes = motif_attacks(after, target).filter(square =>
			after.colour(square) !== opponent && !motif_attackers(after, square, colour).length);
		if (!escapes.length) push("trapped_piece");
	}

	// Moving onto an enemy line can interrupt a slider's defence or attack.
	for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
		let target = Point(x, y);
		if (after.colour(target) !== colour || value(target) < 5) continue;
		let old_sliders = motif_attackers(before, target, opponent).filter(source => motif_sliders(before.piece(source)).length);
		let new_sources = motif_attackers(after, target, opponent).map(source => source.s);
		if (old_sliders.some(source => !new_sources.includes(source.s))) push("interference");
	}

	let enemy_attackers = motif_attackers(after, dest, opponent);
	let tactical_gain = motifs.some(id => ["fork", "double_check", "discovered_attack", "capture_defender", "deflection"].includes(id));
	let captured_value = captured ? MOTIF_VALUES[captured.toLowerCase()] : 0;
	if (role !== "p" && MOTIF_VALUES[role] > captured_value && enemy_attackers.some(source => value(source) < MOTIF_VALUES[role]) && tactical_gain) {
		push("sacrifice");
	}

	if (enemy_king && checkers.some(source => same_square(source, dest)) &&
		Math.max(Math.abs(enemy_king.x - dest.x), Math.abs(enemy_king.y - dest.y)) === 1 && enemy_attackers.some(source => same_square(source, enemy_king))) {
		push("attraction");
	}

	if (role === "p" && (colour === "w" ? dest.y <= 2 : dest.y >= 5)) push("advanced_pawn");

	if (enemy_king && checkers.length) {
		let shield_y = enemy_king.y + (opponent === "w" ? -1 : 1);
		let shield = 0;
		for (let x = enemy_king.x - 1; x <= enemy_king.x + 1; x++) {
			let point = Point(x, shield_y);
			if (point && after.piece(point) === (opponent === "w" ? "P" : "p")) shield++;
		}
		if (shield <= 1) push("exposed_king");
	}

	if (!captured && !checkers.length) {
		let replies = after.movegen();
		let quiet = replies.length && replies.length <= 2 && replies.every(move => !after.piece(Point(move.slice(2, 4))));
		if (quiet) push("zugzwang");
	}
	return motifs.sort((a, b) => MOTIF_PRIORITY[a] - MOTIF_PRIORITY[b]);
}

function draw_badge(text, point, top, colour) {
	let c = CanvasCoords(point.x, point.y);
	let size = config.square_size;
	let radius = Math.max(8, size * 0.145);
	let x = c.x2 - radius - size * 0.045;
	let y = top ? c.y1 + radius + size * 0.045 : c.y2 - radius - size * 0.045;
	boardctx.save();
	boardctx.beginPath();
	boardctx.arc(x, y, radius, 0, Math.PI * 2);
	boardctx.fillStyle = "rgba(20, 20, 20, 0.88)";
	boardctx.fill();
	boardctx.lineWidth = Math.max(1, size * 0.025);
	boardctx.strokeStyle = colour;
	boardctx.stroke();
	boardctx.fillStyle = "#ffffff";
	boardctx.font = `bold ${Math.max(9, size * (text.length > 2 ? 0.16 : 0.21))}px Arial`;
	boardctx.textAlign = "center";
	boardctx.textBaseline = "middle";
	boardctx.fillText(text, x, y + size * 0.01);
	boardctx.restore();
}

function engine_move_nag(node) {
	if (!node || !node.parent || !node.move) return "";
	let usable = info => info && !info.__ghost && info.__touched && typeof info.value === "function" && typeof info.value() === "number";
	let before = SortedMoveInfo(node.parent).filter(usable);
	if (!before.length) return "";

	let best = before[0];
	let played = node.parent.table.moveinfo[node.move];
	let played_value;
	if (usable(played)) {
		played_value = played.value();
	} else {
		let reply = SortedMoveInfo(node).find(usable);
		if (!reply) return "";
		played_value = 1 - reply.value();
	}

	let loss = Math.max(0, best.value() - played_value);
	let reaches = threshold => loss >= threshold - 1e-12;
	if (reaches(NAG_LIMIT.blunder)) return "??";
	if (reaches(NAG_LIMIT.mistake)) return "?";
	if (reaches(NAG_LIMIT.inaccuracy)) return "?!";

	let motifs = Array.isArray(node.motifs) ? node.motifs : [];
	let tactical = ["pin", "fork", "discovered_attack", "double_check", "skewer", "capture_defender", "sacrifice", "deflection", "attraction"];
	let near_best = loss <= NAG_LIMIT.near_best + 1e-12;
	let alternative = before.find(info => info.move !== node.move);
	if (near_best && motifs.includes("sacrifice") && alternative &&
		played_value >= NAG_LIMIT.playable && alternative.value() < NAG_LIMIT.won) return "!!";

	let only_move = best.move === node.move && alternative && best.value() - alternative.value() >= NAG_LIMIT.inaccuracy;
	if (near_best && (only_move || motifs.some(motif => tactical.includes(motif)))) return "!";
	if (loss < NAG_LIMIT.inaccuracy && motifs.some(motif => tactical.includes(motif))) return "!?";
	return "";
}

function draw_move_badges(node) {
	if (!config.move_badges || !node || !node.move) return;
	let point = motif_move_square(node);
	if (!point) return;
	if (node.motifs === null) node.motifs = detect_move_motifs(node);
	if (!node.nag_from_pgn) {
		node.nag = engine_move_nag(node);
	}
	let motif = node.motifs[0];
	if (motif && MOTIF_META[motif]) draw_badge(MOTIF_META[motif].icon, point, false, MOTIF_META[motif].colour);
	if (node.nag) {
		draw_badge(node.nag, point, true, NAG_META[node.nag] ? NAG_META[node.nag].colour : "#999999");
	}
}

function badge_legend_html() {
	let badge = (text, colour) => `<span class="badge-legend-icon" data-colour="${colour}">${text}</span>`;
	let motifs = Object.values(MOTIF_META).map(meta => `<div class="badge-legend-item">
		${badge(meta.icon, meta.colour)}<div><strong>${translate.t(meta.name)}</strong><small>${translate.t(meta.description)}</small></div>
	</div>`).join("");
	let nags = Object.entries(NAG_META).map(([symbol, meta]) => `<div class="badge-legend-item">
		${badge(symbol, meta.colour)}<div><strong>${symbol} — ${translate.t(meta.name)}</strong></div>
	</div>`).join("");
	return `<div class="badge-legend"><h1>${translate.t("Move badge legend")}</h1>
		<p>${translate.t("Motif badges appear at the bottom-right of the moved piece. Engine-generated NAG badges appear at the top-right after analysis; ordinary moves may have no NAG.")}</p>
		<h2>${translate.t("Motif badges")}</h2><div class="badge-legend-grid">${motifs}</div>
		<h2>${translate.t("PGN NAG badges")}</h2><div class="badge-legend-grid">${nags}</div>
		<button id="badge_legend_close">${translate.t("Close")}</button></div>`;
}
