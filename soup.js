const { Soup, GObject } = imports.gi;
const ByteArray = imports.byteArray;
const noop = () => {};

var server = null;
var client = null;

var CastServer = GObject.registerClass(
class CastServer extends Soup.Server
{
	_init()
	{
		super._init();

		this.usedPort = null;
		this.isConnected = false;
		this.doneCleanup = false;
		this.wsConns = {};

		this.add_handler('/', this._onDefaultAccess);
	}

	setPort(port, cb)
	{
		cb = cb || noop;
		port = parseInt(port);

		if(this.usedPort && this.usedPort === port)
			return cb(port);

		if(this.isConnected)
		{
			this.disconnectWebsockets();
			this.disconnect();
			this.isConnected = false;
		}

		this._findFreePort(port, (usedPort) =>
		{
			if(!usedPort)
				return cb(null);

			this.isConnected = true;
			this.usedPort = usedPort;

			return cb(usedPort);
		});
	}

	_findFreePort(port, cb)
	{
		try { this.listen_local(port, Soup.ServerListenOptions.IPV4_ONLY); }
		catch(err) {
			if(port < 65535)
				return this._findFreePort(port + 1, cb);
			else
				return cb(null);
		}

		return cb(port);
	}

	parseMessage(msg)
	{
		let result = null;

		try { result = JSON.parse(msg.request_body.data); }
		catch(err) {}

		return result;
	}

	/* Should not be used in extension more than once */
	onPlaybackData(cb)
	{
		this.remove_handler('/api/data');

		this.add_handler('/api/data', (self, msg) =>
		{
			let parsedMsg = this.parseMessage(msg);

			for(let conn in this.wsConns)
			{
				if(
					!this.wsConns[conn]
					|| this.wsConns[conn].get_state() !== Soup.WebsocketState.OPEN
				)
					continue;

				this.wsConns[conn].send_text(JSON.stringify({
					isPlaying: parsedMsg.isPlaying
				}));
			}

			cb(parsedMsg);
		});
	}

	createWebsockets()
	{
		if(!this.isConnected) return;

		for(let srcApp of ['prefs', 'filechooser', 'nautilus'])
		{
			this.remove_handler('/websocket/' + srcApp);

			this.add_websocket_handler('/websocket/' + srcApp, null, null, (self, conn) =>
			{
				/* Connection will close automatically on srcApp close */
				this.wsConns[srcApp] = conn;
				this.wsConns[srcApp].connect('closed', () => this.wsConns[srcApp] = null);
			});
		}
	}

	addNodeHandler(cb)
	{
		cb = cb || noop;

		if(!this.isConnected)
			return cb(new Error('Client in not connected'));

		this.remove_handler('/websocket/node');

		this.add_websocket_handler('/websocket/node', null, null, (self, conn) =>
		{
			this.wsConns.node = conn;

			this.wsConns.node.connect('message', (self, type, bytes) =>
			{
				/* Ignore not compatible messages */
				if(type !== Soup.WebsocketDataType.TEXT)
					return;

				let msg = bytes.get_data();

				if(msg instanceof Uint8Array)
					msg = ByteArray.toString(msg);
				else
					msg = String(msg);

				return cb(null, msg);
			});

			this.wsConns.node.connect('closed', () =>
			{
				this.wsConns.node = null;
				cb(null, 'disconnected');
			});
		});
	}

	disconnectWebsockets()
	{
		for(let conn in this.wsConns)
		{
			if(
				!this.wsConns[conn]
				|| this.wsConns[conn].get_state() !== Soup.WebsocketState.OPEN
			)
				continue;

			this.wsConns[conn].close(Soup.WebsocketCloseCode.NORMAL, null);
		}
	}

	emitIsServiceEnabled(isEnabled)
	{
		for(let conn in this.wsConns)
		{
			if(
				!this.wsConns[conn]
				|| this.wsConns[conn].get_state() !== Soup.WebsocketState.OPEN
			)
				continue;

			var msg = (isEnabled) ? 'enabled' : 'disabled';

			this.wsConns[conn].send_text(JSON.stringify({
				isEnabled: isEnabled
			}));
		}
	}

	onPlaybackStatus(cb)
	{
		/* Must remove previous handler on new remote creation */
		this.remove_handler('/api/status');

		this.add_handler('/api/status', (self, msg) =>
		{
			cb(this.parseMessage(msg));
		});
	}

	onBrowserData(cb)
	{
		this.remove_handler('/api/browser');

		this.add_handler('/api/browser', (self, msg) =>
		{
			cb(this.parseMessage(msg));
		});
	}

	_onDefaultAccess(self, msg)
	{
		msg.status_code = 404;
	}

	removeAddedHandlers()
	{
		for(let conn in this.wsConns)
			this.remove_handler('/websocket/' + conn);

		this.disconnectWebsockets();
		this.remove_handler('/api/data');
		this.remove_handler('/api/status');
		this.remove_handler('/api/browser');
	}

	closeCleanup()
	{
		if(this.doneCleanup) return;

		this.removeAddedHandlers();
		this.remove_handler('/');

		this.doneCleanup = true;
	}
});

