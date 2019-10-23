imports.gi.versions.Gtk = '3.0';

const { Gtk } = imports.gi;
let gridIndex = 0;

var SettingLabel = class SharedSettingLabel
{
	constructor(text, isTitle, isTopMargin)
	{
		let label = null;
		let marginLR = 0;
		let marginTop = 0;

		if(isTitle) label = '<span font="12.5"><b>' + text + '</b></span>';
		else
		{
			label = text;
			marginLR = 12;
		}

		if(isTopMargin) marginTop = 20;

		return new Gtk.Label({
			label: label,
			use_markup: true,
			hexpand: true,
			halign: Gtk.Align.START,
			margin_top: marginTop,
			margin_left: marginLR,
			margin_right: marginLR
		});
	}
}

function addToGrid(grid, leftWidget, rightWidget, resetIndex)
{
	if(resetIndex) gridIndex = 0;
	if(leftWidget) grid.attach(leftWidget, 0, gridIndex, 1, 1);
	if(rightWidget) grid.attach(rightWidget, 1, gridIndex, 1, 1);

	gridIndex++;
}
