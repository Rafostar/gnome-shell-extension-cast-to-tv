/*
gnome-shell-extension-cast-to-tv
Developer: Rafostar
Extension GitHub: https://github.com/Rafostar/gnome-shell-extension-cast-to-tv
*/

const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const AggregateMenu = Main.panel.statusArea.aggregateMenu;
const Indicator = AggregateMenu._network.indicators;
const Lang = imports.lang;
const Util = imports.misc.util;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const _ = Gettext.gettext;
const RemoteWidget = Local.imports.remotewidget;
const Convenience = Local.imports.convenience;
const Settings = Convenience.getSettings();
const configPath = '/tmp/.cast-to-tv.json';
const remotePath = '/tmp/.chromecast-remote.json';
const listPath = '/tmp/.chromecast-list.json';
const iconName = 'tv-symbolic';
const remoteName = _("Chromecast Remote");

let castMenu;
let remoteButton;
let remoteIconName = 'folder-videos-symbolic';

let statusIcon;
let configContents, remoteContents, listContents;
let seekTime;
let trackID = 0;
let listLastID = 0;
let chromecastWasPlaying;

/* Media controls */
let positionSlider;
let playButton;
let pauseButton;
let seekBackwardButton;
let seekForwardButton;
let skipBackwardButton;
let skipForwardButton;
let repeatButton;

/* Signals */
let ffmpegPathChanged;
let ffprobePathChanged;
let receiverTypeChanged;
let listeningPortChanged;
let videoBitrateChanged;
let videoAccelerationChanged;
let remotePositionChanged;
let seekTimeChanged;
let musicVisualizerChanged;
let chromecastPlayingChanged;

const CastToTvMenu = new Lang.Class
({
	Name: 'Cast to TV',
	Extends: PopupMenu.PopupSubMenuMenuItem,

	_init: function()
	{
		this.parent(_('Cast Media'), true);
		this.icon.icon_name = iconName;

		/* Expandable menu */
		let videoMenuItem = new PopupMenu.PopupImageMenuItem(_("Video"), 'folder-videos-symbolic');
		let musicMenuItem = new PopupMenu.PopupImageMenuItem(_("Music"), 'folder-music-symbolic');
		let pictureMenuItem = new PopupMenu.PopupImageMenuItem(_("Picture"), 'folder-pictures-symbolic');
		let settingsMenuItem = new PopupMenu.PopupMenuItem(_("Cast Settings"));

		/* Assemble all menu items */
		this.menu.addMenuItem(videoMenuItem);
		this.menu.addMenuItem(musicMenuItem);
		this.menu.addMenuItem(pictureMenuItem);
		this.menu.addMenuItem(settingsMenuItem);

		/* Signals connections */
		videoMenuItem.connect('activate', Lang.bind(this, function()
		{
			configContents.streamType = 'VIDEO';
			spawnFileChooser();
		}));

		musicMenuItem.connect('activate', Lang.bind(this, function()
		{
			configContents.streamType = 'MUSIC';
			spawnFileChooser();
		}));

		pictureMenuItem.connect('activate', Lang.bind(this, function()
		{
			configContents.streamType = 'PICTURE';
			spawnFileChooser();
		}));

		settingsMenuItem.connect('activate', Lang.bind(this, function()
		{
			Util.spawn(['gnome-shell-extension-prefs', 'cast-to-tv@rafostar.github.com']);
		}));
	},

	destroy: function()
	{
		this.parent();
	}
});

