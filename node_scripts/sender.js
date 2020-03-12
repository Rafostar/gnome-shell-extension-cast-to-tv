const http = require('http');
const debug = require('debug')('sender');
const noop = () => {};

var lastData;

module.exports =
{
	enabled: false,

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

		if(!this.enabled)
			return cb(null);

		if(!this.opts)
			return cb(new Error('Sender not configured'));

		var dataString = JSON.stringify(data);

		/* Do not send same data */
		if(dataString === lastData)
			return cb(null);

		lastData = dataString;
		this.opts.path = '/api/' + type;

		var req = http.request(this.opts, () => {});
		req.on('error', debug);
		req.once('response', () =>
		{
			debug('Received response');
			req.removeListener('error', debug);
		});
		req.end(dataString, cb);

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
	}
}
