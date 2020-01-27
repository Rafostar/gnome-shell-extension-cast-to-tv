/*
GNOME Shell Extension Cast to TV
Developer: Rafostar
Extension GitHub: https://github.com/Rafostar/gnome-shell-extension-cast-to-tv
*/

const Main = imports.ui.main;
const AggregateMenu = Main.panel.statusArea.aggregateMenu;
const Indicator = AggregateMenu._network.indicators;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const Soup = Local.imports.soup;
const Widget = Local.imports.widget;
const Helper = Local.imports.helper;
const Settings = Helper.getSettings(Local.path);
const Temp = Local.imports.temp;
const _ = Gettext.gettext;

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
		getPlaybackData((selection, playlist) =>
		{
			let trackID;

			if(selection && playlist)
				trackID = playlist.indexOf(selection.filePath) + 1;
			else
				return;

			/* List items are counted from 1 */
			let listLastID = playlist.length;

			/* Disable skip backward if playing first file from list */
			if(trackID > 1) remoteMenu.skipBackwardButton.reactive = true;
			else remoteMenu.skipBackwardButton.reactive = false;

			/* Disable skip forward if playing last file from list */
			if(trackID < listLastID) remoteMenu.skipForwardButton.reactive = true;
			else remoteMenu.skipForwardButton.reactive = false;

			/* Update track title */
			if(selection.title)
				remoteMenu.trackTitle.setText(selection.title);
			else
			{
				let filename = selection.filePath.substring(
					selection.filePath.lastIndexOf('/') + 1);

				let title = (filename.includes('.')) ?
					filename.split('.').slice(0, -1).join('.') : filename;

				if(title) remoteMenu.trackTitle.setText(title);
				else remoteMenu.trackTitle.setText("");
			}

			/* Update widget playlist */
			remoteMenu.playlist.loadPlaylist(playlist, selection.filePath);

			/* Choose remote to create */
			switch(selection.streamType)
			{
				case 'VIDEO':
					remoteMenu.setMode('DIRECT', 'folder-videos-symbolic');
					break;
				case 'MUSIC':
					if(!configContents.musicVisualizer)
						remoteMenu.setMode('DIRECT', 'folder-music-symbolic');
					else
						remoteMenu.setMode('ENCODE');
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

			if(isActor) remoteMenu.actor.show();
			else remoteMenu.show();
		});
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

function getPlaybackData(cb)
{
	Soup.client.getPlaylist(playlist =>
	{
		if(!playlist) return cb(null, null);

		Soup.client.getSelection(selection =>
		{
			if(!selection) return cb(null, playlist);

			cb(selection, playlist);
		});
	});
}

function updateTempConfig(schemaKey, valueType)
{
	let confKey = schemaKey.split('-');
	confKey = confKey[0] + confKey[1].charAt(0).toUpperCase() + confKey[1].slice(1);

	let postData = {};
	postData[confKey] = Settings['get_' + valueType](schemaKey);

	switch(confKey)
	{
		case 'listeningPort':
			if(Soup.server.usedPort == postData[confKey])
			{
				postData[confKey] = (Soup.client.usedPort < Soup.server.usedPort) ?
					postData[confKey] + 1 : postData[confKey] - 1;

				return Settings.set_int('listening-port', postData[confKey]);
			}

			configContents[confKey] = postData[confKey];
			Soup.client.postConfig(postData, () => Soup.client.setPort(postData[confKey]));
			break;
		case 'internalPort':
			if(Soup.client.usedPort == postData[confKey])
			{
				postData[confKey] = (Soup.client.usedPort > Soup.server.usedPort) ?
					postData[confKey] + 1 : postData[confKey] - 1;

				return Settings.set_int('internal-port', postData[confKey]);
			}

			Soup.server.setPort(postData[confKey], (usedPort) =>
			{
				if(!usedPort) return;

				if(postData[confKey] === usedPort)
				{
					configContents[confKey] = postData[confKey];
					Soup.client.postConfig(postData);
				}
				else
					return Settings.set_int('internal-port', usedPort);
			});
			break;
		default:
			if(valueType === 'double')
				postData[confKey] = postData[confKey].toFixed(1);
			else if(confKey === 'ffmpegPath' && !postData[confKey])
				postData[confKey] = '/usr/bin/ffmpeg';
			else if(confKey === 'ffprobePath' && !postData[confKey])
				postData[confKey] = '/usr/bin/ffprobe';

			configContents[confKey] = postData[confKey];
			Soup.client.postConfig(postData);
			break;
	}
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
	Helper.initTranslations(Local.path);
}

function enable()
{
	/* Create dir for temporary data */
	Temp.createTempDir();

	/* Get config object */
	if(!configContents) configContents = Temp.getConfig();

	/* Get remaining necessary settings */
	Widget.seekTime = Settings.get_int('seek-time');
	Widget.isUnifiedSlider = Settings.get_boolean('unified-slider');
	let serviceEnabled = Settings.get_boolean('service-enabled');
	let serviceWanted = Settings.get_boolean('service-wanted');
	let internalPort = Settings.get_int('internal-port');

	/* Create Soup server and client */
	if(!Soup.server)
	{
		Soup.createServer(internalPort, (usedPort) =>
		{
			if(usedPort && internalPort !== usedPort)
				Settings.set_int('internal-port', usedPort);
		});
	}

	if(!Soup.client)
		Soup.createClient(Settings.get_int('listening-port'));

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
	signals.push(Settings.connect('changed::internal-port', updateTempConfig.bind(this, 'internal-port', 'int')));
	signals.push(Settings.connect('changed::webplayer-subs', updateTempConfig.bind(this, 'webplayer-subs', 'double')));
	signals.push(Settings.connect('changed::video-bitrate', updateTempConfig.bind(this, 'video-bitrate', 'double')));
	signals.push(Settings.connect('changed::video-acceleration', updateTempConfig.bind(this, 'video-acceleration', 'string')));
	signals.push(Settings.connect('changed::burn-subtitles', updateTempConfig.bind(this, 'burn-subtitles', 'boolean')));
	signals.push(Settings.connect('changed::music-visualizer', updateTempConfig.bind(this, 'music-visualizer', 'boolean')));
	signals.push(Settings.connect('changed::extractor-reuse', updateTempConfig.bind(this, 'extractor-reuse', 'boolean')));
	signals.push(Settings.connect('changed::extractor-dir', updateTempConfig.bind(this, 'extractor-dir', 'string')));
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
		/* Close Soup server and client */
		Soup.closeServer();
		Soup.closeClient();

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