const ChromecastMediaRemoteMenu = new Lang.Class
({
	Name: 'Chromecast Remote',
	Extends: PanelMenu.Button,

	_init: function()
	{
		this.parent(0.5, remoteName, false);

		let box = new St.BoxLayout();
		let icon = new St.Icon({ icon_name: 'input-dialpad-symbolic', style_class: 'system-status-icon'});
		let toplabel = new St.Label({ text: _(remoteName), y_expand: true, y_align: Clutter.ActorAlign.CENTER });

		/* Display app icon, label and dropdown arrow */
		box.add(icon);
		box.add(toplabel);
		box.add(PopupMenu.arrowIcon(St.Side.BOTTOM));

		this.actor.add_child(box);

		/* Create base for media control buttons */
		let popupBase = new RemoteWidget.PopupBase;

		let controlsButtonBox = new St.BoxLayout({
			x_align: Clutter.ActorAlign.CENTER,
			x_expand: true
		});

		positionSlider = new RemoteWidget.SliderItem(remoteIconName);
		playButton = new RemoteWidget.MediaControlButton('media-playback-start-symbolic');
		pauseButton = new RemoteWidget.MediaControlButton('media-playback-pause-symbolic');
		seekBackwardButton = new RemoteWidget.MediaControlButton('media-seek-backward-symbolic');
		seekForwardButton = new RemoteWidget.MediaControlButton('media-seek-forward-symbolic');
		repeatButton = new RemoteWidget.MediaControlButton('media-playlist-repeat-symbolic');
		let stopButton = new RemoteWidget.MediaControlButton('media-playback-stop-symbolic');

		/* Add space between stop and the remaining buttons */
		stopButton.style = 'padding: 0px, 6px, 0px, 6px; margin-left: 2px; margin-right: 40px;';

		/* Assemble playback controls */
		controlsButtonBox.add(repeatButton);
		controlsButtonBox.add(stopButton);
		controlsButtonBox.add(seekBackwardButton);
		controlsButtonBox.add(playButton);
		controlsButtonBox.add(pauseButton);
		controlsButtonBox.add(seekForwardButton);

		/* We do not want to display both play and pause buttons at once */
		playButton.hide();

		popupBase.actor.add(controlsButtonBox);

		this.menu.addMenuItem(positionSlider);
		this.menu.addMenuItem(popupBase);

		/* Signals connections */
		playButton.connect('clicked', Lang.bind(this, function()
		{
			setRemoteFile('PLAY');
			playButton.hide();
			pauseButton.show();
		}));

		pauseButton.connect('clicked', Lang.bind(this, function()
		{
			setRemoteFile('PAUSE');
			pauseButton.hide();
			playButton.show();
		}));

		seekForwardButton.connect('clicked', Lang.bind(this, function()
		{
			setRemoteFile('SEEK+', seekTime);
		}));

		seekBackwardButton.connect('clicked', Lang.bind(this, function()
		{
			setRemoteFile('SEEK-', seekTime);
		}));

		repeatButton.connect('clicked', Lang.bind(this, function()
		{
			setRemoteFile('REPLAY');
		}));

		stopButton.connect('clicked', Lang.bind(this, function()
		{
			setRemoteFile('STOP');
		}));
	},

	destroy: function()
	{
		this.parent();
	}
});

const ChromecastPictureRemoteMenu = new Lang.Class
({
	Name: 'Chromecast Picture Remote',
	Extends: PanelMenu.Button,

	_init: function()
	{
		this.parent(0.5, remoteName, false);

		let box = new St.BoxLayout();
		let icon = new St.Icon({ icon_name: 'input-dialpad-symbolic', style_class: 'system-status-icon'});
		let toplabel = new St.Label({ text: _(remoteName), y_expand: true, y_align: Clutter.ActorAlign.CENTER });

		/* Display app icon, label and dropdown arrow */
		box.add(icon);
		box.add(toplabel);
		box.add(PopupMenu.arrowIcon(St.Side.BOTTOM));

		this.actor.add_child(box);

		/* Create base for media control buttons */
		let popupBase = new RemoteWidget.PopupBase;

		let controlsButtonBox = new St.BoxLayout({
			x_align: Clutter.ActorAlign.CENTER,
			x_expand: true
		});

		skipBackwardButton = new RemoteWidget.MediaControlButton('media-skip-backward-symbolic');
		skipForwardButton = new RemoteWidget.MediaControlButton('media-skip-forward-symbolic');
		let stopButton = new RemoteWidget.MediaControlButton('media-playback-stop-symbolic');

		/* Assemble playback controls */
		controlsButtonBox.add(skipBackwardButton);
		controlsButtonBox.add(stopButton);
		controlsButtonBox.add(skipForwardButton);

		popupBase.actor.add(controlsButtonBox);
		this.menu.addMenuItem(popupBase);

		/* Buttons to disable on start */
		skipBackwardButton.reactive = false;

		/* Disable skip forward if list has only one position */
		if(listLastID == 0)
		{
			skipForwardButton.reactive= false;
		}

		/* Signals connections */
		skipBackwardButton.connect('clicked', Lang.bind(this, function()
		{
			trackID--;
			configContents.filePath = listContents[trackID];
			writeDataToFile(configPath, configContents);

			if(trackID == 0)
			{
				skipBackwardButton.reactive = false;
			}

			setRemoteFile('SKIP');
			skipForwardButton.reactive = true;
		}));

		skipForwardButton.connect('clicked', Lang.bind(this, function()
		{
			trackID++;
			configContents.filePath = listContents[trackID];
			writeDataToFile(configPath, configContents);

			if(trackID == listLastID)
			{
				skipForwardButton.reactive = false;
			}

			setRemoteFile('SKIP');
			skipBackwardButton.reactive = true;
		}));

		stopButton.connect('clicked', Lang.bind(this, function()
		{
			setRemoteFile('STOP');
		}));
	},

	destroy: function()
	{
		this.parent();
	}
});

