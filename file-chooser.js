imports.gi.versions.Gtk = '3.0';

const { Gio, Gtk, GLib } = imports.gi;
const Gettext = imports.gettext.domain('cast-to-tv');

const LOCAL_PATH = GLib.get_current_dir();
imports.searchPath.unshift(LOCAL_PATH);
const Helper = imports.helper;
const shared = imports.shared.module.exports;
imports.searchPath.shift();

const Settings = Helper.getSettings(LOCAL_PATH);
const _ = Gettext.gettext;

const STREAM_TYPE = ARGV[0];
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
		if(iconTheme.has_icon('cast-to-tv')) this.fileChooser.set_icon_name('cast-to-tv');
		else {
			try { this.fileChooser.set_icon_from_file(LOCAL_PATH + '/appIcon/cast-to-tv.svg'); }
			catch(err) { this.fileChooser.set_icon_name('application-x-executable'); }
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
		//this.comboBoxConvert.append('audio', _("Audio"));
		this.comboBoxConvert.append('video+audio', _("Video + Audio"));
		this.comboBoxConvert.set_active(0);
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

	_setDevices()
	{
		if(this.setDevicesSignal)
		{
			Settings.disconnect(this.setDevicesSignal);
			this.setDevicesSignal = null;
		}

		let devices = [];
		let activeText = '';
		let receiverType = Settings.get_string('receiver-type');

		const hideDeviceSelection = () =>
		{
			this.deviceSelectLabel.hide();
			this.playercastSelect.hide();
			this.chromecastSelect.hide();
		}

		if(receiverType === 'chromecast')
		{
			this.deviceSelectLabel.label = 'Chromecast:';
			activeText = this.chromecastSelect.get_active_text();

			/* Restore empty devices list if someone messed it externally */
			try { devices = JSON.parse(Settings.get_string('chromecast-devices')); }
			catch(err) { Settings.set_string('chromecast-devices', "[]"); }

			this.chromecastSelect.remove_all();
			this.chromecastSelect.append('', _("Automatic"));

			this.setDevicesSignal = Settings.connect('changed::chromecast-devices', this._setDevices.bind(this));
			Helper.setDevicesWidget(this.chromecastSelect, devices, activeText);

			if(!this.boundChromecastDevices)
			{
				Settings.bind('chromecast-name', this.chromecastSelect, 'active-id', Gio.SettingsBindFlags.DEFAULT);
				this.boundChromecastDevices = true;
			}

			if(!this.chromecastPlaying)
			{
				this.deviceSelectLabel.show();
				this.playercastSelect.hide();
				this.chromecastSelect.show();
			}
			else
				hideDeviceSelection();
		}
		else if(receiverType === 'playercast')
		{
			this.deviceSelectLabel.label = 'Playercast:';
			activeText = this.playercastSelect.get_active_text();

			devices = Helper.readFromFile(shared.playercastsPath);
			this.playercastSelect.remove_all();
			this.playercastSelect.append('', _("Automatic"));
			Helper.setDevicesWidget(this.playercastSelect, devices, activeText);

			if(!this.boundPlayercastDevices)
			{
				Settings.bind('playercast-name', this.playercastSelect, 'active-id', Gio.SettingsBindFlags.DEFAULT);
				this.boundPlayercastDevices = true;
			}

			if(!this.chromecastPlaying)
			{
				this.deviceSelectLabel.show();
				this.chromecastSelect.hide();
				this.playercastSelect.show();
			}
			else
				hideDeviceSelection();
		}
		else
		{
			hideDeviceSelection();
		}
	}

	_getEncodeTypeString(configContents)
	{
		if(this.comboBoxConvert && this.comboBoxConvert.active_id !== 'audio')
		{
			switch(configContents.videoAcceleration)
			{
				case 'vaapi':
					return '_VAAPI';
				case 'nvenc':
					return '_NVENC';
				default:
					return '_ENCODE';
			}
		}

		return '';
	}

	_getTranscodeAudioEnabled()
	{
		let isTranscodeAudioEnabled = false;

		if(this.comboBoxConvert)
			isTranscodeAudioEnabled = (this.comboBoxConvert.active_id !== 'video') ? true : false;

		return isTranscodeAudioEnabled;
	}

	_openDialog()
	{
		let configContents = Helper.readFromFile(shared.configPath);
		if(!configContents || !STREAM_TYPE) return;

		let selectionContents = {
			streamType: STREAM_TYPE,
			subsPath: ''
		};

		this.isSubsDialog = false;
		this.fileFilter = new Gtk.FileFilter();

		if(configContents.receiverType == 'other' && selectionContents.streamType == 'PICTURE')
		{
			this.fileChooser.set_select_multiple(false);
		}
		else
		{
			this.fileChooser.set_select_multiple(true);
		}

		this.fileChooser.set_action(Gtk.FileChooserAction.OPEN);
		this.fileChooser.add_button(_("Cancel"), Gtk.ResponseType.CANCEL);

		this.chromecastPlaying = Settings.get_boolean('chromecast-playing');
		this.playlistAllowed = this._getAddPlaylistAllowed();
		this.playlistSignal = Settings.connect('changed::chromecast-playing', () => this._onChromecastPlayingChange());

		let castButtonText = (this.playlistAllowed) ? ADD_PLAYLIST_LABEL : CAST_LABEL_SINGLE;
		this.buttonCast = this.fileChooser.add_button(castButtonText, Gtk.ResponseType.OK);

		switch(selectionContents.streamType)
		{
			case 'VIDEO':
				this.buttonSubs = this.fileChooser.add_button(_("Add Subtitles"), Gtk.ResponseType.APPLY);
				this.fileChooser.set_title(_("Select Video"));
				this.fileChooser.set_current_folder(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_VIDEOS));

				this.fileFilter.set_name(_("Video Files"));
				this.fileFilter.add_mime_type('video/*');

				this.fileSelectionChanged = this.fileChooser.connect('selection-changed', () => this._onVideoSel());
				break;
			case 'MUSIC':
				this.fileChooser.set_title(_("Select Music"));
				this.fileChooser.set_current_folder(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_MUSIC));

				this.fileFilter.set_name(_("Audio Files"));
				this.fileFilter.add_mime_type('audio/*');

				this.fileSelectionChanged = this.fileChooser.connect('selection-changed', () => this._onMusicAndPicSel());
				break;
			case 'PICTURE':
				this.fileChooser.set_title(_("Select Picture"));
				this.fileChooser.set_current_folder(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES));

				this.fileFilter.set_name(_("Pictures"));
				this.fileFilter.add_pixbuf_formats();

				this.fileSelectionChanged = this.fileChooser.connect('selection-changed', () => this._onMusicAndPicSel());
				break;
			default:
				return;
		}

		this.fileChooser.set_extra_widget(this._getExtraWidget());
		this.fileChooser.add_filter(this.fileFilter);
		this.fileChooser.connect('response', () => this._onResponse());

		let DialogResponse = this.fileChooser.run();

		Settings.disconnect(this.playlistSignal);

		let filesList = this.filePathChosen.sort();
		selectionContents.filePath = filesList[0];

		if(DialogResponse !== Gtk.ResponseType.OK)
		{
			if(DialogResponse === Gtk.ResponseType.APPLY)
			{
				selectionContents.subsPath = this._selectSubtitles();
				if(!selectionContents.subsPath) return;
			}
			else
			{
				return;
			}
		}

		this.fileChooser.disconnect(this.fileSelectionChanged);

		/* Handle convert button */
		if(this.buttonConvert && this.buttonConvert.get_active())
		{
			selectionContents.streamType += this._getEncodeTypeString(configContents);
			selectionContents.transcodeAudio = this._getTranscodeAudioEnabled();
		}
		else
			selectionContents.transcodeAudio = false;

		this.fileChooser.destroy();

		let setTempFiles = () =>
		{
			/* Set playback list */
			Helper.writeToFile(shared.listPath, filesList);

			/* Save selection to file */
			Helper.writeToFile(shared.selectionPath, selectionContents);
		}

		/* Playlist does not support external subtitles */
		if(this.playlistAllowed)
		{
			let playlist = Helper.readFromFile(shared.listPath);
			if(!playlist) return setTempFiles();

			filesList.forEach(filepath =>
			{
				if(!playlist.includes(filepath))
					playlist.push(filepath);
			});

			Helper.writeToFile(shared.listPath, playlist);
		}
		else
			setTempFiles();
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

		shared.subsFormats.forEach(function(extension)
		{
			subsFilter.add_pattern('*.' + extension);
		});

		this.fileChooser.set_select_multiple(false);
		this.fileChooser.remove_filter(this.fileFilter);
		this.fileChooser.add_filter(subsFilter);

		if(this.fileChooser.run() == Gtk.ResponseType.OK) return this.filePathChosen[0];
		else return null;
	}

	_getAddPlaylistAllowed()
	{
		let allowed = false;

		if(this.chromecastPlaying)
		{
			if(this.isSubsDialog || (this.buttonConvert && this.buttonConvert.get_active()))
			{
				allowed = false;
			}
			else
			{
				let preSelection = Helper.readFromFile(shared.selectionPath);

				if(
					preSelection
					&& !preSelection.hasOwnProperty('addon')
					&& preSelection.streamType === STREAM_TYPE
					&& preSelection.hasOwnProperty('transcodeAudio')
					&& !preSelection.transcodeAudio
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
				this.buttonCast.label = ADD_PLAYLIST_LABEL;
			else
				this.fileChooser.emit('selection-changed');
		}
	}

	_onVideoSel()
	{
		if(this.playlistAllowed) return;

		let selectedNumber = this.fileChooser.get_filenames().length;

		if(selectedNumber > 1)
		{
			this.buttonCast.label = CAST_LABEL_MULTI;
			this.buttonSubs.hide();
		}
		else
		{
			this.buttonCast.label = CAST_LABEL_SINGLE;
			this.buttonSubs.show();
		}
	}

	_onMusicAndPicSel()
	{
		if(this.playlistAllowed) return;

		let selectedNumber = this.fileChooser.get_filenames().length;

		if(selectedNumber > 1) this.buttonCast.label = CAST_LABEL_MULTI;
		else this.buttonCast.label = CAST_LABEL_SINGLE;
	}

	_onResponse()
	{
		this.filePathChosen = this.fileChooser.get_filenames();
	}

	_onChromecastPlayingChange()
	{
		this.chromecastPlaying = Settings.get_boolean('chromecast-playing');
		this._setDevices();
		this._checkPlaylistLabel();
	}
}

let dialog = new fileChooser();
