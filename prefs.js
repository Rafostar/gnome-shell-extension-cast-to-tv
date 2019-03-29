const { Gtk, Gio, GLib, Gdk, Vte } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Local = ExtensionUtils.getCurrentExtension();
const Convenience = Local.imports.convenience;
const Settings = Convenience.getSettings();
const Temp = Local.imports.temp;
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const _ = Gettext.gettext;

function init()
{
	Convenience.initTranslations();
}

class StreamingNotification extends Gtk.VBox
{
	constructor()
	{
		super({height_request: 380, spacing: 10, margin: 25});
		let label = null;

		label = new Gtk.Label({
			label: '<span font="16"><b>' + _("Streaming is in progress") + '</b></span>',
			use_markup: true,
			vexpand: true,
			valign: Gtk.Align.END
		});
		this.pack_start(label, true, true, 0);

		label = new Gtk.Label({
			label: '<span font="13">' + _("Stop media transfer before accessing extension settings") + '</span>',
			use_markup: true,
			vexpand: true,
			valign: Gtk.Align.START
		});
		this.pack_start(label, true, true, 0);
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
		label = new Gtk.Label({
			label: '<span font="12.5"><b>' + _("Main Options") + '</b></span>',
			use_markup: true,
			hexpand: true,
			halign: Gtk.Align.START
		});
		grid.attach(label, 0, 0, 1, 1);

		/* Receiver Type */
		label = new Gtk.Label({
			label: _("Receiver type"),
			hexpand: true,
			halign: Gtk.Align.START,
			margin_left: 12
		});
		widget = new Gtk.ComboBoxText({halign:Gtk.Align.END});
		widget.append('chromecast', "Chromecast");
		/* TRANSLATORS: Web browser or Media player app selection. This should be as short as possible e.g. "Browser | Player". */
		widget.append('other', "Web browser | Media player");
		//widget.append('cast-receiver', _("Receiver app"));
		Settings.bind('receiver-type', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
		grid.attach(label, 0, 1, 1, 1);
		grid.attach(widget, 1, 1, 1, 1);

		/* FFmpeg Path */
		label = new Gtk.Label({
			label: _("FFmpeg path"),
			hexpand: true,
			halign: Gtk.Align.START,
			margin_left: 12
		});
		widget = new Gtk.Entry({width_request: 220, halign:Gtk.Align.END});
		widget.set_placeholder_text("/usr/bin/ffmpeg");
		Settings.bind('ffmpeg-path', widget, 'text', Gio.SettingsBindFlags.DEFAULT);
		grid.attach(label, 0, 2, 1, 1);
		grid.attach(widget, 1, 2, 1, 1);

		/* FFprobe Path */
		label = new Gtk.Label({
			label: _("FFprobe path"),
			hexpand: true,
			halign: Gtk.Align.START,
			margin_left: 12
		});
		widget = new Gtk.Entry({width_request: 220, halign:Gtk.Align.END});
		widget.set_placeholder_text("/usr/bin/ffprobe");
		Settings.bind('ffprobe-path', widget, 'text', Gio.SettingsBindFlags.DEFAULT);
		grid.attach(label, 0, 3, 1, 1);
		grid.attach(widget, 1, 3, 1, 1);

		/* Listening Port */
		label = new Gtk.Label({
			label: _("Listening port"),
			hexpand: true,
			halign: Gtk.Align.START,
			margin_left: 12
		});
		this.portWidget = new Gtk.SpinButton({halign:Gtk.Align.END});
		this.portWidget.set_sensitive(true);
		this.portWidget.set_range(1, 65535);
		this.portWidget.set_value(Settings.get_int('listening-port'));
		this.portWidget.set_increments(1, 2);
		Settings.bind('listening-port', this.portWidget, 'value', Gio.SettingsBindFlags.DEFAULT);
		grid.attach(label, 0, 4, 1, 1);
		grid.attach(this.portWidget, 1, 4, 1, 1);

		/* Music Visualizer */
		label = new Gtk.Label({
			label: _("Music visualizer"),
			hexpand: true,
			halign: Gtk.Align.START,
			margin_left: 12
		});
		widget = new Gtk.Switch({halign:Gtk.Align.END});
		widget.set_sensitive(true);
		widget.set_active(Settings.get_boolean('music-visualizer'));
		Settings.bind('music-visualizer', widget, 'active', Gio.SettingsBindFlags.DEFAULT);
		grid.attach(label, 0, 5, 1, 1);
		grid.attach(widget, 1, 5, 1, 1);

		/* Web player link */
		this.linkButton = new Gtk.LinkButton({
			expand: false,
			halign:Gtk.Align.CENTER
		});

		this.hostIp = getHostIp();

		this.updateLink = () =>
		{
			let link = this.hostIp + ':' + this.portWidget.value;
			this.linkButton.uri = link;
			this.linkButton.label = link;
		}

		if(this.hostIp)
		{
			box = new Gtk.VBox({
				margin: 5,
				hexpand: true,
				valign:Gtk.Align.END,
				halign:Gtk.Align.CENTER
			});

			label = new Gtk.Label({
				label: _("Access web player from devices on local network")
			});

			this.updateLink();

			box.pack_start(label, false, false, 0);
			box.pack_start(this.linkButton, false, false, 0);
			this.pack_end(box, false, false, 0);
		}

		this.linkSignal = this.portWidget.connect('value-changed', () => this.updateLink());
	}

	destroy()
	{
		super.destroy();
		this.portWidget.disconnect(this.linkSignal);
	}
}

class EncodeSettings extends Gtk.Grid
{
	constructor()
	{
		super({margin: 20, row_spacing: 6});
		let label = null;
		let widget = null;

		/* Label: Media Encoding */
		label = new Gtk.Label({
			label: '<span font="12.5"><b>' + _("Media Encoding") + '</b></span>',
			use_markup: true,
			hexpand: true,
			halign: Gtk.Align.START
		});
		this.attach(label, 0, 0, 1, 1);

		/* Hardware Acceleration */
		label = new Gtk.Label({
			label: _("Hardware acceleration"),
			hexpand: true,
			halign: Gtk.Align.START,
			margin_left: 12
		});
		widget = new Gtk.ComboBoxText({halign:Gtk.Align.END});
		widget.append('none', _("None"));
		/* TRANSLATORS: Should remain as VAAPI unless you use different alphabet */
		widget.append('vaapi', _("VAAPI"));
		/* TRANSLATORS: Should remain as NVENC unless you use different alphabet */
		//widget.append('nvenc', _("NVENC"));
		Settings.bind('video-acceleration', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
		this.attach(label, 0, 1, 1, 1);
		this.attach(widget, 1, 1, 1, 1);

		/* Video Bitrate */
		label = new Gtk.Label({
			label: _("Bitrate (Mbps)"),
			hexpand: true,
			halign: Gtk.Align.START,
			margin_left: 12
		});
		widget = new Gtk.SpinButton({halign:Gtk.Align.END, digits:1});
		widget.set_sensitive(true);
		widget.set_range(2.0, 10.0);
		widget.set_value(Settings.get_double('video-bitrate'));
		widget.set_increments(0.1, 0.2);
		Settings.bind('video-bitrate', widget, 'value', Gio.SettingsBindFlags.DEFAULT);
		this.attach(label, 0, 2, 1, 1);
		this.attach(widget, 1, 2, 1, 1);
	}

	destroy()
	{
		super.destroy();
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
		label = new Gtk.Label({
			label: '<span font="12.5"><b>' + _("Remote Controller") + '</b></span>',
			use_markup: true,
			hexpand: true,
			halign: Gtk.Align.START
		});
		this.attach(label, 0, 0, 1, 1);

		/* Remote Position */
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
		Settings.bind('remote-position', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
		this.attach(label, 0, 1, 1, 1);
		this.attach(widget, 1, 1, 1, 1);

		/* Seek Backward/Forward */
		label = new Gtk.Label({
			label: _("Seek backward/forward (seconds)"),
			hexpand: true,
			halign: Gtk.Align.START,
			margin_left: 12
		});
		widget = new Gtk.SpinButton({halign:Gtk.Align.END});
		widget.set_sensitive(true);
		widget.set_range(1, 120);
		widget.set_value(Settings.get_int('seek-time'));
		widget.set_increments(1, 2);
		Settings.bind('seek-time', widget, 'value', Gio.SettingsBindFlags.DEFAULT);
		this.attach(label, 0, 2, 1, 1);
		this.attach(widget, 1, 2, 1, 1);

		/* Remote Label */
		label = new Gtk.Label({
			label: _("Show remote label"),
			hexpand: true,
			halign: Gtk.Align.START,
			margin_left: 12
		});
		widget = new Gtk.Switch({halign:Gtk.Align.END});
		widget.set_sensitive(true);
		widget.set_active(Settings.get_boolean('remote-label'));
		Settings.bind('remote-label', widget, 'active', Gio.SettingsBindFlags.DEFAULT);
		this.attach(label, 0, 3, 1, 1);
		this.attach(widget, 1, 3, 1, 1);
	}

	destroy()
	{
		super.destroy();
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

		/* Label: General */
		label = new Gtk.Label({
			label: '<span font="12.5"><b>' + _("Chromecast Options") + '</b></span>',
			use_markup: true,
			hexpand: true,
			halign: Gtk.Align.START
		});
		this.attach(label, 0, 0, 1, 1);

		/* Chromecast device name */
		label = new Gtk.Label({
			label: _("Device selection"),
			hexpand: true,
			halign: Gtk.Align.START,
			margin_left: 12
		});
		box = new Gtk.HBox({halign:Gtk.Align.END});
		widget = new Gtk.ComboBoxText();
		this.scanButton = Gtk.Button.new_from_icon_name('view-refresh-symbolic', 4);
		box.pack_end(this.scanButton, false, false, 0);
		box.pack_end(widget, false, false, 8);
		setDevices(widget);
		this.scanSignal = this.scanButton.connect('clicked', scanDevices.bind(this, widget, this.scanButton));
		Settings.bind('chromecast-name', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
		this.attach(label, 0, 1, 1, 1);
		this.attach(box, 1, 1, 1, 1);
	}

	destroy()
	{
		super.destroy();
		this.scanButton.disconnect(this.scanSignal);
	}
}

class AddonsSettings extends Gtk.Notebook
{
	constructor()
	{
		super();
		let label = null;
		let addonPrefs = null;

		let extPath = Local.path.substring(0, Local.path.lastIndexOf('/'));
		let extDir = Gio.File.new_for_path(extPath);
		let dirEnum = extDir.enumerate_children('standard::name,standard::type', 0, null);
		let addons = [];
		let addonWidgets = [];

		let info;
		while((info = dirEnum.next_file(null)))
		{
			let dirName = info.get_name();

			if(dirName.includes('cast-to-tv') && dirName.includes('addon'))
			{
				addons.push(dirName);
			}
		}

		addons.forEach(addonDir =>
		{
			let addonPath = extPath + '/' + addonDir;
			let isPrefs = GLib.file_test(addonPath + '/addon_prefs.js', 16);

			if(isPrefs)
			{
				imports.searchPath.unshift(addonPath);
				addonPrefs = imports.addon_prefs;
				addonWidgets.push(addonPrefs.buildPrefsWidget());
			}
		});

		addonWidgets.forEach(widget => this.append_page(widget, widget.title));
	}

	destroy()
	{
		super.destroy();
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

		this.installButton = new Gtk.Button({
			label: _("Install required npm modules"),
			expand: false,
			halign: Gtk.Align.CENTER
		});
		this.pack_start(this.installButton, false, false, 0);

		let installModules = () =>
		{
			TermWidget.reset(true, true);
			GLib.spawn_command_line_sync('pkill -SIGINT -f ' + Local.path);
			TermWidget.spawn_sync(Vte.PtyFlags.DEFAULT, Local.path, ['/usr/bin/npm', 'install'], null, 0, null, null);
		}

		this.installSignal = this.installButton.connect('clicked', installModules.bind(this));
	}

	destroy()
	{
		super.destroy();
		this.installButton.disconnect(this.installSignal);
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
			margin: 5
		});
		this.pack_start(image, false, false, 0);

		/* Extension name */
		label = new Gtk.Label({
			label: '<span font="16"><b>' + "Cast to TV" + '</b></span>',
			use_markup: true
		});
		this.pack_start(label, false, false, 0);

		/* Extension version */
		label = new Gtk.Label({
			label: '<span font="12"><b>' + _("version:") + " " + Local.metadata['version'] + '</b></span>',
			use_markup: true
		});
		this.pack_start(label, false, false, 0);

		/* Developer name */
		label = new Gtk.Label({
			label: '<span font="12">' + _("Developed by:") + " " + "Rafostar" + '</span>',
			use_markup: true,
			margin: 20
		});
		this.pack_start(label, false, false, 0);

		/* Homepage link */
		linkButton = new Gtk.LinkButton();

		linkButton.uri = Local.metadata['url'];
		linkButton.label = _("Extension Homepage");
		this.pack_start(linkButton, false, false, 0);
	}

	destroy()
	{
		super.destroy();
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

		this.encodeWidget = new EncodeSettings();
		label = new Gtk.Label({ label: _("Encoding") });
		this.append_page(this.encodeWidget, label);

		this.remoteWidget = new RemoteSettings();
		label = new Gtk.Label({ label: _("Remote") });
		this.append_page(this.remoteWidget, label);

		this.chromecastWidget = new ChromecastSettings();
		label = new Gtk.Label({ label: _("Chromecast") });
		this.append_page(this.chromecastWidget, label);

		this.addonsWidget = new AddonsSettings();
		let addonsNumber = this.addonsWidget.get_n_pages();

		if(addonsNumber == 0) {
			this.addonsWidget.destroy();
			this.addonsWidget = null;
		}
		else {
			label = new Gtk.Label({ label: _("Add-ons") });
			this.append_page(this.addonsWidget, label);
		}

		this.modulesWidget = new ModulesSettings();
		label = new Gtk.Label({ label: _("Modules") });
		this.append_page(this.modulesWidget, label);

		this.aboutWidget = new AboutPage();
		label = new Gtk.Label({ label: _("About") });
		this.append_page(this.aboutWidget, label);
	}

	destroy()
	{
		super.destroy();

		this.mainWidget.destroy();
		this.encodeWidget.destroy();
		this.remoteWidget.destroy();
		this.chromecastWidget.destroy();
		this.modulesWidget.destroy();
		this.aboutWidget.destroy();

		if(this.addonsWidget) this.addonsWidget.destroy();
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

		this.streamSignal = Settings.connect('changed::chromecast-playing', () =>
		{
			let chromecastPlaying = Settings.get_boolean('chromecast-playing');

			if(chromecastPlaying)
			{
				this.notebook.hide();
				this.notification.show();
			}
			else
			{
				this.notification.hide();
				this.notebook.show();
			}
		});
	}

	destroy()
	{
		super.destroy();

		this.notebook.destroy();
		this.notification.destroy();

		Settings.disconnect(this.streamSignal);
	}
}

function scanDevices(widget, button)
{
	button.set_sensitive(false);

	widget.remove_all();
	/* TRANSLATORS: Shown when scan for Chromecast devices is running */
	widget.append('', _("Scanning..."));
	/* Show Scanning label */
	widget.set_active(0);

	let [res, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
		'/usr/bin', ['node', Local.path + '/node_scripts/utils/scanner'], null, GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);

	GLib.child_watch_add(GLib.PRIORITY_LOW, pid, () =>
	{
		setDevices(widget);
		/* Set Automatic as active */
		widget.set_active(0);
		button.set_sensitive(true);
	});
}

function setDevices(widget)
{
	widget.remove_all();
	widget.append('', _("Automatic"));

	let devices = Temp.readFromFile(Local.path + '/devices.json');
	if(devices) devices.forEach(device => widget.append(device.name, device.friendlyName));
}

function getHostIp()
{
	try {
		/* NM might not be installed */
		let NMClient = imports.gi.NMClient;
		let client = new NMClient.Client;

		let priConn = client.get_primary_connection();
		let ip4Config = priConn.get_ip4_config();
		let ip4Adress = ip4Config.get_addresses()[0].get_address();

		let array = new Uint8Array(4);
		array[0] = ip4Adress;
		array[1] = ip4Adress >> 8;
		array[2] = ip4Adress >> 16;
		array[3] = ip4Adress >> 24;

		return 'http://' + array[0] + '.' + array[1] + '.' + array[2] + '.' + array[3];
	}
	catch(e) {
		return null;
	}
}

function buildPrefsWidget()
{
	let widget = new CastToTvSettings();
	widget.show_all();

	let isStreaming = Settings.get_boolean('chromecast-playing');

	if(isStreaming) widget.notebook.hide();
	else widget.notification.hide();

	return widget;
}
