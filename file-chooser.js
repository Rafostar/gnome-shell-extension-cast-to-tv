imports.gi.versions.Gtk = '3.0';

const { Gio, Gtk, GLib } = imports.gi;
const Gettext = imports.gettext.domain('cast-to-tv');

const LOCAL_PATH = GLib.get_current_dir();
imports.searchPath.unshift(LOCAL_PATH);
const Soup = imports.soup;
const Helper = imports.helper;
const shared = imports.shared.module.exports;
imports.searchPath.shift();

const Settings = Helper.getSettings(LOCAL_PATH);
const _ = Gettext.gettext;

const STREAM_TYPE = (ARGV[0]) ? ARGV[0] : null;
/* TRANSLATORS: Button text when selected SINGLE file */
const CAST_LABEL_SINGLE = _("Cast Selected File");
/* TRANSLATORS: Button text when selected MULTIPLE files */
const CAST_LABEL_MULTI = _("Cast Selected Files");
const ADD_PLAYLIST_LABEL = _("Add to Playlist");

class fileChooser
{
	constructor()
	{
		GLib.set_prgname('Cast to TV');
		Helper.initTranslations(LOCAL_PATH);
		this.application = new Gtk.Application();
		this.filePathChosen = [];
		this.application.connect('activate', () => this._openDialog());
		this.application.connect('startup', () => this._buildUI());
		this.application.run([]);
	}

	_buildUI()
	{
		this.window = new Gtk.ApplicationWindow();

		this.fileChooser = new Gtk.FileChooserDialog({
			transient_for: this.window,
			window_position: Gtk.WindowPosition.CENTER,
			local_only: false
		});

		let iconTheme = Gtk.IconTheme.get_default();
		if(iconTheme.has_icon('cast-to-tv'))
			this.fileChooser.set_icon_name('cast-to-tv');
		else
		{
			try {
				this.fileChooser.set_icon_from_file(
					LOCAL_PATH + '/appIcon/cast-to-tv.svg'
				);
			}
			catch(err) {
				this.fileChooser.set_icon_name('application-x-executable');
			}
		}
	}

	_getExtraWidget()
	{
		let box = new Gtk.Box({ spacing: 2 });

		if(STREAM_TYPE === 'VIDEO')
			this._addTranscodeWidget(box);

		box.show_all();
		this._addDeviceSelection(box);

		return box;
	}

	_addTranscodeWidget(box)
	{
		this.buttonConvert = new Gtk.CheckButton({ label: _("Transcode") + ':' });

		this.comboBoxConvert = new Gtk.ComboBoxText({ margin_right: 8 });
		this.comboBoxConvert.append('video', _("Video"));
		this.comboBoxConvert.append('audio', _("Audio"));
		this.comboBoxConvert.append('video+audio', _("Video + Audio"));
		this.comboBoxConvert.set_active(Settings.get_int('last-transcode'));
		Settings.bind('last-transcode', this.comboBoxConvert, 'active', Gio.SettingsBindFlags.DEFAULT);
		this.comboBoxConvert.set_sensitive(false);

		this.buttonConvert.connect('toggled', () =>
		{
			let isConvertActive = this.buttonConvert.get_active();
			this.comboBoxConvert.set_sensitive(isConvertActive);

			this._checkPlaylistLabel();
		});

		box.pack_start(this.buttonConvert, true, true, 0);
		box.pack_start(this.comboBoxConvert, true, true, 0);
	}

	_addDeviceSelection(box)
	{
		this.deviceSelectLabel = new Gtk.Label({ margin_left: 4, margin_right: 4 });
		this.chromecastSelect = new Gtk.ComboBoxText();
		this.playercastSelect = new Gtk.ComboBoxText();

		this._setDevices();
		Settings.connect('changed::receiver-type', this._setDevices.bind(this));

		box.pack_start(this.deviceSelectLabel, true, true, 0);
		box.pack_start(this.chromecastSelect, true, true, 0);
		box.pack_start(this.playercastSelect, true, true, 0);
	}

	_refreshDevicesBox(recType, additionalDevs)
	{
		let devices = [];
		let recSelect = recType + 'Select';
		let recBound = recType + 'Bound';
		let activeText = this[recSelect].get_active_text();

		/* Restore empty devices list if someone messed it externally */
		try { devices = JSON.parse(Settings.get_string(recType + '-devices')); }
		catch(err) { Settings.set_string(recType + '-devices', "[]"); }

		if(recType === 'playercast' && additionalDevs)
			devices = Helper.parsePlayercastDevices(devices, additionalDevs);

		this[recSelect].remove_all();
		this[recSelect].append('', _("Automatic"));

		this.setDevicesSignal = Settings.connect(
			'changed::' + recType + '-devices', this._setDevices.bind(this)
		);
		Helper.setDevicesWidget(this[recSelect], devices, activeText);

		if(!this[recBound])
		{
			Settings.bind(
				recType + '-name', this[recSelect],
				'active-id', Gio.SettingsBindFlags.DEFAULT
			);
			/* Set to Automatic instead of empty box */
			if(!this[recSelect].get_active_text())
				this[recSelect].set_active(0);

			this[recBound] = true;
		}

		if(!this.isPlaying)
		{
			this.deviceSelectLabel.show();

			if(recType === 'chromecast')
				this.playercastSelect.hide();
			else
				this.chromecastSelect.hide();

			this[recSelect].show();
		}
		else
			hideDeviceSelection();
	}

