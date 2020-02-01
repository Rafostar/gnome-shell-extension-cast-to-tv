const http = require('http');
const debug = require('debug')('sender');
const noop = () => {};

module.exports =
{
	configure: function(port)
	{
		this.opts = {
			host: '127.0.0.1',
			port: port,
			path: '/',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			timeout: 3000
		};

		debug(`Sender configured to port: ${this.opts.port}`);
	},

	send: function(type, data, cb)
	{
		cb = cb || noop;

		if(!this.opts)
			return cb(new Error('Sender not configured'));

		this.opts.path = '/temp/' + type;

		var req = http.request(this.opts, () => {});
		req.on('error', debug);

		var dataString = JSON.stringify(data);
		req.end(dataString, () =>
		{
			req.removeListener('error', debug);
			cb(null);
		});

		debug(`Send data: ${dataString}`);
	},

	sendPlaybackStatus: function(status, cb)
	{
		this.send('status', status, cb);
	},

	sendPlaybackData: function(data, cb)
	{
		this.send('data', data, cb);
	},

	sendBrowserName: function(name, cb)
	{
		this.send('browser', { name: name }, cb);
	},

	stop: function()
	{
		this.send = () => {};
	}
}
