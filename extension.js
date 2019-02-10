/*
gnome-shell-extension-cast-to-tv
Developer: Rafostar
Extension GitHub: https://github.com/Rafostar/gnome-shell-extension-cast-to-tv
*/

const GLib = imports.gi.GLib;
const Main = imports.ui.main;
const AggregateMenu = Main.panel.statusArea.aggregateMenu;
const Indicator = AggregateMenu._network.indicators;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Widget = Local.imports.widget;
const Convenience = Local.imports.convenience;
const Settings = Convenience.getSettings();
const Spawn = Local.imports.spawn;
const Temp = Local.imports.temp;
const shared = Local.imports.shared.module.exports;

let castMenu;
let remoteMenu;
let readStatusInterval;
let configContents;
let Signals;

function configCastRemote()
{
	let chromecastPlaying = Settings.get_boolean('chromecast-playing');

	clearTimer();

	if(chromecastPlaying)
	{
		/* Update selection and list data (needed for skipping tracks) */
		let selectionContents = Temp.readFromFile(shared.selectionPath);
		let listContents = Temp.readFromFile(shared.listPath);
		let trackID;

		if(listContents && selectionContents) trackID = listContents.indexOf(selectionContents.filePath) + 1;
		else return;

		let listLastID = listContents.length;

		/* Restore repeat button state */
		if(Widget.isRepeatActive) remoteMenu.enableRepeat(true);
		else remoteMenu.enableRepeat(false);

		/* Disable skip backward if playing first file from list */
		if(trackID > 1) remoteMenu.skipBackwardsReactive = true;
		else remoteMenu.skipBackwardsReactive = false;

		/* Disable skip forward if playing last file from list */
		if(trackID < listLastID) remoteMenu.skipForwardReactive = true;
		else remoteMenu.skipForwardReactive = false;

		/* Start remote status timer if not streaming pictures */
		if(selectionContents.streamType != 'PICTURE') startTimer();

		/* Choose remote to create */
		switch(selectionContents.streamType)
		{
			case 'VIDEO':
				remoteMenu.setMode('DIRECT');
				remoteMenu.sliderIcon = 'folder-videos-symbolic';
				break;
			case 'MUSIC':
				if(!configContents.musicVisualizer) remoteMenu.setMode('DIRECT');
				else remoteMenu.setMode('ENCODE');
				remoteMenu.sliderIcon = 'folder-music-symbolic';
				break;
			case 'PICTURE':
				remoteMenu.setMode('PICTURE');
				break;
			default:
				remoteMenu.sliderIcon = 'folder-videos-symbolic';
				remoteMenu.setMode('ENCODE');
				break;
		}

		remoteMenu.show();
	}
	else
	{
		Widget.isRepeatActive = false;
		remoteMenu.hide();
	}
}

function setRemotePosition()
{
	let children;
	let remotePosition = Settings.get_string('remote-position');

	/* Place remote on top bar */
	switch(remotePosition)
	{
		case 'left':
			children = Main.panel._leftBox.get_children();
			Main.panel.addToStatusArea('cast-to-tv-remote', remoteMenu, children.length, remotePosition);
			break;
		case 'center-left':
			remotePosition = 'center';
			Main.panel.addToStatusArea('cast-to-tv-remote', remoteMenu, 0, remotePosition);
			break;
		case 'center-right':
			remotePosition = 'center';
			children = Main.panel._centerBox.get_children();
			Main.panel.addToStatusArea('cast-to-tv-remote', remoteMenu, children.length, remotePosition);
			break;
		case 'right':
			Main.panel.addToStatusArea('cast-to-tv-remote', remoteMenu, 0, remotePosition);
			break;
	}

	configCastRemote();
}

function startTimer()
{
	remoteMenu.setSliderValue(0);

	readStatusInterval = Mainloop.timeout_add_seconds(1, Lang.bind(this, function()
	{
		let statusContents = Temp.readFromFile(shared.statusPath);

		if(statusContents)
		{
			if(statusContents.playerState == 'PLAYING') remoteMenu.setPlaying(true);
			else if(statusContents.playerState == 'PAUSED') remoteMenu.setPlaying(false);

			if(statusContents.mediaDuration > 0)
			{
				let sliderValue = statusContents.currentTime / statusContents.mediaDuration;
				if(!Widget.sliderChanged) remoteMenu.setSliderValue(sliderValue);
			}
		}

		Widget.sliderChanged = false;
		return true;
	}));
}

function clearTimer()
{
	if(readStatusInterval)
	{
		Mainloop.source_remove(readStatusInterval);
		readStatusInterval = null;
	}
}

function getTempFiles()
{
	if(!configContents) configContents = Temp.setConfigFile();

	let selectionExists = GLib.file_test(shared.selectionPath, 16);
	if(!selectionExists) Temp.setSelectionFile();

	let listExists = GLib.file_test(shared.listPath, 16);
	if(!listExists) Temp.setListFile();

	let remoteExists = GLib.file_test(shared.remotePath, 16);
	if(!remoteExists) Temp.setRemoteFile();

	let statusExists = GLib.file_test(shared.statusPath, 16);
	if(!statusExists) Temp.setStatusFile();
}

