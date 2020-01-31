const { Soup } = imports.gi;
const noop = () => {};

var server = null;
var client = null;

class SoupServer extends Soup.Server
{
	constructor()
	{
		super();

		this.usedPort = null;
		this.isConnected = false;
		this.doneCleanup = false;
		this.wsConns = {};

		this.setPort = (port, cb) =>
		{
			cb = cb || noop;
			port = parseInt(port);

			if(this.usedPort && this.usedPort === port)
				return cb(port);

			if(this.isConnected)
			{
				this.disconnect();
				this.isConnected = false;
			}

			this._findFreePort(port, (usedPort) =>
			{
				this.isConnected = true;
				this.usedPort = port;

				return cb(usedPort);
			});
		}

		this._findFreePort = (port, cb) =>
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

		this.parseMessage = (msg) =>
		{
			let result = null;

			try { result = JSON.parse(msg.request_body.data); }
			catch(err) {}

			return result;
		}

		/* Should not be used in extension more than once */
		this.onPlaybackData = (cb) =>
		{
			this.add_handler('/temp/data', (self, msg) =>
			{
				let parsedMsg = this.parseMessage(msg);

				for(let conn in this.wsConns)
				{
					if(!this.wsConns[conn])
						continue;

					this.wsConns[conn].send_text(JSON.stringify({
						showMenu: parsedMsg.showMenu,
						isPlaying: parsedMsg.isPlaying
					}));
				}

				cb(parsedMsg);
			});
		}

		this.createWebsocket = () =>
		{
			if(!this.isConnected) return;

			for(let srcApp of ['prefs', 'filechooser', 'nautilus'])
			{
				this.add_websocket_handler('/websocket/' + srcApp, null, null, (self, conn) =>
				{
					/* Connection will close automatically on srcApp close */
					this.wsConns[srcApp] = conn;
					this.wsConns[srcApp].connect('closed', () => this.wsConns[srcApp] = null);
				});
			}
		}

		this.onPlaybackStatus = (cb) =>
		{
			this.add_handler('/temp/status', (self, msg) =>
			{
				cb(this.parseMessage(msg));
			});
		}

		this.onBrowserData = (cb) =>
		{
			this.add_handler('/temp/browser', (self, msg) =>
			{
				cb(this.parseMessage(msg));
			});
		}

		this._onDefaultAccess = (self, msg) =>
		{
			msg.status_code = 404;
		}

		this.closeCleanup = () =>
		{
			if(this.doneCleanup) return;

			this.remove_handler('/temp/data');
			this.remove_handler('/temp/status');
			this.remove_handler('/temp/browser');
			this.remove_handler('/websocket');
			this.remove_handler('/');

			this.doneCleanup = true;
		}

		this.add_handler('/', this._onDefaultAccess);
	}
}

