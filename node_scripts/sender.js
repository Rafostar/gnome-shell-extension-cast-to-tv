const http = require('http');
const debug = require('debug')('sender');

module.exports =
{
	configure: function(config)
	{
		const port = config.listeningPort + 1;
		this.options = {
			hostname: '127.0.0.1',
			port: port,
			path: '/',
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			}
		};

		debug(`Sender configured to port: ${port}`);
	},

	send: function(data)
	{
		var req = http.request(this.options, () => {});
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
