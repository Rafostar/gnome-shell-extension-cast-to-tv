const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const ByteArray = imports.byteArray;
const ExtensionUtils = imports.misc.extensionUtils;
const Local = ExtensionUtils.getCurrentExtension();
const Convenience = Local.imports.convenience;
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const _ = Gettext.gettext;
const charPath = Local.path + '/CharEnc';
let readOk, charEnc;
let charLines;

function init()
{
	Convenience.initTranslations();
}

const CastToTvSettings = new GObject.Class({
Name: 'CastToTvSettings',
Extends: Gtk.Grid,

_init: function(params)
{
	this.parent(params);
	this.margin = 20;
	this.spacing = 30;
	this.row_spacing = 6;
	this._settings = Convenience.getSettings();

	let label = null;
	let widget = null;
	let value = null;

	// Label: General
	label = new Gtk.Label({
		label: '<b><big>' + _("General") + '</big></b>',
		use_markup: true,
		hexpand: true,
		halign: Gtk.Align.START
	});
	this.attach(label, 0, 0, 1, 1);

	// FFmpeg Path
	label = new Gtk.Label({
		label: _("FFmpeg path"),
		hexpand: true,
		halign: Gtk.Align.START,
		margin_left: 12
	});
	widget = new Gtk.Entry({hexpand: true, halign:Gtk.Align.FILL});
	widget.set_placeholder_text("/usr/bin/ffmpeg");
	this._settings.bind('ffmpeg-path', widget, 'text', Gio.SettingsBindFlags.DEFAULT);
	this.attach(label, 0, 1, 1, 1);
	this.attach(widget, 1, 1, 1, 1);

	// FFprobe Path
	label = new Gtk.Label({
		label: _("FFprobe path"),
		hexpand: true,
		halign: Gtk.Align.START,
		margin_left: 12
	});
	widget = new Gtk.Entry({hexpand: true, halign:Gtk.Align.FILL});
	widget.set_placeholder_text("/usr/bin/ffprobe");
	this._settings.bind('ffprobe-path', widget, 'text', Gio.SettingsBindFlags.DEFAULT);
	this.attach(label, 0, 2, 1, 1);
	this.attach(widget, 1, 2, 1, 1);

	// Receiver Type
	label = new Gtk.Label({
		label: _("Receiver type"),
		hexpand: true,
		halign: Gtk.Align.START,
		margin_left: 12
	});
	widget = new Gtk.ComboBoxText({halign:Gtk.Align.END});
	widget.append('chromecast', "Chromecast");
	widget.append('other', _("Other device"));
	this._settings.bind('receiver-type', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
	this.attach(label, 0, 3, 1, 1);
	this.attach(widget, 1, 3, 1, 1);
	widget.grab_focus();

	// Listening Port
	label = new Gtk.Label({
		label: _("Listening port"),
		hexpand: true,
		halign: Gtk.Align.START,
		margin_left: 12
	});
        widget = new Gtk.SpinButton({halign:Gtk.Align.END});
        widget.set_sensitive(true);
        widget.set_range(1, 65535);
        widget.set_value(this._settings.get_int('listening-port'));
        widget.set_increments(1, 2);
	widget.connect('value-changed', Lang.bind(this, function(w)
	{
		value = w.get_value_as_int();
		this._settings.set_int('listening-port', value);
	}));
	this.attach(label, 0, 4, 1, 1);
	this.attach(widget, 1, 4, 1, 1);

	// Label: Media Encoding
	label = new Gtk.Label({
		label: '<b><big>' + _("Media Encoding") + '</big></b>',
		use_markup: true,
		hexpand: true,
		margin_top: 20,
		halign: Gtk.Align.START
	});
	this.attach(label, 0, 5, 1, 1);

	// Video Bitrate
	label = new Gtk.Label({
		label: _("Bitrate (Mbps)"),
		hexpand: true,
		halign: Gtk.Align.START,
		margin_left: 12
	});
        widget = new Gtk.SpinButton({halign:Gtk.Align.END, digits:1});
        widget.set_sensitive(true);
        widget.set_range(2.0, 10.0);
        widget.set_value(this._settings.get_double('video-bitrate'));
        widget.set_increments(0.1, 0.2);
	widget.connect('value-changed', Lang.bind(this, function(w)
	{
		value = w.get_value();
		value = +value.toFixed(1);
		this._settings.set_double('video-bitrate', value);
	}));
	this.attach(label, 0, 6, 1, 1);
	this.attach(widget, 1, 6, 1, 1);

	// Hardware Acceleration
	label = new Gtk.Label({
		label: _("Hardware acceleration"),
		hexpand: true,
		halign: Gtk.Align.START,
		margin_left: 12
	});
	widget = new Gtk.ComboBoxText({halign:Gtk.Align.END});
	widget.append('none', _("None"));
	widget.append('vaapi', "VAAPI");
	//widget.append('nvenc', "NVENC");
	this._settings.bind('video-acceleration', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
	this.attach(label, 0, 7, 1, 1);
	this.attach(widget, 1, 7, 1, 1);

	// Label: Chromecast Remote
	label = new Gtk.Label({
		label: '<b><big>' + _("Chromecast Remote") + '</big></b>',
		use_markup: true,
		hexpand: true,
		margin_top: 20,
		halign: Gtk.Align.START
	});
	this.attach(label, 0, 8, 1, 1);

	// Remote Position
	label = new Gtk.Label({
		label: _("Remote position"),
		hexpand: true,
		halign: Gtk.Align.START,
		margin_left: 12
	});
	widget = new Gtk.ComboBoxText({halign:Gtk.Align.END});
	widget.append('left', _("Left"));
	widget.append('center-left', _("Center (left side)"));
	widget.append('center-right', _("Center (right side)"));
	widget.append('right', _("Right"));
	this._settings.bind('remote-position', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
	this.attach(label, 0, 9, 1, 1);
	this.attach(widget, 1, 9, 1, 1);

	// Seek Backward/Forward
	label = new Gtk.Label({
		label: _("Seek backward/forward (seconds)"),
		hexpand: true,
		halign: Gtk.Align.START,
		margin_left: 12
	});
        widget = new Gtk.SpinButton({halign:Gtk.Align.END});
        widget.set_sensitive(true);
        widget.set_range(1, 120);
        widget.set_value(this._settings.get_int('seek-time'));
        widget.set_increments(1, 2);
	widget.connect('value-changed', Lang.bind(this, function(w)
	{
		value = w.get_value_as_int();
		this._settings.set_int('seek-time', value);
	}));
	this.attach(label, 0, 10, 1, 1);
	this.attach(widget, 1, 10, 1, 1);

	// Label: Miscellaneous
	label = new Gtk.Label({
		label: '<b><big>' + _("Miscellaneous") + '</big></b>',
		use_markup: true,
		hexpand: true,
		margin_top: 20,
		halign: Gtk.Align.START
	});
	this.attach(label, 0, 11, 1, 1);

	// Music Visualizer
	label = new Gtk.Label({
		label: _("Music visualizer"),
		hexpand: true,
		halign: Gtk.Align.START,
		margin_left: 12
	});
	widget = new Gtk.Switch({halign:Gtk.Align.END});
	widget.set_sensitive(true);
	widget.set_active(this._settings.get_boolean('music-visualizer'));
	widget.connect('notify::active', Lang.bind(this, function(w)
	{
		value = w.get_active();
		this._settings.set_boolean('music-visualizer', value);
	}));
	this.attach(label, 0, 12, 1, 1);
	this.attach(widget, 1, 12, 1, 1);

	// Subtitles Encoding
	label = new Gtk.Label({
		label: _("Subtitles encoding"),
		hexpand: true,
		halign: Gtk.Align.START,
		margin_left: 12
	});
	widget = new Gtk.ComboBoxText({halign:Gtk.Align.END});
	if(readOk)
	{
		if(charEnc instanceof Uint8Array) charLines = ByteArray.toString(charEnc).split('\r\n');
		else charLines = String(charEnc).split('\r\n');

		charLines.forEach(function(line)
		{
			if(line) widget.append(line, line);
		});
	}
	else
	{
		widget.append('UTF-8', 'UTF-8');
	}
	this._settings.bind('subtitles-encoding', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
	this.attach(label, 0, 13, 1, 1);
	this.attach(widget, 1, 13, 1, 1);
}});

function buildPrefsWidget()
{
	let charExists = GLib.file_test(charPath, 16);
	if(charExists) [readOk, charEnc] = GLib.file_get_contents(charPath);

	let widget = new CastToTvSettings();
	widget.show_all();

	return widget;
}