	_setDevices()
	{
		if(this.setDevicesSignal)
		{
			Settings.disconnect(this.setDevicesSignal);
			this.setDevicesSignal = null;
		}

		let receiverType = Settings.get_string('receiver-type');

		const hideDeviceSelection = () =>
		{
			this.deviceSelectLabel.hide();
			this.playercastSelect.hide();
			this.chromecastSelect.hide();
		}

		switch(receiverType)
		{
			case 'chromecast':
				this.deviceSelectLabel.label = 'Chromecast:';
				this._refreshDevicesBox(receiverType, null);
				break;
			case 'playercast':
				this.deviceSelectLabel.label = 'Playercast:';
				Soup.client.getPlayercasts(playercasts =>
					this._refreshDevicesBox(receiverType, playercasts)
				);
				break;
			default:
				hideDeviceSelection();
				break;
		}
	}

	_getEncodeTypeString()
	{
		if(!this.comboBoxConvert)
			return '';

		switch(this.comboBoxConvert.active_id)
		{
			case 'video':
				return '_VENC';
			case 'audio':
				return '_AENC';
			default:
				return '_VENC_AENC';
		}
	}

	_openDialog()
	{
		if(!STREAM_TYPE)
			return log('Cast to TV: cannot open file chooser without stream type');

		let config = {
			receiverType: Settings.get_string('receiver-type'),
			videoAcceleration: Settings.get_string('video-acceleration'),
			listeningPort: Settings.get_int('listening-port'),
			internalPort: Settings.get_int('internal-port')
		};

		let selection = {
			streamType: STREAM_TYPE,
			subsPath: ''
		};

		Soup.createClient(config.listeningPort, config.internalPort);
		this.reconnectTimeout = null;
		this._connectWs();
		Settings.connect('changed::internal-port', () => this._delayReconnectWs());
		Settings.connect('changed::listening-port', () =>
			Soup.client.setNodePort(Settings.get_int('listening-port'))
		);

		let isServiceEnabled = this._getInitData();

		if(!isServiceEnabled)
		{
			if(this.fileChooser)
				this.fileChooser.destroy();

			return log('Cast to TV: file chooser - node service is disabled');
		}

		this.isSubsDialog = false;
		this.fileFilter = new Gtk.FileFilter();
		this.fileChooser.set_select_multiple(true);
		this.fileChooser.set_action(Gtk.FileChooserAction.OPEN);
		this.fileChooser.add_button(_("Cancel"), Gtk.ResponseType.CANCEL);

		let castButtonText = (this.playlistAllowed) ? _(ADD_PLAYLIST_LABEL) : _(CAST_LABEL_SINGLE);
		this.buttonCast = this.fileChooser.add_button(castButtonText, Gtk.ResponseType.OK);

		switch(selection.streamType)
		{
			case 'VIDEO':
				this.buttonSubs = this.fileChooser.add_button(
					_("Add Subtitles"), Gtk.ResponseType.APPLY
				);
				this.fileChooser.set_title(_("Select Video"));
				this.fileChooser.set_current_folder(
					GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_VIDEOS)
				);
				this.fileFilter.set_name(_("Video Files"));
				this.fileFilter.add_mime_type('video/*');

				this.fileSelectionChanged = this.fileChooser.connect(
					'selection-changed', this._onVideoSel.bind(this)
				);
				break;
			case 'MUSIC':
				this.fileChooser.set_title(_("Select Music"));
				this.fileChooser.set_current_folder(
					GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_MUSIC)
				);
				this.fileFilter.set_name(_("Audio Files"));
				this.fileFilter.add_mime_type('audio/*');