function initChromecastRemote()
{
	getConfigFromFile();
	let chromecastPlaying = Settings.get_boolean('chromecast-playing');

	if(chromecastWasPlaying == chromecastPlaying)
	{
		return;
	}

	chromecastWasPlaying = chromecastPlaying;

	if(remoteButton)
	{
		remoteButton.destroy();
		remoteButton = null;
	}

	if(configContents.receiverType != 'chromecast' || !chromecastPlaying)
	{
		return;
	}

	listContents = readDataFromFile(listPath);

	if(listContents)
	{
		listLastID = listContents.length - 1;
	}
	else
	{
		listLastID = 0;
	}

	/* Choose remote to create */
	if(configContents.streamType != 'PICTURE')
	{
		/* Check if video is transcoded and disable seeking*/
		switch(configContents.streamType)
		{
			case 'VIDEO':
				remoteIconName = 'folder-videos-symbolic';
				break;
			case 'MUSIC':
				remoteIconName = 'folder-music-symbolic';
				if(configContents.musicVisualizer) enableSeekButtons(false);
				break;
			default:
				remoteIconName = 'folder-videos-symbolic';
				enableSeekButtons(false);
		}

		remoteButton = new ChromecastMediaRemoteMenu;
	}
	else
	{
		remoteIconName = 'folder-pictures-symbolic';
		remoteButton = new ChromecastPictureRemoteMenu;
	}

	let children;
	let remotePosition = Settings.get_string('remote-position');

	switch(remotePosition)
	{
		case 'left':
			children = Main.panel._leftBox.get_children();
			Main.panel.addToStatusArea('ChromecastRemote', remoteButton, children.length, remotePosition);
			break;
		case 'center-left':
			remotePosition = 'center';
			Main.panel.addToStatusArea('ChromecastRemote', remoteButton, 0, remotePosition);
			break;
		case 'center-right':
			remotePosition = 'center';
			children = Main.panel._centerBox.get_children();
			Main.panel.addToStatusArea('ChromecastRemote', remoteButton, children.length, remotePosition);
			break;
		case 'right':
			Main.panel.addToStatusArea('ChromecastRemote', remoteButton, 0, remotePosition);
			break;
	}
}

function enableSeekButtons(isEnabled)
{
	repeatButton.reactive = isEnabled;
	seekBackwardButton.reactive = isEnabled;
	seekForwardButton.reactive = isEnabled;

	if(isEnabled) positionSlider.show();
	else positionSlider.hide();
}

function changeFFmpegPath()
{
	getConfigFromFile();
	configContents.ffmpegPath = Settings.get_string('ffmpeg-path');

	if(!configContents.ffmpegPath)
	{
		configContents.ffmpegPath = '/usr/bin/ffmpeg';
	}

	writeDataToFile(configPath, configContents);
}

function changeFFprobePath()
{
	getConfigFromFile();
	configContents.ffprobePath = Settings.get_string('ffprobe-path');

	if(!configContents.ffprobePath)
	{
		configContents.ffprobePath = '/usr/bin/ffprobe';
	}

	writeDataToFile(configPath, configContents);
}

function changeReceiverType()
{
	getConfigFromFile();
	configContents.receiverType = Settings.get_string('receiver-type');
	writeDataToFile(configPath, configContents);
	initChromecastRemote();
}

function changeListeningPort()
{
	getConfigFromFile();
	configContents.listeningPort = Settings.get_int('listening-port');
	writeDataToFile(configPath, configContents);
}

function changeVideoBitrate()
{
	getConfigFromFile();
	configContents.videoBitrate = Settings.get_double('video-bitrate');
	writeDataToFile(configPath, configContents);
}

function changeVideoAcceleration()
{
	getConfigFromFile();
	configContents.videoAcceleration = Settings.get_string('video-acceleration');
	writeDataToFile(configPath, configContents);
}

function changeMusicVisualizer()
{
	getConfigFromFile();
	configContents.musicVisualizer = Settings.get_boolean('music-visualizer');
	writeDataToFile(configPath, configContents);
}

function changeSeekTime()
{
	seekTime = Settings.get_int('seek-time');
}

function spawnFileChooser()
{
	/* To not freeze gnome shell FileChooserDialog needs to be run as separate process */
	Util.spawn(['gjs', Local.path + '/filechooser.js', Local.path, configContents.streamType]);
}

