/*
gnome-shell-extension-cast-to-tv
Developer: Rafostar
Extension GitHub: https://github.com/Rafostar/gnome-shell-extension-cast-to-tv
*/

const St = imports.gi.St;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
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
const Convenience = Local.imports.convenience;
const Settings = Convenience.getSettings();
const configPath = '/tmp/.cast-to-tv.json';
const remotePath = '/tmp/.chromecast-remote.json';
const iconName = 'tv-symbolic';


let castMenu;
let remoteButton;

let statusIcon;
let configContents, remoteContents;
let seekTime;
let playButton, pauseButton, seekBackwardButton, seekForwardButton;

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

const MediaControlButton = GObject.registerClass({
	GTypeName: "MediaControlButton"
}, class MediaControlButton extends St.Button {
	_init(buttonIconName) {
		super._init({
			style: "padding: 4px, 6px, 4px, 6px; margin-left: 2px; margin-right: 2px;",
			opacity: 130,
			child: new St.Icon({
				icon_name: buttonIconName,
				icon_size: 20
			})
		});

		let callback = () => {
			this.opacity = !this.reactive ? 30 : this.hover ? 255 : 130;
			
		};

		let signalIds = [
			this.connect("notify::hover", callback),
			this.connect("notify::reactive", callback),
			this.connect("destroy", () => {
				signalIds.forEach(signalId => this.disconnect(signalId));
			})
		];
	}
});

const CastToTvMenu = new Lang.Class
({
	Name: 'Cast to TV',
	Extends: PopupMenu.PopupSubMenuMenuItem,

	_init: function()
	{
		this.parent('Cast Media', true);
		this.icon.icon_name = iconName;

		/* Expandable menu */
		let videoMenuItem = new PopupMenu.PopupImageMenuItem('Video', 'folder-videos-symbolic');
		let musicMenuItem = new PopupMenu.PopupImageMenuItem('Music', 'folder-music-symbolic');
		let settingsMenuItem = new PopupMenu.PopupMenuItem('Cast Settings');

		/* Assemble all menu items */
		this.menu.addMenuItem(videoMenuItem);
		this.menu.addMenuItem(musicMenuItem);
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

const ChromecastRemoteMenu = new Lang.Class
({
	Name: 'Chromecast Remote',
	Extends: PanelMenu.Button,

	_init: function()
	{
		this.parent(0.5, 'Chromecast Remote', false);

		let box = new St.BoxLayout();
		let icon = new St.Icon({ icon_name: 'input-dialpad-symbolic', style_class: 'system-status-icon'});
		let toplabel = new St.Label({ text: 'Cast Remote', y_expand: true, y_align: Clutter.ActorAlign.CENTER });

		/* Display app icon, label and dropdown arrow */
		box.add(icon);
		box.add(toplabel);
		box.add(PopupMenu.arrowIcon(St.Side.BOTTOM));

		this.actor.add_child(box);

		/* Create base for media control buttons */
		let popupBase = new PopupMenu.PopupBaseMenuItem({hover: false, reactive: true});

		let controlsButtonBox = new St.BoxLayout({
			x_align: Clutter.ActorAlign.CENTER,
			x_expand: true
		});

		playButton = new MediaControlButton("media-playback-start-symbolic");
		pauseButton = new MediaControlButton("media-playback-pause-symbolic");
		seekBackwardButton = new MediaControlButton("media-seek-backward-symbolic");
		seekForwardButton = new MediaControlButton("media-seek-forward-symbolic");
		let stopButton = new MediaControlButton("media-playback-stop-symbolic");
		let repeatButton = new MediaControlButton("media-playlist-repeat-symbolic");

		/* Add space between stop and the remaining buttons */
		stopButton.style = "padding: 0px, 6px, 0px, 6px; margin-left: 2px; margin-right: 40px;";

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

function initChromecastRemote()
{
	let chromecastPlaying = Settings.get_boolean('chromecast-playing');

	if(remoteButton)
	{
		remoteButton.destroy();
		remoteButton = null;
	}

	if(configContents.receiverType != 'chromecast' || !chromecastPlaying)
	{
		return;
	}

	remoteButton = new ChromecastRemoteMenu;

	/* Check if video is transcoded and disable seeking*/
	readConfigFromFile();
	switch(configContents.streamType)
	{
		case 'VIDEO':
			enableSeekButtons(true);
			break;
		case 'MUSIC':
			if(configContents.musicVisualizer)
			{
				enableSeekButtons(false);
				break;
			}
			enableSeekButtons(true);
			break;
		default:
			enableSeekButtons(false);
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
	seekBackwardButton.reactive = isEnabled;
	seekForwardButton.reactive = isEnabled;
}

function changeFFmpegPath()
{
	readConfigFromFile();
	configContents.ffmpegPath = Settings.get_string('ffmpeg-path');

	if(!configContents.ffmpegPath)
	{
		configContents.ffmpegPath = '/bin/ffmpeg';
	}

	writeDataToFile(configPath, configContents);
}

function changeFFprobePath()
{
	readConfigFromFile();
	configContents.ffprobePath = Settings.get_string('ffprobe-path');

	if(!configContents.ffprobePath)
	{
		configContents.ffprobePath = '/bin/ffprobe';
	}

	writeDataToFile(configPath, configContents);
}

function changeReceiverType()
{
	readConfigFromFile();
	configContents.receiverType = Settings.get_string('receiver-type');
	writeDataToFile(configPath, configContents);
	initChromecastRemote();
}

function changeListeningPort()
{
	readConfigFromFile();
	configContents.listeningPort = Settings.get_int('listening-port');
	writeDataToFile(configPath, configContents);
}

function changeVideoBitrate()
{
	readConfigFromFile();
	configContents.videoBitrate = Settings.get_double('video-bitrate');
	writeDataToFile(configPath, configContents);
}

function changeVideoAcceleration()
{
	readConfigFromFile();
	configContents.videoAcceleration = Settings.get_string('video-acceleration');
	writeDataToFile(configPath, configContents);
}

function changeMusicVisualizer()
{
	readConfigFromFile();
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
		configContents.ffmpegPath = '/bin/ffmpeg';
	}

	if(!configContents.ffprobePath)
	{
		configContents.ffprobePath = '/bin/ffprobe';
	}

	writeDataToFile(configPath, configContents);
}

function writeDataToFile(path, contents)
{
	/* Write config data to temp file */
	GLib.file_set_contents(path, JSON.stringify(contents, null, 1));
}

function readConfigFromFile()
{
	/* Read config data from temp file */
	let [readOk, readFile] = GLib.file_get_contents(path);

	if(readOk)
	{
		if(readFile instanceof Uint8Array)
		{
			configContents = JSON.parse(ByteArray.toString(readFile));
		}
		else
		{
			configContents = JSON.parse(readFile);
		}
	}
	else
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
	//Convenience.initTranslations(); // No translations yet
}

function enable()
{
	/* Create new object from class CastToTvMenu */
	castMenu = new CastToTvMenu;

	/* Create config file */
	setConfigFile();

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

	/* Add Chromecast remote to top bar if already playing */
	initChromecastRemote();

	/* Stop earlier started processes (for gnome-shell restart) */
	Util.spawn(['pkill', '-SIGINT', '-f', Local.path]);
}

function disable()
{
	/* Stop processes containing local path */
	Util.spawn(['pkill', '-SIGINT', '-f', Local.path]);

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
	}

	/* Remove indicator and menu item object */
	Indicator.remove_child(statusIcon);
	castMenu.destroy();
}
