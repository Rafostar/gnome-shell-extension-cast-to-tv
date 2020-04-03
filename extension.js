/*
GNOME Shell Extension Cast to TV
Developer: Rafostar
Extension GitHub: https://github.com/Rafostar/gnome-shell-extension-cast-to-tv
*/

const Main = imports.ui.main;
const AggregateMenu = Main.panel.statusArea.aggregateMenu;
const NetworkMenu = AggregateMenu._network;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Soup = Local.imports.soup;
const Widget = Local.imports.widget;
const Helper = Local.imports.helper;
const Settings = Helper.getSettings(Local.path);
const Temp = Local.imports.temp;

let castMenu;
let remoteMenu;
let config;
let signals;
let serviceSignal;

function refreshRemote(playbackData)
{
	if(!remoteMenu)
		return;

	let isShown = (playbackData && playbackData.isPlaying);
	remoteMenu.playlist.remoteActive = isShown;

	if(!isShown)
	{
		if(remoteMenu.isActor)
			remoteMenu.actor.hide();
		else
			remoteMenu.hide();

		return stopAddonsStreams();
	}

	if(
		!playbackData
		|| !playbackData.selection
		|| !playbackData.playlist
	)
		return;

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

function stopAddonsStreams()
{
	if(!castMenu) return;

	let menuItems = castMenu.castSubMenu.menu._getMenuItems();

	menuItems.forEach(item =>
	{
		if(
			item._onCastStop
			&& typeof item._onCastStop === 'function'
		)
			item._onCastStop();
	});
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

				Soup.client.postConfig(postData);
			});
			break;
		case 'chromecastName':
			if(remoteMenu.opts.useFriendlyName)
				updateChromecastName(postData[confKey]);

			Soup.client.postConfig(postData);
			break;
		case 'playercastName':
			if(remoteMenu.opts.useFriendlyName)
				updatePlayercastName(postData[confKey]);

			Soup.client.postConfig(postData);
			break;
		case 'chromecastDevices':
		case 'chromecastSubtitles':
			try { postData[confKey] = JSON.parse(postData[confKey]); }
			catch(err) { postData[confKey] = null; }

			if(postData[confKey])
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
				updateReceiverName(postData[confKey]);

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
		return remoteMenu.refreshLabel();

	let castDevices = null;

	try { castDevices = JSON.parse(Settings.get_string('chromecast-devices')); }
	catch(err) { Settings.set_string('chromecast-devices', "[]"); }

	if(!castDevices) return;

	let myDevice = castDevices.find(device => device.name === name);

	if(myDevice)
		Widget.remoteNames.chromecast = myDevice;
	else
		Widget.remoteNames.chromecast = {};

	remoteMenu.refreshLabel();
}

function updatePlayercastName(name)
{
	name = name || Settings.get_string('playercast-name');

	Widget.remoteNames.playercast = (name) ? name : null;
	remoteMenu.refreshLabel();
}

function onBrowserData(browser)
{
	if(browser && browser.name)
		Widget.remoteNames.browser = browser.name;
	else
		Widget.remoteNames.browser = null;

	if(remoteMenu)
		remoteMenu.refreshLabel();
}

function updateReceiverName(receiverType)
{
	if(receiverType)
		remoteMenu.opts.receiverType = receiverType;
	else
		receiverType = remoteMenu.opts.receiverType;

	if(!remoteMenu.opts.useFriendlyName)
		return remoteMenu.refreshLabel();

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
	{
		remoteMenu.toplabel.show();
		remoteMenu.barArrowIcon.show();
	}
	else
	{
		remoteMenu.toplabel.hide();
		remoteMenu.barArrowIcon.hide();
	}
}

function changeUseFriendlyName()
{
	remoteMenu.opts.useFriendlyName = Settings.get_boolean('remote-label-fn');
	updateReceiverName();
}

function createRemote()
{
	/* Remove previous indicator */
	if(remoteMenu) remoteMenu.destroy();

	let opts = Temp.getRemoteOpts();
	remoteMenu = new Widget.CastRemoteMenu(opts);

	/* Add remote to top bar */
	setRemotePosition();

	/* Refresh label only once after create */
	updateReceiverName();

	/* Refresh initial status */
	Soup.client.getPlaybackData(data => refreshRemote(data));
}

function changeServiceEnabled()
{
	let enable = !castMenu.isServiceEnabled;
	Settings.set_boolean('service-wanted', enable);

	Soup.client.getIsServiceEnabled(data =>
	{
		/* When wanted state matches service state */
		if(data && data.isEnabled === enable || !data && !enable)
			return;

		enableService(enable);
	});
}

function enableService(enable)
{
	if(enable)
		Helper.startApp(Local.path, 'server-monitor', null, true);
	else
		Helper.closeOtherApps(Local.path, true);
}