function setConfigFile()
{
	configContents = {
		ffmpegPath: Settings.get_string('ffmpeg-path'),
		ffprobePath: Settings.get_string('ffprobe-path'),
		receiverType: Settings.get_string('receiver-type'),
		listeningPort: Settings.get_int('listening-port'),
		videoBitrate: Settings.get_double('video-bitrate'),
		videoAcceleration: Settings.get_string('video-acceleration'),
		musicVisualizer: Settings.get_boolean('music-visualizer'),
		streamType: null,
		filePath: null,
		subsPath: null
	};

	/* Use default paths if custom paths are not defined */
	if(!configContents.ffmpegPath)
	{
		configContents.ffmpegPath = '/usr/bin/ffmpeg';
	}

	if(!configContents.ffprobePath)
	{
		configContents.ffprobePath = '/usr/bin/ffprobe';
	}

	writeDataToFile(configPath, configContents);
}

function writeDataToFile(path, contents)
{
	/* Write config data to temp file */
	GLib.file_set_contents(path, JSON.stringify(contents, null, 1));
}

function readDataFromFile(path)
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

function getConfigFromFile()
{
	configContents = readDataFromFile(configPath);

	if(!configContents)
	{
		setConfigFile();
	}
}

function setRemoteFile(castAction, castValue)
{
	remoteContents = {
		action: castAction,
		value: castValue
	};

	writeDataToFile(remotePath, remoteContents);
}

function init()
{
	Convenience.initTranslations();
}

function enable()
{
	/* Create new object from class CastToTvMenu */
	castMenu = new CastToTvMenu;

	/* Get remaining necessary settings */
	seekTime = Settings.get_int('seek-time');

	/* Connect signals from settings */
	ffmpegPathChanged = Settings.connect('changed::ffmpeg-path', Lang.bind(this, changeFFmpegPath));
	ffprobePathChanged = Settings.connect('changed::ffprobe-path', Lang.bind(this, changeFFprobePath));
	receiverTypeChanged = Settings.connect('changed::receiver-type', Lang.bind(this, changeReceiverType));
	listeningPortChanged = Settings.connect('changed::listening-port', Lang.bind(this, changeListeningPort));
	videoBitrateChanged = Settings.connect('changed::video-bitrate', Lang.bind(this, changeVideoBitrate));
	videoAccelerationChanged = Settings.connect('changed::video-acceleration', Lang.bind(this, changeVideoAcceleration));
	remotePositionChanged = Settings.connect('changed::remote-position', Lang.bind(this, initChromecastRemote));
	seekTimeChanged = Settings.connect('changed::seek-time', Lang.bind(this, changeSeekTime));
	musicVisualizerChanged = Settings.connect('changed::music-visualizer', Lang.bind(this, changeMusicVisualizer));

	/* Connect other signals */
	chromecastPlayingChanged = Settings.connect('changed::chromecast-playing', Lang.bind(this, initChromecastRemote));

	/* Set insert position after network menu items */
	let menuItems = AggregateMenu.menu._getMenuItems();
	let menuPosition = menuItems.indexOf(AggregateMenu._network.menu) + 1;

	/* Add indicator and menu item */
	statusIcon = new St.Icon({ icon_name: iconName, style_class: 'system-status-icon'});
	Indicator.add_child(statusIcon);
	AggregateMenu.menu.addMenuItem(castMenu, menuPosition);

	/* Add Chromecast remote to top bar if already playing,
	Generates initial temp config file if it does not exist */
	chromecastWasPlaying = null;
	initChromecastRemote();
}

function disable()
{
	let lockingScreen = (Main.sessionMode.currentMode == 'unlock-dialog' || Main.sessionMode.currentMode == 'lock-screen');

	if(!lockingScreen)
	{
		Util.spawn(['pkill', '-SIGINT', '-f', Local.path]);
	}

	/* Disconnect signals from settings */
	Settings.disconnect(ffmpegPathChanged);
	Settings.disconnect(ffprobePathChanged);
	Settings.disconnect(receiverTypeChanged);
	Settings.disconnect(listeningPortChanged);
	Settings.disconnect(videoBitrateChanged);
	Settings.disconnect(videoAccelerationChanged);
	Settings.disconnect(remotePositionChanged);
	Settings.disconnect(seekTimeChanged);
	Settings.disconnect(musicVisualizerChanged);

	/* Disconnect other signals */
	Settings.disconnect(chromecastPlayingChanged);

	/* Remove Chromecast Remote */
	if(remoteButton)
	{
		remoteButton.destroy();
		remoteButton = null;
	}

	/* Remove indicator and menu item object */
	Indicator.remove_child(statusIcon);
	castMenu.destroy();
}
