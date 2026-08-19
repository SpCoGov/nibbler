"use strict";

const position_editor_panel = document.getElementById("position_editor");
const position_editor_palette = document.getElementById("position_editor_palette");
const position_editor_error = document.getElementById("position_editor_error");
const editor_active = document.getElementById("editor_active");
const editor_castling = document.getElementById("editor_castling");
const editor_ep = document.getElementById("editor_ep");
const editor_halfmove = document.getElementById("editor_halfmove");
const editor_fullmove = document.getElementById("editor_fullmove");
const editor_start = document.getElementById("editor_start");
const editor_clear = document.getElementById("editor_clear");
const editor_cancel = document.getElementById("editor_cancel");
const editor_apply = document.getElementById("editor_apply");

for (let element of document.querySelectorAll("#position_editor [data-i18n]")) {
	element.textContent = translate.t(element.dataset.i18n);
}

const position_editor = {
	active: false,
	board: null,
	selected_piece: null,
	previous_behaviour: null,

	open: function() {
		if (this.active) return;
		hub.escape();
		this.active = true;
		this.board = hub.tree.node.board.copy();
		this.previous_behaviour = config.behaviour;
		hub.set_behaviour("halt");
		this.selected_piece = null;
		this.populate_controls();
		position_editor_error.textContent = "";
		position_editor_panel.style.display = "block";
		document.documentElement.style.setProperty("--board-size", config.board_size + "px");
		this.draw_board();
	},

	close: function(restore_behaviour) {
		if (!this.active) return;
		this.active = false;
		this.board = null;
		this.selected_piece = null;
		position_editor_panel.style.display = "none";
		drag_handler.cancel_drag();
		hub.friendly_draws = New2DArray(8, 8, null);
		hub.enemy_draws = New2DArray(8, 8, null);
		hub.draw();
		if (restore_behaviour) hub.set_behaviour(this.previous_behaviour);
	},

	cancel: function() { this.close(true); },

	populate_controls: function() {
		let tokens = this.board.fen(true).split(" ");
		editor_active.value = tokens[1];
		editor_castling.value = tokens[2];
		editor_ep.value = tokens[3];
		editor_halfmove.value = tokens[4];
		editor_fullmove.value = tokens[5];
		this.sync_castling_checks();
	},

	sync_castling_checks: function() {
		for (let input of document.querySelectorAll("[data-castling]")) {
			input.checked = editor_castling.value.includes(input.dataset.castling);
		}
	},

	fen: function() {
		let rows = [];
		for (let y = 0; y < 8; y++) {
			let row = "";
			let blanks = 0;
			for (let x = 0; x < 8; x++) {
				let piece = this.board.state[x][y];
				if (!piece) blanks++;
				else { if (blanks) row += blanks; blanks = 0; row += piece; }
			}
			if (blanks) row += blanks;
			rows.push(row);
		}
		return rows.join("/") + " " + editor_active.value + " " + (editor_castling.value.trim() || "-") + " " + (editor_ep.value.trim() || "-") + " " + editor_halfmove.value + " " + editor_fullmove.value;
	},

	apply: function() {
		let fen = this.fen();
		let board;
		try {
			if (!/^(?:-|[KQkqA-Ha-h]+)$/.test(editor_castling.value.trim())) throw "Invalid FEN - castling rights";
			if (!/^\d+$/.test(editor_halfmove.value) || !/^\d+$/.test(editor_fullmove.value)) throw "Invalid FEN - move counters";
			board = LoadFEN(fen);
			if (editor_ep.value.trim() !== "" && editor_ep.value.trim() !== "-" && !board.enpassant) throw "Invalid FEN - en passant";
			if (board.halfmove < 0 || board.fullmove < 1) throw "Invalid FEN - move counters";
		} catch (err) {
			position_editor_error.textContent = translate.t(String(err));
			return;
		}
		let behaviour = this.previous_behaviour;
		this.close(false);
		hub.tree.replace_tree(NewRoot(board));
		hub.position_changed(true, true);
		hub.set_behaviour(behaviour);
	},

	set_board: function(fen) {
		this.board = LoadFEN(fen);
		this.populate_controls();
		this.draw_board();
	},

	clear_board: function() {
		for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) this.board.state[x][y] = "";
		this.draw_board();
	},

	draw_board: function() {
		if (!this.active) return;
		document.documentElement.style.setProperty("--board-size", config.board_size + "px");
		for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
			document.getElementById("underlay_" + S(x, y)).style.backgroundImage = "none";
			let piece = this.board.state[x][y];
			document.getElementById("overlay_" + S(x, y)).style.backgroundImage = piece ? images[piece].string_for_bg_style : "none";
		}
		boardctx.clearRect(0, 0, canvas.width, canvas.height);
	},

	handle_board_mousedown: function(event) {
		if (!this.active) return false;
		let p = Point(EventPathString(event, "overlay_"));
		if (!p) return true;
		event.preventDefault();
		if (event.button === 2) {
			this.board.state[p.x][p.y] = "";
			this.draw_board();
		} else if (event.button === 0 && this.selected_piece) {
			drag_handler.cancel_drag();
			this.board.state[p.x][p.y] = this.selected_piece;
			this.draw_board();
		}
		return true;
	},

	move_piece: function(from, to) {
		let a = Point(from);
		let b = Point(to);
		if (!a) return;
		let piece = this.board.state[a.x][a.y];
		this.board.state[a.x][a.y] = "";
		if (b) this.board.state[b.x][b.y] = piece;
		this.draw_board();
	},
};