				this.fileSelectionChanged = this.fileChooser.connect(
					'selection-changed', this._onMusicAndPicSel.bind(this)
				);
				break;
			case 'PICTURE':
				this.fileChooser.set_title(_("Select Picture"));
				this.fileChooser.set_current_folder(
					GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES)
				);
				this.fileFilter.set_name(_("Pictures"));
				this.fileFilter.add_pixbuf_formats();

				this.fileSelectionChanged = this.fileChooser.connect(
					'selection-changed', this._onMusicAndPicSel.bind(this)
				);
				break;
			default:
				return;
		}

		this.fileChooser.set_extra_widget(this._getExtraWidget());
		this.fileChooser.add_filter(this.fileFilter);
		this.fileChooser.connect('response', this._onResponse.bind(this));

		let DialogResponse = this.fileChooser.run();

		let filesList = this.filePathChosen.sort();
		selection.filePath = filesList[0];

		if(DialogResponse !== Gtk.ResponseType.OK)
		{
			if(DialogResponse !== Gtk.ResponseType.APPLY) return;

			this.fileChooser.disconnect(this.fileSelectionChanged);
			selection.subsPath = this._selectSubtitles();

			if(!selection.subsPath) return;
		}

		Soup.client.disconnectWebsocket();

		/* Handle convert button */
		if(this.buttonConvert && this.buttonConvert.get_active())
			selection.streamType += this._getEncodeTypeString();

		this.fileChooser.destroy();

		if(this.playlistAllowed)
			Soup.client.postPlaylistSync(filesList, true);
		else
		{
			Soup.client.postPlaybackDataSync({
				playlist: filesList,
				selection: selection
			});
		}
	}

	_selectSubtitles()
	{
		this.isSubsDialog = true;
		this._checkPlaylistLabel();

		let subsFilter = new Gtk.FileFilter();

		this.fileChooser.set_title(_("Select Subtitles"));
		this.buttonSubs.hide();

		/* Add supported subtitles formats to filter */
		subsFilter.set_name(_("Subtitle Files"));

		shared.subsFormats.forEach(extension =>
		{
			subsFilter.add_pattern('*.' + extension);
		});

		this.fileChooser.set_select_multiple(false);
		this.fileChooser.remove_filter(this.fileFilter);
		this.fileChooser.add_filter(subsFilter);

		if(this.fileChooser.run() == Gtk.ResponseType.OK)
			return this.filePathChosen[0];
		else
			return null;
	}

	_getInitData()
	{
		let data = Soup.client.getPlaybackDataSync();

		if(!data) return null;

		this.isPlaying = data.isPlaying;
		this.playlistAllowed = this._getAddPlaylistAllowed(data.selection);

		return true;
	}

	_connectWs()
	{
		Soup.client.connectWebsocket('filechooser', (err) =>
		{
			if(err) return this._delayReconnectWs();

			Soup.client.onWebsocketMsg((err, data) =>
			{
				if(err) return log('Cast to TV: ' + err.message);

				if(data.hasOwnProperty('isPlaying'))
				{
					this.isPlaying = data.isPlaying;
					this._setDevices();
					this._checkPlaylistLabel();
				}
				else if(data.hasOwnProperty('isEnabled'))
				{
					if(!data.isEnabled && this.fileChooser)
						this.fileChooser.destroy();
				}
			});

			Soup.client.wsConn.connect('closed', () => this._delayReconnectWs());
		});
	}

	_delayReconnectWs()
	{
		if(this.reconnectTimeout)
			GLib.source_remove(this.reconnectTimeout);

		this.reconnectTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () =>
		{
			this.reconnectTimeout = null;
			let wsPort = Settings.get_int('internal-port');

			if(wsPort != Soup.client.wsPort)
				Soup.client.setWsPort(wsPort);

			this._connectWs();

			return GLib.SOURCE_REMOVE;
		});
	}

	_getAddPlaylistAllowed(preSelection)
	{
		let allowed = false;

		if(this.isPlaying)
		{
			if(
				this.isSubsDialog
				|| (this.buttonConvert && this.buttonConvert.get_active())
			) {
				allowed = false;
			}
			else
			{
				preSelection = preSelection || Soup.client.getSelectionSync();

				if(
					preSelection
					&& !preSelection.hasOwnProperty('addon')
					&& preSelection.streamType === STREAM_TYPE
				)
					allowed = true;
			}
		}

		return allowed;
	}

	_checkPlaylistLabel()
	{
		let allowed = this._getAddPlaylistAllowed();

		if(this.playlistAllowed !== allowed)
		{
			this.playlistAllowed = allowed;

			if(this.playlistAllowed && this.buttonCast)
				this.buttonCast.label = _(ADD_PLAYLIST_LABEL);
			else
				this._onVideoSel();
		}
	}

	_onVideoSel()
	{
		if(this.playlistAllowed) return;

		let selectedNumber = this.fileChooser.get_filenames().length;

		if(selectedNumber > 1)
		{
			this.buttonCast.label = _(CAST_LABEL_MULTI);

			if(this.buttonSubs)
				this.buttonSubs.hide();
		}
		else
		{
			this.buttonCast.label = _(CAST_LABEL_SINGLE);

			if(this.buttonSubs)
			{
				this.buttonSubs.show();
				this.buttonSubs.set_sensitive(selectedNumber === 1);
			}
		}
	}

	_onMusicAndPicSel()
	{
		if(this.playlistAllowed) return;

		let selectedNumber = this.fileChooser.get_filenames().length;

		if(selectedNumber > 1) this.buttonCast.label = _(CAST_LABEL_MULTI);
		else this.buttonCast.label = _(CAST_LABEL_SINGLE);
	}

	_onResponse()
	{
		this.filePathChosen = this.fileChooser.get_filenames();
	}
}

let dialog = new fileChooser();