function changeFFmpegPath()
{
	configContents.ffmpegPath = Settings.get_string('ffmpeg-path');

	if(!configContents.ffmpegPath)
	{
		configContents.ffmpegPath = '/usr/bin/ffmpeg';
	}

	Temp.writeToFile(shared.configPath, configContents);
}

function changeFFprobePath()
{
	configContents.ffprobePath = Settings.get_string('ffprobe-path');

	if(!configContents.ffprobePath)
	{
		configContents.ffprobePath = '/usr/bin/ffprobe';
	}

	Temp.writeToFile(shared.configPath, configContents);
}

function changeReceiverType()
{
	configContents.receiverType = Settings.get_string('receiver-type');
	Temp.writeToFile(shared.configPath, configContents);
}

function changeListeningPort()
{
	configContents.listeningPort = Settings.get_int('listening-port');
	Temp.writeToFile(shared.configPath, configContents);
}

function changeVideoBitrate()
{
	configContents.videoBitrate = Settings.get_double('video-bitrate');
	Temp.writeToFile(shared.configPath, configContents);
}

function changeVideoAcceleration()
{
	configContents.videoAcceleration = Settings.get_string('video-acceleration');
	Temp.writeToFile(shared.configPath, configContents);
}

function changeMusicVisualizer()
{
	configContents.musicVisualizer = Settings.get_boolean('music-visualizer');
	Temp.writeToFile(shared.configPath, configContents);
}

function changeSubtitlesEncoding()
{
	configContents.subtitlesEncoding = Settings.get_string('subtitles-encoding');
	Temp.writeToFile(shared.configPath, configContents);
}

function changeSeekTime()
{
	Widget.seekTime = Settings.get_int('seek-time');
}

function changeRemotePosition()
{
	/* Remove previous indicator */
	remoteMenu.destroy();
	remoteMenu = new Widget.CastRemoteMenu;

	setRemotePosition();
}

function init()
{
	Convenience.initTranslations();
}

function enable()
{
	/* Create new objects from classes */
	castMenu = new Widget.CastToTvMenu;
	remoteMenu = new Widget.CastRemoteMenu;

	/* Get remaining necessary settings */
	Widget.seekTime = Settings.get_int('seek-time');

	/* Clear signals array */
	Signals = [];

	/* Connect signals */
	Signals.push(Settings.connect('changed::ffmpeg-path', Lang.bind(this, changeFFmpegPath)));
	Signals.push(Settings.connect('changed::ffprobe-path', Lang.bind(this, changeFFprobePath)));
	Signals.push(Settings.connect('changed::receiver-type', Lang.bind(this, changeReceiverType)));
	Signals.push(Settings.connect('changed::listening-port', Lang.bind(this, changeListeningPort)));
	Signals.push(Settings.connect('changed::video-bitrate', Lang.bind(this, changeVideoBitrate)));
	Signals.push(Settings.connect('changed::video-acceleration', Lang.bind(this, changeVideoAcceleration)));
	Signals.push(Settings.connect('changed::remote-position', Lang.bind(this, changeRemotePosition)));
	Signals.push(Settings.connect('changed::seek-time', Lang.bind(this, changeSeekTime)));
	Signals.push(Settings.connect('changed::music-visualizer', Lang.bind(this, changeMusicVisualizer)));
	Signals.push(Settings.connect('changed::subtitles-encoding', Lang.bind(this, changeSubtitlesEncoding)));
	Signals.push(Settings.connect('changed::chromecast-playing', Lang.bind(this, configCastRemote)));

	/* Set insert position after network menu items */
	let menuItems = AggregateMenu.menu._getMenuItems();
	let menuPosition = menuItems.indexOf(AggregateMenu._network.menu) + 1;

	/* Add indicator and menu item */
	Indicator.add_child(Widget.statusIcon);
	AggregateMenu.menu.addMenuItem(castMenu, menuPosition);

	/* Read/create temp files */
	getTempFiles();

	/* Add remote to top bar */
	setRemotePosition();
}

function disable()
{
	let lockingScreen = (Main.sessionMode.currentMode == 'unlock-dialog' || Main.sessionMode.currentMode == 'lock-screen');

	if(!lockingScreen)
	{
		Spawn.closeServer();
	}

	/* Disconnect signals from settings */
	Signals.forEach(signal => Settings.disconnect(signal));

	/* Remove timer */
	clearTimer();

	/* Remove Chromecast Remote */
	remoteMenu.destroy();
	remoteMenu = null;

	/* Remove indicator and menu item object */
	Indicator.remove_child(Widget.statusIcon);
	castMenu.destroy();
	castMenu = null;
}
