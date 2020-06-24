const scanner = require('multicast-scanner');
const gnome = require('../gnome');
const SERVICE = (process.argv[2]) ? process.argv[2] : 'googlecast';

var opts = {
	service_name: `_${SERVICE}._tcp.local`,
	full_scan: true
};

scanner(opts, (err, devices) =>
{
	var results = [];

	if(!err)
	{
		devices.forEach(device =>
		{
			results.push({
				name: device.name,
				friendlyName: device.friendlyName,
				ip: ''
			});
		});
	}

	const devName = (SERVICE !== 'googlecast') ? SERVICE : 'chromecast';
	gnome.setSetting(`${devName}-devices`, JSON.stringify(results));
});

gnome.loadSchema();
