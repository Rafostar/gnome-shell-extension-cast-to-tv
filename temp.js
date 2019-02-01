const GLib = imports.gi.GLib;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Local.imports.convenience;
const Settings = Convenience.getSettings();
const shared = Local.imports.shared.module.exports;
const tempDir = Local.imports.shared.tempDir;

function writeToFile(path, contents)
{
	/* Write config data to temp file */
	GLib.file_set_contents(path, JSON.stringify(contents, null, 1));
}

function readFromFile(path)
{
	/* Check if file exists (EXISTS = 16) */
	let fileExists = GLib.file_test(path, 16);

	if(fileExists)
	{
		/* Read config data from temp file */
		let [readOk, readFile] = GLib.file_get_contents(path);

		if(readOk)
		{
			if(readFile instanceof Uint8Array)
			{
				return JSON.parse(ByteArray.toString(readFile));
			}
			else
			{
				return JSON.parse(readFile);
			}
		}
	}

	return null;
}

function setConfigFile()
{
	let configContents = {
		ffmpegPath: Settings.get_string('ffmpeg-path'),
		ffprobePath: Settings.get_string('ffprobe-path'),
		receiverType: Settings.get_string('receiver-type'),
		listeningPort: Settings.get_int('listening-port'),
		videoBitrate: Settings.get_double('video-bitrate'),
		videoAcceleration: Settings.get_string('video-acceleration'),
		musicVisualizer: Settings.get_boolean('music-visualizer'),
		subtitlesEncoding: Settings.get_string('subtitles-encoding')
	};

	/* Use default paths if custom paths are not defined */
	if(!configContents.ffmpegPath) configContents.ffmpegPath = '/usr/bin/ffmpeg';
	if(!configContents.ffprobePath) configContents.ffprobePath = '/usr/bin/ffprobe';

	GLib.mkdir_with_parents(tempDir, 448); // 700 in octal
	writeToFile(shared.configPath, configContents);

	return configContents;
}

function setSelectionFile()
{
	let selectionContents = {
		streamType: '',
		filePath: '',
		subsPath: ''
	};

	writeToFile(shared.selectionPath, selectionContents);

	return selectionContents;
}

function setListFile()
{
	let listContents = [''];
	writeToFile(shared.listPath, listContents);
}

function setRemoteFile()
{
	let remoteContents = {
		action: '',
		value: ''
	};

	writeToFile(shared.remotePath, remoteContents);
}

function setStatusFile()
{
	statusContents = {
		playerState: 'UNAVAILABLE',
		currentTime: 0,
		mediaDuration: 0,
		volume: 0
	};

	writeToFile(shared.statusPath, statusContents);
}

function setRemoteAction(castAction, castValue)
{
	let remoteContents = {
		action: castAction,
		value: castValue
	};

	writeToFile(shared.remotePath, remoteContents);
}