var CastClient = GObject.registerClass(
class CastClient extends Soup.Session
{
	_init(nodePort, wsPort)
	{
		super._init({
			timeout: 3,
			use_thread_context: true
		});

		this.nodePort = (nodePort && nodePort > 0) ? parseInt(nodePort) : null;
		this.wsPort = (wsPort && wsPort > 0) ? parseInt(wsPort) : null;
		this.wsConn = null;
	}

	setNodePort(port)
	{
		this.nodePort = parseInt(port);
	}

	setWsPort(port)
	{
		this.wsPort = parseInt(port);
	}

	_getRequest(type, cb)
	{
		cb = cb || noop;

		let message = Soup.Message.new(
			'GET', 'http://127.0.0.1:' + this.nodePort + '/api/' + type
		);

		this.queue_message(message, () =>
		{
			let result = null;

			if(
				typeof message === 'object'
				&& message.response_body
				&& typeof message.response_body === 'object'
				&& message.response_body.data
			) {
				try { result = JSON.parse(message.response_body.data); }
				catch(err) {}
			}

			return cb(result);
		});
	}

	_getRequestSync(type)
	{
		let result = null;

		let message = Soup.Message.new(
			'GET', 'http://127.0.0.1:' + this.nodePort + '/api/' + type
		);

		this.send_message(message);

		if(
			typeof message === 'object'
			&& message.response_body
			&& typeof message.response_body === 'object'
			&& message.response_body.data
		) {
			try { result = JSON.parse(message.response_body.data); }
			catch(err) {}
		}

		return result;
	}

	_postRequest(type, data, query, cb)
	{
		cb = cb || noop;

		let url = 'http://127.0.0.1:' + this.nodePort + '/api/' + type;

		if(query) url += '?' + query;

		let message = Soup.Message.new('POST', url);
		let parsedData = null;

		try { parsedData = JSON.stringify(data); }
		catch(err) {}

		if(!parsedData) return cb(null);

		message.set_request(
			'application/json',
			Soup.MemoryUse.COPY,
			parsedData
		);

		this.queue_message(message, cb);
	}

	_postRequestSync(type, data, query)
	{
		let url = 'http://127.0.0.1:' + this.nodePort + '/api/' + type;

		if(query) url += '?' + query;

		let message = Soup.Message.new('POST', url);
		let parsedData = null;

		try { parsedData = JSON.stringify(data); }
		catch(err) {}

		if(!parsedData) return null;

		message.set_request(
			'application/json',
			Soup.MemoryUse.COPY,
			parsedData
		);

		this.send_message(message);
	}

	connectWebsocket(srcApp, cb)
	{
		cb = cb || noop;

		if(!this.wsPort)
			cb(new Error('No websocket port to connect'));

		let message = Soup.Message.new(
			'GET', 'ws://127.0.0.1:' + this.wsPort + '/websocket/' + srcApp
		);

		this.websocket_connect_async(message, null, null, null, (self, res) =>
		{
			let conn = null;
			try { conn = this.websocket_connect_finish(res); }
			catch(err) { return cb(err); }

			this.wsConn = conn;

			return cb(null);
		});
	}

	disconnectWebsocket(cb)
	{
		cb = cb || noop;

		if(
			!this.wsConn
			|| this.wsConn.get_state() !== Soup.WebsocketState.OPEN
		)
			return cb(null);

		this.wsClosedSignal = this.wsConn.connect('closed', () =>
		{
			this.wsConn.disconnect(this.wsClosedSignal);

			if(this.wsMessageSignal)
				this.wsConn.disconnect(this.wsMessageSignal);

			this.wsConn.run_dispose();
			this.wsConn = null;

			cb(null);
		});

		this.wsConn.close(Soup.WebsocketCloseCode.NORMAL, null);
	}

	onWebsocketMsg(cb)
	{
		if(!this.wsConn)
			return cb(new Error('Websocket not connected'));

		this.wsMessageSignal = this.wsConn.connect('message', (self, type, bytes) =>
		{
			/* Ignore not compatible messages */
			if(type !== Soup.WebsocketDataType.TEXT)
				return;

			let msg = bytes.get_data();

			if(msg instanceof Uint8Array)
				msg = ByteArray.toString(msg);

			let parsedData = null;
			try {
				parsedData = JSON.parse(msg);
			}
			catch(err) {
				return cb(new Error('Could not parse websocket data'));
			}

			return cb(null, parsedData);
		});
	}

	getIsServiceEnabled(cb)
	{
		cb = cb || noop;
		this._getRequest('is-enabled', cb);
	}

	getIsServiceEnabledSync()
	{
		return this._getRequestSync('is-enabled');
	}

	getConfig(cb)
	{
		cb = cb || noop;
		this._getRequest('config', cb);
	}

	getConfigSync()
	{
		return this._getRequestSync('config');
	}

	postConfig(data, cb)
	{
		cb = cb || noop;
		this._postRequest('config', data, null, cb);
	}

	getSelection(cb)
	{
		cb = cb || noop;
		this._getRequest('selection', cb);
	}

	getSelectionSync()
	{
		return this._getRequestSync('selection');
	}

	postSelection(data, cb)
	{
		cb = cb || noop;
		this._postRequest('selection', data, null, cb);
	}

	postSelectionSync(data)
	{
		this._postRequestSync('selection', data, null);
	}

	updateSelection(filePath, cb)
	{
		cb = cb || noop;
		this._getRequest('selection', (selection) =>
		{
			if(!selection)
				return cb(new Error('Could not obtain selection'));

			selection.filePath = filePath;
			selection.subsPath = "";

			this._postRequest('selection', selection, null, cb);
		});
	}

	getPlaylist(cb)
	{
		cb = cb || noop;
		this._getRequest('playlist', cb);
	}

	getPlaylistSync()
	{
		return this._getRequestSync('playlist');
	}

	postPlaylist(data, isAppend, cb)
	{
		cb = cb || noop;
		let append = false;

		if(isAppend)
		{
			if(typeof isAppend === 'function')
				cb = isAppend;
			else
				append = true;
		}

		let query = 'append=' + append;
		this._postRequest('playlist', data, query, cb);
	}

	postPlaylistSync(data, isAppend)
	{
		isAppend = (isAppend) ? true : false;
		let query = 'append=' + isAppend;
		this._postRequestSync('playlist', data, query);
	}

	getPlaybackData(cb)
	{
		cb = cb || noop;
		this._getRequest('playback-data', cb);
	}

	getPlaybackDataSync()
	{
		return this._getRequestSync('playback-data');
	}

	postPlaybackData(data, cb)
	{
		cb = cb || noop;
		this._postRequest('playback-data', data, null, cb);
	}

	postPlaybackDataSync(data)
	{
		this._postRequestSync('playback-data', data, null);
	}

	postRemote(action, value, cb)
	{
		cb = cb || noop;
		let data = { action: action };

		if(typeof value !== 'undefined')
			data.value = value;

		this._postRequest('remote', data, null, cb);
	}

	getPlayercasts(cb)
	{
		cb = cb || noop;
		this._getRequest('playercasts', cb);
	}

	getPlayercastsSync()
	{
		return this._getRequestSync('playercasts');
	}

	getBrowser(cb)
	{
		cb = cb || noop;
		this._getRequest('browser', cb);
	}

	getBrowserSync()
	{
		let browser = this._getRequestSync('browser');
		return (browser && browser.name) ?  browser.name : null;
	}

	postIsLockScreen(value, cb)
	{
		cb = cb || noop;

		let data = { isLockScreen: value };
		this._postRequest('lock-screen', data, null, cb);
	}
});

function createServer(port, cb)
{
	cb = cb || noop;

	if(server) return cb(server.usedPort);

	server = new CastServer();
	server.setPort(port, cb);
}

function createClient(nodePort, wsPort)
{
	if(client) return;

	client = new CastClient(nodePort, wsPort);
}

function closeServer()
{
	if(!server) return;

	server.closeCleanup();
	server.disconnect();
	server = null;
}

function closeClient()
{
	if(!client) return;

	client.abort();
	client = null;
}
