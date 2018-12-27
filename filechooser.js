imports.gi.versions.Gtk = '3.0';
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const ByteArray = imports.byteArray;

const localPath = ARGV[0];
const configPath = '/tmp/.cast-to-tv.json';
const subsFormats = ['srt', 'ass', 'vtt'];
let [readOk, configFile] = GLib.file_get_contents(configPath);
let configContents;

let filePathChosen;
let initType = 'BUFFERED';

let fileChooser;
let fileFilter;
let buttonSubs;

void function selectFile()
{
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

		configContents.streamType = ARGV[1];
	}
	else
	{
		return;
	}

	Gtk.init(null);

	fileChooser = new Gtk.FileChooserDialog();
	fileFilter = new Gtk.FileFilter();
	let buttonConvert = new Gtk.CheckButton({label: 'Transcode Video'});
	let box = new Gtk.Box({spacing: 10});

	box.pack_start(buttonConvert, true, true, 0);
	box.show_all();

	fileChooser.set_local_only(true);
	fileChooser.set_show_hidden(false);
	//fileChooser.set_select_multiple(true); // Not supported yet
	fileChooser.add_button(("Cancel"), Gtk.ResponseType.CANCEL);
	fileChooser.add_button(("Cast Media File"), Gtk.ResponseType.OK);

	if(configContents.streamType == 'VIDEO')
	{
		buttonSubs = fileChooser.add_button(("Add Subtitles"), Gtk.ResponseType.APPLY);
		fileChooser.set_title('Select Video');
		fileChooser.set_current_folder(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_VIDEOS));
		fileChooser.set_extra_widget(box);

		fileFilter.set_name('Video Files');
		fileFilter.add_mime_type('video/*');
	}
	else if(configContents.streamType == 'MUSIC')
	{
		fileChooser.set_title('Select Music');
		fileChooser.set_current_folder(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_MUSIC));

		fileFilter.set_name('Music Files');
		fileFilter.add_mime_type('audio/*');
	}
	else if(configContents.streamType == 'PICTURE')
	{
		fileChooser.set_title('Select Picture');
		fileChooser.set_current_folder(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES));

		fileFilter.set_name('Pictures');
		fileFilter.add_pixbuf_formats();

		if(configContents.receiverType == 'chromecast')
		{
			configContents.streamType += '_ENCODE';
		}
	}
	else
	{
		return;
	}

	fileChooser.set_action(Gtk.FileChooserAction.OPEN);
	fileChooser.add_filter(fileFilter);

	fileChooser.connect('response', Lang.bind(this, function()
	{
		filePathChosen = fileChooser.get_filename();
	}));

	var DialogResponse = fileChooser.run();
	configContents.filePath = filePathChosen;

	if(DialogResponse != Gtk.ResponseType.OK)
	{
		if(DialogResponse == Gtk.ResponseType.APPLY)
		{
			var SubsDialogResponse = selectSubtitles();

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
		if(configContents.videoAcceleration == 'vaapi')
		{
			configContents.streamType += '_VAAPI';
		}
		else if(configContents.videoAcceleration == 'nvenc')
		{
			configContents.streamType += '_NVENC';
		}
		else
		{
			configContents.streamType += '_ENCODE';
		}
	}

	/* Save config to file */
	GLib.file_set_contents(configPath, JSON.stringify(configContents, null, 1));

	/* Run server (process exits if already running) */
	GLib.spawn_async('/usr/bin', ['node', localPath + '/castserver'], null, 0, null);

	/* Cast to Chromecast */
	if(configContents.receiverType == 'chromecast')
	{
		switch(configContents.streamType)
		{
			case 'VIDEO':
				break;
			case 'MUSIC':
				if(configContents.musicVisualizer)
				{
					initType = 'LIVE';
				}
				break;
			default:
				initType = 'LIVE';
		}

		GLib.spawn_async('/usr/bin', ['node', localPath + '/castfunctions', initType], null, 0, null);
	}
}();

function selectSubtitles()
{
	let subsFilter = new Gtk.FileFilter();

	fileChooser.set_title('Select Subtitles');
	buttonSubs.hide();

	/* Add supported subtitles formats to filter */
	subsFilter.set_name('Subtitle Files');

	subsFormats.forEach(function(extension)
	{
		subsFilter.add_pattern('*.' + extension);
	});

	fileChooser.remove_filter(fileFilter);
	fileChooser.add_filter(subsFilter);

	if(fileChooser.run() != Gtk.ResponseType.OK)
	{
		return 1;
	}
	else
	{
		configContents.subsPath = filePathChosen;
		return 0;
	}
}
