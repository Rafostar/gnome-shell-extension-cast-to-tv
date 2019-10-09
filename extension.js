/*
GNOME Shell Extension Cast to TV
Developer: Rafostar
Extension GitHub: https://github.com/Rafostar/gnome-shell-extension-cast-to-tv
*/

const GLib = imports.gi.GLib;
const Main = imports.ui.main;
const AggregateMenu = Main.panel.statusArea.aggregateMenu;
const Indicator = AggregateMenu._network.indicators;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const Widget = Local.imports.widget;
const Helper = Local.imports.helper;
const Settings = Helper.getSettings(Local.path, Local.metadata['settings-schema']);
const Temp = Local.imports.temp;
const shared = Local.imports.shared.module.exports;
const _ = Gettext.gettext;

const EXTENSIONS_PATH = Local.path.substring(0, Local.path.lastIndexOf('/'));

let castMenu;
let remoteMenu;
let configContents;
let serviceStarted;
let signals;
let serviceSignal;

function configCastRemote()
{
	/* Change remote label */
	switch(configContents.receiverType)
	{
		case 'playercast':
			/* TRANSLATORS: "Playercast" is a name of an app, so do not change it */
			remoteMenu.toplabel.text = _("Playercast Remote");
			break;
		case 'other':
			/* TRANSLATORS: Can be translated as "Browser Remote" if it makes it shorter */
			remoteMenu.toplabel.text = _("Web Player Remote");
			break;
		default:
			remoteMenu.toplabel.text = _("Chromecast Remote");
			break;
	}

	let chromecastPlaying = Settings.get_boolean('chromecast-playing');
	remoteMenu.playlist.remoteActive = chromecastPlaying;

	let isActor = (remoteMenu.hasOwnProperty('actor'));

	if(chromecastPlaying)
	{
		/* Update selection and list data (needed for skipping tracks) */
		let selectionContents = Helper.readFromFile(shared.selectionPath);
		let listContents = Helper.readFromFile(shared.listPath);
		let trackID;

		if(listContents && selectionContents) trackID = listContents.indexOf(selectionContents.filePath) + 1;
		else return;

		/* List items are counted from 1 */
		let listLastID = listContents.length;

		/* Disable skip backward if playing first file from list */
		if(trackID > 1) remoteMenu.skipBackwardButton.reactive = true;
		else remoteMenu.skipBackwardButton.reactive = false;

		/* Disable skip forward if playing last file from list */
		if(trackID < listLastID) remoteMenu.skipForwardButton.reactive = true;
		else remoteMenu.skipForwardButton.reactive = false;

		/* Update track title */
		if(selectionContents.title) remoteMenu.trackTitle.setText(selectionContents.title);
		else
		{
			let filename = selectionContents.filePath.substring(selectionContents.filePath.lastIndexOf('/') + 1);
			let title = (filename.includes('.')) ? filename.split('.').slice(0, -1).join('.') : filename;

			if(title) remoteMenu.trackTitle.setText(title);
			else remoteMenu.trackTitle.setText("");
		}

		/* Update widget playlist */
		remoteMenu.playlist.loadPlaylist(listContents, selectionContents.filePath);

		/* Choose remote to create */
		switch(selectionContents.streamType)
		{
			case 'VIDEO':
				remoteMenu.setMode('DIRECT', 'folder-videos-symbolic');
				break;
			case 'MUSIC':
				if(!configContents.musicVisualizer) remoteMenu.setMode('DIRECT', 'folder-music-symbolic');
				else remoteMenu.setMode('ENCODE');
				break;
			case 'PICTURE':
				remoteMenu.setMode('PICTURE');
				break;
			case 'LIVE':
				remoteMenu.setMode('LIVE');
				break;
			default:
				remoteMenu.setMode('ENCODE');
				break;
		}

		/* Set slider icon */
		if(remoteMenu.positionSlider.isVolume)
			remoteMenu.positionSlider.setIcon(remoteMenu.positionSlider.volumeIcon);
		else
			remoteMenu.positionSlider.setIcon(remoteMenu.positionSlider.defaultIcon);

		/* Restore widget buttons and sliders state */
		remoteMenu.updateRemote();

		if(isActor) remoteMenu.actor.show();
		else remoteMenu.show();
	}
	else
	{
		if(isActor) remoteMenu.actor.hide();
		else remoteMenu.hide();
	}
}

