const scanner = require('multicast-scanner');
const gnome = require('../gnome');
const SERVICE = (process.argv[2]) ? process.argv[2] : 'googlecast';

var opts = {
	service_name: `_${SERVICE}._tcp.local`,
	full_scan: true
};

scanner(opts, (err, devices) =>
{
	if(err) devices = [];
	else devices.forEach(device => device.ip = '');

	const devName = (SERVICE !== 'googlecast') ? SERVICE : 'chromecast';
	gnome.setSetting(`${devName}-devices`, JSON.stringify(devices));
});

gnome.loadSchema();
