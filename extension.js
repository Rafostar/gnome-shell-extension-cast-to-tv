/*
gnome-shell-extension-cast-to-tv
Developer: Rafostar
Extension GitHub: https://github.com/Rafostar/gnome-shell-extension-cast-to-tv
*/

const GLib = imports.gi.GLib;
const Main = imports.ui.main;
const AggregateMenu = Main.panel.statusArea.aggregateMenu;
const Indicator = AggregateMenu._network.indicators;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Widget = Local.imports.widget;
const Convenience = Local.imports.convenience;
const Settings = Convenience.getSettings();
const Temp = Local.imports.temp;
const shared = Local.imports.shared.module.exports;

let castMenu;
let remoteMenu;
let configContents;
let serviceStarted;
let Signals;

function configCastRemote()
{
	/* Change remote label */
	switch(configContents.receiverType)
	{
		case 'other':
			/* TRANSLATORS: Can be translated as "Browser Remote" if it makes it shorter */
			remoteMenu.toplabel.text = _("Web Player Remote");
			break;
		default:
			remoteMenu.toplabel.text = _("Chromecast Remote");
			break;
	}

	let chromecastPlaying = Settings.get_boolean('chromecast-playing');

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
		if(trackID > 1) remoteMenu.skipBackwardButton.reactive = true;
		else remoteMenu.skipBackwardButton.reactive = false;

		/* Disable skip forward if playing last file from list */
		if(trackID < listLastID) remoteMenu.skipForwardButton.reactive = true;
		else remoteMenu.skipForwardButton.reactive = false;

		/* Update track title */
		if(selectionContents.title) remoteMenu.trackTitle.text = selectionContents.title;
		else
		{
			let filename = selectionContents.filePath;
			let title = filename.substring(filename.lastIndexOf('/') + 1, filename.lastIndexOf('.'));

			if(title) remoteMenu.trackTitle.text = title;
			else remoteMenu.trackTitle.text = "";
		}

		/* Choose remote to create */
		switch(selectionContents.streamType)
		{
			case 'VIDEO':
				remoteMenu.setMode('DIRECT', 'folder-videos-symbolic');
				break;
			case 'MUSIC':
				if(!configContents.musicVisualizer) remoteMenu.setMode('DIRECT', 'folder-music-symbolic');
				else remoteMenu.setMode('ENCODE', 'folder-music-symbolic');
				break;
			case 'PICTURE':
				remoteMenu.setMode('PICTURE');
				break;
			default:
				remoteMenu.setMode('ENCODE', 'folder-videos-symbolic');
				break;
		}

		/* Set slider startup values */
		if(remoteMenu.positionSlider.isVolume)
		{
			remoteMenu.positionSlider.icon = remoteMenu.positionSlider.volumeIcon;
		}
		else
		{
			remoteMenu.positionSlider.setValue(0);
			remoteMenu.positionSlider.icon = remoteMenu.positionSlider.defaultIcon;
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

function changeWebplayerSubs()
{
	configContents.webplayerSubs = Settings.get_double('webplayer-subs').toFixed(1);
	Temp.writeToFile(shared.configPath, configContents);
}

function changeVideoBitrate()
{
	configContents.videoBitrate = Settings.get_double('video-bitrate').toFixed(1);
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

function changeChromecastName()
{
	configContents.chromecastName = Settings.get_string('chromecast-name');
	Temp.writeToFile(shared.configPath, configContents);
}

function changeSeekTime()
{
	Widget.seekTime = Settings.get_int('seek-time');
}

function changeUnifiedSlider()
{
	Widget.isUnifiedSlider = Settings.get_boolean('unified-slider');
	recreateRemote();
}

function changeLabelVisibility()
{
	let showLabel = Settings.get_boolean('remote-label');

	if(showLabel) remoteMenu.toplabel.show();
	else remoteMenu.toplabel.hide();
}

function recreateRemote()
{
	/* Remove previous indicator */
	remoteMenu.destroy();
	remoteMenu = new Widget.remoteMenu();

	changeLabelVisibility();
	setRemotePosition();
}

function init()
{
	Convenience.initTranslations();
}

function enable()
{
	/* Read/create temp files */
	getTempFiles();

	/* Get remaining necessary settings */
	Widget.seekTime = Settings.get_int('seek-time');
	Widget.isUnifiedSlider = Settings.get_boolean('unified-slider');

	/* Create new objects from classes */
	castMenu = new Widget.castMenu();
	remoteMenu = new Widget.remoteMenu();

	/* Set initial remote label visibility */
	changeLabelVisibility();

	/* Clear signals array */
	Signals = [];

	/* Connect signals */
	Signals.push(Settings.connect('changed::ffmpeg-path', changeFFmpegPath.bind(this)));
	Signals.push(Settings.connect('changed::ffprobe-path', changeFFprobePath.bind(this)));
	Signals.push(Settings.connect('changed::receiver-type', changeReceiverType.bind(this)));
	Signals.push(Settings.connect('changed::listening-port', changeListeningPort.bind(this)));
	Signals.push(Settings.connect('changed::webplayer-subs', changeWebplayerSubs.bind(this)));
	Signals.push(Settings.connect('changed::video-bitrate', changeVideoBitrate.bind(this)));
	Signals.push(Settings.connect('changed::video-acceleration', changeVideoAcceleration.bind(this)));
	Signals.push(Settings.connect('changed::remote-position', recreateRemote.bind(this)));
	Signals.push(Settings.connect('changed::unified-slider', changeUnifiedSlider.bind(this)));
	Signals.push(Settings.connect('changed::seek-time', changeSeekTime.bind(this)));
	Signals.push(Settings.connect('changed::music-visualizer', changeMusicVisualizer.bind(this)));
	Signals.push(Settings.connect('changed::chromecast-name', changeChromecastName.bind(this)));
	Signals.push(Settings.connect('changed::remote-label', changeLabelVisibility.bind(this)));
	Signals.push(Settings.connect('changed::chromecast-playing', configCastRemote.bind(this)));

	/* Set insert position after network menu items */
	let menuItems = AggregateMenu.menu._getMenuItems();
	let menuPosition = menuItems.indexOf(AggregateMenu._network.menu) + 1;

	/* Add indicator and menu item */
	Indicator.add_child(Widget.statusIcon);
	AggregateMenu.menu.addMenuItem(castMenu, menuPosition);

	/* Add remote to top bar */
	setRemotePosition();

	/* Start server monitoring service */
	if(!serviceStarted)
	{
		GLib.spawn_async('/usr/bin', ['gjs', `${Local.path}/server-monitor.js`], null, 0, null);
		serviceStarted = true;
	}
}

function disable()
{
	let lockingScreen = (Main.sessionMode.currentMode == 'unlock-dialog' || Main.sessionMode.currentMode == 'lock-screen');

	if(!lockingScreen)
	{
		/* Stop all apps running inside extension folder */
		GLib.spawn_command_line_async(`pkill -SIGINT -f ${Local.path}`);
		serviceStarted = false;
	}

	/* Disconnect signals from settings */
	Signals.forEach(signal => Settings.disconnect(signal));

	/* Remove Chromecast Remote */
	remoteMenu.destroy();
	remoteMenu = null;

	/* Remove indicator and menu item object */
	Indicator.remove_child(Widget.statusIcon);
	castMenu.destroy();
	castMenu = null;
}