function setRemotePosition()
{
	let itemIndex = 0;
	let remotePosition = Settings.get_string('remote-position');

	switch(remotePosition)
	{
		case 'left':
			itemIndex = Main.panel._leftBox.get_children().length;
			break;
		case 'center-left':
			remotePosition = 'center';
			break;
		case 'center-right':
			itemIndex = Main.panel._centerBox.get_children().length;
			remotePosition = 'center';
			break;
		default:
			break;
	}

	/* Place remote on top bar */
	Main.panel.addToStatusArea('cast-to-tv-remote', remoteMenu, itemIndex, remotePosition);
	configCastRemote();
}

function getTempFiles()
{
	if(!configContents) configContents = Temp.setConfigFile();

	let selectionExists = GLib.file_test(shared.selectionPath, GLib.FileTest.EXISTS);
	if(!selectionExists) Temp.setSelectionFile();

	let listExists = GLib.file_test(shared.listPath, GLib.FileTest.EXISTS);
	if(!listExists) Temp.setListFile();

	let remoteExists = GLib.file_test(shared.remotePath, GLib.FileTest.EXISTS);
	if(!remoteExists) Temp.setRemoteFile();

	let statusExists = GLib.file_test(shared.statusPath, GLib.FileTest.EXISTS);
	if(!statusExists) Temp.setStatusFile();
}

function updateTempConfig(schemaKey, valueType)
{
	let confKey = schemaKey.split('-');
	confKey = confKey[0] + confKey[1].charAt(0).toUpperCase() + confKey[1].slice(1);

	configContents[confKey] = Settings['get_' + valueType](schemaKey);

	if(valueType === 'double')
		configContents[confKey] = configContents[confKey].toFixed(1);

	if(!configContents.ffmpegPath)
		configContents.ffmpegPath = '/usr/bin/ffmpeg';

	if(!configContents.ffprobePath)
		configContents.ffprobePath = '/usr/bin/ffprobe';

	Helper.writeToFile(shared.configPath, configContents);
}

function changeSeekTime()
{
	Widget.seekTime = Settings.get_int('seek-time');
}

function changeMediaButtonsSize()
{
	remoteMenu.setMediaButtonsSize(Settings.get_int('media-buttons-size'));
}

function changeSlidersIconSize()
{
	remoteMenu.setSlidersIconSize(Settings.get_int('slider-icon-size'));
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

	/* Restore remote settings */
	changeLabelVisibility();
	changeMediaButtonsSize();
	changeSlidersIconSize();
	setRemotePosition();
}

function changeServiceEnabled()
{
	let enable = !Settings.get_boolean('service-enabled');
	Settings.set_boolean('service-wanted', enable);
	enableService(enable);
}

function enableService(enable)
{
	if(enable) Helper.startApp(Local.path, 'server-monitor');
	else Helper.closeOtherApps(Local.path, true);
}

function setIndicator(enable)
{
	if(enable !== true && enable !== false)
		enable = Settings.get_boolean('service-enabled');

	let children = Indicator.get_children();
	if(children && children.length)
	{
		if(enable && !children.includes(Widget.statusIcon))
		{
			Indicator.add_child(Widget.statusIcon);
		}
		else if(!enable && children.includes(Widget.statusIcon))
		{
			Indicator.remove_child(Widget.statusIcon);
		}
	}

	castMenu.enableFullMenu(enable);
}

function init()
{
	Helper.initTranslations(Local.path, Local.metadata['gettext-domain']);
}

