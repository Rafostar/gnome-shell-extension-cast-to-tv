imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';

const { Gio, Gtk, GLib, Gdk, Vte, Pango, GObject } = imports.gi;
const ByteArray = imports.byteArray;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const { SettingLabel, addToGrid } = Local.imports.prefs_shared;
const Soup = Local.imports.soup;
const Helper = Local.imports.helper;
const Settings = Helper.getSettings(Local.path);
const shared = Local.imports.shared.module.exports;
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const _ = Gettext.gettext;

const HOME_DIR = GLib.get_home_dir();
const NODE_PATH = (GLib.find_program_in_path('nodejs') || GLib.find_program_in_path('node'));
const NPM_PATH = GLib.find_program_in_path('npm');
const FILE_MANAGERS = ['nautilus', 'nemo'];

let nodeDir;
let nodeBin;

function init()
{
	Helper.initTranslations(Local.path);
}

class MissingNotification extends Gtk.VBox
{
	constructor(dependName)
	{
		super({height_request: 380, spacing: 10, margin: 20});
		let label = null;

		label = new Gtk.Label({
			/* TRANSLATORS: Will contain dependency name at the beginning (e.g. Node.js is not installed) */
			label: '<span font="16"><b>' + dependName + " " + _("is not installed") + '</b></span>',
			use_markup: true,
			vexpand: true,
			valign: Gtk.Align.CENTER
		});
		this.pack_start(label, true, true, 0);
		this.show_all();
	}
}

class StreamingNotification extends Gtk.VBox
{
	constructor()
	{
		super({height_request: 380, spacing: 10, margin: 10});
		let label = null;

		label = new Gtk.Label({
			label: '<span font="16"><b>' + _("Streaming in progress") + '</b></span>',
			use_markup: true,
			vexpand: true,
			valign: Gtk.Align.END,
			margin_top: 10
		});
		this.pack_start(label, true, true, 0);

		label = new Gtk.Label({
			/* TRANSLATORS: Keep line this short (otherwise extension prefs will strech) */
			label: '<span font="13">' + _("Stop media transfer before accessing extension settings") + '</span>',
			use_markup: true,
			vexpand: true,
			valign: Gtk.Align.START,
			margin_bottom: 0
		});
		this.pack_start(label, true, true, 0);

		let remoteWidget = new RemoteSettings();
		this.pack_start(remoteWidget, true, true, 0);
	}
}

