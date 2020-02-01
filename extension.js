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
let config;
let serviceStarted;
let signals;
let serviceSignal;

function refreshRemote(playbackData)
{
	let isShown = (playbackData) ? playbackData.isPlaying : false;
	remoteMenu.playlist.remoteActive = isShown;

	if(!isShown)
	{
		if(remoteMenu.isActor)
			return remoteMenu.actor.hide();
		else
			return remoteMenu.hide();
	}

	if(
		!playbackData
		|| !playbackData.selection
		|| !playbackData.playlist
	)
		return;

	remoteMenu.refreshLabel();

	let selection = playbackData.selection;
	let playlist = playbackData.playlist;

	/* Current track number in playlist */
	let trackID = playlist.indexOf(selection.filePath) + 1;

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
			if(!config.musicVisualizer)
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

	if(remoteMenu.isActor)
		remoteMenu.actor.show();
	else
		remoteMenu.show();
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

	Soup.client.getPlaybackData(data => refreshRemote(data));
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
			/* Prevent setting node to same port as gnome */
			if(Soup.server.usedPort == postData[confKey])
			{
				postData[confKey] = (Soup.client.nodePort < Soup.server.usedPort) ?
					postData[confKey] + 1 : postData[confKey] - 1;

				return Settings.set_int('listening-port', postData[confKey]);
			}
			config[confKey] = postData[confKey];
			Soup.client.postConfig(postData, () => Soup.client.setNodePort(postData[confKey]));
			break;
		case 'internalPort':
			/* Prevent setting gnome to same port as node */
			if(Soup.client.nodePort == postData[confKey])
			{
				postData[confKey] = (Soup.client.nodePort > Soup.server.usedPort) ?
					postData[confKey] + 1 : postData[confKey] - 1;

				return Settings.set_int('internal-port', postData[confKey]);
			}
			Soup.server.setPort(postData[confKey], (usedPort) =>
			{
				if(!usedPort) return;

				/* Save port you ended with to gsettings */
				if(postData[confKey] != usedPort)
					return Settings.set_int('internal-port', usedPort);

				postData[confKey] = usedPort;
				config[confKey] = usedPort;

				Soup.server.createWebsocket();
				Soup.client.postConfig(postData);
			});
			break;
		case 'chromecastName':
			updateChromecastName(postData[confKey]);
			Soup.client.postConfig(postData);
			break;
		case 'playercastName':
			updatePlayercastName(postData[confKey]);
			Soup.client.postConfig(postData);
			break;
		case 'musicVisualizer':
			config[confKey] = postData[confKey];
			Soup.client.postConfig(postData);
			break;
		default:
			if(valueType === 'double')
				postData[confKey] = postData[confKey].toFixed(1);
			else if(confKey === 'ffmpegPath' && !postData[confKey])
				postData[confKey] = '/usr/bin/ffmpeg';
			else if(confKey === 'ffprobePath' && !postData[confKey])
				postData[confKey] = '/usr/bin/ffprobe';
			else if(confKey === 'receiverType')
				setReceiverName(postData[confKey]);

			Soup.client.postConfig(postData);
			break;
	}
}

function updateChromecastName(name)
{
	name = name || Settings.get_string('chromecast-name');

	if(
		Widget.remoteNames.chromecast.name
		&& Widget.remoteNames.chromecast.name === name
	)
		return;

	let castDevices = null;

	try { castDevices = JSON.parse(Settings.get_string('chromecast-devices')); }
	catch(err) { Settings.set_string('chromecast-devices', "[]"); }

	if(!castDevices) return;

	let myDevice = castDevices.find(device => device.name === name);

	if(myDevice)
		Widget.remoteNames.chromecast = myDevice;
}

function updatePlayercastName(name)
{
	name = name || Settings.get_string('playercast-name');

	if(Widget.remoteNames.playercast === name)
		return;

	Widget.remoteNames.playercast = name;
}

function onBrowserData(browser)
{
	if(browser && browser.name && Widget.remoteNames.browser !== browser.name)
	{
		Widget.remoteNames.browser = browser.name;
		remoteMenu.refreshLabel();
	}
	else if(!browser || !browser.name)
	{
		Widget.remoteNames.browser = null;
		remoteMenu.refreshLabel();
	}
}

function setReceiverName(receiverType)
{
	remoteMenu.opts.receiverType = receiverType;

	switch(receiverType)
	{
		case 'chromecast':
			updateChromecastName();
			break;
		case 'playercast':
			updatePlayercastName();
			break;
		case 'other':
			Soup.client.getBrowser(data => onBrowserData(data));
			break;
		default:
			break;
	}
}

