const { Gtk, Gio, GLib, Gdk, NMClient, Vte } = imports.gi;
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
		super();
		this.spacing = 10;
		this.margin = 25;
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

class MainSettings extends Gtk.Grid
{
	constructor()
	{
		super();
		this.margin = 20;
		this.row_spacing = 6;

		let label = null;
		let widget = null;
		let button = null;

		/* Label: General */
		label = new Gtk.Label({
			label: '<span font="12.5"><b>' + _("Options") + '</b></span>',
			use_markup: true,
			hexpand: true,
			halign: Gtk.Align.START
		});
		this.attach(label, 0, 0, 1, 1);

		/* Receiver Type */
		label = new Gtk.Label({
			label: _("Receiver type"),
			hexpand: true,
			halign: Gtk.Align.START,
			margin_left: 12
		});
		widget = new Gtk.ComboBoxText({halign:Gtk.Align.END});
		widget.append('chromecast', "Chromecast");
		/* TRANSLATORS: This should be as short as possible. Web browser or Media player app selection. */
		widget.append('other', "Web browser | Media player");
		//widget.append('cast-app', _("Receiver app"));
		Settings.bind('receiver-type', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
		this.attach(label, 0, 1, 1, 1);
		this.attach(widget, 1, 1, 1, 1);

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
		this.attach(label, 0, 2, 1, 1);
		this.attach(widget, 1, 2, 1, 1);

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
		this.attach(label, 0, 3, 1, 1);
		this.attach(widget, 1, 3, 1, 1);

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
		this.attach(label, 0, 4, 1, 1);
		this.attach(this.portWidget, 1, 4, 1, 1);

		/* Label: Media Encoding */
		label = new Gtk.Label({
			label: '<span font="12.5"><b>' + _("Media Encoding") + '</b></span>',
			use_markup: true,
			hexpand: true,
			margin_top: 20,
			halign: Gtk.Align.START
		});
		this.attach(label, 0, 5, 1, 1);

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
		this.attach(label, 0, 6, 1, 1);
		this.attach(widget, 1, 6, 1, 1);

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
		//widget.append('nvenc', _("NVENC"));
		Settings.bind('video-acceleration', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
		this.attach(label, 0, 7, 1, 1);
		this.attach(widget, 1, 7, 1, 1);

		/* Label: Miscellaneous */
		label = new Gtk.Label({
			/* TRANSLATORS: The rest  of settings (something like "Other" or "Remaining") */
			label: '<span font="12.5"><b>' + _("Miscellaneous") + '</b></span>',
			use_markup: true,
			hexpand: true,
			margin_top: 20,
			halign: Gtk.Align.START
		});
		this.attach(label, 0, 8, 1, 1);

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
		this.attach(label, 0, 9, 1, 1);
		this.attach(widget, 1, 9, 1, 1);
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
		super();
		this.margin = 20;
		this.row_spacing = 6;

		let label = null;
		let widget = null;
		let box = null;
		let button = null;

		/* Label: General */
		label = new Gtk.Label({
			label: '<span font="12.5"><b>' + _("Options") + '</b></span>',
			use_markup: true,
			hexpand: true,
			halign: Gtk.Align.START
		});
		this.attach(label, 0, 0, 1, 1);

		/* Chromecast device name */
		label = new Gtk.Label({
			label: _("Chromecast selection"),
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

		/* Label: Chromecast Remote */
		label = new Gtk.Label({
			label: '<span font="12.5"><b>' + _("Chromecast Remote") + '</b></span>',
			use_markup: true,
			hexpand: true,
			margin_top: 20,
			halign: Gtk.Align.START
		});
		this.attach(label, 0, 2, 1, 1);

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
		this.attach(label, 0, 3, 1, 1);
		this.attach(widget, 1, 3, 1, 1);

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
		this.attach(label, 0, 4, 1, 1);
		this.attach(widget, 1, 4, 1, 1);
	}

	destroy()
	{
		super.destroy();
		this.scanButton.disconnect(this.scanSignal);
	}
}

class WebBrowserSettings extends Gtk.VBox
{
	constructor()
	{
		super();
		this.grid = new Gtk.Grid();
		this.margin = 20;
		this.grid.row_spacing = 6;
		this.pack_start(this.grid, true, true, 0);

		let label = null;
		let widget = null;
		let box = null;

		/* Label: Web Player Remote */
		label = new Gtk.Label({
			label: '<span font="12.5"><b>' + _("Remote Controller") + '</b></span>',
			use_markup: true,
			hexpand: true,
			halign: Gtk.Align.START
		});
		//this.grid.attach(label, 0, 0, 1, 1);

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
		//Settings.bind('browser-remote-position', widget, 'active-id', Gio.SettingsBindFlags.DEFAULT);
		//this.grid.attach(label, 0, 1, 1, 1);
		//this.grid.attach(widget, 1, 1, 1, 1);

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
		//widget.set_value(Settings.get_int('browser-seek-time'));
		widget.set_increments(1, 2);
		//Settings.bind('browser-seek-time', widget, 'value', Gio.SettingsBindFlags.DEFAULT);
		//this.grid.attach(label, 0, 2, 1, 1);
		//this.grid.attach(widget, 1, 2, 1, 1);

		this.linkButton = new Gtk.LinkButton({
			expand: false,
			halign:Gtk.Align.CENTER
		});

		this.client = new NMClient.Client;
		this.hostIp = getHostIp(this.client);

		if(this.hostIp)
		{
			box = new Gtk.VBox({
				hexpand: true,
				valign:Gtk.Align.END,
				halign:Gtk.Align.CENTER
			});

			label = new Gtk.Label({
				label: _("Access web player from devices on local network")
			});

			this.link = this.hostIp + ':' + Settings.get_int('listening-port');
			this.linkButton.uri = this.link;
			this.linkButton.label = this.link;

			box.pack_start(label, false, false, 0);
			box.pack_start(this.linkButton, false, false, 0);
			this.pack_start(box, false, false, 0);
		}
	}

	destroy()
	{
		super.destroy();
	}
}

class UpdateSettings extends Gtk.VBox
{
	constructor()
	{
		super();
		this.margin = 10;

		let TermWidget = new Vte.Terminal({
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

		this.pack_start(TermWidget, false, false, 0);

		this.installButton = new Gtk.Button({ label: _("Install required npm modules") });
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

class CastToTvSettings extends Gtk.Notebook
{
	constructor()
	{
		super();
		this.margin = 5;
		let label = null;

		this.mainWidget = new MainSettings();
		label = new Gtk.Label({ label: _("Main") });
		this.append_page(this.mainWidget, label);

		this.chromecastWidget = new ChromecastSettings();
		label = new Gtk.Label({ label: _("Chromecast") });
		this.append_page(this.chromecastWidget, label);

		this.webBrowserWidget = new WebBrowserSettings();
		label = new Gtk.Label({ label: _("Web player") });
		this.append_page(this.webBrowserWidget, label);

		this.updateWidget = new UpdateSettings();
		label = new Gtk.Label({ label: _("Modules") });
		this.append_page(this.updateWidget, label);

		this.updateLink = () =>
		{
			let link = this.webBrowserWidget.hostIp + ':' + this.mainWidget.portWidget.value;

			this.webBrowserWidget.linkButton.uri = link;
			this.webBrowserWidget.linkButton.label = link;
		}

		this.linkSignal = this.mainWidget.portWidget.connect('value-changed', () => this.updateLink());
	}

	destroy()
	{
		super.destroy();
		this.MainWidget.portWidget.disconnect(this.linkSignal);

		this.mainWidget.destroy();
		this.chromecastWidget.destroy();
		this.webBrowserWidget.destroy();
		this.updateWidget.destroy();
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

function getHostIp(client)
{
	try {
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
	let widget;
	let isStreaming = Settings.get_boolean('chromecast-playing');

	if(isStreaming) widget = new StreamingNotification();
	else widget = new CastToTvSettings();

	widget.show_all();
	return widget;
}
