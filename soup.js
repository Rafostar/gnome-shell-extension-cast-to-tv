const { GLib, Soup } = imports.gi;
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

		this.setPort = (port, cb) =>
		{
			cb = cb || noop;
			port = parseInt(port);

			if(this.usedPort && this.usedPort === port)
				return cb(port);

			if(this.isConnected)
			{
				server.disconnect();
				this.isConnected = false;
			}

			try {
				server.listen_local(port, Soup.ServerListenOptions.IPV4_ONLY);

				this.usedPort = port;
				this.isConnected = true;
			}
			catch(err) {
				if(port < 65535)
					return this.setPort(port + 1, cb);
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
	}
}

class SoupClient extends Soup.Session
{
	constructor(port)
	{
		super({ timeout: 3 });

		this.usedPort = (port > 0) ? parseInt(port) : null;
		this.loop = GLib.MainLoop.new(null, false);

		this.setPort = (port) =>
		{
			this.usedPort = parseInt(port);
		}

		this._getRequest = (type, cb) =>
		{
			cb = cb || noop;

			this.abort();
			let message = Soup.Message.new('GET',
				'http://127.0.0.1:' + this.usedPort + '/temp/' + type
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

			this._getRequest(type, (data) =>
			{
				result = data;
				this.loop.quit();
			});

			this.loop.run();

			return result;
		}

		this._postRequest = (type, data, query, cb) =>
		{
			cb = cb || noop;

			this.abort();
			let url = 'http://127.0.0.1:' + this.usedPort + '/temp/' + type;

			if(query) url += '?' + query;

			for(let key in data)
			{
				if(typeof data[key] !== 'string')
					data[key] = String(data[key]);
			}

			let message = Soup.Message.new('POST', url);
			let params = Soup.form_encode_hash(data);
			message.set_request(
				'application/x-www-form-urlencoded',
				Soup.MemoryUse.COPY,
				params
			);

			this.queue_message(message, cb);
		}

		this._getParsedObject = (data) =>
		{
			if(!data) return null;

			for(let key in data)
			{
				if(data[key] === 'true')
					data[key] = true;
				else if(data[key] === 'false')
					data[key] = false;
			}

			return data;
		}

		this.getConfig = (cb) =>
		{
			cb = cb || noop;
			this._getRequest('config', (data) =>
			{
				cb(this._getParsedObject(data));
			});
		}

		this.getConfigSync = () =>
		{
			let data = this._getRequestSync('config');
			return this._getParsedObject(data);
		}

		this.getSelection = (cb) =>
		{
			cb = cb || noop;
			this._getRequest('selection', (data) =>
			{
				cb(this._getParsedObject(data));
			});
		}

		this.getSelectionSync = () =>
		{
			let data = this._getRequestSync('selection');
			return this._getParsedObject(data);
		}

		this.updateSelection = (filePath, cb) =>
		{
			cb = cb || noop;
			this._getRequest('selection', (data) =>
			{
				let selection = this._getParsedObject(data);

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

		this.getPlayercasts = (cb) =>
		{
			cb = cb || noop;
			this._getRequest('playercasts', cb);
		}

		this.getPlayercastsSync = () =>
		{
			return this._getRequestSync('playercasts');
		}

		this.postConfig = (data, cb) =>
		{
			cb = cb || noop;
			this._postRequest('config', data, null, cb);
		}

		this.postSelection = (data, cb) =>
		{
			cb = cb || noop;
			this._postRequest('selection', data, null, cb);
		}

		this.postPlaylist = (data, isAppend, cb) =>
		{
			let append = false;

			if(isAppend)
			{
				if(typeof isAppend === 'function')
					cb = isAppend;
				else
					append = true;
			}

			cb = cb || noop;

			let query = 'append=' + append;
			this._postRequest('playlist', data, query, cb);
		}

		this.postRemote = (action, value, cb) =>
		{
			cb = cb || noop;

			value = (typeof value === 'undefined') ? '' : String(value);

			let data = { action: action, value: value };
			this._postRequest('remote', data, null, cb);
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

function createClient(port)
{
	if(client) return;

	client = new SoupClient(port);
}

function closeServer()
{
	if(!server) return;

	server.disconnect();
	server = null;
}

function closeClient()
{
	if(!client) return;

	client.abort();
	client = null;
}