function changeSeekTime()
{
	remoteMenu.opts.seekTime = Settings.get_int('seek-time');
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
	remoteMenu.setUnifiedSlider(Settings.get_boolean('unified-slider'));
}

function changeLabelVisibility()
{
	let showLabel = Settings.get_boolean('remote-label');

	if(showLabel)
		remoteMenu.toplabel.show();
	else
		remoteMenu.toplabel.hide();
}

function changeUseFriendlyName()
{
	remoteMenu.opts.useFriendlyName = Settings.get_boolean('remote-label-fn');
	remoteMenu.refreshLabel();
}

function createRemote()
{
	/* Remove previous indicator */
	if(remoteMenu) remoteMenu.destroy();

	let opts = Temp.getRemoteOpts();
	remoteMenu = new Widget.remoteMenu(opts);

	/* Add remote to top bar */
	setRemotePosition();
}

function changeServiceEnabled()
{
	let enable = !castMenu.isServiceEnabled;
	Settings.set_boolean('service-wanted', enable);
	enableService(enable);
}

function enableService(enable)
{
	if(enable)
		Helper.startApp(Local.path, 'server-monitor');
	else
		Helper.closeOtherApps(Local.path, true);
}

function setIndicator(enable)
{
	let children = Indicator.get_children();

	if(children && children.length)
	{
		if(enable && !children.includes(Widget.statusIcon))
			Indicator.add_child(Widget.statusIcon);
		else if(!enable && children.includes(Widget.statusIcon))
			Indicator.remove_child(Widget.statusIcon);
	}
}

function onNodeWebsocket(err, msg)
{
	if(err) return log('Cast to TV: ' + err.message);

	switch(msg)
	{
		case 'connected':
			castMenu.enableFullMenu(true);
			setIndicator(true);
			break;
		case 'disconnected':
			castMenu.enableFullMenu(false);
			setIndicator(false);
			break;
		default:
			break;
	}
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
	if(!config) config = Temp.getConfig();

	/* Get remaining necessary settings */
	//let serviceEnabled = Settings.get_boolean('service-enabled');
	let serviceWanted = Settings.get_boolean('service-wanted');

	/* Create main menu */
	castMenu = new Widget.castMenu();

	/* Prepare signals array */
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
	signals.push(Settings.connect('changed::remote-position', createRemote.bind(this)));
	signals.push(Settings.connect('changed::unified-slider', changeUnifiedSlider.bind(this)));
	signals.push(Settings.connect('changed::seek-time', changeSeekTime.bind(this)));
	signals.push(Settings.connect('changed::media-buttons-size', changeMediaButtonsSize.bind(this)));
	signals.push(Settings.connect('changed::slider-icon-size', changeSlidersIconSize.bind(this)));
	signals.push(Settings.connect('changed::remote-label', changeLabelVisibility.bind(this)));
	signals.push(Settings.connect('changed::remote-label-fn', changeUseFriendlyName.bind(this)));
	//signals.push(Settings.connect('changed::service-enabled', setIndicator.bind(this, null)));

	/* Other signals */
	serviceSignal = castMenu.serviceMenuItem.connect('activate', changeServiceEnabled.bind(this));

	/* Create Soup client and server */
	if(!Soup.client)
		Soup.createClient(Settings.get_int('listening-port'));

	if(!Soup.server)
	{
		let internalPort = Settings.get_int('internal-port');

		Soup.createServer(internalPort, (usedPort) =>
		{
			if(!usedPort) return;

			if(internalPort != usedPort)
				return Settings.set_int('internal-port', usedPort);

			Soup.server.createWebsocket();
			Soup.server.addNodeHandler((err, msg) => onNodeWebsocket(err, msg));
		});
	}

	/* Create remote widget */
	createRemote();

	Soup.server.onPlaybackData(data => refreshRemote(data));
	Soup.server.onBrowserData(data => onBrowserData(data));

	/* Set insert position after network menu items */
	let menuItems = AggregateMenu.menu._getMenuItems();
	let menuPosition = menuItems.indexOf(AggregateMenu._network.menu) + 1;

	/* Add menu item */
	AggregateMenu.menu.addMenuItem(castMenu, menuPosition);

	/* Check if service should start */
	if(!serviceStarted && serviceWanted)
	{
		enableService(true);
		serviceStarted = true;
	}

	//setIndicator(serviceEnabled);
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
		/* Close background service */
		enableService(false);
		serviceStarted = false;
		config = null;

		/* Close Soup server and client */
		Soup.closeServer();
		Soup.closeClient();
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
