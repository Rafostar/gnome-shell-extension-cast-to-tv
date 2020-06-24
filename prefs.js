imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';

const { Gio, Gtk, GLib, Gdk, Vte, Pango, GObject } = imports.gi;
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
let soupClient;

function init()
{
	Helper.initTranslations(Local.path);
}

let CastMissingAppInfoBox = GObject.registerClass(
class CastMissingAppInfoBox extends Gtk.VBox
{
	_init(dependName)
	{
		super._init({
			height_request: 380,
			spacing: 10,
			margin: 20
		});

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
});

let CastIsStreamingInfoBox = GObject.registerClass(
class CastIsStreamingInfoBox extends Gtk.VBox
{
	_init()
	{
		super._init({
			height_request: 380,
			spacing: 10,
			margin: 10
		});

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

		let remoteWidget = new CastRemoteSettingsGrid();
		this.pack_start(remoteWidget, true, true, 0);
	}
});

let CastMainSettingsBox = GObject.registerClass(
class CastMainSettingsBox extends Gtk.VBox
{
	_init()
	{
		super._init();

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
		this.portWidget.set_range(1024, 65535);
		this.portWidget.set_value(Settings.get_int('listening-port'));
		this.portWidget.set_increments(1, 2);
		Settings.bind('listening-port', this.portWidget, 'value', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(grid, label, this.portWidget);

		/* Internal Port */
		label = new SettingLabel(_("Internal communication port"));
		this.intPortWidget = new Gtk.SpinButton({halign:Gtk.Align.END});
		this.intPortWidget.set_sensitive(true);
		this.intPortWidget.set_range(1024, 65535);
		this.intPortWidget.set_value(Settings.get_int('internal-port'));
		this.intPortWidget.set_increments(1, 2);
		Settings.bind('internal-port', this.intPortWidget, 'value', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(grid, label, this.intPortWidget);

		/* Web player link */
		this.linkButton = new Gtk.LinkButton({
			expand: false,
			halign:Gtk.Align.CENTER
		});

		box = new Gtk.VBox({
			margin: 5,
			hexpand: true,
			valign:Gtk.Align.END,
			halign:Gtk.Align.CENTER
		});

		this.infoLabel = new Gtk.Label();

		box.pack_start(this.infoLabel, false, false, 0);
		box.pack_start(this.linkButton, false, false, 0);
		this.pack_end(box, false, false, 0);

		this.linkSignal = this.portWidget.connect('value-changed', () => this.updateLink());

		getHostIpAsync(hostIp =>
		{
			this.hostIp = hostIp;

			if(this.hostIp)
			{
				this.infoLabel.label = _("Access web player from devices on local network");
				this.updateLink();
				this.checkService();
			}
		});
	}

	updateLink()
	{
		let link = 'http://' + this.hostIp + ':' + this.portWidget.value;
		this.linkButton.uri = link;
		this.linkButton.label = link;
	}

	checkService()
	{
		soupClient.getIsServiceEnabled(data =>
		{
			if(data && data.isEnabled)
				this.setDisplayInfo(true);
			else
				this.setDisplayInfo(false);
		});
	}

	setDisplayInfo(isEnabled)
	{
		/* No point in displaying without host IP */
		if(isEnabled && this.hostIp)
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

	destroy()
	{
		this.portWidget.disconnect(this.linkSignal);

		super.destroy();
	}
});

let CastRemoteSettingsGrid = GObject.registerClass(
class CastRemoteSettingsGrid extends Gtk.Grid
{
	_init()
	{
		super._init({
			margin: 20,
			row_spacing: 6
		});

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
	}

	destroy()
	{
		this.remoteSwitch.disconnect(this.remoteSwitchSignal);

		super.destroy();
	}
});

let CastChromecastSettingsGrid = GObject.registerClass(
class CastChromecastSettingsGrid extends Gtk.Grid
{
	_init()
	{
		super._init({
			margin: 20,
			row_spacing: 6
		});

		this.subsConfig = {};

		let label = null;
		let widget = null;
		let box = null;
		let button = null;
		let rgba = new Gdk.RGBA();

		/* Restore default subtitles values if someone messed them externally */
		try { this.subsConfig = JSON.parse(Settings.get_string('chromecast-subtitles')); }
		catch(err) { Settings.set_string('chromecast-subtitles', "{}"); }

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

		this.devChangeSignal = Settings.connect('changed::chromecast-devices', this.onDevEdit.bind(this, widget));
		this.scanSignal = this.scanButton.connect('clicked',
			scanDevices.bind(this, widget, [this.scanButton, this.ipConfButton], 'googlecast')
		);
		this.ipConfSignal = this.ipConfButton.connect('clicked', () => {
			let castIp = new CastChromecastIpDialog(this);
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
		this.fontFamily.active_id = this.getSubsConfig('fontGenericFamily');
		this.familySignal = this.fontFamily.connect('changed', () =>
		{
			this.subsConfig.fontFamily = this.fontFamily.get_active_text();
			this.subsConfig.fontGenericFamily = this.fontFamily.active_id;
			this.setSubsConfig();
		});
		addToGrid(this, label, this.fontFamily);

		/* Font Style */
		label = new SettingLabel(_("Font style"));
		this.fontStyle = new Gtk.ComboBoxText({width_request: 180, halign:Gtk.Align.END});
		this.fontStyle.append('NORMAL', _("Normal"));
		this.fontStyle.append('BOLD', _("Bold"));
		this.fontStyle.append('ITALIC', _("Italic"));
		this.fontStyle.append('BOLD_ITALIC', _("Bold italic"));
		this.fontStyle.active_id = this.getSubsConfig('fontStyle');
		this.styleSignal = this.fontStyle.connect('changed', () =>
		{
			this.subsConfig.fontStyle = this.fontStyle.active_id;
			this.setSubsConfig();
		});
		addToGrid(this, label, this.fontStyle);

		/* Subtitles Scale */
		label = new SettingLabel(_("Scale factor"));
		this.scaleButton = new Gtk.SpinButton({halign:Gtk.Align.END, digits:1});
		this.scaleButton.set_sensitive(true);
		this.scaleButton.set_range(0.1, 5.0);
		this.scaleButton.set_value(this.getSubsConfig('fontScale'));
		this.scaleButton.set_increments(0.1, 0.2);
		this.scaleSignal = this.scaleButton.connect('value-changed', () =>
		{
			this.subsConfig.fontScale = this.scaleButton.value.toFixed(1);
			this.setSubsConfig();
		});
		addToGrid(this, label, this.scaleButton);

		/* Font Color */
		label = new SettingLabel(_("Font color"));
		rgba.parse(hashToColor(this.getSubsConfig('foregroundColor')));
		this.fontColor = new Gtk.ColorButton({halign:Gtk.Align.END, rgba: rgba, show_editor: true});
		this.fontColor.set_sensitive(true);
		this.fontColorSignal = this.fontColor.connect('color-set', () =>
		{
			this.subsConfig.foregroundColor = colorToHash(this.fontColor.rgba.to_string());
			this.setSubsConfig();
		});
		addToGrid(this, label, this.fontColor);

		/* Font Outline */
		label = new SettingLabel(_("Font outline"));
		box = new Gtk.HBox({halign:Gtk.Align.END});
		this.outlineSwitch = new Gtk.Switch({halign:Gtk.Align.END, valign:Gtk.Align.CENTER});
		this.outlineSwitch.set_sensitive(true);
		this.checkActive = () =>
		{
			return (this.getSubsConfig('edgeType') === "OUTLINE") ? true : false;
		}
		this.outlineSwitch.set_active(this.checkActive());
		this.outlineSignal = this.outlineSwitch.connect('notify::active', () =>
		{
			if(this.outlineSwitch.active)
				this.subsConfig.edgeType = "OUTLINE";
			else
				this.subsConfig.edgeType = "NONE";

			this.setSubsConfig();
		});

		rgba.parse(hashToColor(this.getSubsConfig('edgeColor')));
		this.edgeColor = new Gtk.ColorButton({halign:Gtk.Align.END, rgba: rgba, show_editor: true});
		this.edgeColor.set_sensitive(true);
		this.edgeSignal = this.edgeColor.connect('color-set', () =>
		{
			this.subsConfig.edgeColor = colorToHash(this.edgeColor.rgba.to_string());
			this.setSubsConfig();
		});
		box.pack_end(this.edgeColor, false, false, 0);
		box.pack_end(this.outlineSwitch, false, false, 8);
		addToGrid(this, label, box);

		/* Background color */
		label = new SettingLabel(_("Background color"));
		rgba.parse(hashToColor(this.getSubsConfig('backgroundColor')));
		this.bgColor = new Gtk.ColorButton({halign:Gtk.Align.END, rgba: rgba, show_editor: true, use_alpha: true});
		this.bgColor.set_sensitive(true);
		this.bgSignal = this.bgColor.connect('color-set', () =>
		{
			this.subsConfig.backgroundColor = colorToHash(this.bgColor.rgba.to_string());
			this.setSubsConfig();
		});
		addToGrid(this, label, this.bgColor);
	}

	getSubsConfig(confName)
	{
		return this.subsConfig[confName] || shared.chromecast.subsStyle[confName];
	}

	setSubsConfig()
	{
		Settings.set_string('chromecast-subtitles', JSON.stringify(this.subsConfig));
	}

	onDevEdit(widget)
	{
		let activeText = widget.get_active_text();
		setDevices(widget, false, activeText);
	}

	destroy()
	{
		Settings.disconnect(this.devChangeSignal);

		this.scanButton.disconnect(this.scanSignal);
		this.ipConfButton.disconnect(this.ipConfSignal);
		this.fontFamily.disconnect(this.familySignal);
		this.fontStyle.disconnect(this.styleSignal);
		this.scaleButton.disconnect(this.scaleSignal);
		this.fontColor.disconnect(this.fontColorSignal);
		this.outlineSwitch.disconnect(this.outlineSignal);
		this.edgeColor.disconnect(this.edgeSignal);
		this.bgColor.disconnect(this.bgSignal);

		super.destroy();
	}
});

let CastOtherSettingsNotebook = GObject.registerClass(
class CastOtherSettingsNotebook extends Gtk.Notebook
{
	_init()
	{
		super._init();

		let widget = null;
		this.createdWidgets = [];

		let otherWidgets = [
			CastEncoderSettingsGrid,
			CastExtractorSettingsGrid,
			CastMiscSettingsGrid
		];

		otherWidgets.forEach(OtherWidget =>
		{
			widget = new OtherWidget();
			this.append_page(widget, widget.title);
			this.createdWidgets.push(widget);
		});
	}

	destroy()
	{
		this.createdWidgets.forEach(createdWidget =>
		{
			createdWidget.destroy();
		});

		super.destroy();
	}
});

let CastEncoderSettingsGrid = GObject.registerClass(
class CastEncoderSettingsGrid extends Gtk.Grid
{
	_init()
	{
		super._init({
			margin: 20,
			row_spacing: 6
		});

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
		label = new SettingLabel(_("Burn subtitles when transcoding video"));
		widget = new Gtk.Switch({halign:Gtk.Align.END});
		widget.set_sensitive(true);
		widget.set_active(Settings.get_boolean('burn-subtitles'));
		Settings.bind('burn-subtitles', widget, 'active', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);
	}
});

let CastExtractorSettingsGrid = GObject.registerClass(
class CastExtractorSettingsGrid extends Gtk.Grid
{
	_init()
	{
		super._init({
			margin: 20,
			row_spacing: 6
		});

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

		/* Preferred Subtitles Language */
		label = new SettingLabel(_("Preferred language"));
		widget = new Gtk.Entry({halign:Gtk.Align.END});
		widget.set_placeholder_text("eng/English");
		Settings.bind('subs-preferred', widget, 'text', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);

		/* Fallback Subtitles Language */
		label = new SettingLabel(_("Fallback language"));
		widget = new Gtk.Entry({halign:Gtk.Align.END});
		widget.set_placeholder_text(_("none"));
		Settings.bind('subs-fallback', widget, 'text', Gio.SettingsBindFlags.DEFAULT);
		addToGrid(this, label, widget);

		/* Save Folder */
		/* TRANSLATORS: Destination folder to save subtitles */
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
	}

	destroy()
	{
		this.extractorChooser.disconnect(this.chooserSignal);
		this.installExtractor.disconnect(this.installExtractorSignal);
		this.extractorSave.disconnect(this.enableExtractorSignal);

		super.destroy();
	}
});

let CastMiscSettingsGrid = GObject.registerClass(
class CastMiscSettingsGrid extends Gtk.Grid
{
	_init()
	{
		super._init({
			margin: 20,
			row_spacing: 6
		});

		this.title = new Gtk.Label({ label: _("Misc") });
		let label = null;
		let widget = null;
		let box = null;

		/* Label: Playercast */
		label = new SettingLabel(_("Playercast app"), true);
		addToGrid(this, label);

		/* Playercast device name */
		label = new SettingLabel(_("Device selection"));
		box = new Gtk.HBox({halign:Gtk.Align.END});
		this.playercastSelect = new Gtk.ComboBoxText();
		this.playercastScanButton = Gtk.Button.new_from_icon_name('view-refresh-symbolic', 4);
		box.pack_end(this.playercastScanButton, false, false, 4);
		box.pack_end(this.playercastSelect, false, false, 0);
		setDevices(this.playercastSelect, true).then(() => {
			Settings.bind('playercast-name', this.playercastSelect, 'active-id', Gio.SettingsBindFlags.DEFAULT);

			/* Set to Automatic instead of empty box */
			if(!this.playercastSelect.get_active_text())
				this.playercastSelect.set_active(0);
		});
		this.playercastChangeSignal = Settings.connect(
			'changed::playercast-devices', this.onPlayercastEdit.bind(this, this.playercastSelect)
		);
		this.playercastScanSignal = this.playercastScanButton.connect('clicked',
			scanDevices.bind(this, this.playercastSelect, [this.playercastScanButton], 'playercast')
		);
		addToGrid(this, label, box);

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

		if(Local.metadata['custom-install'])
			return;

		/* Nautilus/Nemo Integration */
		label = new SettingLabel(_("Nautilus/Nemo integration"));
		this.nautilusSwitch = new Gtk.Switch({halign:Gtk.Align.END});
		this.nautilusSwitch.set_sensitive(true);

		this.nautilusSwitch.set_active(this.getIsFmEnabled());

		this.nautilusSignal = this.nautilusSwitch.connect('notify::active', () =>
		{
			enableNautilusExtension(this.nautilusSwitch.active);
		});

		addToGrid(this, label, this.nautilusSwitch);
	}

	getIsFmEnabled()
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

	onPlayercastEdit(widget)
	{
		let activeText = widget.get_active_text();
		setDevices(widget, true, activeText);
	}

	destroy()
	{
		Settings.disconnect(this.playercastChangeSignal);
		this.playercastScanButton.disconnect(this.playercastScanSignal);

		if(this.nautilusSwitch)
			this.nautilusSwitch.disconnect(this.nautilusSignal);

		super.destroy();
	}
});

let CastAddonsSettingsNotebook = GObject.registerClass(
class CastAddonsSettingsNotebook extends Gtk.Notebook
{
	_init()
	{
		super._init();

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

				if(!widget.visible && !widget.get_realized())
					widget.realize();
			}
		});
	}
});

let CastModulesSettingsBox = GObject.registerClass(
class CastModulesSettingsBox extends Gtk.VBox
{
	_init()
	{
		super._init({ margin: 10 });

		let installLabel = _("Install npm modules");
		this.installButton = new Gtk.Button({
			label: _(installLabel),
			expand: false,
			halign: Gtk.Align.CENTER
		});

		let installCallback = () =>
		{
			if(Settings.get_boolean('service-wanted'))
				GLib.spawn_async(Local.path, ['/usr/bin/gjs', Local.path + '/server-monitor.js'], null, 0, null);

			this.installButton.label = _(installLabel);
			this.installButton.set_sensitive(true);
		}

		let ptyCallback = (pty, spawnRes) =>
		{
			let [res, pid] = pty.spawn_finish(spawnRes);
			this.termWidget.watch_child(pid);
		}

		let installModules = () =>
		{
			if(!this.termWidget)
				return;

			this.termWidget.reset(true, true);
			/* Stops both server and monitor service */
			GLib.spawn_command_line_sync('pkill -SIGINT -f ' + Local.path);
			this.installButton.set_sensitive(false);
			this.installButton.label = _("Installing...");

			let pty = Vte.Pty.new_sync(Vte.PtyFlags.DEFAULT, null);
			this.termWidget.set_pty(pty);

			try {
				pty.spawn_async(
					Local.path, [NPM_PATH, 'install'], null,
					GLib.SpawnFlags.DO_NOT_REAP_CHILD, null, 120000, null,
					(self, res) => ptyCallback(self, res)
				);
			}
			catch(err) {
				let errMsg = [
					'Error: Could not spawn VTE terminal',
					'Reason: ' + err.message,
					'',
					'Try installing from terminal with:',
					'cd ' + Local.path,
					'npm install',
					'\0'
				].join('\n');

				this.termWidget.feed_child(errMsg, -1);

				this.installButton.label = _(installLabel);
				this.installButton.set_sensitive(true);
			}
		}

		/*
			Creating new Vte.Terminal on prefs init causes weird misbehaviour
			of prefs window. Adding it after small delay makes it work.
		*/
		GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () =>
		{
			this.termWidget = new Vte.Terminal({
				scroll_on_output: true,
				margin_bottom: 10
			});

			let background = new Gdk.RGBA({red: 0.96, green: 0.96, blue: 0.96, alpha: 1});
			let foreground = new Gdk.RGBA({red: 0, green: 0, blue: 0, alpha: 1});

			this.termWidget.set_color_background(background);
			this.termWidget.set_color_foreground(foreground);
			this.termWidget.set_color_cursor(background);
			this.termWidget.set_cursor_shape(Vte.CursorShape.IBEAM);
			this.termWidget.set_cursor_blink_mode(Vte.CursorBlinkMode.OFF);
			this.termWidget.set_sensitive(false);

			this.installFinishSignal = this.termWidget.connect('child-exited', installCallback.bind(this));

			this.pack_start(this.termWidget, true, true, 0);
			this.pack_start(this.installButton, false, false, 0);
			this.show_all();

			return GLib.SOURCE_REMOVE;
		});

		this.installSignal = this.installButton.connect('clicked', installModules.bind(this));
	}

	destroy()
	{
		this.installButton.disconnect(this.installSignal);

		if(this.termWidget && this.installFinishSignal)
			this.termWidget.disconnect(this.installFinishSignal);

		super.destroy();
	}
});

let CastAboutPageBox = GObject.registerClass(
class CastAboutPageBox extends Gtk.VBox
{
	_init()
	{
		super._init({
			valign: Gtk.Align.CENTER,
			halign: Gtk.Align.CENTER
		});

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
});

let CastPrefsNotebook = GObject.registerClass(
class CastPrefsNotebook extends Gtk.Notebook
{
	_init()
	{
		super._init({ margin: 5 });

		this.delay = 0;

		this.mainWidget = new CastMainSettingsBox();
		this.addToNotebook(this.mainWidget, _("Main"));

		this.remoteWidget = new CastRemoteSettingsGrid();
		this.addToNotebook(this.remoteWidget, _("Remote"));

		this.chromecastWidget = new CastChromecastSettingsGrid();
		this.addToNotebook(this.chromecastWidget, "Chromecast");

		this.otherWidget = new CastOtherSettingsNotebook();
		/* TRANSLATORS: Other extension settings */
		this.addToNotebook(this.otherWidget, _("Other"));

		this.addonsWidget = new CastAddonsSettingsNotebook();
		let addonsNumber = this.addonsWidget.get_n_pages();

		if(addonsNumber == 0)
		{
			this.addonsWidget.destroy();
			this.addonsWidget = null;
		}
		else
		{
			this.addToNotebook(this.addonsWidget, _("Add-ons"));
		}

		if(!Local.metadata['custom-install'])
		{
			this.modulesWidget = new CastModulesSettingsBox();
			this.addToNotebook(this.modulesWidget, _("Modules"));
		}

		this.aboutWidget = new CastAboutPageBox();
		this.addToNotebook(this.aboutWidget, _("About"));
	}

	addToNotebook(widget, name)
	{
		this.delay += 10;

		GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.delay, () =>
		{
			let label = new Gtk.Label({ label: _(name) });
			this.append_page(widget, label);

			if(!widget.visible && !widget.get_realized())
				widget.realize();

			widget.show_all();

			return GLib.SOURCE_REMOVE;
		});
	}

	destroy()
	{
		this.mainWidget.destroy();
		this.otherWidget.destroy();
		this.remoteWidget.destroy();
		this.chromecastWidget.destroy();
		this.aboutWidget.destroy();

		if(this.modulesWidget)
			this.modulesWidget.destroy();

		if(this.addonsWidget)
			this.addonsWidget.destroy();

		super.destroy();
	}
});

let CastToTvPrefsBox = GObject.registerClass(
class CastToTvPrefsBox extends Gtk.VBox
{
	_init()
	{
		super._init();

		this.timeout = null;
		this.notebook = new CastPrefsNotebook();
		this.pack_start(this.notebook, true, true, 0);

		this.notification = new CastIsStreamingInfoBox();
		this.pack_start(this.notification, true, true, 0);

		soupClient.getPlaybackData(data => this._onPlayingChange(data));

		this.intPortSignal = Settings.connect('changed::internal-port', () => this.delayReconnect());
		this.destroySignal = this.connect('destroy', () => this._onPrefsDestroy());

		this.createWebsocketConn();
	}

	createWebsocketConn(isRefresh)
	{
		soupClient.connectWebsocket('prefs', (err) =>
		{
			if(err) return this.delayReconnect();

			if(isRefresh)
				soupClient.getPlaybackData(data => this._onPlayingChange(data));

			soupClient.onWebsocketMsg((err, data) =>
			{
				if(err) return log('Cast to TV: '+ err.message);

				if(data.hasOwnProperty('isPlaying'))
					this._onPlayingChange(data);
				else if(data.hasOwnProperty('isEnabled'))
					this.notebook.mainWidget.setDisplayInfo(data.isEnabled);
			});

			this.wsClosedSignal = soupClient.wsConn.connect('closed', () => this.delayReconnect());
		});
	}

	delayReconnect()
	{
		if(!soupClient) return;

		if(this.timeout)
			GLib.source_remove(this.timeout);

		this.timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () =>
		{
			this.timeout = null;
			let wsPort = Settings.get_int('internal-port');

			if(wsPort != soupClient.wsPort)
				soupClient.setWsPort(wsPort);

			this.createWebsocketConn(true);

			return GLib.SOURCE_REMOVE;
		});
	}

	_onPlayingChange(data)
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

	_onPrefsDestroy()
	{
		this.disconnect(this.destroySignal);

		if(
			soupClient
			&& soupClient.wsConn
			&& this.wsClosedSignal
		) {
			soupClient.wsConn.disconnect(this.wsClosedSignal);
		}

		Settings.disconnect(this.intPortSignal);
		this.notebook.destroy();
		this.notification.destroy();

		if(!soupClient) return;

		soupClient.disconnectWebsocket(() =>
		{
			soupClient.abort();
			soupClient.run_dispose();
			soupClient = null;
		});
	}
});

let CastChromecastIpDialog = GObject.registerClass(
class CastChromecastIpDialog extends Gtk.Dialog
{
	_init(parent)
	{
		super._init({
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

		this.listStore = new Gtk.ListStore();
		this.listStore.set_column_types([
			GObject.TYPE_BOOLEAN,
			GObject.TYPE_STRING,
			GObject.TYPE_STRING
		]);

		this.devices = [];
		this.devIndex = -1;
		this.loadStoreList();

		let treeView = new Gtk.TreeView({
			expand: true,
			enable_search: false,
			model: this.listStore
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

		this.normalCellSignal = this.normalCell.connect('edited', this._onNormalCellEdit.bind(this));

		this.boldCellSignal = this.boldCell.connect('edited', this._onBoldCellEdit.bind(this));

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

		this.treeSelectionSignal = this.treeSelection.connect('changed', this._onTreeSelectionChanged.bind(this));

		let grid = new Gtk.Grid({
			valign: Gtk.Align.CENTER,
			halign: Gtk.Align.END,
			margin: 5,
			row_spacing: 6,
			column_spacing: 4
		});

		this.addButton = Gtk.Button.new_from_icon_name('list-add-symbolic', 4);
		this.addButtonSignal = this.addButton.connect('clicked', this._onAddButtonClicked.bind(this));

		this.removeButton = Gtk.Button.new_from_icon_name('list-remove-symbolic', 4);
		this.removeButton.set_sensitive(false);

		this.removeButtonSignal = this.removeButton.connect('clicked', this._onRemoveButtonClicked.bind(this));

		grid.attach(this.removeButton, 0, 0, 1, 1);
		grid.attach(this.addButton, 1, 0, 1, 1);
		box.pack_start(grid, false, false, 0);

		this.get_content_area().add(box);
		this.show_all();
	}

	loadStoreList()
	{
		/* Restore empty devices list if someone messed it externally */
		try { this.devices = JSON.parse(Settings.get_string('chromecast-devices')); }
		catch(err) {
			this.devices = [];
			Settings.set_string('chromecast-devices', "[]");
		}

		this.listStore.clear();

		this.devices.forEach(device =>
		{
			let devIp = device.ip || '';
			let isAuto = (device.hasOwnProperty('name') && device.name.endsWith('.local'));

			this.listStore.set(
				this.listStore.append(),
				[0, 1, 2], [isAuto, device.friendlyName, devIp]
			);
		});
	}

	_onNormalCellEdit(cell, path, newText)
	{
		newText = newText.trim();

		if(this.devices[path].ip !== newText)
		{
			this.devices[path].ip = newText;
			Settings.set_string('chromecast-devices', JSON.stringify(this.devices));
			this.loadStoreList();
		}
	}

	_onBoldCellEdit(cell, path, newText)
	{
		newText = newText.trim();

		if(this.devices[path].friendlyName !== newText)
		{
			this.devices[path].name = newText;
			this.devices[path].friendlyName = newText;
			Settings.set_string('chromecast-devices', JSON.stringify(this.devices));
			this.loadStoreList();
		}
	}

	_onTreeSelectionChanged()
	{
		let [isSelected, model, iter] = this.treeSelection.get_selected();
		this.devIndex = -1;

		if(isSelected)
		{
			this.devIndex = this.listStore.get_string_from_iter(iter);
			if(this.devIndex >= 0)
			{
				this.removeButton.set_sensitive(true);
				return;
			}
		}

		this.removeButton.set_sensitive(false);
	}

	_onAddButtonClicked()
	{
		this.devices.push({ name: '', friendlyName: '', ip: '' });
		Settings.set_string('chromecast-devices', JSON.stringify(this.devices));
		this.loadStoreList();
	}

	_onRemoveButtonClicked()
	{
		if(this.devIndex >= 0)
		{
			this.devices.splice(this.devIndex, 1);
			Settings.set_string('chromecast-devices', JSON.stringify(this.devices));
			this.loadStoreList();
		}
	}

	destroy()
	{
		this.treeSelection.disconnect(this.treeSelectionSignal);
		this.normalCell.disconnect(this.normalCellSignal);
		this.boldCell.disconnect(this.boldCellSignal);
		this.addButton.disconnect(this.addButtonSignal);
		this.removeButton.disconnect(this.removeButtonSignal);

		super.destroy();
	}
});

function scanDevices(widget, buttons, serviceName)
{
	let isPlayercast = (serviceName && serviceName === 'playercast');
	buttons.forEach(button => button.set_sensitive(false));

	widget.remove_all();
	/* TRANSLATORS: Shown when scan for Chromecast devices is running */
	widget.append('', _("Scanning..."));
	/* Show Scanning label */
	widget.set_active(0);

	const onSetDevicesFinish = function()
	{
		/* Set Automatic as active */
		widget.set_active(0);
		buttons.forEach(button => button.set_sensitive(true));
	}

	let [res, pid] = GLib.spawn_async(
		nodeDir, [nodeBin, Local.path + '/node_scripts/utils/scanner', serviceName],
		null, GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);

	GLib.child_watch_add(GLib.PRIORITY_LOW, pid, () =>
	{
		let devicesPromise = setDevices(widget, isPlayercast);

		if(!devicesPromise)
			return onSetDevicesFinish();

		devicesPromise.then(() => onSetDevicesFinish());
	});
}

function setDevices(widget, isPlayercast, activeText)
{
	widget.remove_all();
	widget.append('', _("Automatic"));

	let devName = (isPlayercast) ? 'playercast' : 'chromecast';
	let devices = [];

	/* Restore empty devices list if someone messed it externally */
	try { devices = JSON.parse(Settings.get_string(`${devName}-devices`)); }
	catch(err) { Settings.set_string(`${devName}-devices`, "[]"); }

	if(!isPlayercast)
	{
		Helper.setDevicesWidget(widget, devices, activeText);
		return false;
	}

	return new Promise(resolve =>
	{
		soupClient.getPlayercasts(playercasts =>
		{
			devices = Helper.parsePlayercastDevices(playercasts, devices);

			Helper.setDevicesWidget(widget, devices, activeText);
			resolve();
		});
	});
}

function getHostIpAsync(cb)
{
	let ip4 = '';

	let [res, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
		nodeDir, [nodeBin, Local.path + '/node_scripts/utils/local-ip'],
		null, GLib.SpawnFlags.DO_NOT_REAP_CHILD, null
	);

	let stream = new Gio.DataInputStream({ base_stream: new Gio.UnixInputStream({ fd: stdout }) });

	Helper.readOutputAsync(stream, (out) => ip4 += out);

	GLib.child_watch_add(GLib.PRIORITY_LOW, pid, () =>
	{
		if(ip4) ip4 = ip4.replace(/\n/, '');

		return cb(ip4);
	});
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
			Helper.createDir(installPath);
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
		Helper.createDir(installPath);
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

	if(!NODE_PATH) return widget = new CastMissingAppInfoBox('nodejs');
	else if(!NPM_PATH) return widget = new CastMissingAppInfoBox('npm');

	nodeDir = NODE_PATH.substring(0, NODE_PATH.lastIndexOf('/'));
	nodeBin = NODE_PATH.substring(NODE_PATH.lastIndexOf('/') + 1);

	if(!soupClient)
	{
		let listeningPort = Settings.get_int('listening-port');
		let wsPort = Settings.get_int('internal-port');
		soupClient = new Soup.CastClient(listeningPort, wsPort);
	}

	widget = new CastToTvPrefsBox();
	widget.show_all();
	widget.notification.hide();

	return widget;
}
