"use strict";

const ANNOTATION_COLOURS = Object.freeze({
	green: "rgba(80, 170, 70, 0.58)",
	red: "rgba(210, 65, 55, 0.58)",
	yellow: "rgba(225, 180, 35, 0.58)",
	blue: "rgba(55, 120, 210, 0.58)",
});

function annotation_colour(event) {
	if (event.shiftKey) return "red";
	if (event.ctrlKey) return "yellow";
	if (event.altKey) return "blue";
	return "green";
}

function draw_annotations(node) {
	if (!node || !Array.isArray(node.annotations)) return;
	let size = config.square_size;
	for (let mark of node.annotations) {
		boardctx.save();
		boardctx.strokeStyle = ANNOTATION_COLOURS[mark.colour] || ANNOTATION_COLOURS.green;
		boardctx.fillStyle = boardctx.strokeStyle;
		boardctx.lineWidth = Math.max(3, size * 0.1);
		boardctx.lineCap = "round";
		if (mark.type === "circle") {
			let p = Point(mark.square);
			if (p) {
				let c = CanvasCoords(p.x, p.y);
				boardctx.beginPath();
				boardctx.arc(c.cx, c.cy, size * 0.36, 0, Math.PI * 2);
				boardctx.stroke();
			}
		} else if (mark.type === "arrow") {
			boardctx.lineWidth = Math.max(5, size * 0.22);
			let from = Point(mark.from);
			let to = Point(mark.to);
			if (from && to) {
				let a = CanvasCoords(from.x, from.y);
				let b = CanvasCoords(to.x, to.y);
				let angle = Math.atan2(b.cy - a.cy, b.cx - a.cx);
				let head = size * 0.55;
				let endx = b.cx - Math.cos(angle) * size * 0.24;
				let endy = b.cy - Math.sin(angle) * size * 0.24;
				boardctx.beginPath();
				boardctx.moveTo(a.cx, a.cy);
				boardctx.lineTo(endx, endy);
				boardctx.stroke();
				boardctx.beginPath();
				boardctx.moveTo(b.cx, b.cy);
				boardctx.lineTo(endx - Math.cos(angle - Math.PI / 2) * head / 2, endy - Math.sin(angle - Math.PI / 2) * head / 2);
				boardctx.lineTo(endx - Math.cos(angle + Math.PI / 2) * head / 2, endy - Math.sin(angle + Math.PI / 2) * head / 2);
				boardctx.closePath();
				boardctx.fill();
			}
		}
		boardctx.restore();
	}
}

const annotations_handler = {
	start: null,
	preview_square: null,

	mark: function(square) {
		return square === this.start.square
			? {type: "circle", square: square, colour: this.start.colour}
			: {type: "arrow", from: this.start.square, to: square, colour: this.start.colour};
	},

	mousedown: function(event) {
		if (event.button !== 2 || position_editor.active) return false;
		let square = EventPathString(event, "overlay_");
		if (!Point(square)) return false;
		event.preventDefault();
		this.start = {square: square, colour: annotation_colour(event)};
		return true;
	},

	mousemove: function(event) {
		if (!this.start || !(event.buttons & 2)) return;
		let square = EventPathString(event, "overlay_");
		if (!Point(square)) square = null;
		if (square === this.preview_square) return;
		this.preview_square = square;
		hub.draw_canvas_arrows();
	},

	draw_preview: function() {
		if (this.start && this.preview_square) {
			draw_annotations({annotations: [this.mark(this.preview_square)]});
		}
	},

	mouseup: function(event) {
		if (!this.start || event.button !== 2) return;
		let square = EventPathString(event, "overlay_");
		if (!Point(square)) {
			this.cancel();
			return;
		}
		let mark = this.mark(square);
		this.start = null;
		this.preview_square = null;
		let annotations = hub.tree.node.annotations;
		let same = JSON.stringify(mark);
		let index = annotations.findIndex(item => JSON.stringify(item) === same);
		if (index < 0) annotations.push(mark); else annotations.splice(index, 1);
		hub.draw_canvas_arrows();
	},

	cancel: function() {
		if (!this.start) return;
		this.start = null;
		this.preview_square = null;
		hub.draw_canvas_arrows();
	},
};