function setIndicator(enable)
{
	/* Compatibility with GNOME pre-3.36 */
	let indicator = (NetworkMenu.hasOwnProperty('indicators')) ?
		NetworkMenu.indicators : NetworkMenu;

	let children = indicator.get_children();

	if(children && children.length)
	{
		if(enable && !children.includes(Widget.statusIcon))
			indicator.add_child(Widget.statusIcon);
		else if(!enable && children.includes(Widget.statusIcon))
			indicator.remove_child(Widget.statusIcon);
	}
}

function onNodeWebsocket(err, msg)
{
	if(!castMenu || !remoteMenu)
		return;

	if(err) return log('Cast to TV: ' + err.message);

	let enable = (msg && msg === 'connected');

	if(!enable)
		refreshRemote(false);

	castMenu.enableFullMenu(enable);
	setIndicator(enable);
	Soup.server.emitIsServiceEnabled(enable);
}

function init()
{
	Helper.initTranslations(Local.path);
}

function enable()
{
	/* Get config object */
	if(!config) config = Temp.getConfig();

	/* Create main menu */
	castMenu = new Widget.CastMainMenu();

	/* Prepare signals array */
	signals = [];

	let nodeSignals = {
		string: [
			'ffmpeg-path', 'ffprobe-path', 'receiver-type',
			'video-acceleration', 'extractor-dir', 'playercast-name',
			'chromecast-name', 'chromecast-devices', 'chromecast-subtitles',
			'subs-preferred', 'subs-fallback'
		],
		int: [
			'listening-port', 'internal-port', 'slideshow-time'
		],
		double: [
			'webplayer-subs', 'video-bitrate'
		],
		boolean: [
			'burn-subtitles', 'music-visualizer', 'extractor-reuse'
		]
	};

	/* Connect signals */
	for(let type in nodeSignals)
	{
		for(let setting of nodeSignals[type])
		{
			signals.push(Settings.connect(`changed::${setting}`,
				updateTempConfig.bind(this, setting, type))
			);
		}
	}

	/* Connect remaining signals */
	signals.push(Settings.connect('changed::remote-position', createRemote.bind(this)));
	signals.push(Settings.connect('changed::unified-slider', changeUnifiedSlider.bind(this)));
	signals.push(Settings.connect('changed::seek-time', changeSeekTime.bind(this)));
	signals.push(Settings.connect('changed::media-buttons-size', changeMediaButtonsSize.bind(this)));
	signals.push(Settings.connect('changed::slider-icon-size', changeSlidersIconSize.bind(this)));
	signals.push(Settings.connect('changed::remote-label', changeLabelVisibility.bind(this)));
	signals.push(Settings.connect('changed::remote-label-fn', changeUseFriendlyName.bind(this)));

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

			/* Handlers should be set only once, server port can still be changed */
			Soup.server.addNodeHandler((err, msg) => onNodeWebsocket(err, msg));
			Soup.server.onPlaybackData(data => refreshRemote(data));
			Soup.server.onBrowserData(data => onBrowserData(data));
			Soup.server.onPlaybackStatus(data =>
			{
				if(remoteMenu)
					remoteMenu.updateRemote(data);
			});
			Soup.server.createWebsockets();

			if(internalPort != usedPort)
				Settings.set_int('internal-port', usedPort);
		});
	}

	/* Create remote widget */
	createRemote();

	/* Set insert position after network menu items */
	let menuItems = AggregateMenu.menu._getMenuItems();
	let menuPosition = menuItems.indexOf(AggregateMenu._network.menu) + 1;

	/* Add menu item */
	AggregateMenu.menu.addMenuItem(castMenu, menuPosition);

	/* Check if service should start */
	Soup.client.getIsServiceEnabled(data =>
	{
		let serviceWanted = Settings.get_boolean('service-wanted');

		if(data && data.isEnabled)
		{
			/* Resume communication with node */
			Soup.client.postIsLockScreen(false);

			if(!serviceWanted)
				enableService(false);
		}
		else if(serviceWanted)
			enableService(true);
	});
}

function disable()
{
	/* Disconnect signals from settings */
	signals.forEach(signal => Settings.disconnect(signal));
	signals = null;

	/* Disconnect other signals */
	castMenu.serviceMenuItem.disconnect(serviceSignal);
	serviceSignal = null;

	let lockingScreen = (
		Main.sessionMode.currentMode == 'unlock-dialog'
		|| Main.sessionMode.currentMode == 'lock-screen'
	);

	if(lockingScreen)
	{
		/* Pause data communication with node client */
		Soup.client.postIsLockScreen(true, () =>
		{
			Soup.server.disconnectWebsockets();
		});
	}
	else
	{
		/* Close background service */
		enableService(false);
		config = null;

		/* Close Soup client and server */
		Soup.closeClient();
		Soup.closeServer();
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