class SoupClient extends Soup.Session
{
	constructor(nodePort, wsPort)
	{
		super({ timeout: 3 });

		this.nodePort = (nodePort > 0) ? parseInt(nodePort) : null;
		this.wsPort = (wsPort > 0) ? parseInt(wsPort) : null;
		this.wsConn = null;

		this.setNodePort = (port) =>
		{
			this.nodePort = parseInt(port);
		}

		this.setWsPort = (port) =>
		{
			this.wsPort = parseInt(port);
		}

		this._getRequest = (type, cb) =>
		{
			cb = cb || noop;

			let message = Soup.Message.new(
				'GET', 'http://127.0.0.1:' + this.nodePort + '/temp/' + type
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

		this._getRequestSync = (type) =>
		{
			let result = null;

			let message = Soup.Message.new(
				'GET', 'http://127.0.0.1:' + this.nodePort + '/temp/' + type
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

		this._postRequest = (type, data, query, cb) =>
		{
			cb = cb || noop;

			let url = 'http://127.0.0.1:' + this.nodePort + '/temp/' + type;

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

		this._postRequestSync = (type, data, query) =>
		{
			let url = 'http://127.0.0.1:' + this.nodePort + '/temp/' + type;

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

		this.connectWebsocket = (srcApp, cb) =>
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

		this.disconnectWebsocket = (cb) =>
		{
			cb = cb || noop;

			if(!this.wsConn)
				return cb(null);

			this.wsConn.connect('closed', () =>
			{
				this.wsConn = null;
				cb(null);
			});

			this.wsConn.close(Soup.WebsocketCloseCode.NORMAL, null);
		}

		this.onWebsocketMsg = (cb) =>
		{
			if(!this.wsConn)
				return cb(new Error('Websocket not connected'));

			this.wsConn.connect('message', (self, type, bytes) =>
			{
				/* Ignore not compatible messages */
				if(type !== Soup.WebsocketDataType.TEXT)
					return;

				let parsedData = null;
				try {
					parsedData = JSON.parse(bytes.get_data());
				}
				catch(err) {
					return cb(new Error('Could not parse websocket data'));
				}

				return cb(null, parsedData);
			});
		}

		this.getConfig = (cb) =>
		{
			cb = cb || noop;
			this._getRequest('config', cb);
		}

		this.getConfigSync = () =>
		{
			return this._getRequestSync('config');
		}

		this.postConfig = (data, cb) =>
		{
			cb = cb || noop;
			this._postRequest('config', data, null, cb);
		}

		this.getSelection = (cb) =>
		{
			cb = cb || noop;
			this._getRequest('selection', cb);
		}

		this.getSelectionSync = () =>
		{
			return this._getRequestSync('selection');
		}

		this.postSelection = (data, cb) =>
		{
			cb = cb || noop;
			this._postRequest('selection', data, null, cb);
		}

		this.postSelectionSync = (data) =>
		{
			this._postRequestSync('selection', data, null);
		}

		this.updateSelection = (filePath, cb) =>
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

		this.getPlaylist = (cb) =>
		{
			cb = cb || noop;
			this._getRequest('playlist', cb);
		}

		this.getPlaylistSync = () =>
		{
			return this._getRequestSync('playlist');
		}

		this.postPlaylist = (data, isAppend, cb) =>
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

		this.postPlaylistSync = (data, isAppend) =>
		{
			isAppend = (isAppend) ? true : false;
			let query = 'append=' + isAppend;
			this._postRequestSync('playlist', data, query);
		}

		this.getPlaybackData = (cb) =>
		{
			cb = cb || noop;
			this._getRequest('playback-data', cb);
		}

		this.getPlaybackDataSync = () =>
		{
			return this._getRequestSync('playback-data');
		}

		this.postPlaybackData = (data) =>
		{
			cb = cb || noop;
			this._postRequest('playback-data', data, null, cb);
		}

		this.postPlaybackDataSync = (data) =>
		{
			this._postRequestSync('playback-data', data, null);
		}

		this.postRemote = (action, value, cb) =>
		{
			cb = cb || noop;
			let data = { action: action };

			if(typeof value !== 'undefined')
				data.value = value;

			this._postRequest('remote', data, null, cb);
		}

		this.getPlayercasts = (cb) =>
		{
			cb = cb || noop;
			this._getRequest('playercasts', cb);
		}

		this.getPlayercastsSync = () =>
		{
			return this._getRequestSync('playercasts');
		}

		this.getBrowser = (cb) =>
		{
			cb = cb || noop;
			this._getRequest('browser', cb);
		}

		this.getBrowserSync = (cb) =>
		{
			let browser = this._getRequestSync('browser');
			return (browser && browser.name) ?  browser.name : null;
		}
	}
}

function createServer(port, cb)
{
	cb = cb || noop;

	if(server) return cb(server.usedPort);

	server = new SoupServer();
	server.setPort(port, cb);
}

function createClient(nodePort, wsPort)
{
	if(client) return;

	client = new SoupClient(nodePort, wsPort);
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
