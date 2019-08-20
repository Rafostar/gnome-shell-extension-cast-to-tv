const { Gio, Gtk, GLib } = imports.gi;
const ByteArray = imports.byteArray;
const Gettext = imports.gettext;
const MetadataDomain = 'cast-to-tv';
const GettextDomain = Gettext.domain(MetadataDomain);
const _ = GettextDomain.gettext;
const localPath = GLib.get_home_dir() + '/.local/share/gnome-shell/extensions/cast-to-tv@rafostar.github.com';
const streamType = ARGV[0];
imports.searchPath.unshift(localPath);
const shared = imports.shared.module.exports;
Gettext.bindtextdomain(MetadataDomain, localPath + '/locale');

class fileChooser
{
	constructor()
	{
		GLib.set_prgname('Cast to TV');
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
			window_position: Gtk.WindowPosition.CENTER
		});

		let iconTheme = Gtk.IconTheme.get_default();
		if(iconTheme.has_icon('cast-to-tv')) this.fileChooser.set_icon_name('cast-to-tv');
		else {
			try { this.fileChooser.set_icon_from_file(localPath + '/appIcon/cast-to-tv.svg'); }
			catch(err) { this.fileChooser.set_icon_name('application-x-executable'); }
		}
	}

	_openDialog()
	{
		let configContents = this._getConfig();
		let selectionContents = {};
		selectionContents.streamType = streamType;
		selectionContents.subsPath = '';

		if(!configContents || !selectionContents.streamType) return;

		this.fileFilter = new Gtk.FileFilter();
		let buttonConvert = new Gtk.CheckButton({ label: _("Transcode Video") });
		let box = new Gtk.Box({ spacing: 10 });

		box.pack_start(buttonConvert, true, true, 0);
		box.show_all();

		if(configContents.receiverType == 'other' && selectionContents.streamType == 'PICTURE')
		{
			this.fileChooser.set_select_multiple(false);
		}
		else
		{
			this.fileChooser.set_select_multiple(true);
		}

		/* TRANSLATORS: Button text when selected SINGLE file */
		this.castLabelSingle = _("Cast Selected File");
		/* TRANSLATORS: Button text when selected MULTIPLE files */
		this.castLabelMulti = _("Cast Selected Files");

		this.fileChooser.set_action(Gtk.FileChooserAction.OPEN);
		this.fileChooser.add_button(_("Cancel"), Gtk.ResponseType.CANCEL);
		this.buttonCast = this.fileChooser.add_button(_(this.castLabelSingle), Gtk.ResponseType.OK);

		switch(selectionContents.streamType)
		{
			case 'VIDEO':
				this.buttonSubs = this.fileChooser.add_button(_("Add Subtitles"), Gtk.ResponseType.APPLY);
				this.fileChooser.set_title(_("Select Video"));
				this.fileChooser.set_current_folder(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_VIDEOS));
				this.fileChooser.set_extra_widget(box);

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

		this.fileChooser.add_filter(this.fileFilter);
		this.fileChooser.connect('response', () => this._onResponse());

		let DialogResponse = this.fileChooser.run();
		let filesList = this.filePathChosen.sort();
		selectionContents.filePath = filesList[0];

		if(DialogResponse != Gtk.ResponseType.OK)
		{
			if(DialogResponse == Gtk.ResponseType.APPLY)
			{
				this.fileChooser.disconnect(this.fileSelectionChanged);
				selectionContents.subsPath = this._selectSubtitles();

				if(!selectionContents.subsPath) return;
			}
			else
			{
				return;
			}
		}

		/* Handle convert button */
		if(buttonConvert.get_active())
		{
			switch(configContents.videoAcceleration)
			{
				case 'vaapi':
					selectionContents.streamType += '_VAAPI';
					break;
				case 'nvenc':
					selectionContents.streamType += '_NVENC';
					break;
				default:
					selectionContents.streamType += '_ENCODE';
					break;
			}
		}

		selectionContents.transcodeAudio = false;

		this.fileChooser.destroy();

		/* Set playback list */
		GLib.file_set_contents(shared.listPath, JSON.stringify(filesList, null, 1));

		/* Save selection to file */
		GLib.file_set_contents(shared.selectionPath, JSON.stringify(selectionContents, null, 1));
	}

	_getConfig()
	{
		let [readOk, configFile] = GLib.file_get_contents(shared.configPath);

		if(readOk)
		{
			if(configFile instanceof Uint8Array) return JSON.parse(ByteArray.toString(configFile));
			else return JSON.parse(configFile);
		}
		else
		{
			return null;
		}
	}

	_selectSubtitles()
	{
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

	_onVideoSel()
	{
		let selectedNumber = this.fileChooser.get_filenames().length;

		if(selectedNumber > 1)
		{
			this.buttonCast.label = _(this.castLabelMulti);
			this.buttonSubs.hide();
		}
		else
		{
			this.buttonCast.label = _(this.castLabelSingle);
			this.buttonSubs.show();
		}
	}

	_onMusicAndPicSel()
	{
		let selectedNumber = this.fileChooser.get_filenames().length;

		if(selectedNumber > 1) this.buttonCast.label = _(this.castLabelMulti);
		else this.buttonCast.label = _(this.castLabelSingle);
	}

	_onResponse()
	{
		this.filePathChosen = this.fileChooser.get_filenames();
	}
}

let dialog = new fileChooser();
