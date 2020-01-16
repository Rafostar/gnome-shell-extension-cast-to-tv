const GLib = imports.gi.GLib;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Settings = Local.imports.helper.getSettings(Local.path);
const { writeToFile } = Local.imports.helper;
const shared = Local.imports.shared.module.exports;

function getConfig()
{
	let config = {
		ffmpegPath: Settings.get_string('ffmpeg-path'),
		ffprobePath: Settings.get_string('ffprobe-path'),
		receiverType: Settings.get_string('receiver-type'),
		listeningPort: Settings.get_int('listening-port'),
		internalPort: Settings.get_int('internal-port'),
		webplayerSubs: Settings.get_double('webplayer-subs').toFixed(1),
		videoBitrate: Settings.get_double('video-bitrate').toFixed(1),
		videoAcceleration: Settings.get_string('video-acceleration'),
		musicVisualizer: Settings.get_boolean('music-visualizer'),
		chromecastName: Settings.get_string('chromecast-name'),
		playercastName: Settings.get_string('playercast-name')
	};

	/* Use default paths if custom paths are not defined */
	if(!config.ffmpegPath) config.ffmpegPath = '/usr/bin/ffmpeg';
	if(!config.ffprobePath) config.ffprobePath = '/usr/bin/ffprobe';

	return config;
}

function setSelectionFile()
{
	let selectionContents = {
		streamType: '',
		filePath: '',
		subsPath: '',
		transcodeAudio: false
	};

	writeToFile(shared.selectionPath, selectionContents);
}

function setListFile(list)
{
	let listContents = (list && Array.isArray(list)) ? list : [''];
	writeToFile(shared.listPath, listContents);
}
