const { Soup } = imports.gi;
const noop = () => {};

class SoupServer extends Soup.Server
{
	constructor(port)
	{
		super({ port: port });
		this.run_async();

		this.parseMessage = (msg) =>
		{
			let result = null;

			try { result = JSON.parse(msg.request_body.data); }
			catch(err) {}

			return result;
		}
	}
}

class SoupClient extends Soup.SessionAsync
{
	constructor(port)
	{
		super();

		this.nodePort = port;

		this._getRequest = (type, cb) =>
		{
			cb = cb || noop;

			this.abort();
			let message = Soup.Message.new('GET',
				'http://127.0.0.1:' + this.nodePort + '/temp/' + type
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

		this._postRequest = (type, data, cb) =>
		{
			cb = cb || noop;

			this.abort();
			let message = Soup.Message.new('POST',
				'http://127.0.0.1:' + this.nodePort + '/temp/' + type
			);

			message.request_body.data = JSON.stringify(data);
			this.queue_message(message, cb);
		}

		this.getConfig = (cb) =>
		{
			cb = cb || noop;
			this._getRequest('config', cb);
		}

		this.getSelection = (cb) =>
		{
			cb = cb || noop;
			this._getRequest('selection', cb);
		}

		this.getPlaylist = (cb) =>
		{
			cb = cb || noop;
			this._getRequest('playlist', cb);
		}

		this.postConfig = (data, cb) =>
		{
			cb = cb || noop;
			this._postRequest('config', data, cb);
		}

		this.postSelection = (data, cb) =>
		{
			cb = cb || noop;
			this._postRequest('selection', data, cb);
		}

		this.postPlaylist = (data, cb) =>
		{
			cb = cb || noop;
			this._postRequest('playlist', data, cb);
		}
	}
}
