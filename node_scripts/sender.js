const http = require('http');
const debug = require('debug')('sender');

module.exports =
{
	configure: function(port)
	{
		this.opts = {
			hostname: '127.0.0.1',
			port: port,
			path: '/',
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			}
		};

		debug(`Sender configured to port: ${this.opts.port}`);
	},

	send: function(data)
	{
		var req = http.request(this.opts, () => {});
		req.on('error', debug);

		var dataString = JSON.stringify(data);
		req.end(dataString, () => req.removeListener('error', debug));

		debug(`Send data: ${dataString}`);
	},

	stop: function()
	{
		this.send = () => {};
	}
}
