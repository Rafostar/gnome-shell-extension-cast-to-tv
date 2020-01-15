const { Soup } = imports.gi;
const noop = () => {};

class SoupServer extends Soup.Server
{
	constructor(port)
	{
		super();

		this.listen_local(port, Soup.ServerListenOptions.IPV4_ONLY);

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

		this._postRequest = (type, data, query, cb) =>
		{
			cb = cb || noop;

			this.abort();
			let url = 'http://127.0.0.1:' + this.nodePort + '/temp/' + type;

			if(query) url += '?' + query;

			let message = Soup.Message.new('POST', url);
			let params = Soup.form_encode_hash(data);
			message.set_request(
				'application/x-www-form-urlencoded',
				Soup.MemoryUse.COPY,
				params
			);

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
	}
}
