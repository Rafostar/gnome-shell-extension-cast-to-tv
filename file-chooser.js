imports.gi.versions.Gtk = '3.0';
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const ByteArray = imports.byteArray;
const Gettext = imports.gettext;
const MetadataDomain = 'cast-to-tv';
const GettextDomain = Gettext.domain(MetadataDomain);
const _ = GettextDomain.gettext;

const localPath = ARGV[0];
imports.searchPath.unshift(localPath);
const shared = imports.shared.module.exports;

Gettext.bindtextdomain(MetadataDomain, localPath + '/locale');
let configContents;
let selectionContents;

let fileChooser;
let fileFilter;
let buttonSubs;

let filePathChosen;
let initType = 'BUFFERED';
let mimeType;

let fileSelectionChanged;

void function selectFile()
{
	let configOk = getConfig();
	let selectionOk = getSelection();

	if(!configOk || !selectionOk) return;

	selectionContents.streamType = ARGV[1];
	selectionContents.subsPath = '';

	Gtk.init(null);

	fileChooser = new Gtk.FileChooserDialog();
	fileFilter = new Gtk.FileFilter();
	let buttonConvert = new Gtk.CheckButton({label: _("Transcode Video")});
	let box = new Gtk.Box({spacing: 10});

	box.pack_start(buttonConvert, true, true, 0);
	box.show_all();

	fileChooser.set_local_only(true);
	fileChooser.set_show_hidden(false);

	if(configContents.receiverType == 'chromecast')
	{
		fileChooser.set_select_multiple(true);
	}

	fileChooser.set_action(Gtk.FileChooserAction.OPEN);
	fileChooser.add_button(_("Cancel"), Gtk.ResponseType.CANCEL);
	fileChooser.add_button(_("Cast Selected File"), Gtk.ResponseType.OK);

	switch(selectionContents.streamType)
	{
		case 'VIDEO':
			buttonSubs = fileChooser.add_button(_("Add Subtitles"), Gtk.ResponseType.APPLY);
			fileChooser.set_title(_("Select Video"));
			fileChooser.set_current_folder(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_VIDEOS));
			fileChooser.set_extra_widget(box);

			fileFilter.set_name(_("Video Files"));
			mimeType = 'video/*';
			fileFilter.add_mime_type(mimeType);

			fileSelectionChanged = fileChooser.connect('selection-changed', Lang.bind(this, function()
			{
				let selectedNumber = fileChooser.get_filenames().length;

				if(selectedNumber > 1) buttonSubs.hide();
				else buttonSubs.show();
			}));

			break;
		case 'MUSIC':
			fileChooser.set_title(_("Select Music"));
			fileChooser.set_current_folder(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_MUSIC));

			fileFilter.set_name(_("Audio Files"));
			mimeType = 'audio/*';
			fileFilter.add_mime_type(mimeType);

			if(configContents.musicVisualizer)
			{
				mimeType = 'video/*';
				initType = 'LIVE';
			}

			break;
		case 'PICTURE':
			fileChooser.set_title(_("Select Picture"));
			fileChooser.set_current_folder(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES));

			fileFilter.set_name(_("Pictures"));
			mimeType = 'image/*';
			fileFilter.add_pixbuf_formats();
			break;
		default:
			return;
	}

	fileChooser.add_filter(fileFilter);

	fileChooser.connect('response', Lang.bind(this, function()
	{
		filePathChosen = fileChooser.get_filenames();
	}));

	let DialogResponse = fileChooser.run();
	let filesList = filePathChosen.sort();
	selectionContents.filePath = filesList[0];

	if(DialogResponse != Gtk.ResponseType.OK)
	{
		if(DialogResponse == Gtk.ResponseType.APPLY)
		{
			fileChooser.disconnect(fileSelectionChanged);
			let SubsDialogResponse = selectSubtitles();

			if(SubsDialogResponse != 0)
			{
				return;
			}
		}
		else
		{
			return;
		}
	}

	/* Handle convert button */
	if(buttonConvert.get_active())
	{
		initType = 'LIVE';

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
		}
	}

	/* Save selection to file */
	GLib.file_set_contents(shared.selectionPath, JSON.stringify(selectionContents, null, 1));

	/* Run server (process exits if already running) */
	GLib.spawn_async('/usr/bin', ['node', localPath + '/server'], null, 0, null);

	/* Cast to Chromecast */
	if(configContents.receiverType == 'chromecast')
	{
		GLib.file_set_contents(shared.listPath, JSON.stringify(filesList, null, 1));
		sendToChromecast();
	}
}();

function getConfig()
{
	let [readOk, configFile] = GLib.file_get_contents(shared.configPath);

	if(readOk)
	{
		if(configFile instanceof Uint8Array)
		{
			configContents = JSON.parse(ByteArray.toString(configFile));
		}
		else
		{
			configContents = JSON.parse(configFile);
		}

		return true;
	}
	else
	{
		return false;
	}
}

function getSelection()
{
	let [readOk, selectionFile] = GLib.file_get_contents(shared.selectionPath);

	if(readOk)
	{
		if(selectionFile instanceof Uint8Array)
		{
			selectionContents = JSON.parse(ByteArray.toString(selectionFile));
		}
		else
		{
			selectionContents = JSON.parse(selectionFile);
		}

		return true;
	}
	else
	{
		return false;
	}
}

function selectSubtitles()
{
	let subsFilter = new Gtk.FileFilter();

	fileChooser.set_title(_("Select Subtitles"));
	buttonSubs.hide();

	/* Add supported subtitles formats to filter */
	subsFilter.set_name(_("Subtitle Files"));

	shared.subsFormats.forEach(function(extension)
	{
		subsFilter.add_pattern('*.' + extension);
	});

	fileChooser.set_select_multiple(false);
	fileChooser.remove_filter(fileFilter);
	fileChooser.add_filter(subsFilter);

	if(fileChooser.run() != Gtk.ResponseType.OK)
	{
		return 1;
	}
	else
	{
		selectionContents.subsPath = filePathChosen[0];
		return 0;
	}
}

function checkChromecastState()
{
	/* Check if file exists (EXISTS = 16) */
	let configExists = GLib.file_test(shared.statusPath, 16);

	let statusContents = {
		playerState: null
	};

	if(configExists)
	{
		/* Read config data from temp file */
		let [readOk, readFile] = GLib.file_get_contents(shared.statusPath);

		if(readOk)
		{
			if(readFile instanceof Uint8Array)
			{
				statusContents = JSON.parse(ByteArray.toString(readFile));
			}
			else
			{
				statusContents = JSON.parse(readFile);
			}
		}
	}

	return statusContents.playerState;
}

function sendToChromecast()
{
	let isChromecastPlaying = checkChromecastState();

	if(!isChromecastPlaying)
	{
		GLib.spawn_async('/usr/bin', ['node', localPath + '/chromecast', initType, mimeType], null, 0, null);
	}
	else
	{
		let remoteContents = {
			action: 'RELOAD',
			mimeType: mimeType,
			initType: initType
		};

		GLib.file_set_contents(shared.remotePath, JSON.stringify(remoteContents, null, 1));
	}
}