function enable()
{
	/* Read/create temp files */
	getTempFiles();

	/* Get remaining necessary settings */
	Widget.seekTime = Settings.get_int('seek-time');
	Widget.isUnifiedSlider = Settings.get_boolean('unified-slider');
	let serviceEnabled = Settings.get_boolean('service-enabled');
	let serviceWanted = Settings.get_boolean('service-wanted');

	/* Create new objects from classes */
	castMenu = new Widget.castMenu();
	remoteMenu = new Widget.remoteMenu();

	/* Set initial remote label visibility */
	changeLabelVisibility();

	/* Set initial remote buttons size */
	changeMediaButtonsSize();
	changeSlidersIconSize();

	/* Clear signals array */
	signals = [];

	/* Connect signals */
	signals.push(Settings.connect('changed::ffmpeg-path', updateTempConfig.bind(this, 'ffmpeg-path', 'string')));
	signals.push(Settings.connect('changed::ffprobe-path', updateTempConfig.bind(this, 'ffprobe-path', 'string')));
	signals.push(Settings.connect('changed::receiver-type', updateTempConfig.bind(this, 'receiver-type', 'string')));
	signals.push(Settings.connect('changed::listening-port', updateTempConfig.bind(this, 'listening-port', 'int')));
	signals.push(Settings.connect('changed::webplayer-subs', updateTempConfig.bind(this, 'webplayer-subs', 'double')));
	signals.push(Settings.connect('changed::video-bitrate', updateTempConfig.bind(this, 'video-bitrate', 'double')));
	signals.push(Settings.connect('changed::video-acceleration', updateTempConfig.bind(this, 'video-acceleration', 'string')));
	signals.push(Settings.connect('changed::music-visualizer', updateTempConfig.bind(this, 'music-visualizer', 'boolean')));
	signals.push(Settings.connect('changed::chromecast-name', updateTempConfig.bind(this, 'chromecast-name', 'string')));
	signals.push(Settings.connect('changed::playercast-name', updateTempConfig.bind(this, 'playercast-name', 'string')));
	signals.push(Settings.connect('changed::remote-position', recreateRemote.bind(this)));
	signals.push(Settings.connect('changed::unified-slider', changeUnifiedSlider.bind(this)));
	signals.push(Settings.connect('changed::seek-time', changeSeekTime.bind(this)));
	signals.push(Settings.connect('changed::media-buttons-size', changeMediaButtonsSize.bind(this)));
	signals.push(Settings.connect('changed::slider-icon-size', changeSlidersIconSize.bind(this)));
	signals.push(Settings.connect('changed::remote-label', changeLabelVisibility.bind(this)));
	signals.push(Settings.connect('changed::chromecast-playing', configCastRemote.bind(this)));
	signals.push(Settings.connect('changed::service-enabled', setIndicator.bind(this, null)));

	/* Other signals */
	serviceSignal = castMenu.serviceMenuItem.connect('activate', changeServiceEnabled.bind(this));

	/* Set insert position after network menu items */
	let menuItems = AggregateMenu.menu._getMenuItems();
	let menuPosition = menuItems.indexOf(AggregateMenu._network.menu) + 1;

	/* Add menu item */
	AggregateMenu.menu.addMenuItem(castMenu, menuPosition);

	/* Add remote to top bar */
	setRemotePosition();

	/* Check if service should start */
	if(!serviceStarted && serviceWanted)
	{
		enableService(true);
		serviceStarted = true;
	}

	setIndicator(serviceEnabled);
}

function disable()
{
	/* Disconnect signals from settings */
	signals.forEach(signal => Settings.disconnect(signal));
	signals = null;

	/* Disconnect other signals */
	castMenu.serviceMenuItem.disconnect(serviceSignal);
	serviceSignal = null;

	let lockingScreen = (Main.sessionMode.currentMode == 'unlock-dialog' || Main.sessionMode.currentMode == 'lock-screen');
	if(!lockingScreen)
	{
		enableService(false);
		serviceStarted = false;
	}

	/* Remove top bar indicator */
	setIndicator(false);

	/* Remove Chromecast Remote */
	remoteMenu.destroy();
	remoteMenu = null;

	/* Remove menu item object */
	castMenu.destroy();
	castMenu = null;
}
