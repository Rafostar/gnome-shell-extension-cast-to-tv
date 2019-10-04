const GLib = imports.gi.GLib;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Settings = Local.imports.helper.getSettings(Local.path, Local.metadata['settings-schema']);
const shared = Local.imports.shared.module.exports;
const { writeToFile } = Local.imports.helper;

function setConfigFile()
{
	let configContents = {
		ffmpegPath: Settings.get_string('ffmpeg-path'),
		ffprobePath: Settings.get_string('ffprobe-path'),
		receiverType: Settings.get_string('receiver-type'),
		listeningPort: Settings.get_int('listening-port'),
		webplayerSubs: Settings.get_double('webplayer-subs').toFixed(1),
		videoBitrate: Settings.get_double('video-bitrate').toFixed(1),
		videoAcceleration: Settings.get_string('video-acceleration'),
		musicVisualizer: Settings.get_boolean('music-visualizer'),
		chromecastName: Settings.get_string('chromecast-name'),
		playercastName: Settings.get_string('playercast-name')
	};

	/* Use default paths if custom paths are not defined */
	if(!configContents.ffmpegPath) configContents.ffmpegPath = '/usr/bin/ffmpeg';
	if(!configContents.ffprobePath) configContents.ffprobePath = '/usr/bin/ffprobe';

	GLib.mkdir_with_parents(shared.tempDir, 448); // 700 in octal
	writeToFile(shared.configPath, configContents);

	return configContents;
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
	let statusContents = {
		playerState: 'UNAVAILABLE',
		currentTime: 0,
		mediaDuration: 0,
		volume: 0,
		repeat: false
	};

	writeToFile(shared.statusPath, statusContents);

	/* No status file means that Chromecast is not playing
	This also prevents remote from showing after reboot */
	Settings.set_boolean('chromecast-playing', false);
}

function setRemoteAction(castAction, castValue)
{
	let remoteContents = {
		action: castAction,
		value: castValue
	};

	writeToFile(shared.remotePath, remoteContents);
}
