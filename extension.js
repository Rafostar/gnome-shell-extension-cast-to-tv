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
const Mainloop = imports.mainloop;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Widget = Local.imports.widget;
const Convenience = Local.imports.convenience;
const Settings = Convenience.getSettings();
const Temp = Local.imports.temp;
const shared = Local.imports.shared.module.exports;
const iconName = 'tv-symbolic';
const remoteName = _("Chromecast Remote");

let castMenu;
let remoteButton;
let remoteIconName  = 'folder-videos-symbolic';
let readStatusInterval;
let statusIcon;
let configContents, selectionContents, listContents, statusContents;
let seekTime;
let trackID;
let listLastID;
let chromecastWasPlaying;
let isPaused;
//let isRepeatActive;

/* Media controls */
let positionSlider;
let seekBackwardButton;
let seekForwardButton;
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
let subtitlesEncodingChanged;

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
			selectionContents.streamType = 'VIDEO';
			spawnFileChooser();
		}));

		musicMenuItem.connect('activate', Lang.bind(this, function()
		{
			selectionContents.streamType = 'MUSIC';
			spawnFileChooser();
		}));

		pictureMenuItem.connect('activate', Lang.bind(this, function()
		{
			selectionContents.streamType = 'PICTURE';
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

	_init: function(mode)
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
		let popupBase = new Widget.PopupBase;

		let controlsButtonBox = new St.BoxLayout({
			x_align: Clutter.ActorAlign.CENTER,
			x_expand: true
		});

		let stopButton = new Widget.MediaControlButton('media-playback-stop-symbolic');
		let skipBackwardButton = new Widget.MediaControlButton('media-skip-backward-symbolic');
		let skipForwardButton = new Widget.MediaControlButton('media-skip-forward-symbolic');

		if(mode == 'media')
		{
			positionSlider = new Widget.SliderItem(remoteIconName);
			let playButton = new Widget.MediaControlButton('media-playback-start-symbolic');
			let pauseButton = new Widget.MediaControlButton('media-playback-pause-symbolic');
			seekBackwardButton = new Widget.MediaControlButton('media-seek-backward-symbolic');
			seekForwardButton = new Widget.MediaControlButton('media-seek-forward-symbolic');
			repeatButton = new Widget.MediaControlButton('media-playlist-repeat-symbolic', true);

			/* Add space between stop and the remaining buttons */
			stopButton.style = 'padding: 0px, 6px, 0px, 6px; margin-left: 2px; margin-right: 46px;';

			/* Assemble playback controls */
			controlsButtonBox.add(repeatButton);
			controlsButtonBox.add(stopButton);
			controlsButtonBox.add(skipBackwardButton);
			controlsButtonBox.add(seekBackwardButton);
			controlsButtonBox.add(playButton);
			controlsButtonBox.add(pauseButton);
			controlsButtonBox.add(seekForwardButton);
			controlsButtonBox.add(skipForwardButton);

			/* We do not want to display both play and pause buttons at once */
			if(isPaused) pauseButton.hide();
			else playButton.hide();

			this.menu.addMenuItem(positionSlider);

			/* Signals connections */
			positionSlider.connect('value-changed', Lang.bind(this, function()
			{
				Mainloop.source_remove(readStatusInterval);
				Temp.setRemoteAction('SEEK', positionSlider.value);
				readStatusTimer();
			}));

			playButton.connect('clicked', Lang.bind(this, function()
			{
				Temp.setRemoteAction('PLAY');
				playButton.hide();
				pauseButton.show();
				isPaused = false;
			}));

			pauseButton.connect('clicked', Lang.bind(this, function()
			{
				Temp.setRemoteAction('PAUSE');
				pauseButton.hide();
				playButton.show();
				isPaused = true;
			}));

			seekForwardButton.connect('clicked', Lang.bind(this, function()
			{
				Temp.setRemoteAction('SEEK+', seekTime);
			}));

			seekBackwardButton.connect('clicked', Lang.bind(this, function()
			{
				Temp.setRemoteAction('SEEK-', seekTime);
			}));

			repeatButton.connect('clicked', Lang.bind(this, function()
			{
				Temp.setRemoteAction('REPEAT', repeatButton.turnedOn);
				//isRepeatActive = repeatButton.turnedOn;
			}));

			//if(isRepeatActive) repeatButton.clicked();
		}
		else
		{
			controlsButtonBox.add(skipBackwardButton);
			controlsButtonBox.add(stopButton);
			controlsButtonBox.add(skipForwardButton);
		}

		popupBase.actor.add(controlsButtonBox);
		this.menu.addMenuItem(popupBase);

		/* Disable skip forward if playing first file from list */
		if(trackID == 0) skipBackwardButton.reactive = false;

		/* Disable skip forward if playing last file from list */
		if(trackID == listLastID) skipForwardButton.reactive = false;

		stopButton.connect('clicked', Lang.bind(this, function()
		{
			Temp.setRemoteAction('STOP');
		}));

		skipBackwardButton.connect('clicked', Lang.bind(this, function()
		{
			trackID--;
			selectionContents.filePath = listContents[trackID];
			Temp.writeToFile(shared.configPath, configContents);

			if(trackID == 0)
			{
				skipBackwardButton.reactive = false;
			}

			Temp.setRemoteAction('SKIP');
			skipForwardButton.reactive = true;
		}));

		skipForwardButton.connect('clicked', Lang.bind(this, function()
		{
			trackID++;
			selectionContents.filePath = listContents[trackID];
			Temp.writeToFile(shared.configPath, configContents);

			if(trackID == listLastID)
			{
				skipForwardButton.reactive = false;
			}

			Temp.setRemoteAction('SKIP');
			skipBackwardButton.reactive = true;
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

	/* Do not recreate remote if state did not change */
	if(chromecastWasPlaying == chromecastPlaying)
	{
		return;
	}

	chromecastWasPlaying = chromecastPlaying;

	/* Destroy old remote before choosing new one */
	if(remoteButton)
	{
		remoteButton.destroy();
		remoteButton = null;
	}

	/* Do not create remote if receiver is not set to Chromecast */
	if(configContents.receiverType != 'chromecast' || !chromecastPlaying)
	{
		return;
	}

	/* Get playlist */
	listContents = Temp.readFromFile(shared.listPath);

	if(listContents)
	{
		listLastID = listContents.length - 1;
	}
	else
	{
		listLastID = 0;
	}

	/* Get current playing track number */
	trackID = listContents.indexOf(selectionContents.filePath);

	/* Choose remote to create */
	if(selectionContents.streamType != 'PICTURE')
	{
		/* Create Chromecast Remote */
		remoteButton = new ChromecastRemoteMenu('media');

		/* Check if video is transcoded and disable seeking*/
		switch(selectionContents.streamType)
		{
			case 'VIDEO':
				remoteIconName = 'folder-videos-symbolic';
				readStatusTimer();
				break;
			case 'MUSIC':
				remoteIconName = 'folder-music-symbolic';
				if(configContents.musicVisualizer) hideSeekButtons();
				else readStatusTimer();
				break;
			default:
				remoteIconName = 'folder-videos-symbolic';
				hideSeekButtons();
		}

		positionSlider.icon = remoteIconName;
	}
	else
	{
		remoteIconName = 'folder-pictures-symbolic';
		remoteButton = new ChromecastRemoteMenu('pictures');
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

function hideSeekButtons()
{
	repeatButton.hide();
	seekBackwardButton.hide();
	seekForwardButton.hide();
	positionSlider.hide();
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
	initChromecastRemote();
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
	seekTime = Settings.get_int('seek-time');
}

function readStatusTimer()
{
	let previousTime = 0;

	readStatusInterval = Mainloop.timeout_add_seconds(1, Lang.bind(this, function() {

		let statusContents = Temp.readFromFile(shared.statusPath);

		if(statusContents)
		{
			if(statusContents.currentTime != previousTime && statusContents.playerState != 'BUFFERING')
			{
				let sliderValue = statusContents.currentTime / statusContents.mediaDuration;
				positionSlider.setValue(sliderValue);
				previousTime = statusContents.currentTime;
			}
			return true;
		}
		else
		{
			Mainloop.source_remove(readStatusInterval);
		}
	}));
}

function spawnFileChooser()
{
	/* To not freeze gnome shell FileChooserDialog needs to be run as separate process */
	Util.spawn(['gjs', Local.path + '/file-chooser.js', Local.path, selectionContents.streamType]);
}

function getTempFiles()
{
	configContents = Temp.readFromFile(shared.configPath);
	if(!configContents) configContents = Temp.setConfigFile();

	selectionContents = Temp.readFromFile(shared.selectionPath);
	if(!selectionContents) selectionContents = Temp.setSelectionFile();

	statusContents = Temp.readFromFile(shared.statusPath);
	if(!statusContents) statusContents = Temp.setStatusFile();

	let listExists = GLib.file_test(shared.listPath, 16);
	if(!listExists) Temp.setListFile(shared.listPath);

	let remoteExists = GLib.file_test(shared.remotePath, 16);
	if(!remoteExists) Temp.setRemoteFile(shared.remotePath);
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
	subtitlesEncodingChanged = Settings.connect('changed::subtitles-encoding', Lang.bind(this, changeSubtitlesEncoding));

	/* Connect other signals */
	chromecastPlayingChanged = Settings.connect('changed::chromecast-playing', Lang.bind(this, initChromecastRemote));

	/* Set insert position after network menu items */
	let menuItems = AggregateMenu.menu._getMenuItems();
	let menuPosition = menuItems.indexOf(AggregateMenu._network.menu) + 1;

	/* Add indicator and menu item */
	statusIcon = new St.Icon({ icon_name: iconName, style_class: 'system-status-icon'});
	Indicator.add_child(statusIcon);
	AggregateMenu.menu.addMenuItem(castMenu, menuPosition);

	/* Read/create temp files */
	getTempFiles();

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
	Settings.disconnect(subtitlesEncodingChanged);

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