class MainSettings extends Gtk.VBox
{
	constructor()
	{
		super();
		let label = null;
		let widget = null;
		let button = null;
		let box = null;

		let grid = new Gtk.Grid({
			margin: 20,
			row_spacing: 6
		});
		this.pack_start(grid, false, false, 0);

		/* Label: Main Options */
		label = new SettingLabel(_("Main Options"), true);
		addToGrid(grid, label, null, true);

		/* Receiver Type */
		label = new SettingLabel(_("Receiver type"));
		widget = new Gtk.ComboBoxText({width_request: 230, halign:Gtk.Align.END});
		widget.append('chromecast', "Chromecast");
		/* TRANSLATORS: "Playercast" is a name of an app, so do not change it */
		widget.append('playercast', _("Playercast app"));
		/* TRANSLATORS: Web browser or Media player app selection.
		This should be as short as possible e.g. "Browser | Player". */
		widget.append('other', _("Web browser | Media player"));
		Settings.bind('receiver-type', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(grid, label, widget);

		/* FFmpeg Path */
		label = new SettingLabel(_("FFmpeg path"));
		widget = new Gtk.Entry({width_request: 230, halign:Gtk.Align.END});
		widget.set_placeholder_text("/usr/bin/ffmpeg");
		Settings.bind('ffmpeg-path', widget, 'text', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(grid, label, widget);

		/* FFprobe Path */
		label = new SettingLabel(_("FFprobe path"));
		widget = new Gtk.Entry({width_request: 230, halign:Gtk.Align.END});
		widget.set_placeholder_text("/usr/bin/ffprobe");
		Settings.bind('ffprobe-path', widget, 'text', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(grid, label, widget);

		/* Listening Port */
		label = new SettingLabel(_("Listening port"));
		this.portWidget = new Gtk.SpinButton({halign:Gtk.Align.END});
		this.portWidget.set_sensitive(true);
		this.portWidget.set_range(1, 65535);
		this.portWidget.set_value(Settings.get_int('listening-port'));
		this.portWidget.set_increments(1, 2);
		Settings.bind('listening-port', this.portWidget, 'value', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(grid, label, this.portWidget);

		/* Internal Port */
		label = new SettingLabel(_("Internal communication port"));
		this.intPortWidget = new Gtk.SpinButton({halign:Gtk.Align.END});
		this.intPortWidget.set_sensitive(true);
		this.intPortWidget.set_range(1, 65535);
		this.intPortWidget.set_value(Settings.get_int('internal-port'));
		this.intPortWidget.set_increments(1, 2);
		Settings.bind('internal-port', this.intPortWidget, 'value', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(grid, label, this.intPortWidget);

		/* Web player link */
		this.linkButton = new Gtk.LinkButton({
			expand: false,
			halign:Gtk.Align.CENTER
		});

		this.hostIp = getHostIp();

		this.updateLink = () =>
		{
			let link = 'http://' + this.hostIp + ':' + this.portWidget.value;
			this.linkButton.uri = link;
			this.linkButton.label = link;
		}

		box = new Gtk.VBox({
			margin: 5,
			hexpand: true,
			valign:Gtk.Align.END,
			halign:Gtk.Align.CENTER
		});

		this.infoLabel = new Gtk.Label();

		if(this.hostIp)
		{
			this.infoLabel.label = _("Access web player from devices on local network");
			this.updateLink();
		}

		box.pack_start(this.infoLabel, false, false, 0);
		box.pack_start(this.linkButton, false, false, 0);
		this.pack_end(box, false, false, 0);

		this.linkSignal = this.portWidget.connect('value-changed', () => this.updateLink());

		this.checkService = () =>
		{
			let serviceEnabled = Settings.get_boolean('service-enabled');

			if(serviceEnabled && this.hostIp)
			{
				this.infoLabel.show();
				this.linkButton.show();
			}
			else
			{
				this.infoLabel.hide();
				this.linkButton.hide();
			}
		}

		this.serviceSignal = Settings.connect('changed::service-enabled', () => this.checkService());

		this.destroy = () =>
		{
			if(this.serviceSignal)
				Settings.disconnect(this.serviceSignal);

			this.portWidget.disconnect(this.linkSignal);

			super.destroy();
		}
	}
}

class RemoteSettings extends Gtk.Grid
{
	constructor()
	{
		super({margin: 20, row_spacing: 6});
		let label = null;
		let widget = null;

		/* Label: Remote Controller */
		label = new SettingLabel(_("Remote Controller"), true);
		addToGrid(this, label, null, true);

		/* Remote Position */
		label = new SettingLabel(_("Remote position"));
		widget = new Gtk.ComboBoxText({halign:Gtk.Align.END});
		widget.append('left', _("Left"));
		widget.append('center-left', _("Center (left side)"));
		widget.append('center-right', _("Center (right side)"));
		widget.append('right', _("Right"));
		Settings.bind('remote-position', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);

		/* Seek Backward/Forward */
		label = new SettingLabel(_("Seek backward/forward (seconds)"));
		widget = new Gtk.SpinButton({halign:Gtk.Align.END});
		widget.set_sensitive(true);
		widget.set_range(1, 120);
		widget.set_value(Settings.get_int('seek-time'));
		widget.set_increments(1, 2);
		Settings.bind('seek-time', widget, 'value', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);

		/* Slideshow Timer */
		label = new SettingLabel(_("Slideshow time per picture (seconds)"));
		widget = new Gtk.SpinButton({halign:Gtk.Align.END});
		widget.set_sensitive(true);
		widget.set_range(5, 999);
		widget.set_value(Settings.get_int('slideshow-time'));
		widget.set_increments(1, 2);
		Settings.bind('slideshow-time', widget, 'value', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);

		/* Media Buttons Size */
		label = new SettingLabel(_("Media control buttons size"));
		widget = new Gtk.SpinButton({halign:Gtk.Align.END});
		widget.set_sensitive(true);
		widget.set_range(8, 32);
		widget.set_value(Settings.get_int('media-buttons-size'));
		widget.set_increments(1, 2);
		Settings.bind('media-buttons-size', widget, 'value', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);

		/* Slider Icon Size */
		label = new SettingLabel(_("Slider icon size"));
		widget = new Gtk.SpinButton({halign:Gtk.Align.END});
		widget.set_sensitive(true);
		widget.set_range(8, 32);
		widget.set_value(Settings.get_int('slider-icon-size'));
		widget.set_increments(1, 2);
		Settings.bind('slider-icon-size', widget, 'value', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);

		/* Volume Slider */
		label = new SettingLabel(_("Unify sliders"));
		widget = new Gtk.Switch({halign:Gtk.Align.END});
		widget.set_sensitive(true);
		widget.set_active(Settings.get_boolean('unified-slider'));
		Settings.bind('unified-slider', widget, 'active', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);

		/* Remote Label */
		label = new SettingLabel(_("Show remote label"));
		this.remoteSwitch = new Gtk.Switch({halign:Gtk.Align.END});
		this.remoteSwitch.set_sensitive(true);
		this.remoteSwitch.set_active(Settings.get_boolean('remote-label'));
		Settings.bind('remote-label', this.remoteSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, this.remoteSwitch);

		/* Remote Label */
		label = new SettingLabel(_("Receiver name as label"));
		this.nameSwitch = new Gtk.Switch({halign:Gtk.Align.END});
		this.nameSwitch.set_sensitive(true);
		this.nameSwitch.set_active(Settings.get_boolean('remote-label-fn'));
		Settings.bind('remote-label-fn', this.nameSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, this.nameSwitch);

		this.remoteSwitchSignal = this.remoteSwitch.connect('notify::active', () =>
		{
			this.nameSwitch.set_sensitive(this.remoteSwitch.active);
		});

		this.destroy = () =>
		{
			this.remoteSwitch.disconnect(this.remoteSwitchSignal);

			super.destroy();
		}
	}
}

class ChromecastSettings extends Gtk.Grid
{
	constructor()
	{
		super({margin: 20, row_spacing: 6});
		let label = null;
		let widget = null;
		let box = null;
		let button = null;
		let rgba = new Gdk.RGBA();

		let subsConfig = {};
		let sharedSubsConfig = shared.chromecast.subsStyle;

		/* Restore default subtitles values if someone messed them externally */
		try { subsConfig = JSON.parse(Settings.get_string('chromecast-subtitles')); }
		catch(err) { Settings.set_string('chromecast-subtitles', "{}"); }

		let getSubsConfig = (confName) =>
		{
			return subsConfig[confName] || sharedSubsConfig[confName];
		}

		let setSubsConfig = () =>
		{
			Settings.set_string('chromecast-subtitles', JSON.stringify(subsConfig));
		}

		/* Label: Chromecast Options */
		label = new SettingLabel(_("Chromecast Options"), true);
		addToGrid(this, label, null, true);

		/* Chromecast device name */
		label = new SettingLabel(_("Device selection"));
		box = new Gtk.HBox({halign:Gtk.Align.END});
		widget = new Gtk.ComboBoxText();
		this.scanButton = Gtk.Button.new_from_icon_name('view-refresh-symbolic', 4);
		this.ipConfButton = Gtk.Button.new_from_icon_name('emblem-system-symbolic', 4);
		box.pack_end(this.ipConfButton, false, false, 0);
		box.pack_end(this.scanButton, false, false, 4);
		box.pack_end(widget, false, false, 0);
		setDevices(widget);

		let onDevEdit = (widget) =>
		{
			let activeText = widget.get_active_text();
			setDevices(widget, false, activeText);
		}

		this.devChangeSignal = Settings.connect('changed::chromecast-devices', onDevEdit.bind(this, widget));
		this.scanSignal = this.scanButton.connect('clicked',
			scanDevices.bind(this, widget, [this.scanButton, this.ipConfButton])
		);
		this.ipConfSignal = this.ipConfButton.connect('clicked', () => {
			let castIp = new ChromecastIpSettings(this);
		});
		Settings.bind('chromecast-name', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, box);

		/* Label: Subtitles */
		label = new SettingLabel(_("Subtitles"), true, true);
		addToGrid(this, label);

		/* Font Family */
		label = new SettingLabel(_("Font family"));
		this.fontFamily = new Gtk.ComboBoxText({width_request: 180, halign:Gtk.Align.END});
		this.fontFamily.append('SANS_SERIF', "Droid Sans");
		this.fontFamily.append('MONOSPACED_SANS_SERIF', "Droid Sans Mono");
		this.fontFamily.append('SERIF', "Droid Serif Regular");
		this.fontFamily.append('MONOSPACED_SERIF', "Cutive Mono");
		this.fontFamily.append('CASUAL', "Short Stack");
		this.fontFamily.append('CURSIVE', "Quintessential");
		this.fontFamily.append('SMALL_CAPITALS', "Alegreya Sans SC");
		this.fontFamily.active_id = getSubsConfig('fontGenericFamily');
		this.familySignal = this.fontFamily.connect('changed', () =>
		{
			subsConfig.fontFamily = this.fontFamily.get_active_text();
			subsConfig.fontGenericFamily = this.fontFamily.active_id;
			setSubsConfig();
		});
		addToGrid(this, label, this.fontFamily);

		/* Font Style */
		label = new SettingLabel(_("Font style"));
		this.fontStyle = new Gtk.ComboBoxText({width_request: 180, halign:Gtk.Align.END});
		this.fontStyle.append('NORMAL', _("Normal"));
		this.fontStyle.append('BOLD', _("Bold"));
		this.fontStyle.append('ITALIC', _("Italic"));
		this.fontStyle.append('BOLD_ITALIC', _("Bold italic"));
		this.fontStyle.active_id = getSubsConfig('fontStyle');
		this.styleSignal = this.fontStyle.connect('changed', () =>
		{
			subsConfig.fontStyle = this.fontStyle.active_id;
			setSubsConfig();
		});
		addToGrid(this, label, this.fontStyle);

		/* Subtitles Scale */
		label = new SettingLabel(_("Scale factor"));
		this.scaleButton = new Gtk.SpinButton({halign:Gtk.Align.END, digits:1});
		this.scaleButton.set_sensitive(true);
		this.scaleButton.set_range(0.1, 5.0);
		this.scaleButton.set_value(getSubsConfig('fontScale'));
		this.scaleButton.set_increments(0.1, 0.2);
		this.scaleSignal = this.scaleButton.connect('value-changed', () =>
		{
			subsConfig.fontScale = this.scaleButton.value.toFixed(1);
			setSubsConfig();
		});
		addToGrid(this, label, this.scaleButton);

		/* Font Color */
		label = new SettingLabel(_("Font color"));
		rgba.parse(hashToColor(getSubsConfig('foregroundColor')));
		this.fontColor = new Gtk.ColorButton({halign:Gtk.Align.END, rgba: rgba, show_editor: true});
		this.fontColor.set_sensitive(true);
		this.fontColorSignal = this.fontColor.connect('color-set', () =>
		{
			subsConfig.foregroundColor = colorToHash(this.fontColor.rgba.to_string());
			setSubsConfig();
		});
		addToGrid(this, label, this.fontColor);

		/* Font Outline */
		label = new SettingLabel(_("Font outline"));
		box = new Gtk.HBox({halign:Gtk.Align.END});
		this.outlineSwitch = new Gtk.Switch({halign:Gtk.Align.END, valign:Gtk.Align.CENTER});
		this.outlineSwitch.set_sensitive(true);
		this.checkActive = () =>
		{
			return (getSubsConfig('edgeType') === "OUTLINE") ? true : false;
		}
		this.outlineSwitch.set_active(this.checkActive());
		this.outlineSignal = this.outlineSwitch.connect('notify::active', () =>
		{
			if(this.outlineSwitch.active) subsConfig.edgeType = "OUTLINE";
			else subsConfig.edgeType = "NONE";

			setSubsConfig();
		});

		rgba.parse(hashToColor(getSubsConfig('edgeColor')));
		this.edgeColor = new Gtk.ColorButton({halign:Gtk.Align.END, rgba: rgba, show_editor: true});
		this.edgeColor.set_sensitive(true);
		this.edgeSignal = this.edgeColor.connect('color-set', () =>
		{
			subsConfig.edgeColor = colorToHash(this.edgeColor.rgba.to_string());
			setSubsConfig();
		});
		box.pack_end(this.edgeColor, false, false, 0);
		box.pack_end(this.outlineSwitch, false, false, 8);
		addToGrid(this, label, box);

		/* Background color */
		label = new SettingLabel(_("Background color"));
		rgba.parse(hashToColor(getSubsConfig('backgroundColor')));
		this.bgColor = new Gtk.ColorButton({halign:Gtk.Align.END, rgba: rgba, show_editor: true, use_alpha: true});
		this.bgColor.set_sensitive(true);
		this.bgSignal = this.bgColor.connect('color-set', () =>
		{
			subsConfig.backgroundColor = colorToHash(this.bgColor.rgba.to_string());
			setSubsConfig();
		});
		addToGrid(this, label, this.bgColor);

		this.destroy = () =>
		{
			Settings.disconnect(this.devChangeSignal);

			this.scanButton.disconnect(this.scanSignal);
			this.ipConfButton.disconnect(this.ipConfSignal);
			this.fontFamily.disconnect(this.familySignal);
			this.fontStyle.disconnect(this.styleSignal);
			this.scaleButton.disconnect(this.scaleSignal);
			this.fontColor.disconnect(this.fontColorSignal);
			this.outlineSignal.disconnect(this.outlineSignal);
			this.edgeColor.disconnect(this.edgeSignal);
			this.bgColor.disconnect(this.bgSignal);

			super.destroy();
		}
	}
}

class OtherSettings extends Gtk.Notebook
{
	constructor()
	{
		super();
		let widget = null;
		this.createdWidgets = [];

		let otherWidgets = [
			EncoderSettings,
			ExtractorSettings,
			MiscSettings
		];

		otherWidgets.forEach(OtherWidget =>
		{
			widget = new OtherWidget();
			this.append_page(widget, widget.title);
			this.createdWidgets.push(widget);
		});

		this.destroy = () =>
		{
			this.createdWidgets.forEach(createdWidget =>
			{
				createdWidget.destroy();
			});

			super.destroy();
		}
	}
}

class EncoderSettings extends Gtk.Grid
{
	constructor()
	{
		super({margin: 20, row_spacing: 6});
		this.title = new Gtk.Label({ label: _("Encoder") });
		let label = null;
		let widget = null;

		/* Label: Media Encoding */
		label = new SettingLabel(_("Media Encoding"), true);
		addToGrid(this, label, null, true);

		/* Hardware Acceleration */
		label = new SettingLabel(_("Hardware acceleration"));
		widget = new Gtk.ComboBoxText({halign:Gtk.Align.END});
		widget.append('none', _("None"));
		widget.append('vaapi', "VAAPI");
		widget.append('nvenc', "NVENC");
		Settings.bind('video-acceleration', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);

		/* Video Bitrate */
		label = new SettingLabel(_("Bitrate (Mbps)"));
		widget = new Gtk.SpinButton({halign:Gtk.Align.END, digits:1});
		widget.set_sensitive(true);
		widget.set_range(2.0, 10.0);
		widget.set_value(Settings.get_double('video-bitrate'));
		widget.set_increments(0.1, 0.2);
		Settings.bind('video-bitrate', widget, 'value', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);

		/* Burn Subtitles */
		/* TRANSLATORS: Burn subtitles into video during transcoding */
		label = new SettingLabel(_("Burn subtitles"));
		widget = new Gtk.Switch({halign:Gtk.Align.END});
		widget.set_sensitive(true);
		widget.set_active(Settings.get_boolean('burn-subtitles'));
		Settings.bind('burn-subtitles', widget, 'active', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);
	}
}

class ExtractorSettings extends Gtk.Grid
{
	constructor()
	{
		super({margin: 20, row_spacing: 6});
		/* TRANSLATORS: "Players" as video players */
		this.title = new Gtk.Label({ label: _("Extractor") });
		let label = null;
		let widget = null;

		/* Label: Extractor Settings */
		label = new SettingLabel(_("Subtitles Extraction"), true);
		addToGrid(this, label);

		/* Add vttextract */
		/* TRANSLATORS: "vttextract" is the name of executable, do not change */
		label = new SettingLabel(_("Add vttextract executable"));
		this.installExtractor = new Gtk.Switch({halign:Gtk.Align.END});
		this.installExtractor.set_sensitive(true);
		this.installExtractor.set_active(
			GLib.file_test(HOME_DIR + '/.local/bin/vttextract', GLib.FileTest.EXISTS)
		);
		addToGrid(this, label, this.installExtractor);

		/* Reuse Extracted Subtitles */
		label = new SettingLabel(_("Reuse extracted subtitles"));
		this.extractorSave = new Gtk.Switch({halign:Gtk.Align.END});
		this.extractorSave.set_sensitive(true);
		this.extractorSave.set_active(Settings.get_boolean('extractor-reuse'));
		Settings.bind('extractor-reuse', this.extractorSave, 'active', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, this.extractorSave);

		/* Save Folder */
		label = new SettingLabel(_("Save folder"));
		this.extractorChooser = Gtk.FileChooserButton.new(
			_("Select folder"), Gtk.FileChooserAction.SELECT_FOLDER
		);
		let startupDir = Settings.get_string('extractor-dir');
		this.extractorChooser.set_filename(startupDir);
		this.extractorChooser.set_sensitive(this.extractorSave.active);
		addToGrid(this, label, this.extractorChooser);

		this.chooserSignal = this.extractorChooser.connect('file-set', () =>
		{
			let filename = this.extractorChooser.get_filename();

			if(filename && filename.length > 1)
				Settings.set_string('extractor-dir', filename);
		});

		this.installExtractorSignal = this.installExtractor.connect('notify::active', () =>
		{
			enableCmdTool(this.installExtractor.active, 'vttextract');
		});

		this.enableExtractorSignal = this.extractorSave.connect('notify::active', () =>
		{
			this.extractorChooser.set_sensitive(this.extractorSave.active);
		});

		this.destroy = () =>
		{
			this.extractorChooser.disconnect(this.chooserSignal);
			this.installExtractor.disconnect(this.installExtractorSignal);
			this.extractorSave.disconnect(this.enableExtractorSignal);

			super.destroy();
		}
	}
}

class MiscSettings extends Gtk.Grid
{
	constructor()
	{
		super({margin: 20, row_spacing: 6});
		this.title = new Gtk.Label({ label: _("Misc") });
		let label = null;
		let widget = null;

		/* Label: Playercast */
		label = new SettingLabel(_("Playercast app"), true);
		addToGrid(this, label);

		/* Playercast device name */
		label = new SettingLabel(_("Device selection"));
		widget = new Gtk.ComboBoxText();
		setDevices(widget, true);
		Settings.bind('playercast-name', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
		let currentPlayercast = Settings.get_string('playercast-name');
		if(widget.active_id != currentPlayercast)
		{
			widget.append(currentPlayercast, currentPlayercast);
			widget.active_id = currentPlayercast;
		}
		addToGrid(this, label, widget);

		/* Label: Web Player */
		label = new SettingLabel(_("Web Player"), true, true);
		addToGrid(this, label);

		/* Subtitles Scale */
		label = new SettingLabel(_("Subtitles scale factor"));
		widget = new Gtk.SpinButton({halign:Gtk.Align.END, digits:1});
		widget.set_sensitive(true);
		widget.set_range(0.1, 5.0);
		widget.set_value(Settings.get_double('webplayer-subs'));
		widget.set_increments(0.1, 0.2);
		Settings.bind('webplayer-subs', widget, 'value', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);

		/* Label: Miscellaneous */
		/* TRANSLATORS: The rest of extension settings */
		label = new SettingLabel(_("Miscellaneous"), true, true);
		addToGrid(this, label);

		/* Music Visualizer */
		label = new SettingLabel(_("Music visualizer"));
		widget = new Gtk.Switch({halign:Gtk.Align.END});
		widget.set_sensitive(true);
		widget.set_active(Settings.get_boolean('music-visualizer'));
		Settings.bind('music-visualizer', widget, 'active', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);

		/* Nautilus/Nemo Integration */
		label = new SettingLabel(_("Nautilus/Nemo integration"));
		this.nautilusSwitch = new Gtk.Switch({halign:Gtk.Align.END});
		this.nautilusSwitch.set_sensitive(true);

		let isFmExtEnabled = () =>
		{
			if(!HOME_DIR) return false;

			for(let fm of FILE_MANAGERS)
			{
				if(
					GLib.file_test(HOME_DIR + '/.local/share/' + fm +
						'-python/extensions/nautilus-cast-to-tv.py', GLib.FileTest.EXISTS)
				) {
					return true;
				}
			}

			return false;
		}

		this.nautilusSwitch.set_active(isFmExtEnabled());

		this.nautilusSignal = this.nautilusSwitch.connect('notify::active', () =>
		{
			enableNautilusExtension(this.nautilusSwitch.active);
		});

		addToGrid(this, label, this.nautilusSwitch);

		this.destroy = () =>
		{
			this.nautilusSwitch.disconnect(this.nautilusSignal);

			super.destroy();
		}
	}
}

class AddonsSettings extends Gtk.Notebook
{
	constructor()
	{
		super();
		let label = null;

		let extPath = Local.path.substring(0, Local.path.lastIndexOf('/'));
		let extDir = Gio.File.new_for_path(extPath);
		let dirEnum = extDir.enumerate_children('standard::name,standard::type', 0, null);
		let addons = [];

		let info;
		while((info = dirEnum.next_file(null)))
		{
			let dirName = info.get_name();

			if(dirName.startsWith('cast-to-tv') && dirName.includes('addon@'))
			{
				addons.push(dirName);
			}
		}

		addons.sort();
		addons.forEach(addonDir =>
		{
			let addonPath = extPath + '/' + addonDir;
			let addonName = addonDir.substring(11, addonDir.lastIndexOf('-'));
			let isPrefs = GLib.file_test(addonPath + '/' + addonName + '_prefs.js', GLib.FileTest.EXISTS);

			if(isPrefs)
			{
				imports.searchPath.unshift(addonPath);
				let addonPrefs = imports[addonName + '_prefs'];
				imports.searchPath.shift();

				addonPrefs.init();
				let widget = addonPrefs.buildPrefsWidget();
				this.append_page(widget, widget.title);
			}
		});
	}
}

class ModulesSettings extends Gtk.VBox
{
	constructor()
	{
		super({margin: 10});

		let TermWidget = new Vte.Terminal({
			height_request: 320,
			scroll_on_output: true,
			margin_bottom: 10
		});

		let background = new Gdk.RGBA({red: 0.96, green: 0.96, blue: 0.96, alpha: 1});
		let foreground = new Gdk.RGBA({red: 0, green: 0, blue: 0, alpha: 1});

		TermWidget.set_color_background(background);
		TermWidget.set_color_foreground(foreground);
		TermWidget.set_color_cursor(background);
		TermWidget.set_cursor_shape(Vte.CursorShape.IBEAM);
		TermWidget.set_cursor_blink_mode(Vte.CursorBlinkMode.OFF);
		TermWidget.set_sensitive(false);

		this.pack_start(TermWidget, true, true, 0);
		let installLabel = _("Install npm modules");

		this.installButton = new Gtk.Button({
			label: _(installLabel),
			expand: false,
			halign: Gtk.Align.CENTER
		});
		this.pack_start(this.installButton, false, false, 0);

		let installCallback = () =>
		{
			if(Settings.get_boolean('service-wanted'))
				GLib.spawn_async(Local.path, ['/usr/bin/gjs', Local.path + '/server-monitor.js'], null, 0, null);

			this.installButton.label = _(installLabel);
			this.installButton.set_sensitive(true);
		}

		let installModules = () =>
		{
			TermWidget.reset(true, true);
			/* Stops both server and monitor service */
			GLib.spawn_command_line_sync('pkill -SIGINT -f ' + Local.path);
			this.installButton.set_sensitive(false);
			this.installButton.label = _("Installing...");

			try {
				TermWidget.spawn_async(
					Vte.PtyFlags.DEFAULT, Local.path, [NPM_PATH, 'install'],
					null, GLib.SpawnFlags.DO_NOT_REAP_CHILD, null, 120000, null, (res, pid) =>
						GLib.child_watch_add(GLib.PRIORITY_LOW, pid, () => installCallback()));
			}
			catch(err) {
				let [res, pid] = TermWidget.spawn_sync(
					Vte.PtyFlags.DEFAULT, Local.path, [NPM_PATH, 'install'],
					null, GLib.SpawnFlags.DO_NOT_REAP_CHILD, null, null);

				GLib.child_watch_add(GLib.PRIORITY_LOW, pid, () => installCallback());
			}
		}

		this.installSignal = this.installButton.connect('clicked', installModules.bind(this));

		this.destroy = () =>
		{
			this.installButton.disconnect(this.installSignal);

			super.destroy();
		}
	}
}

class AboutPage extends Gtk.VBox
{
	constructor()
	{
		super({valign: Gtk.Align.CENTER, halign: Gtk.Align.CENTER});
		let label = null;
		let linkButton = null;

		/* Image */
		let image = new Gtk.Image({
			file: Local.path + '/appIcon/prefs.png',
			margin: 5,
			margin_top: 25
		});
		this.pack_start(image, false, false, 0);

		/* Extension name */
		label = new Gtk.Label({
			label: '<span font="16"><b>' + "Cast to TV" + '</b></span>',
			use_markup: true
		});
		this.pack_start(label, false, false, 0);

		/* Extension version */
		let buildVersion = Local.metadata.git || Local.metadata.version;
		label = new Gtk.Label({
			label: '<span font="12"><b>' + _("version:") + " " + buildVersion + '</b></span>',
			use_markup: true
		});
		this.pack_start(label, false, false, 0);

		/* Developer name */
		label = new Gtk.Label({
			label: '<span font="12">' + _("Developed by") + " " + "Rafostar" + '</span>',
			use_markup: true,
			margin: 20
		});
		this.pack_start(label, false, false, 0);

		/* Homepage link */
		linkButton = new Gtk.LinkButton({
			uri: Local.metadata['url'],
			label: _("Extension Homepage")
		});
		this.pack_start(linkButton, false, false, 0);

		/* Playercast link */
		linkButton = new Gtk.LinkButton({
			uri: 'https://rafostar.github.io/playercast',
			label: _("Playercast Homepage")
		});
		this.pack_start(linkButton, false, false, 0);

		/* Donation link */
		linkButton = new Gtk.LinkButton({
			uri: 'https://www.paypal.me/Rafostar',
			label: _("Donate")
		});
		this.pack_start(linkButton, false, false, 20);
	}
}

class CastNotebook extends Gtk.Notebook
{
	constructor()
	{
		super({margin: 5});
		let label = null;

		this.mainWidget = new MainSettings();
		label = new Gtk.Label({ label: _("Main") });
		this.append_page(this.mainWidget, label);

		this.remoteWidget = new RemoteSettings();
		label = new Gtk.Label({ label: _("Remote") });
		this.append_page(this.remoteWidget, label);

		this.chromecastWidget = new ChromecastSettings();
		label = new Gtk.Label({ label: "Chromecast" });
		this.append_page(this.chromecastWidget, label);

		this.otherWidget = new OtherSettings();
		/* TRANSLATORS: Other extension settings */
		label = new Gtk.Label({ label: _("Other") });
		this.append_page(this.otherWidget, label);

		this.addonsWidget = new AddonsSettings();
		let addonsNumber = this.addonsWidget.get_n_pages();

		if(addonsNumber == 0)
		{
			this.addonsWidget.destroy();
			this.addonsWidget = null;
		}
		else
		{
			label = new Gtk.Label({ label: _("Add-ons") });
			this.append_page(this.addonsWidget, label);
		}

		this.modulesWidget = new ModulesSettings();
		label = new Gtk.Label({ label: _("Modules") });
		this.append_page(this.modulesWidget, label);

		this.aboutWidget = new AboutPage();
		label = new Gtk.Label({ label: _("About") });
		this.append_page(this.aboutWidget, label);

		this.destroy = () =>
		{
			this.mainWidget.destroy();
			this.otherWidget.destroy();
			this.remoteWidget.destroy();
			this.chromecastWidget.destroy();
			this.modulesWidget.destroy();
			this.aboutWidget.destroy();
			if(this.addonsWidget) this.addonsWidget.destroy();

			super.destroy();
		}
	}
}

class CastToTvSettings extends Gtk.VBox
{
	constructor()
	{
		super();

		this.notebook = new CastNotebook();
		this.pack_start(this.notebook, true, true, 0);

		this.notification = new StreamingNotification();
		this.pack_start(this.notification, true, true, 0);

		Soup.client.getPlaybackData(data => this._onPlayingChange(data));

		Soup.client.connectWebsocket(err =>
		{
			if(err) return log('Cast to TV: '+ err.message);

			Soup.client.onWebsocketMsg((err, data) =>
			{
				if(err) return log('Cast to TV: '+ err.message);

				this._onPlayingChange(data);
			});
		});

		this._onPlayingChange = (data) =>
		{
			if(!data) return;

			if(data.isPlaying)
			{
				this.notebook.hide();
				this.notification.show();
			}
			else
			{
				this.notification.hide();
				this.notebook.show();
			}
		}

		this.destroy = () =>
		{
			this.notebook.destroy();
			this.notification.destroy();

			super.destroy();
		}
	}
}

class ChromecastIpSettings extends Gtk.Dialog
{
	constructor(parent)
	{
		super({
			title: _("Manual IP Config"),
			transient_for: parent.get_toplevel(),
			default_width: 420,
			default_height: 300,
			use_header_bar: true,
			modal: true
		});

		let label = null;
		let widget = null;

		let box = new Gtk.VBox({
			margin: 5,
			expand: true
		});

		let listStore = new Gtk.ListStore();
		listStore.set_column_types([
			GObject.TYPE_BOOLEAN,
			GObject.TYPE_STRING,
			GObject.TYPE_STRING
		]);

		let devices = [];
		let devIndex = -1;

		let loadStoreList = () =>
		{
			/* Restore empty devices list if someone messed it externally */
			try { devices = JSON.parse(Settings.get_string('chromecast-devices')); }
			catch(err) {
				devices = [];
				Settings.set_string('chromecast-devices', "[]");
			}

			listStore.clear();

			devices.forEach(device =>
			{
				let devIp = device.ip || '';
				let isAuto = (device.hasOwnProperty('name') && device.name.endsWith('.local'));

				listStore.set(
					listStore.append(),
					[0, 1, 2], [isAuto, device.friendlyName, devIp]
				);
			});
		}

		loadStoreList();

		let treeView = new Gtk.TreeView({
			expand: true,
			enable_search: false,
			model: listStore
		});

		let local = new Gtk.TreeViewColumn({title: _("Auto")});
		let friendlyName = new Gtk.TreeViewColumn({title: _("Name"), min_width: 220});
		let ip = new Gtk.TreeViewColumn({title: "IP", min_width: 140});

		this.activeCell = new Gtk.CellRendererToggle({
			activatable: false
		});

		this.normalCell = new Gtk.CellRendererText({
			editable: true,
			placeholder_text: _("None")
		});

		this.boldCell = new Gtk.CellRendererText({
			editable: true,
			weight: Pango.Weight.BOLD,
			/* TRANSLATORS: Text field temporary text */
			placeholder_text: _("Insert name")
		});

		this.normalCellSignal = this.normalCell.connect('edited', (cell, path, newText) =>
		{
			newText = newText.trim();

			if(devices[path].ip !== newText)
			{
				devices[path].ip = newText;
				Settings.set_string('chromecast-devices', JSON.stringify(devices));
				loadStoreList();
			}
		});

		this.boldCellSignal = this.boldCell.connect('edited', (cell, path, newText) =>
		{
			newText = newText.trim();

			if(devices[path].friendlyName !== newText)
			{
				devices[path].name = newText;
				devices[path].friendlyName = newText;
				Settings.set_string('chromecast-devices', JSON.stringify(devices));
				loadStoreList();
			}
		});

		local.pack_start(this.activeCell, true);
		friendlyName.pack_start(this.boldCell, true);
		ip.pack_start(this.normalCell, true);

		local.add_attribute(this.activeCell, "active", 0);
		friendlyName.add_attribute(this.boldCell, "text", 1);
		ip.add_attribute(this.normalCell, "text", 2);

		treeView.insert_column(local, 0);
		treeView.insert_column(friendlyName, 1);
		treeView.insert_column(ip, 2);

		box.pack_start(treeView, true, true, 0);

		this.treeSelection = treeView.get_selection();
		this.treeSelectionSignal = this.treeSelection.connect('changed', () =>
		{
			let [isSelected, model, iter] = this.treeSelection.get_selected();
			devIndex = -1;

			if(isSelected)
			{
				devIndex = listStore.get_string_from_iter(iter);
				if(devIndex >= 0)
				{
					this.removeButton.set_sensitive(true);
					return;
				}
			}

			this.removeButton.set_sensitive(false);
		});

		let grid = new Gtk.Grid({
			valign: Gtk.Align.CENTER,
			halign: Gtk.Align.END,
			margin: 5,
			row_spacing: 6,
			column_spacing: 4
		});

		this.addButton = Gtk.Button.new_from_icon_name('list-add-symbolic', 4);
		this.addButtonSignal = this.addButton.connect('clicked', () =>
		{
			devices.push({ name: '', friendlyName: '', ip: '' });
			Settings.set_string('chromecast-devices', JSON.stringify(devices));
			loadStoreList();
		});

		this.removeButton = Gtk.Button.new_from_icon_name('list-remove-symbolic', 4);
		this.removeButton.set_sensitive(false);
		this.removeButtonSignal = this.removeButton.connect('clicked', () =>
		{
			if(devIndex >= 0)
			{
				devices.splice(devIndex, 1);
				Settings.set_string('chromecast-devices', JSON.stringify(devices));
				loadStoreList();
			}
		});

		grid.attach(this.removeButton, 0, 0, 1, 1);
		grid.attach(this.addButton, 1, 0, 1, 1);
		box.pack_start(grid, false, false, 0);

		this.get_content_area().add(box);
		this.show_all();

		this.destroy = () =>
		{
			this.treeSelection.disconnect(this.treeSelectionSignal);
			this.normalCell.disconnect(this.normalCellSignal);
			this.boldCell.disconnect(this.boldCellSignal);
			this.addButton.disconnect(this.addButtonSignal);
			this.removeButton.disconnect(this.removeButtonSignal);

			super.destroy();
		}
	}
}

function scanDevices(widget, buttons)
{
	buttons.forEach(button => button.set_sensitive(false));

	widget.remove_all();
	/* TRANSLATORS: Shown when scan for Chromecast devices is running */
	widget.append('', _("Scanning..."));
	/* Show Scanning label */
	widget.set_active(0);

	let [res, pid] = GLib.spawn_async(
		nodeDir, [nodeBin, Local.path + '/node_scripts/utils/scanner'],
		null, GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);

	GLib.child_watch_add(GLib.PRIORITY_LOW, pid, () =>
	{
		setDevices(widget);
		/* Set Automatic as active */
		widget.set_active(0);
		buttons.forEach(button => button.set_sensitive(true));
	});
}

function setDevices(widget, isPlayercasts, activeText)
{
	widget.remove_all();
	widget.append('', _("Automatic"));
	let devices = [];

	if(isPlayercasts)
	{
		Soup.client.getPlayercasts(playercasts =>
		{
			if(playercasts)
				devices = playercasts;

			Helper.setDevicesWidget(widget, devices, activeText);
		});
	}
	else
	{
		/* Restore empty devices list if someone messed it externally */
		try { devices = JSON.parse(Settings.get_string('chromecast-devices')); }
		catch(err) { Settings.set_string('chromecast-devices', "[]"); }

		Helper.setDevicesWidget(widget, devices, activeText);
	}
}

function getHostIp()
{
	try {
		let ip4;

		/* synchronous because must be obtained before widget is shown */
		let [res, stdout] = GLib.spawn_sync(
			nodeDir, [nodeBin, Local.path + '/node_scripts/utils/local-ip'],
			null, 0, null);

		if(res && stdout)
		{
			if(stdout instanceof Uint8Array) ip4 = ByteArray.toString(stdout);
			else ip4 = stdout.toString();

			return ip4.replace(/\n/, '');
		}
		else
		{
			return null;
		}
	}
	catch(err) {
		return null;
	}
}

function enableNautilusExtension(enabled)
{
	let srcPath = Local.path + '/nautilus/nautilus-cast-to-tv.py';
	if(!GLib.file_test(srcPath, GLib.FileTest.EXISTS)) return;

	let userDataDir = GLib.get_user_data_dir();
	if(!userDataDir) return;

	FILE_MANAGERS.forEach(fm =>
	{
		let installPath = userDataDir + '/' + fm + '-python/extensions';
		let destFile = Gio.File.new_for_path(installPath).get_child('nautilus-cast-to-tv.py');

		if(enabled && GLib.find_program_in_path(fm) && !destFile.query_exists(null))
		{
			GLib.mkdir_with_parents(installPath, 493); // 755 in octal
			destFile.make_symbolic_link(srcPath, null);
		}
		else if(!enabled && destFile.query_exists(null))
		{
			destFile.delete(null);
		}
	});
}

function enableCmdTool(enabled, toolName)
{
	if(!toolName) return;

	let srcPath = Local.path + '/node_scripts/utils/' + toolName + '.js';
	if(!HOME_DIR || !GLib.file_test(srcPath, GLib.FileTest.EXISTS)) return;

	let installPath = HOME_DIR + '/.local/bin';
	let destFile = Gio.File.new_for_path(installPath).get_child(toolName);

	if(enabled && !destFile.query_exists(null))
	{
		GLib.mkdir_with_parents(installPath, 493); // 755 in octal
		destFile.make_symbolic_link(srcPath, null);
		GLib.spawn_command_line_async('chmod +x "' + srcPath + '"');
	}
	else if(!enabled && destFile.query_exists(null))
	{
		destFile.delete(null);
	}
}

function hashToColor(colorHash)
{
	let colorValue = colorHash.split('#')[1];
	let colorInt = parseInt(colorValue, 16);

	let array = new Uint8Array(4);
	array[3] = colorInt;
	array[2] = colorInt >> 8;
	array[1] = colorInt >> 16;
	array[0] = colorInt >> 24;

	return 'rgba(' + array[0] + ',' + array[1] + ',' + array[2] + ',' + array[3] / 255 + ')';
}

function colorToHash(colorString)
{
	let values = colorString.substring(colorString.indexOf('(') + 1, colorString.indexOf(')')).split(',');
	let hash = "#";

	if(values[3]) values[3] *= 255;

	values.forEach(value =>
	{
		let integer = parseInt(value, 10);
		hash += integer.toString(16).toUpperCase().padStart(2, 0);
	});

	while(hash.length < 9) hash += 'F';

	return hash;
}

function buildPrefsWidget()
{
	let widget = null;

	if(!NODE_PATH) return widget = new MissingNotification('nodejs');
	else if(!NPM_PATH) return widget = new MissingNotification('npm');

	nodeDir = NODE_PATH.substring(0, NODE_PATH.lastIndexOf('/'));
	nodeBin = NODE_PATH.substring(NODE_PATH.lastIndexOf('/') + 1);

	if(!Soup.client)
	{
		let listeningPort = Settings.get_int('listening-port');
		let wsPort = Settings.get_int('internal-port');
		Soup.createClient(listeningPort, wsPort);
	}

	widget = new CastToTvSettings();
	widget.show_all();
	widget.notification.hide();
	widget.notebook.mainWidget.checkService();

	return widget;
}
